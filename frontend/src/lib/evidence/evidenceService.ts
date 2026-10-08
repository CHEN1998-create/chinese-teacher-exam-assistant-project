/**
 * 考情证据服务（当前为本地 Mock 实现，可整体替换为真实后端）。
 *
 * 职责：
 * - 公告提取任务（ExtractionJob）的创建、进度、失败、重试、待审核流转；
 * - 字段级证据（EvidenceItem）的按目标读取与多来源合并；
 * - 用户纠错（Correction）的提交与查询。
 *
 * 边界：
 * - 没有“人工审核通过”方法 —— official 只能来自真实审核后台/种子数据；
 * - 不抓取全国公告、不做资格判断、不做上岸概率。
 *
 * 替换为真实服务：实现同样方法签名（getItems、startExtraction、retryJob、submitCorrection、
 * subscribe、getVersion），或注入新的 EvidenceExtractor（setExtractor）即可，页面无需改动。
 */
import {
  AnnouncementSourceInput,
  Correction,
  ExamTarget,
  EvidenceItem,
  ExtractionJob,
} from "@/types";
import { loadFromStorage, saveToStorageStrict } from "@/lib/storage";
import { STORAGE_KEYS, mockEvidenceItems, mockExamTargets } from "@/lib/mock-data";
import { normalizeTarget } from "@/lib/targets/domain";
import { authService } from "@/lib/auth";
import {
  buildEvidenceItems,
  isHighImpact,
  mergeExtractedItems,
} from "./domain";
import { EvidenceExtractor, mockEvidenceExtractor } from "./extractor";
import {
  emitEvidenceChanged,
  getEvidenceStoreVersion,
  subscribeEvidence,
} from "./events";
import { correctionService } from "@/lib/governance/correctionService";
import { track, classifyErrorCode } from "@/lib/analytics/eventService";

let extractor: EvidenceExtractor = mockEvidenceExtractor;

/** 正在运行的提取任务（仅内存，刷新后视为中断失败） */
const runningJobs = new Set<string>();

function notifyChanged(): void {
  emitEvidenceChanged();
}

/**
 * 提取完成后触发考情变化检查（动态导入避免与 replanService 的循环依赖）。
 * 通知写入失败不影响提取结果本身。
 */
async function triggerEvidenceChangeNotice(targetId: string): Promise<void> {
  try {
    const { replanService } = await import("@/lib/plans/replanService");
    replanService.ensureEvidenceChangeNotification(targetId);
  } catch {
    // 通知失败不阻塞主流程
  }
}

function currentUserId(): string {
  return authService.getSession()?.user.id ?? "anonymous";
}

/** 从目标存储中直接读取目标（避免与 services.ts 形成循环依赖） */
function findTarget(targetId: string): ExamTarget | null {
  const list = loadFromStorage<ExamTarget[]>(STORAGE_KEYS.EXAM_TARGETS, mockExamTargets);
  return list.map(normalizeTarget).find((t) => t.id === targetId) ?? null;
}

function loadItems(): EvidenceItem[] {
  return loadFromStorage<EvidenceItem[]>(STORAGE_KEYS.EVIDENCE_ITEMS, mockEvidenceItems);
}

function loadJobs(): ExtractionJob[] {
  const list = loadFromStorage<ExtractionJob[]>(STORAGE_KEYS.EXTRACTION_JOBS, []);
  // 刷新前停在“正在提取”的任务视为中断：不假装成功，展示失败并允许重试
  return list.map((job) =>
    job.status === "processing" && !runningJobs.has(job.id)
      ? {
          ...job,
          status: "failed",
          progress: job.progress || 0,
          failReason: "页面刷新或会话中断导致提取未完成，请重新提取",
          updatedAt: job.updatedAt,
        }
      : job
  );
}


function sourceLabelOf(input: AnnouncementSourceInput): string {
  if (input.sourceType === "announcement_url") return input.url?.trim() ?? "公告链接";
  if (input.sourceType === "announcement_file") return input.fileName ?? "公告文件";
  return `粘贴文本：${(input.text ?? "").trim().slice(0, 24)}…`;
}

export const evidenceService = {
  subscribe(listener: () => void): () => void {
    return subscribeEvidence(listener);
  },

  getVersion(): number {
    return getEvidenceStoreVersion();
  },

  /** 替换提取器（接入真实 AI/后端时使用） */
  setExtractor(next: EvidenceExtractor): void {
    extractor = next;
  },

  /** 当前提取器名称（页面/README 展示 Mock 边界用） */
  getExtractorName(): string {
    return extractor.name;
  },

  // ==================== 证据读取 ====================

  /** 某目标下的全部字段证据（不含占位行；缺失字段由画像层补“待确认”） */
  getItems(targetId: string): EvidenceItem[] {
    return loadItems()
      .filter((i) => i.examTargetId === targetId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  // ==================== 提取任务 ====================

  getJobs(targetId: string): ExtractionJob[] {
    return loadJobs()
      .filter((j) => j.examTargetId === targetId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  getLatestJob(targetId: string): ExtractionJob | null {
    return this.getJobs(targetId)[0] ?? null;
  },

  getJobById(jobId: string): ExtractionJob | null {
    return loadJobs().find((j) => j.id === jobId) ?? null;
  },

  /** 对同一目标是否存在进行中的任务 */
  isProcessing(targetId: string): boolean {
    return this.getJobs(targetId).some((j) => j.status === "processing");
  },

  /**
   * 提交公告来源并开始提取（异步）。
   * 成功/失败都会更新任务状态并通知订阅者；失败时不改动已有证据。
   */
  async startExtraction(targetId: string, input: AnnouncementSourceInput): Promise<ExtractionJob> {
    const target = findTarget(targetId);
    if (!target) throw new Error("目标考试不存在，无法提交公告");
    if (target.userId !== currentUserId()) {
      throw new Error("只能给自己的目标提交公告");
    }
    if (this.isProcessing(targetId)) {
      throw new Error("该目标已有提取任务进行中，请等待完成后再提交");
    }
    if (input.sourceType === "announcement_file") {
      throw new Error("公告文件解析当前为占位能力，请改用公告链接或粘贴公告文本");
    }

    const now = new Date().toISOString();
    const job: ExtractionJob = {
      id: `job-${Date.now()}`,
      examTargetId: targetId,
      userId: currentUserId(),
      sourceType: input.sourceType,
      sourceLabel: sourceLabelOf(input),
      sourceUrl: input.sourceType === "announcement_url" ? input.url?.trim() : undefined,
      sourceText: input.sourceType === "announcement_text" ? input.text?.trim() : undefined,
      fileName: input.fileName,
      fileSize: input.fileSize,
      status: "processing",
      progress: 0,
      stage: "排队中",
      createdAt: now,
      updatedAt: now,
    };

    const jobs = loadJobs();
    jobs.push(job);
    saveToStorageStrict(STORAGE_KEYS.EXTRACTION_JOBS, jobs);
    runningJobs.add(job.id);
    notifyChanged();

    const patchJob = (patch: Partial<ExtractionJob>) => {
      const all = loadJobs();
      const index = all.findIndex((j) => j.id === job.id);
      if (index === -1) return;
      all[index] = { ...all[index], ...patch, updatedAt: new Date().toISOString() };
      saveToStorageStrict(STORAGE_KEYS.EXTRACTION_JOBS, all);
      notifyChanged();
    };

    try {
      const payload = await extractor.extract(
        input,
        { target },
        (progress, stage) => patchJob({ progress, stage })
      );

      const finishedAt = new Date().toISOString();
      const newItems = buildEvidenceItems({
        jobId: job.id,
        target,
        payload,
        now: finishedAt,
      });
      // 合并必须按目标隔离：仅替换“本目标”同字段的旧 AI 结论，
      // 其他目标/其他用户的证据项原样保留（修复跨目标污染）
      const allItems = loadItems();
      const others = allItems.filter((i) => i.examTargetId !== target.id);
      const scoped = allItems.filter((i) => i.examTargetId === target.id);
      const merged = [...others, ...mergeExtractedItems(scoped, newItems)];
      saveToStorageStrict(STORAGE_KEYS.EVIDENCE_ITEMS, merged);

      const pendingReviewCount = newItems.filter((i) => i.reviewStatus === "pending_review").length;
      patchJob({
        status: pendingReviewCount > 0 ? "pending_review" : "succeeded",
        progress: 100,
        stage: pendingReviewCount > 0 ? "提取完成，待人工审核" : "提取完成",
        extractedCount: newItems.length,
        pendingReviewCount,
        finishedAt,
      });
      // 考情变化说明（哪条变了、今天安排是否受影响）
      await triggerEvidenceChangeNotice(targetId);
      return this.getJobById(job.id)!;
    } catch (e) {
      const reason = e instanceof Error ? e.message : "提取失败，请稍后重试";
      patchJob({
        status: "failed",
        stage: "提取失败",
        failReason: reason,
        finishedAt: new Date().toISOString(),
      });
      track("extraction_failed", "evidence", {
        targetId,
        props: { jobId: job.id, reasonCode: classifyErrorCode(e) },
      });
      return this.getJobById(job.id)!;
    } finally {
      runningJobs.delete(job.id);
    }
  },

  /** 使用相同来源重新提取失败/已完成的任务 */
  async retryJob(jobId: string): Promise<ExtractionJob | null> {
    const job = this.getJobById(jobId);
    if (!job) return null;
    const input: AnnouncementSourceInput = {
      sourceType: job.sourceType,
      url: job.sourceUrl,
      text: job.sourceText,
      fileName: job.fileName,
      fileSize: job.fileSize,
    };
    return this.startExtraction(job.examTargetId, input);
  },

  // ==================== 纠错 ====================
  //
  // 纠错的单一数据源已迁移到 governance/correctionService（含状态机、时间线、
  // 后台处理与撤回）。这里保留同名方法作为适配层，供旧调用方平滑过渡。

  getCorrections(targetId: string): Correction[] {
    return correctionService.listForTarget(targetId);
  },

  /** @deprecated 请使用 correctionService.submit；本方法仅做旧字段适配 */
  submitCorrection(input: {
    targetId: string;
    field: string;
    fieldLabel?: string;
    currentValue: string;
    suggestedValue: string;
    reason: string;
    sourceUrl?: string;
  }): Correction {
    return correctionService.submit({
      targetType: "evidence",
      examTargetId: input.targetId,
      field: input.field,
      fieldLabel: input.fieldLabel,
      currentValue: input.currentValue,
      description: input.reason,
      suggestedValue: input.suggestedValue,
      sources: [
        {
          url: input.sourceUrl?.trim() || undefined,
          note: input.sourceUrl?.trim() ? undefined : input.reason,
        },
      ],
    });
  },

  /** 高影响字段判定出口（UI 用，真值仍在 domain） */
  isHighImpactField(field: EvidenceItem["field"]): boolean {
    return isHighImpact(field);
  },
};
