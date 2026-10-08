"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn, formatDateTime } from "@/lib/utils";
import { CORRECTION_TIMELINE_ACTION_LABELS } from "@/types";
import { useAdminCorrections } from "@/lib/governance/useGovernance";
import {
  AdminCorrectionView,
  correctionService,
} from "@/lib/governance/correctionService";
import {
  CORRECTION_QUEUE_LABELS,
  CorrectionQueueKey,
} from "@/lib/governance/domain";
import { CorrectionStatusBadge } from "@/components/governance/badges";
import { useCurrentUser } from "@/lib/auth";

const QUEUE_TABS: CorrectionQueueKey[] = [
  "open",
  "submitted",
  "need_info",
  "processing",
  "accepted",
  "rejected",
  "all",
];

/** /admin/feedback：跨用户纠错队列 + 处理动作（采纳/驳回/要求补充） */
export function CorrectionQueuePanel() {
  const [queue, setQueue] = useState<CorrectionQueueKey>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { views, counts } = useAdminCorrections(queue);
  const selected = views.find((v) => v.correction.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* 队列 */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {QUEUE_TABS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setQueue(key)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-colors",
                queue === key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              {CORRECTION_QUEUE_LABELS[key]}
              <span
                className={cn(
                  "ml-1.5 inline-flex min-w-5 justify-center rounded-full px-1.5 text-xs",
                  queue === key ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"
                )}
              >
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        {views.length === 0 ? (
          <EmptyState
            icon={<span className="text-4xl">📭</span>}
            title="该队列暂无纠错"
            description="用户在「这次考试怎么考」页提交的纠错会按状态进入对应队列"
          />
        ) : (
          <ul className="space-y-2">
            {views.map((view) => (
              <li key={view.correction.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(view.correction.id)}
                  className={cn(
                    "w-full text-left rounded-xl border bg-white p-3 transition-colors",
                    selectedId === view.correction.id
                      ? "border-blue-400 ring-1 ring-blue-200"
                      : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {view.correction.subject}
                    </p>
                    <CorrectionStatusBadge status={view.correction.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                    {view.correction.description}
                  </p>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    {view.submitterName} ·{" "}
                    {view.target ? view.target.name : "目标已不存在"} ·{" "}
                    {formatDateTime(view.correction.createdAt)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 详情与处理 */}
      <div className="lg:col-span-3">
        {selected ? (
          <CorrectionAdminDetail
            key={selected.correction.id}
            view={selected}
            onHandled={() => setSelectedId(null)}
          />
        ) : (
          <Card className="min-h-[320px] flex items-center justify-center">
            <EmptyState
              icon={<span className="text-4xl">🔎</span>}
              title="选择一条纠错查看详情"
              description="可以查看纠错对象、问题描述、补充来源与提交人的完整处理时间线"
            />
          </Card>
        )}
      </div>
    </div>
  );
}

function CorrectionAdminDetail({
  view,
  onHandled,
}: {
  view: AdminCorrectionView;
  onHandled: () => void;
}) {
  const { role } = useCurrentUser();
  const { correction: c, target, linkedItem, submitterName } = view;
  const canAct = role === "exam_reviewer" || role === "admin";
  const terminal = c.status === "accepted" || c.status === "rejected";

  const [mode, setMode] = useState<"accept" | "reject" | "request_info" | null>(null);
  const [resultNote, setResultNote] = useState("");
  const [applyToEvidence, setApplyToEvidence] = useState(true);
  const [finalValue, setFinalValue] = useState(c.suggestedValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const run = (fn: () => void) => {
    setError(null);
    setBusy(true);
    try {
      fn();
      setDone("处理结果已记录，提交人将收到站内通知。");
      setMode(null);
      onHandled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {c.targetType === "evidence" ? "考情结论纠错 · " : "其他信息纠错 · "}
            {c.subject}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {submitterName} · {target ? target.name : "目标已不存在"} · 提交于{" "}
            {formatDateTime(c.createdAt)}
          </p>
        </div>
        <CorrectionStatusBadge status={c.status} />
      </div>

      <dl className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
        {c.currentValue && (
          <div>
            <dt className="text-xs text-slate-400">提交时当前内容</dt>
            <dd className="mt-0.5 text-slate-700">{c.currentValue}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-slate-400">问题描述</dt>
          <dd className="mt-0.5 text-slate-700 whitespace-pre-line">{c.description}</dd>
        </div>
        {c.suggestedValue && (
          <div>
            <dt className="text-xs text-slate-400">提交人认为正确的内容</dt>
            <dd className="mt-0.5 text-slate-700 whitespace-pre-line">{c.suggestedValue}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-slate-400">补充来源（{c.sources.length}）</dt>
          <dd className="mt-1 space-y-1">
            {c.sources.map((s) => (
              <p key={s.id} className="text-xs text-slate-600">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                    {s.url} ↗
                  </a>
                ) : null}
                {s.url && s.note ? <span className="text-slate-400">（{s.note}）</span> : !s.url ? s.note : null}
              </p>
            ))}
          </dd>
        </div>
        {linkedItem && (
          <div className="border-t border-slate-100 pt-2">
            <dt className="text-xs text-slate-400">关联证据当前值</dt>
            <dd className="mt-0.5 text-slate-700">
              {linkedItem.value || "（空值）"}{" "}
              <span className="text-[11px] text-slate-400">v{linkedItem.version}</span>
            </dd>
          </div>
        )}
      </dl>

      {c.resultNote && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-xs",
            c.status === "accepted"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : c.status === "need_info"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-slate-50 text-slate-600"
          )}
        >
          <p className="font-medium">
            {c.handlerName ? `${c.handlerName}：` : ""}
            {c.status === "need_info" ? "要求补充" : "处理说明"}
          </p>
          <p className="mt-0.5 whitespace-pre-line">{c.resultNote}</p>
        </div>
      )}

      {/* 处理动作 */}
      {!terminal &&
        (canAct ? (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            {c.status === "submitted" && (
              <Button size="sm" variant="outline" onClick={() => correctionService.startProcessing(c.id)}>
                认领并开始处理
              </Button>
            )}

            {!mode && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setMode("accept")}>
                  采纳
                </Button>
                <Button size="sm" variant="outline" onClick={() => setMode("request_info")}>
                  要求补充
                </Button>
                <Button size="sm" variant="danger" onClick={() => setMode("reject")}>
                  驳回
                </Button>
              </div>
            )}

            {mode === "accept" && (
              <div className="space-y-3">
                {c.evidenceItemId && (
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={applyToEvidence}
                      onChange={(e) => setApplyToEvidence(e.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      同步更新关联考情结论为最终值
                      <span className="block text-xs text-slate-400">
                        将走“修改后通过”人工审核并写 ReviewLog；不勾选则只记录采纳、不改证据
                      </span>
                    </span>
                  </label>
                )}
                {applyToEvidence && c.evidenceItemId && (
                  <Textarea
                    label="最终结论值"
                    className="min-h-[64px]"
                    value={finalValue}
                    onChange={(e) => setFinalValue(e.target.value)}
                  />
                )}
                <Textarea
                  label="给提交人的处理说明（选填，将随结果通知发送）"
                  className="min-h-[56px]"
                  value={resultNote}
                  onChange={(e) => setResultNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        correctionService.accept(c.id, {
                          resultNote,
                          applyToEvidence: c.evidenceItemId ? applyToEvidence : false,
                          finalValue,
                        })
                      )
                    }
                  >
                    确认采纳
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
                    取消
                  </Button>
                </div>
              </div>
            )}

            {mode === "reject" && (
              <div className="space-y-3">
                <Textarea
                  label="驳回原因（必填，将通知提交人）"
                  className="min-h-[72px]"
                  value={resultNote}
                  onChange={(e) => setResultNote(e.target.value)}
                  placeholder="说明为什么未采纳，以及还需要哪些依据"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy || !resultNote.trim()}
                    onClick={() => run(() => correctionService.reject(c.id, resultNote))}
                  >
                    确认驳回
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
                    取消
                  </Button>
                </div>
              </div>
            )}

            {mode === "request_info" && (
              <div className="space-y-3">
                <Textarea
                  label="需要提交人补充的内容（必填）"
                  className="min-h-[72px]"
                  value={resultNote}
                  onChange={(e) => setResultNote(e.target.value)}
                  placeholder="例如：请补充公告原文中关于分值计算的具体段落或链接"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy || !resultNote.trim()}
                    onClick={() => run(() => correctionService.requestInfo(c.id, resultNote))}
                  >
                    发送补充请求
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
                    取消
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            资源审核员账号仅可浏览纠错队列，采纳、驳回与要求补充需要考情审核员或管理员权限。
          </div>
        ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-emerald-700">{done}</p>}

      {/* 时间线 */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">处理时间线</p>
        <ol className="space-y-2 border-l-2 border-slate-100 pl-3">
          {c.timeline.map((entry) => (
            <li key={entry.id} className="text-xs">
              <p className="font-medium text-slate-700">
                {CORRECTION_TIMELINE_ACTION_LABELS[entry.action]}
                <span className="ml-2 font-normal text-slate-400">
                  {entry.actorName} · {formatDateTime(entry.at)}
                </span>
              </p>
              {entry.note && <p className="mt-0.5 text-slate-500">{entry.note}</p>}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
