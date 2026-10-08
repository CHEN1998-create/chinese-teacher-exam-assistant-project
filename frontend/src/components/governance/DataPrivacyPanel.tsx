"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  DataDeletionRequest,
  DataDeletionScopeItem,
} from "@/types";
import {
  useActiveDeletionRequest,
  useDataCategories,
} from "@/lib/governance/useGovernance";
import { privacyService } from "@/lib/governance/privacyService";
import { useAuth } from "@/lib/auth";
import { DataHandlingBadge, DeletionStatusBadge } from "./badges";

/**
 * 隐私与个人数据删除面板：
 * - 展示数据用途、保存范围与各类别实时数量；
 * - 删除申请四状态：待确认 → 处理中 → 已完成 / 失败（可重试）；
 * - 公共数据（考情证据池、公共资源）与私有数据分开；审计留痕匿名化保留。
 * 演示边界：删除在浏览器本地执行并模拟处理延迟，没有真实服务端删除任务。
 */
export function DataPrivacyPanel() {
  const categories = useDataCategories();
  const active = useActiveDeletionRequest();
  const { logout } = useAuth();
  const router = useRouter();
  const [completed, setCompleted] = useState<DataDeletionRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const privateItems = categories.filter((c) => c.handling === "delete");
  const publicItems = categories.filter((c) => c.handling === "retain_public");
  const auditItems = categories.filter((c) => c.handling === "retain_audit");

  const initiate = () => {
    setError(null);
    try {
      privacyService.initiateDeletion();
    } catch (e) {
      setError(e instanceof Error ? e.message : "申请失败，请重试");
    }
  };

  const confirm = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await privacyService.confirmDeletion(id);
      if (result.status === "completed") setCompleted(result);
      if (result.status === "failed") setError(result.failReason ?? "处理失败，请重试");
    } catch (e) {
      setError(e instanceof Error ? e.message : "处理失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const cancelPending = (id: string) => {
    privacyService.cancelPending(id);
  };

  const finishAndLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="space-y-4">
      {/* 数据用途与保存范围 */}
      <Card>
        <CardHeader
          title="隐私与数据用途"
          description="我们只收集生成考情信息、学习计划与资源匹配所必需的数据"
        />
        <div className="space-y-3 text-sm leading-relaxed text-ink-muted">
          <p>
            你的目标考试、公告原文、私有资料、准备情况、计划与执行反馈仅用于为你本人提供备考服务，
            保存在本设备浏览器中，不会自动公开给其他用户。
          </p>
          <p>
            经审核的考情结论与公共资源属于<b>公共数据</b>，内容来自公开公告，不含你的个人信息；
            纠错、审核与删除申请作为<b>审计留痕</b>，在你删除账号时做匿名化处理，无法再识别到你本人。
          </p>
          <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-ink-muted">
            演示环境说明：所有数据存储在本浏览器中，本面板执行的是本地删除流程（模拟后台处理延迟），
            没有真实服务端删除任务；公共证据与审计留痕不会被物理删除。
          </p>
        </div>
      </Card>

      {/* 数据类别清单 */}
      <Card>
        <CardHeader
          title="我的数据类别"
          description="数量按当前账号实时统计；“将删除”类合计为本次删除的私有记录"
        />
        <div className="space-y-4">
          <CategoryGroup
            heading="你的私有数据"
            hint="删除账号时从本设备移除"
            items={privateItems.map((c) => ({
              key: c.key,
              label: c.label,
              count: c.count,
              purpose: c.purpose,
              retention: c.retention,
              handling: c.handling,
            }))}
          />
          <CategoryGroup
            heading="公共数据"
            hint="与个人账号无关，删除账号不受影响"
            items={publicItems.map((c) => ({
              key: c.key,
              label: c.label,
              count: c.count,
              purpose: c.purpose,
              retention: c.retention,
              handling: c.handling,
            }))}
          />
          <CategoryGroup
            heading="审计留痕"
            hint="只追加、不物理删除；删除账号时匿名化"
            items={auditItems.map((c) => ({
              key: c.key,
              label: c.label,
              count: c.count,
              purpose: c.purpose,
              retention: c.retention,
              handling: c.handling,
            }))}
          />
        </div>
      </Card>

      {/* 删除申请流程 */}
      <Card>
        <CardHeader
          title="删除我的个人数据"
          description="流程：发起申请 → 确认范围 → 后台处理 → 完成（失败可重试）"
        />

        {completed ? (
          <CompletedPanel request={completed} onLogout={finishAndLogout} />
        ) : !active ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              发起后你仍有一次确认机会；确认前可以取消申请。删除完成后，你的私有数据将从本设备移除，
              审核所需的纠错与操作记录会匿名化保留。
            </p>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button variant="danger" onClick={initiate}>
              申请删除我的个人数据
            </Button>
          </div>
        ) : active.status === "processing" ? (
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-blue-600" />
            正在处理你的删除申请，请稍候…
          </div>
        ) : (
          <RequestPanel
            request={active}
            busy={busy}
            error={error}
            onConfirm={() => confirm(active.id)}
            onCancel={() => cancelPending(active.id)}
            onRestart={initiate}
          />
        )}
      </Card>
    </div>
  );
}

function CategoryGroup({
  heading,
  hint,
  items,
}: {
  heading: string;
  hint: string;
  items: Array<{
    key: string;
    label: string;
    count: number;
    purpose: string;
    retention: string;
    handling: DataDeletionScopeItem["handling"];
  }>;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h4 className="text-sm font-semibold text-ink">{heading}</h4>
        <span className="text-xs text-ink-muted">{hint}</span>
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {items.map((item) => (
          <li key={item.key} className="flex items-start justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {item.label}
                <span className="ml-2 text-xs font-normal text-ink-muted">{item.count} 条</span>
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{item.purpose}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">保存范围：{item.retention}</p>
            </div>
            <DataHandlingBadge handling={item.handling} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RequestPanel({
  request,
  busy,
  error,
  onConfirm,
  onCancel,
  onRestart,
}: {
  request: DataDeletionRequest;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onRestart: () => void;
}) {
  const privateCount = request.scope
    .filter((s) => s.handling === "delete")
    .reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <DeletionStatusBadge status={request.status} />
        <span className="text-xs text-ink-muted">
          申请于 {new Date(request.createdAt).toLocaleString("zh-CN", { hour12: false })}
        </span>
      </div>

      {request.status === "failed" && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          上次处理失败：{request.failReason ?? "未知原因"}。可重试，已删除部分不会重复计数。
        </div>
      )}

      <div className="rounded-lg border border-line p-3">
        <p className="text-sm font-medium text-ink">本次删除范围（申请时快照）</p>
        <ul className="mt-2 space-y-1">
          {request.scope
            .filter((s) => s.handling === "delete")
            .map((s) => (
              <li key={s.key} className="flex justify-between text-xs text-ink-muted">
                <span>{s.label}</span>
                <span>{s.count} 条</span>
              </li>
            ))}
        </ul>
        <p className="mt-2 border-t border-line pt-2 text-xs text-ink-muted">
          合计约 {privateCount} 条私有记录将被删除；公共考情证据保留，纠错等审计记录匿名化保留。
          删除后当前账号将退出登录。
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {request.status === "failed" ? (
          <>
            <Button variant="danger" disabled={busy} onClick={onConfirm}>
              {busy ? "处理中…" : "重试删除"}
            </Button>
            <Button variant="outline" onClick={onRestart}>
              重新发起申请
            </Button>
          </>
        ) : (
          <>
            <Button variant="danger" disabled={busy} onClick={onConfirm}>
              {busy ? "处理中…" : "我已了解，确认删除"}
            </Button>
            <Button variant="outline" disabled={busy} onClick={onCancel}>
              取消申请
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function CompletedPanel({
  request,
  onLogout,
}: {
  request: DataDeletionRequest;
  onLogout: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">✅</span>
        <p className="text-sm font-semibold text-emerald-800">个人数据删除已完成</p>
      </div>
      <ul className="space-y-1 text-sm text-ink-muted">
        <li>· 已删除私有记录 {request.deletedCount ?? 0} 条；</li>
        <li>· 审计留痕 {request.anonymizedCount ?? 0} 条已匿名化保留，无法再识别到你本人；</li>
        <li>· 公共考情证据与公共资源未受影响。</li>
      </ul>
      <p className="text-xs text-ink-muted">
        完成时间：
        {request.processedAt
          ? new Date(request.processedAt).toLocaleString("zh-CN", { hour12: false })
          : "—"}
      </p>
      <Button onClick={onLogout}>完成并退出登录</Button>
    </div>
  );
}
