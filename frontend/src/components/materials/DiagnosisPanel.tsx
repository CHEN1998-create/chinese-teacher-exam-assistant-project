"use client";

import { useState, useEffect } from "react";
import {
  EVIDENCE_TYPE_LABELS,
  MaterialDiagnosisSnapshot,
  MATERIAL_RECOMMENDATION_LABELS,
  MaterialRecommendation,
  UsageStatus,
} from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { materialService } from "@/lib/materials/materialService";
import {
  EvidenceReadiness,
  MIN_MATERIAL_CATEGORIES,
  moduleLabel,
  requiredModuleKeys,
} from "@/lib/materials/domain";
import { ExamTarget, MaterialItem } from "@/types";
import { GapResourcePanel } from "@/components/resources/GapResourcePanel";
import { trackView } from "@/lib/analytics/eventService";

const RECOMMENDATION_VARIANT: Record<MaterialRecommendation, "success" | "warning" | "danger"> = {
  continue: "success",
  partial: "warning",
  pause: "danger",
};

interface DiagnosisPanelProps {
  target: ExamTarget | null;
  targetId: string;
  inventoryStatus: UsageStatus;
  materials: MaterialItem[];
  snapshot: MaterialDiagnosisSnapshot | null;
  readiness: EvidenceReadiness | null;
  stale: boolean;
}

export function DiagnosisPanel({
  target,
  targetId,
  inventoryStatus,
  materials,
  snapshot,
  readiness,
  stale,
}: DiagnosisPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // 打开“资料怎么用”标签即记录一次查看（同一会话去重）
  useEffect(() => {
    trackView(targetId, "diagnosis_viewed", "material", { targetId });
  }, [targetId]);

  const handleRecompute = () => {
    setRunning(true);
    setError(null);
    try {
      materialService.recompute(targetId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析失败，请重试");
    } finally {
      setRunning(false);
    }
  };

  // ---- 无资料：最小资料类别清单 ----
  if (materials.length === 0 && (!snapshot || snapshot.materialDiagnoses.length === 0)) {
    return (
      <div className="space-y-4">
        {readiness && !readiness.complete && <EvidenceWarning readiness={readiness} />}
        <EmptyState
          icon={<span className="text-4xl">🔎</span>}
          title="还没有资料，先看最少需要准备什么"
          description="不必一次买齐：先按下面的最小资料类别补齐主干，其余模块等考情确认后再决定。"
        />
        <div className="space-y-2">
          {MIN_MATERIAL_CATEGORIES.filter(
            (cat) => !cat.generalPaperOnly || readiness?.hasGeneralPaper
          ).map((cat, index) => (
            <Card key={cat.key} padding="sm">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-900">{cat.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{cat.desc}</p>
                </div>
              </div>
            </Card>
          ))}
          {readiness && !readiness.hasGeneralPaper && (
            <p className="px-1 text-xs text-slate-400">
              「教育综合知识教材」当前未列为必需：现有官方考情未确认笔试含教育综合科目；若考情更新，
              重新计算后清单会自动调整。
            </p>
          )}
        </div>
        <p className="px-1 text-xs text-slate-400">
          这里只给出资料类别，不提供购买链接，也不按平台热度或商业合作做推荐。
        </p>
        {target && readiness && (
          <GapResourcePanel target={target} modules={requiredModuleKeys(readiness)} />
        )}
      </div>
    );
  }

  // ---- 有资料但还没生成诊断 ----
  if (!snapshot) {
    return (
      <div className="space-y-4">
        {readiness && !readiness.complete && <EvidenceWarning readiness={readiness} />}
        <EmptyState
          icon={<span className="text-4xl">🩺</span>}
          title="资料已就绪，还没有分析怎么用"
          description="点击生成后，规则层会结合你准备的考试、已核对考情和准备情况，逐项给出使用结论与原因。"
          actionLabel="分析资料怎么用"
          onAction={handleRecompute}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {readiness && !readiness.complete && <EvidenceWarning readiness={readiness} />}

      {stale && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <span className="text-amber-600">⚠</span>
            <div>
              <p className="text-sm font-medium text-amber-800">分析可能已过时</p>
              <p className="text-xs text-amber-700">
                考试、考情、资料或准备情况在上次分析后发生了变化（包括切换当前考试），请重新计算。
              </p>
            </div>
          </div>
          <Button size="sm" onClick={handleRecompute} disabled={running}>
            {running ? "计算中…" : "重新计算"}
          </Button>
        </div>
      )}

      {/* 结论总览：缺什么、薄弱什么 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card padding="sm">
          <p className="text-sm font-semibold text-slate-900">当前缺少的模块</p>
          {snapshot.missingModules.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              必需模块都已有可用（继续使用或部分使用）的资料覆盖。
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {snapshot.missingModules.map((key) => (
                <Badge key={key} variant={snapshot.weakModules.includes(key) ? "danger" : "warning"}>
                  {moduleLabel(key)}
                  {snapshot.weakModules.includes(key) ? "（也是薄弱项）" : ""}
                </Badge>
              ))}
            </div>
          )}
        </Card>
        <Card padding="sm">
          <p className="text-sm font-semibold text-slate-900">能力薄弱项（来自自评/成绩/手动标注）</p>
          {snapshot.weakModules.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              暂未识别到薄弱模块：可在「准备情况」页补充自评与最近成绩。
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {snapshot.weakModules.map((key) => (
                <Badge key={key} variant="danger">
                  {moduleLabel(key)}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 资料缺口 → 公共资源匹配（每缺口最多 3 个；无合规资源显示空态与查找建议） */}
      {target && <GapResourcePanel target={target} modules={snapshot.missingModules} />}

      {/* 冲突取舍 */}
      {snapshot.conflictGroups.length > 0 && (
        <Card padding="sm">
          <p className="text-sm font-semibold text-slate-900">多套资料取舍</p>
          <div className="mt-2 space-y-2">
            {snapshot.conflictGroups.map((group) => (
              <div key={group.module} className="rounded-lg border border-slate-200 p-2.5">
                <p className="text-xs font-medium text-slate-800">
                  {group.moduleLabel}：保留《{materials.find((m) => m.id === group.keepMaterialId)?.name ?? "当前资料"}》
                </p>
                <ul className="mt-1 space-y-0.5">
                  {group.paused.map((p) => (
                    <li key={p.materialId} className="text-xs text-slate-500">
                      · 《{materials.find((m) => m.id === p.materialId)?.name ?? "已删除资料"}》本周暂缓 —— {p.reason}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-slate-400">{group.advice}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 逐份资料分析 */}
      <div className="space-y-3">
        {snapshot.materialDiagnoses.map((diagnosis) => {
          const material = materials.find((m) => m.id === diagnosis.materialId);
          return (
            <Card key={diagnosis.id} padding="sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {material?.name ?? "已删除的资料"}
                </p>
                <Badge variant={RECOMMENDATION_VARIANT[diagnosis.recommendation]}>
                  {MATERIAL_RECOMMENDATION_LABELS[diagnosis.recommendation]}
                </Badge>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{diagnosis.reason}</p>
              <div className="mt-2 space-y-1.5">
                {diagnosis.items.map((item) => (
                  <div key={item.module} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-slate-800">{item.moduleLabel}</span>
                      <Badge variant={RECOMMENDATION_VARIANT[item.recommendation]}>
                        {MATERIAL_RECOMMENDATION_LABELS[item.recommendation]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.reason}</p>
                    {item.relatedChapterTitles.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        相关章节：{item.relatedChapterTitles.join("、")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {diagnosis.warnings.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {diagnosis.warnings.map((w) => (
                    <p key={w} className="text-xs text-red-600">
                      ⚠ {w}
                    </p>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-slate-400">
          分析时间：{new Date(snapshot.diagnosedAt).toLocaleString("zh-CN")} ·
          入口状态：{inventoryStatus === "none" ? "还没有资料" : inventoryStatus === "single" ? "一套资料" : "多套资料"}
        </p>
        <Button variant="outline" size="sm" onClick={handleRecompute} disabled={running}>
          {stale ? "重新计算" : "按最新信息再算一次"}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function EvidenceWarning({ readiness }: { readiness: EvidenceReadiness }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-800">考情尚未完全核对，分析结果可能不完整</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-700">
        以下高影响字段还没有从官方公告核对：
        {readiness.pendingFields.map((f) => EVIDENCE_TYPE_LABELS[f]).join("、")}
        。当前分析先按已有考情与你的资料信息给出，考情核对后请重新计算。
      </p>
    </div>
  );
}
