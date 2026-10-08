"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { ReviewStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn, formatDateTime } from "@/lib/utils";
import {
  EVIDENCE_SOURCE_TYPE_LABELS,
  EVIDENCE_TYPE_LABELS,
  EvidenceType,
  REVIEW_ACTION_LABELS,
  REVIEW_REASON_PRESETS,
  ReviewActionType,
  USER_ROLE_LABELS,
} from "@/types";
import { adminReviewService } from "@/lib/admin/adminReviewService";
import { canReviewField } from "@/lib/admin/domain";
import { isHighImpact } from "@/lib/evidence/domain";
import { useReviewDetail } from "@/lib/admin/useAdminReviews";
import { RetractConclusionPanel } from "@/components/admin/RetractConclusionPanel";
import { useCurrentUser } from "@/lib/auth";

const ACTIONS: ReviewActionType[] = [
  "approve",
  "approve_with_edit",
  "reject",
  "mark_unconfirmed",
  "mark_conflict",
];

const ACTION_STYLES: Record<ReviewActionType, string> = {
  approve: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700",
  approve_with_edit: "border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
  reject: "border-red-600 bg-red-600 text-white hover:bg-red-700",
  mark_unconfirmed: "border-amber-500 bg-amber-500 text-white hover:bg-amber-600",
  mark_conflict: "border-rose-600 bg-rose-600 text-white hover:bg-rose-700",
};

function lockReason(role: string, field: EvidenceType): string {
  if (role === "resource_reviewer" && isHighImpact(field)) {
    return "高影响考情（报名时间/考试日期/科目/分值/资格条件）需要考情审核权限，资源审核员仅可审核低影响字段";
  }
  return "当前角色没有考情审核权限";
}

interface ReviewDetailProps {
  itemId: string | null;
  onClose?: () => void;
}

/** 审核详情：原始来源 / AI 提取值 / 当前发布值 / 适用范围 / 历史版本 + 审核动作 */
export function ReviewDetail({ itemId, onClose }: ReviewDetailProps) {
  const detail = useReviewDetail(itemId);
  const { role } = useCurrentUser();

  // 注意：父组件以 key={itemId} 挂载本组件，切换结论即整体重挂载，
  // 因此表单初始状态可以直接从详情读取，无需在 effect 中重置。
  const [action, setAction] = useState<ReviewActionType | null>(null);
  const [editedValue, setEditedValue] = useState(detail?.item.value ?? "");
  const [reasonPreset, setReasonPreset] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [doneAt, setDoneAt] = useState<string | null>(null);

  if (!itemId) {
    return (
      <Card className="h-full min-h-[320px] flex items-center justify-center">
        <EmptyState
          icon={<span className="text-4xl">🔎</span>}
          title="选择一条结论开始审核"
          description="左侧队列中的每条 AI 提取结论都可以查看原始来源、当前发布值与历史版本"
        />
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card className="h-full min-h-[320px] flex items-center justify-center">
        <EmptyState
          icon={<span className="text-4xl">⚠️</span>}
          title="结论不存在"
          description="它可能已被其他审核员处理，或数据已被重置"
        />
      </Card>
    );
  }

  const { item, target, fieldItems, published, logs } = detail;
  const locked = !role || !canReviewField(role, item.field);
  const highImpact = isHighImpact(item.field);

  const pickAction = (next: ReviewActionType) => {
    setError(null);
    setDoneAt(null);
    setReasonPreset("");
    setEditedValue(item.value);
    setAction((prev) => (prev === next ? null : next));
  };

  const handleSubmit = () => {
    if (!action) return;
    setSubmitting(true);
    setError(null);
    try {
      adminReviewService.submitReview({
        evidenceItemId: item.id,
        action,
        editedValue: action === "approve_with_edit" ? editedValue : undefined,
        reasonPreset,
        reasonNote,
      });
      setDoneAt(new Date().toLocaleString("zh-CN", { hour12: false }));
      setAction(null);
      setReasonPreset("");
      setReasonNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 标题区 */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span className="text-base font-semibold text-slate-900">
                {EVIDENCE_TYPE_LABELS[item.field]}
              </span>
              {highImpact && (
                <span className="px-1.5 py-px rounded bg-amber-100 text-amber-700 text-[10px] font-medium">
                  高影响 · 必须人工审核
                </span>
              )}
              {item.reviewerFlaggedConflict && (
                <span className="px-1.5 py-px rounded bg-red-100 text-red-700 text-[10px] font-medium">
                  已标记来源冲突
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500 truncate">{target?.name ?? "未知目标"}</p>
            <p className="mt-0.5 text-xs text-slate-400">适用范围：{item.scope}</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <ReviewStatusBadge status={item.reviewStatus} />
            <span className="text-[11px] text-slate-400">版本 v{item.version}</span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                关闭详情
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* 三块对照：原始来源 / AI 提取值 / 当前发布值 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card padding="sm">
          <p className="text-xs font-semibold text-slate-700 mb-1.5">原始来源</p>
          <p className="text-sm text-slate-900">{item.sourceName || "未知来源"}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {EVIDENCE_SOURCE_TYPE_LABELS[item.sourceType]}
          </p>
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-blue-600 hover:underline break-all"
            >
              打开来源链接 ↗
            </a>
          )}
          {item.sourceExcerpt && (
            <p className="mt-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-2 py-1.5 border-l-2 border-slate-200">
              {item.sourceExcerpt}
            </p>
          )}
        </Card>

        <Card padding="sm" className="border-blue-200">
          <p className="text-xs font-semibold text-slate-700 mb-1.5">
            AI 提取值
            <span className="ml-1 font-normal text-slate-400">
              更新于 {formatDateTime(item.updatedAt)}
            </span>
          </p>
          <p className="text-sm text-slate-900 whitespace-pre-line min-h-[40px]">
            {item.value || "（空值：未提取到）"}
          </p>
        </Card>

        <Card padding="sm" className={published ? "border-emerald-200" : ""}>
          <p className="text-xs font-semibold text-slate-700 mb-1.5">当前发布值</p>
          {published ? (
            <>
              <p className="text-sm text-slate-900 whitespace-pre-line min-h-[40px]">
                {published.value}
              </p>
              <p className="mt-1 text-[11px] text-emerald-600">
                {published.reviewerName ? `${published.reviewerName} ` : ""}
                {published.reviewedAt ? formatDateTime(published.reviewedAt) : ""} 发布 · v
                {published.version}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400 min-h-[40px]">
              暂无已发布版本，用户端当前显示“待确认”或历史参考信息
            </p>
          )}
        </Card>
      </div>

      {/* 同字段全部来源（审核员可见含已驳回项的全貌） */}
      {fieldItems.length > 1 && (
        <Card padding="sm">
          <p className="text-xs font-semibold text-slate-700 mb-2">
            同字段全部来源结论（{fieldItems.length}）
          </p>
          <ul className="space-y-1.5">
            {fieldItems.map((other) => (
              <li
                key={other.id}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-xs",
                  other.id === item.id ? "border-blue-200 bg-blue-50/50" : "border-slate-200"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800 truncate">{other.sourceName}</span>
                  <ReviewStatusBadge status={other.reviewStatus} />
                </div>
                <p className="mt-0.5 text-slate-600 whitespace-pre-line">
                  {other.value || "（空值）"}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 审核动作 */}
      <Card>
        {locked ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            🔒 {role ? lockReason(role, item.field) : "请先登录"}
            。你可以浏览队列与详情，但不能执行审核动作。
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-800 mb-2">审核动作</p>
              <div className="flex flex-wrap gap-2">
                {ACTIONS.map((act) => (
                    <button
                      key={act}
                      type="button"
                      onClick={() => pickAction(act)}
                      className={cn(
                        "h-9 px-3.5 rounded-lg text-sm font-medium border transition-colors",
                        action === act
                          ? ACTION_STYLES[act]
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      {REVIEW_ACTION_LABELS[act]}
                    </button>
                  ))}
              </div>
            </div>

            {action === "approve_with_edit" && (
              <Textarea
                label="校正后的结论内容（将作为官方确认值发布）"
                className="min-h-[72px]"
                value={editedValue}
                onChange={(e) => setEditedValue(e.target.value)}
                placeholder="请对照原始来源填写校正后的内容"
              />
            )}

            {/* 提交结果反馈：独立于动作选择状态，提交成功后（action 已复位）仍展示 */}
            {doneAt && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">
                ✅ 审核动作已记录（{doneAt}），用户端证据卡状态已同步更新。
              </div>
            )}

            {action && (
              <>
                <Select
                  label="操作原因（必选）"
                  placeholder="请选择原因"
                  value={reasonPreset}
                  onChange={(e) => setReasonPreset(e.target.value)}
                  options={REVIEW_REASON_PRESETS[action].map((preset) => ({
                    value: preset,
                    label: preset,
                  }))}
                />
                <Textarea
                  label="补充说明（选填）"
                  className="min-h-[60px]"
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  placeholder="补充判断依据，例如公告中的具体表述"
                />
                {error && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700"
                  >
                    ⚠️ {error}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!reasonPreset || submitting}
                    className={ACTION_STYLES[action]}
                  >
                    {submitting ? "提交中…" : `确认${REVIEW_ACTION_LABELS[action]}`}
                  </Button>
                  {!reasonPreset && <span className="text-xs text-slate-400">请先选择操作原因</span>}
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      {/* 错误结论撤回（治理）：始终渲染，由面板内部控制可见性，
          保证撤回成功后（结论已变为待确认）成功提示不被卸载 */}
      <RetractConclusionPanel
        evidenceItemId={item.id}
        canAct={role === "exam_reviewer" || role === "admin"}
        retracted={item.reviewStatus === "unconfirmed"}
      />

      {/* 历史版本 / 审核留痕 */}
      <Card>
        <p className="text-sm font-semibold text-slate-800 mb-2">历史版本与审核记录</p>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-400">
            暂无审核记录{published ? "（该结论为预置官方数据）" : ""}。每次审核动作都会在此留痕。
          </p>
        ) : (
          <ol className="relative border-l-2 border-slate-100 ml-1 space-y-3">
            {logs.map((log) => (
              <li key={log.id} className="pl-3.5 relative">
                <span className="absolute -left-[5.5px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-300" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {REVIEW_ACTION_LABELS[log.action]}
                  </span>
                  <span className="text-[11px] text-slate-400">v{log.version}</span>
                  <span className="text-[11px] text-slate-400">
                    {log.reviewerName}（{USER_ROLE_LABELS[log.reviewerRole]}）·{" "}
                    {formatDateTime(log.reviewedAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">原因：{log.reason}</p>
                {(log.beforeValue !== log.afterValue ||
                  log.beforeStatus !== log.afterStatus) && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    内容：
                    <span className="text-slate-400 line-through">{log.beforeValue || "（空）"}</span>
                    {" → "}
                    <span className="text-slate-700">{log.afterValue || "（空）"}</span>
                    <span className="ml-1 text-slate-400">
                      （{log.beforeStatus} → {log.afterStatus}）
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
