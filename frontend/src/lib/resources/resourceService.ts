/**
 * 公共资源索引服务（本地 Mock，非生产实现）。
 *
 * 边界：
 * - 公共资源是全局数据（跨账号共享同一份索引），与用户私有资料物理分开存储；
 * - 用户私有上传/资料不会自动进入公共资源库（没有任何此类写入路径）；
 * - 匹配规则全部在 domain.ts，本文件只做存取、编排与记录；
 * - 写入（新增/编辑/停用/复核）要求资源审核员或管理员，service 层强制校验。
 */
import {
  ResourceItem,
  ResourceMatch,
  ResourcePlanLink,
  ResourceStatus,
  ResourceViewRecord,
  ResourceLinkStatus,
  RightsStatus,
  ExamTarget,
  EducationLevel,
  ExamType,
} from "@/types";
import { STORAGE_KEYS, mockResources } from "@/lib/mock-data";
import { loadFromStorage, saveToStorageStrict } from "@/lib/storage";
import { authService } from "@/lib/auth";
import { emitResourcesChanged, subscribeResources, getResourceStoreVersion } from "./events";
import {
  RESOURCE_ADMIN_ROLES,
  checkRecommendable,
  classifyQueue,
  gapSearchAdvice,
  listBrowseable,
  matchGap as matchGapRules,
  normalizeResource,
} from "./domain";
import { track } from "@/lib/analytics/eventService";

export type ResourceItemInput = Omit<ResourceItem, "id" | "createdAt" | "updatedAt">;

export interface ResourceQueues {
  all: ResourceItem[];
  active: ResourceItem[];
  pending_review: ResourceItem[];
  expired: ResourceItem[];
  inactive: ResourceItem[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function currentUserId(): string | null {
  return authService.getSession()?.user.id ?? null;
}

function loadResources(): ResourceItem[] {
  return loadFromStorage<ResourceItem[]>(STORAGE_KEYS.RESOURCES, mockResources).map(normalizeResource);
}

function persistResources(items: ResourceItem[]): void {
  saveToStorageStrict(STORAGE_KEYS.RESOURCES, items);
}

function loadLinks(): ResourcePlanLink[] {
  return loadFromStorage<ResourcePlanLink[]>(STORAGE_KEYS.RESOURCE_PLAN_LINKS, []);
}

function persistLinks(links: ResourcePlanLink[]): void {
  saveToStorageStrict(STORAGE_KEYS.RESOURCE_PLAN_LINKS, links);
}

function loadViews(): ResourceViewRecord[] {
  return loadFromStorage<ResourceViewRecord[]>(STORAGE_KEYS.RESOURCE_VIEWS, []);
}

function persistViews(views: ResourceViewRecord[]): void {
  saveToStorageStrict(STORAGE_KEYS.RESOURCE_VIEWS, views);
}

function ensureResourceAdmin(): void {
  const role = authService.getSession()?.user.role;
  if (!role || !RESOURCE_ADMIN_ROLES.includes(role as (typeof RESOURCE_ADMIN_ROLES)[number])) {
    throw new Error("只有资源审核员或管理员可以维护公共资源");
  }
}

export const resourceService = {
  subscribe(listener: () => void): () => void {
    return subscribeResources(listener);
  },

  getVersion(): number {
    return getResourceStoreVersion();
  },

  // ==================== 用户端读取 ====================

  /** 公共资源浏览：仅正常且合规（用户端不会看到停用/失效/待复核/权利不明项） */
  browseAll(): ResourceItem[] {
    return listBrowseable(loadResources(), nowIso());
  },

  getById(id: string): ResourceItem | null {
    return loadResources().find((r) => r.id === id) ?? null;
  },

  /** 为单个缺口返回最多 3 个匹配资源（规则层完成全部过滤与排序） */
  matchGap(moduleKey: string, target: ExamTarget): ResourceMatch[] {
    return matchGapRules(loadResources(), moduleKey, target, nowIso());
  },

  /** 无匹配时的查找建议 */
  searchAdvice(moduleKey: string): string[] {
    return gapSearchAdvice(moduleKey);
  },

  /** 合规闸门结果（调试/透明化用） */
  explainEligibility(resourceId: string) {
    const r = this.getById(resourceId);
    return r ? checkRecommendable(r, nowIso()) : { ok: false, reasons: ["资源不存在"] };
  },

  // ==================== 用户行为记录 ====================

  /** 点击“查看来源”时记录查看（不去重，反映真实查看次数） */
  recordView(resourceId: string): ResourceViewRecord | null {
    const userId = currentUserId();
    if (!userId) return null;
    const record: ResourceViewRecord = {
      id: `rvw-${Date.now()}`,
      userId,
      resourceId,
      viewedAt: nowIso(),
    };
    const views = loadViews();
    views.push(record);
    persistViews(views);
    emitResourcesChanged();
    track("resource_viewed", "resource", { props: { resourceId } });
    return record;
  },

  listViews(): ResourceViewRecord[] {
    const userId = currentUserId();
    if (!userId) return [];
    return loadViews().filter((v) => v.userId === userId);
  },

  listMyLinks(examTargetId?: string): ResourcePlanLink[] {
    const userId = currentUserId();
    if (!userId) return [];
    return loadLinks()
      .filter((l) => l.userId === userId && (!examTargetId || l.examTargetId === examTargetId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /**
   * 加入本周计划：生成“待安排”任务数据。
   * 同一目标+资源+模块已有未放弃记录时直接返回原记录，不重复生成。
   */
  addToPlan(resourceId: string, examTargetId: string, module: string): ResourcePlanLink {
    const userId = currentUserId();
    if (!userId) throw new Error("请先登录");
    const resource = this.getById(resourceId);
    if (!resource) throw new Error("资源不存在");
    if (!checkRecommendable(resource, nowIso()).ok) {
      throw new Error("该资源已停用、失效或待复核，不能加入计划");
    }
    const links = loadLinks();
    const existing = links.find(
      (l) =>
        l.userId === userId &&
        l.resourceId === resourceId &&
        l.examTargetId === examTargetId &&
        l.module === module &&
        l.status !== "dismissed"
    );
    if (existing) return existing;
    const ts = nowIso();
    const link: ResourcePlanLink = {
      id: `rpl-${Date.now()}`,
      userId,
      resourceId,
      examTargetId,
      module,
      status: "pending_arrangement",
      estimatedMinutes: resource.estimatedMinutes,
      createdAt: ts,
      updatedAt: ts,
    };
    links.push(link);
    persistLinks(links);
    emitResourcesChanged();
    track("resource_added_to_plan", "resource", {
      targetId: examTargetId,
      props: { resourceId, module },
    });
    return link;
  },

  updateLinkStatus(linkId: string, status: ResourceLinkStatus): ResourcePlanLink | null {
    const userId = currentUserId();
    if (!userId) return null;
    const links = loadLinks();
    const index = links.findIndex((l) => l.id === linkId && l.userId === userId);
    if (index === -1) return null;
    const previous = links[index].status;
    links[index] = { ...links[index], status, updatedAt: nowIso() };
    persistLinks(links);
    emitResourcesChanged();
    // 首次进入“使用中/已使用”记一次实际使用转化（重复状态变更不重复计数）
    if (
      (status === "in_use" || status === "used") &&
      previous !== "in_use" &&
      previous !== "used"
    ) {
      track("resource_used", "resource", {
        targetId: links[index].examTargetId,
        props: { resourceId: links[index].resourceId, stage: status },
      });
    }
    return links[index];
  },

  /** 放弃待安排任务（移出计划） */
  dismissLink(linkId: string): void {
    this.updateLinkStatus(linkId, "dismissed");
  },

  // ==================== 后台管理（资源审核员/管理员） ====================

  adminListAll(): ResourceItem[] {
    return loadResources().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  adminQueues(): ResourceQueues {
    const all = loadResources();
    const queues: ResourceQueues = { all, active: [], pending_review: [], expired: [], inactive: [] };
    for (const r of all) {
      queues[classifyQueue(r, nowIso())].push(r);
    }
    return queues;
  },

  /** 资源使用统计（查看次数、加入计划次数，全部账号汇总） */
  adminStats(): Record<string, { views: number; planLinks: number }> {
    const views = loadViews();
    const links = loadLinks();
    const stats: Record<string, { views: number; planLinks: number }> = {};
    const ensure = (id: string) => (stats[id] ??= { views: 0, planLinks: 0 });
    views.forEach((v) => {
      ensure(v.resourceId).views += 1;
    });
    links.filter((l) => l.status !== "dismissed").forEach((l) => {
      ensure(l.resourceId).planLinks += 1;
    });
    return stats;
  },

  adminCreate(input: ResourceItemInput): ResourceItem {
    ensureResourceAdmin();
    const now = nowIso();
    const resource = normalizeResource({
      ...input,
      id: `pr-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    });
    const items = loadResources();
    items.push(resource);
    persistResources(items);
    emitResourcesChanged();
    return resource;
  },

  adminUpdate(id: string, patch: Partial<ResourceItemInput>): ResourceItem | null {
    ensureResourceAdmin();
    const items = loadResources();
    const index = items.findIndex((r) => r.id === id);
    if (index === -1) return null;
    items[index] = normalizeResource({ ...items[index], ...patch, id, updatedAt: nowIso() });
    persistResources(items);
    emitResourcesChanged();
    return items[index];
  },

  /** 停用：立即不再产生新推荐（既有“待安排”记录保留，不做静默删除） */
  adminDeactivate(id: string): ResourceItem | null {
    ensureResourceAdmin();
    return this.adminUpdate(id, { status: "inactive" });
  },

  adminReactivate(id: string): ResourceItem | null {
    ensureResourceAdmin();
    return this.adminUpdate(id, { status: "active" });
  },

  /** 标记已复核：刷新复核时间/链接状态并恢复正常 */
  adminMarkReviewed(id: string, linkAlive: boolean): ResourceItem | null {
    const reviewerName = authService.getSession()?.user.name ?? "资源审核员";
    const ts = nowIso();
    return this.adminUpdate(id, {
      status: "active",
      linkAlive,
      lastReviewedAt: ts,
      linkCheckedAt: ts,
      reviewedBy: reviewerName,
    });
  },
};

/** 供表单使用的空资源草稿 */
export function createEmptyResourceInput(): ResourceItemInput {
  return {
    title: "",
    description: "",
    resourceType: "official",
    sourceName: "",
    sourceUrl: "",
    rightsStatus: "official" as RightsStatus,
    applicableRegions: ["全国"],
    year: undefined,
    applicableLevels: [] as EducationLevel[],
    applicableTypes: [] as ExamType[],
    modules: [],
    recommendReason: "",
    suggestedChapters: [],
    estimatedMinutes: 60,
    lastReviewedAt: nowIso(),
    expiresAt: undefined,
    linkCheckedAt: nowIso(),
    linkAlive: true,
    status: "active" as ResourceStatus,
  };
}
