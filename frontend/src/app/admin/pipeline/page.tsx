"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn, formatDateTime } from "@/lib/utils";
import { announcementsPipelineApi, type Run } from "@/lib/announcements-pipeline/api";

// ==================== 状态映射 ====================

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  submitted: { label: "已提交", className: "bg-slate-100 text-slate-600" },
  extracting: { label: "提取中", className: "bg-blue-100 text-blue-700" },
  pending_review: { label: "待审核", className: "bg-amber-100 text-amber-700" },
  approved: { label: "审核通过", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "已驳回", className: "bg-red-100 text-red-700" },
  failed: { label: "提取失败", className: "bg-red-100 text-red-700" },
  published: { label: "已发布", className: "bg-emerald-100 text-emerald-700" },
};

const HIGH_IMPACT_FIELDS = new Set([
  "registration_time",
  "exam_time",
  "subjects",
  "score",
  "qualification",
  "headcount",
  "employment_nature",
  "education",
  "major",
  "teacher_cert",
  "age",
]);

const FIELD_LABELS: Record<string, string> = {
  title: "公告标题",
  registration_time: "报名时间",
  exam_time: "考试时间",
  subjects: "考试科目",
  score: "分值",
  qualification: "资格条件",
  headcount: "招聘人数",
  exam_scope: "考试范围",
  employment_nature: "用工性质",
  education: "学历要求",
  major: "专业要求",
  teacher_cert: "教师资格",
  age: "年龄要求",
};

// ==================== 候选字段类型 ====================

interface CandidateField {
  field: string;
  value: string;
  anchor?: { locator: { kind: string; excerpt?: string }; excerpt?: string };
  confidence?: number;
}

// ==================== 主页面 ====================

export default function AdminPipelinePage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // 提交表单
  const [submitMode, setSubmitMode] = useState<"url" | "text">("url");
  const [publisher, setPublisher] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    try {
      setError(null);
      const list = await announcementsPipelineApi.listRuns();
      setRuns(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  // 初始加载：内联 fetch，避免在 effect 中直接调用含 setState 的函数
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await announcementsPipelineApi.listRuns();
        if (!cancelled) setRuns(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        publisher: publisher.trim() || "未命名来源",
        officialUrl: submitMode === "url" ? officialUrl.trim() : `text://${Date.now()}`,
        sourceType: submitMode === "url" ? "government" : "manual_text",
        content: submitMode === "url" ? officialUrl.trim() : content,
        mimeType: submitMode === "url" ? "text/plain" : "text/plain",
      };
      // 文本模式：content 是正文；URL 模式：首版把 URL 当作内容提交（生产环境应抓取）
      if (submitMode === "url") {
        // 首版 URL 模式实际提交 URL 字符串作为内容，解析器会提取标题等
        input.content = officialUrl.trim();
      }
      await announcementsPipelineApi.submitSource(input);
      setOfficialUrl("");
      setContent("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExtract = async (runId: string) => {
    try {
      await announcementsPipelineApi.runExtraction(runId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "提取失败");
    }
  };

  const handleRetry = async (runId: string) => {
    try {
      await announcementsPipelineApi.retryRun(runId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "重试失败");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">公告提取与审核流水线</h1>
        <p className="text-sm text-slate-500 mt-1">
          提交官方公告 → 机器提取候选 → 人工审核 → 发布不可变版本。高影响字段必须有证据锚点才能通过。
        </p>
      </div>

      {/* 提交区 */}
      <Card>
        <p className="text-sm font-semibold text-slate-800 mb-3">提交公告来源</p>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setSubmitMode("url")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm border",
              submitMode === "url"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-600"
            )}
          >
            公告链接
          </button>
          <button
            type="button"
            onClick={() => setSubmitMode("text")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm border",
              submitMode === "text"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-600"
            )}
          >
            粘贴正文
          </button>
        </div>

        <div className="space-y-3">
          <Input
            label="发布主体（如：杭州市教育局）"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            placeholder="可选，默认未命名来源"
          />
          {submitMode === "url" ? (
            <Input
              label="官方公告链接"
              value={officialUrl}
              onChange={(e) => setOfficialUrl(e.target.value)}
              placeholder="https://www.example.gov.cn/...（首版提交链接文本，生产环境抓取网页）"
            />
          ) : (
            <Textarea
              label="公告正文"
              className="min-h-[160px]"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="粘贴公告 HTML 或纯文本正文，系统会自动提取报名时间、考试时间、科目、分值、资格条件等字段"
            />
          )}
          <Button onClick={handleSubmit} disabled={submitting || (submitMode === "url" ? !officialUrl : !content)}>
            {submitting ? "提交中..." : "提交并创建提取任务"}
          </Button>
        </div>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* 任务列表 */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-800">提取任务列表</p>
          <Button size="sm" variant="outline" onClick={refresh}>
            刷新
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">加载中...</p>
        ) : runs.length === 0 ? (
          <EmptyState
            icon={<span className="text-4xl">📭</span>}
            title="还没有提取任务"
            description="在上方提交公告链接或正文，系统会创建提取任务"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3">来源</th>
                  <th className="py-2 pr-3">状态</th>
                  <th className="py-2 pr-3">提交时间</th>
                  <th className="py-2 pr-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const st = STATUS_LABELS[run.status] ?? { label: run.status, className: "bg-slate-100" };
                  return (
                    <tr key={run.id} className="border-b border-slate-100">
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-slate-800 truncate max-w-[200px]">
                          {run.snapshot?.source?.publisher ?? "未知来源"}
                        </p>
                        <p className="text-xs text-slate-400 truncate max-w-[200px]">
                          {run.snapshot?.officialUrl ?? run.snapshot?.contentHash?.slice(0, 12)}
                        </p>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={cn("px-2 py-0.5 rounded text-xs font-medium", st.className)}>
                          {st.label}
                        </span>
                        {run.errorMessage && (
                          <p className="text-xs text-red-500 mt-1 max-w-[180px] truncate">
                            {run.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-slate-500">
                        {formatDateTime(run.createdAt)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(run.status === "submitted" || run.status === "failed") && (
                            <Button size="sm" onClick={() => handleExtract(run.id)}>
                              {run.status === "failed" ? "重新提取" : "开始提取"}
                            </Button>
                          )}
                          {run.status === "failed" && (
                            <Button size="sm" variant="outline" onClick={() => handleRetry(run.id)}>
                              重置任务
                            </Button>
                          )}
                          {run.status === "pending_review" && (
                            <Button size="sm" onClick={() => setSelectedRunId(run.id)}>
                              去审核
                            </Button>
                          )}
                          {run.status === "approved" && (
                            <PublishButton runId={run.id} onPublished={refresh} />
                          )}
                          {run.status === "published" && (
                            <span className="text-xs text-emerald-600">已发布 v{run.publishedVersion?.versionNumber}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 审核面板 */}
      {selectedRunId && (
        <ReviewPanel
          runId={selectedRunId}
          onClose={() => setSelectedRunId(null)}
          onDone={() => {
            setSelectedRunId(null);
            refresh();
          }}
        />
      )}

      {/* 已发布版本 */}
      <PublishedVersionsSection runs={runs} />
    </div>
  );
}

// ==================== 发布按钮 ====================

function PublishButton({ runId, onPublished }: { runId: string; onPublished: () => void }) {
  const [publishing, setPublishing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={async () => {
          setPublishing(true);
          setErr(null);
          try {
            await announcementsPipelineApi.publish(runId);
            onPublished();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "发布失败");
          } finally {
            setPublishing(false);
          }
        }}
        disabled={publishing}
      >
        {publishing ? "发布中..." : "发布"}
      </Button>
      {err && <span className="text-xs text-red-500">{err}</span>}
    </div>
  );
}

// ==================== 审核面板（左侧原文 / 右侧字段） ====================

function ReviewPanel({
  runId,
  onClose,
  onDone,
}: {
  runId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [run, setRun] = useState<Run | null>(null);
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"approve" | "approve_with_edit" | "reject" | "mark_incomplete" | null>(null);
  const [reason, setReason] = useState("");
  const [editedFields, setEditedFields] = useState<CandidateField[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await announcementsPipelineApi.getRun(runId);
        if (cancelled) return;
        setRun(r);
        if (r.snapshot?.id) {
          const snap = await announcementsPipelineApi.getSnapshotContent(r.snapshot.id);
          if (!cancelled) setOriginalContent(snap.content);
        }
        const candidate = (r.candidate as { fields: CandidateField[] } | null) ?? { fields: [] };
        setEditedFields(candidate.fields);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-slate-400">加载审核详情...</p>
      </Card>
    );
  }

  if (error || !run) {
    return (
      <Card>
        <p className="text-sm text-red-600">{error ?? "任务不存在"}</p>
        <Button size="sm" variant="outline" onClick={onClose} className="mt-2">
          关闭
        </Button>
      </Card>
    );
  }

  const candidate = (run.candidate as { fields: CandidateField[] } | null) ?? { fields: [] };
  const highImpactMissing = candidate.fields.filter(
    (f) => HIGH_IMPACT_FIELDS.has(f.field) && !f.anchor
  );

  const handleSubmit = async () => {
    if (!action || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await announcementsPipelineApi.submitReview({
        runId,
        action,
        reason: reason.trim(),
        editedFields: action === "approve_with_edit" ? editedFields : undefined,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "审核提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">审核任务 {run.id.slice(0, 8)}</p>
          <p className="text-xs text-slate-500">
            来源：{run.snapshot?.source?.publisher ?? "未知"} · 解析器：{run.parserVersion}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onClose}>
          关闭
        </Button>
      </div>

      {highImpactMissing.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ 以下高影响字段缺少证据锚点，无法审核通过：
          {highImpactMissing.map((f) => (
            <span key={f.field} className="ml-1 font-medium">
              {FIELD_LABELS[f.field] ?? f.field}
            </span>
          ))}
        </div>
      )}

      {/* 左侧原文 / 右侧字段 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-2">原始公告内容</p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 max-h-[400px] overflow-y-auto">
            <pre className="text-xs text-slate-700 whitespace-pre-wrap break-words">
              {originalContent || "（无法读取原始内容）"}
            </pre>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-700 mb-2">
            提取候选字段（{candidate.fields.length} 项）
          </p>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {candidate.fields.length === 0 ? (
              <p className="text-sm text-slate-400">未提取到任何字段</p>
            ) : (
              candidate.fields.map((f, idx) => {
                const isHigh = HIGH_IMPACT_FIELDS.has(f.field);
                const hasAnchor = !!f.anchor;
                return (
                  <div key={f.field} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-700">
                        {FIELD_LABELS[f.field] ?? f.field}
                      </span>
                      {isHigh && (
                        <span className="px-1.5 py-px rounded bg-amber-100 text-amber-700 text-[10px]">
                          高影响
                        </span>
                      )}
                      {hasAnchor ? (
                        <span className="px-1.5 py-px rounded bg-emerald-100 text-emerald-700 text-[10px]">
                          有证据
                        </span>
                      ) : (
                        <span className="px-1.5 py-px rounded bg-red-100 text-red-700 text-[10px]">
                          无证据
                        </span>
                      )}
                    </div>
                    {action === "approve_with_edit" ? (
                      <Textarea
                        className="mt-1.5 min-h-[48px] text-xs"
                        value={editedFields[idx]?.value ?? f.value}
                        onChange={(e) => {
                          const next = [...editedFields];
                          next[idx] = { ...f, value: e.target.value };
                          setEditedFields(next);
                        }}
                      />
                    ) : (
                      <p className="mt-1 text-sm text-slate-900 break-words">{f.value}</p>
                    )}
                    {f.anchor?.excerpt && (
                      <p className="mt-1 text-[11px] text-slate-400 italic line-clamp-2">
                        证据：{f.anchor.excerpt}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 审核动作 */}
      <div className="mt-5 space-y-3">
        <p className="text-sm font-semibold text-slate-800">审核动作</p>
        <div className="flex flex-wrap gap-2">
          {([
            { key: "approve", label: "通过", style: "border-emerald-600 bg-emerald-600 text-white" },
            { key: "approve_with_edit", label: "修改后通过", style: "border-blue-600 bg-blue-600 text-white" },
            { key: "mark_incomplete", label: "信息缺失", style: "border-amber-500 bg-amber-500 text-white" },
            { key: "reject", label: "驳回", style: "border-red-600 bg-red-600 text-white" },
          ] as const).map((act) => (
            <button
              key={act.key}
              type="button"
              onClick={() => setAction(act.key)}
              className={cn(
                "h-9 px-3.5 rounded-lg text-sm font-medium border transition-colors",
                action === act.key ? act.style : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              {act.label}
            </button>
          ))}
        </div>

        {action && (
          <div className="space-y-3">
            <Input
              label="操作原因（必填）"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：与公告原文一致"
            />
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
                ⚠️ {error}
              </div>
            )}
            <Button onClick={handleSubmit} disabled={!reason.trim() || submitting}>
              {submitting ? "提交中..." : "确认审核"}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ==================== 已发布版本与差异 ====================

function PublishedVersionsSection({ runs }: { runs: Run[] }) {
  const [announcementId, setAnnouncementId] = useState<string>("");
  const [versions, setVersions] = useState<Array<{ id: string; versionNumber: number; status: string; publishedAt: string }>>([]);
  const [diff, setDiff] = useState<Array<{ field: string; before: string; after: string; changed: boolean }> | null>(null);
  const [loading, setLoading] = useState(false);

  const publishedRuns = runs.filter((r) => r.status === "published");

  const loadVersions = async (annId: string) => {
    setAnnouncementId(annId);
    setDiff(null);
    setLoading(true);
    try {
      const vs = await announcementsPipelineApi.listVersions(annId);
      setVersions(
        vs.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          status: v.status,
          publishedAt: v.publishedAt,
        }))
      );
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  };

  const showDiff = async (v1: number, v2: number) => {
    try {
      const result = await announcementsPipelineApi.getVersionDiff(announcementId, v1, v2);
      setDiff(result as Array<{ field: string; before: string; after: string; changed: boolean }>);
    } catch {
      setDiff(null);
    }
  };

  return (
    <Card>
      <p className="text-sm font-semibold text-slate-800 mb-3">已发布版本与差异</p>

      {publishedRuns.length === 0 ? (
        <p className="text-sm text-slate-400">还没有已发布的版本。审核通过后点击「发布」即可创建不可变版本。</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {publishedRuns.map((r) => (
              <Button
                key={r.id}
                size="sm"
                variant={announcementId === (r.announcementId ?? r.id) ? "primary" : "outline"}
                onClick={() => loadVersions(r.announcementId ?? r.id)}
              >
                {r.snapshot?.source?.publisher ?? r.id.slice(0, 8)} (v{r.publishedVersion?.versionNumber})
              </Button>
            ))}
          </div>

          {announcementId && (
            <div>
              {loading ? (
                <p className="text-xs text-slate-400">加载版本列表...</p>
              ) : versions.length === 0 ? (
                <p className="text-xs text-slate-400">暂无版本</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {versions.map((v) => (
                      <span
                        key={v.id}
                        className={cn(
                          "px-2 py-1 rounded text-xs",
                          v.status === "published"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        )}
                      >
                        v{v.versionNumber} · {v.status === "published" ? "当前" : "已取代"} ·{" "}
                        {formatDateTime(v.publishedAt)}
                      </span>
                    ))}
                  </div>

                  {versions.length >= 2 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-slate-700 mb-2">查看版本差异</p>
                      <div className="flex items-center gap-2">
                        <select
                          className="text-xs border border-slate-300 rounded px-2 py-1"
                          onChange={(e) => {
                            const [a, b] = e.target.value.split(",").map(Number);
                            if (a && b) showDiff(a, b);
                          }}
                          defaultValue=""
                        >
                          <option value="">选择两个版本对比...</option>
                          {versions.flatMap((v1, i) =>
                            versions.slice(i + 1).map((v2) => (
                              <option key={`${v1.versionNumber}-${v2.versionNumber}`} value={`${v1.versionNumber},${v2.versionNumber}`}>
                                v{v1.versionNumber} → v{v2.versionNumber}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      {diff && (
                        <div className="mt-3 rounded-lg border border-slate-200 divide-y divide-slate-100">
                          {diff.map((d) => (
                            <div key={d.field} className="p-2.5 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-700">
                                  {FIELD_LABELS[d.field] ?? d.field}
                                </span>
                                {d.changed && (
                                  <span className="px-1.5 py-px rounded bg-amber-100 text-amber-700 text-[10px]">
                                    已变更
                                  </span>
                                )}
                              </div>
                              {d.changed ? (
                                <div className="mt-1 flex flex-wrap gap-3">
                                  <span className="text-slate-400 line-through">{d.before || "（空）"}</span>
                                  <span className="text-slate-300">→</span>
                                  <span className="text-slate-800">{d.after || "（空）"}</span>
                                </div>
                              ) : (
                                <p className="mt-1 text-slate-600">{d.after || "（空）"}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
