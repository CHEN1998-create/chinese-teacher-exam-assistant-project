"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { EVIDENCE_TYPE_LABELS } from "@/types";
import { correctionService } from "@/lib/governance/correctionService";
import type { RetractionRecord } from "@/types";

/**
 * 错误结论撤回入口（挂在审核详情内）：
 * 先预览影响范围（目标/用户/计划/任务），填写撤回原因与给用户的变化说明后确认。
 * 仅考情审核员/管理员可用；资源审核员不渲染本面板（service 层另有强制鉴权）。
 */
export function RetractConclusionPanel({
  evidenceItemId,
  canAct,
  retracted = false,
}: {
  evidenceItemId: string;
  canAct: boolean;
  /** 结论当前已是“待确认”（可能由本面板刚刚撤回，也可能本就待确认） */
  retracted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [userNotice, setUserNotice] = useState("");
  const [preview, setPreview] = useState<ReturnType<
    typeof correctionService.previewRetraction
  > | null>(null);
  const [record, setRecord] = useState<RetractionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canAct) return null;
  // 已是待确认且非本次撤回（无本地成功记录）时不展示入口；
  // 若本次撤回刚完成（record 存在），继续展示成功提示，避免结论状态变化导致面板卸载。
  if (retracted && !record) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setError(null);
    setRecord(null);
    if (next && !preview) {
      try {
        const result = correctionService.previewRetraction(evidenceItemId);
        setPreview(result);
        setUserNotice(
          `你关注的考试目标中「${EVIDENCE_TYPE_LABELS[result.item.field]}」原结论经核实有误，现已撤回并显示为待确认。请以最新官方公告为准，相关学习计划可能需要重新确认。`
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "无法获取影响范围");
      }
    }
  };

  const confirm = () => {
    setBusy(true);
    setError(null);
    try {
      const result = correctionService.retractConclusion({
        evidenceItemId,
        reason,
        userNotice,
      });
      setRecord(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "撤回失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-red-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">错误结论撤回（治理操作）</p>
          <p className="mt-1 text-xs text-slate-500">
            撤回后该结论及同字段同值结论都会置为“待确认”，原值保留在审核留痕中；
            受影响用户会收到变化说明，高影响字段会要求其重新确认计划任务。
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={toggle}>
          {open ? "取消撤回" : "撤回错误结论"}
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}

          {record ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="font-medium">撤回已完成，留痕编号 {record.id}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                <li>受影响目标 {record.impact.targetIds.length} 个、用户 {record.impact.userIds.length} 位</li>
                <li>执行中计划 {record.impact.planIds.length} 个、待重新确认任务 {record.impact.taskIds.length} 项</li>
                <li>同值结论 {record.impact.evidenceItemIds.length} 条一并撤回</li>
                <li>已向 {record.notifiedUserIds.length} 位用户送达站内通知（其余被其通知设置抑制）</li>
              </ul>
            </div>
          ) : (
            <>
              {preview && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <p className="font-medium">影响范围预览（确认前不会改动任何数据）</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    <li>
                      受影响目标 {preview.impact.targetIds.length} 个：
                      {preview.targets.map((t) => t.name).join("、") || "无"}
                    </li>
                    <li>受影响用户 {preview.impact.userIds.length} 位</li>
                    <li>执行中计划 {preview.impact.planIds.length} 个</li>
                    <li>
                      {preview.highImpact
                        ? `高影响字段：执行中计划的 ${preview.impact.taskIds.length} 个任务将标记为待重新确认`
                        : "非高影响字段：只发送通知，不打断既有计划"}
                    </li>
                    <li>同字段同值结论 {preview.impact.evidenceItemIds.length} 条将一并撤回</li>
                  </ul>
                </div>
              )}

              <Textarea
                label="撤回原因（必填，写入审计留痕）"
                className="min-h-[64px]"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例如：经与 2026 年最新公告核对，该结论引用了去年公告，分值计算口径错误"
              />
              <Textarea
                label="给受影响用户的变化说明（必填，随通知发送）"
                className="min-h-[80px]"
                value={userNotice}
                onChange={(e) => setUserNotice(e.target.value)}
              />
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy || !reason.trim() || !userNotice.trim()}
                  onClick={confirm}
                >
                  {busy ? "处理中…" : "确认撤回并通知用户"}
                </Button>
                {(!reason.trim() || !userNotice.trim()) && (
                  <span className="text-xs text-slate-400">撤回原因与变化说明均为必填</span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
