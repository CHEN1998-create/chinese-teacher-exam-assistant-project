"use client";

import { useState } from "react";
import {
  ResourceItem,
  ResourceQueueKey,
  RESOURCE_STATUS_LABELS,
  RESOURCE_TYPE_LABELS,
  RIGHTS_STATUS_LABELS,
  RightsStatus,
} from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { ConfirmModal } from "@/components/ui/Modal";
import { useCurrentUser } from "@/lib/auth";
import { useAdminResources } from "@/lib/resources/useResources";
import {
  ResourceItemInput,
  createEmptyResourceInput,
  resourceService,
} from "@/lib/resources/resourceService";
import { RESOURCE_ADMIN_ROLES, checkRecommendable, classifyQueue, scopeSummary } from "@/lib/resources/domain";
import { moduleLabel } from "@/lib/materials/domain";
import { ResourceFormModal } from "@/components/admin/ResourceFormModal";

const QUEUE_TABS: { id: ResourceQueueKey; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "active", label: "正常" },
  { id: "pending_review", label: "待复核" },
  { id: "expired", label: "已失效" },
  { id: "inactive", label: "已停用" },
];

const QUEUE_BADGE: Record<ResourceQueueKey, "success" | "warning" | "danger" | "muted"> = {
  all: "muted",
  active: "success",
  pending_review: "warning",
  expired: "danger",
  inactive: "muted",
};

const RIGHTS_VARIANT: Record<RightsStatus, "success" | "primary" | "info" | "muted" | "warning"> = {
  official: "success",
  self_made: "primary",
  licensed: "info",
  open: "info",
  third_party: "muted",
  unknown: "warning",
};

type DialogState =
  | { type: "closed" }
  | { type: "form"; mode: "create" | "edit"; resource: ResourceItem }
  | { type: "deactivate"; resource: ResourceItem };

export default function AdminResourcesPage() {
  const { role } = useCurrentUser();
  const canWrite = role ? (RESOURCE_ADMIN_ROLES as readonly string[]).includes(role) : false;
  const { queues, stats } = useAdminResources();
  const [activeTab, setActiveTab] = useState<ResourceQueueKey>("all");
  const [dialog, setDialog] = useState<DialogState>({ type: "closed" });
  const [error, setError] = useState<string | null>(null);

  const counts: Record<ResourceQueueKey, number> = {
    all: queues.all.length,
    active: queues.active.length,
    pending_review: queues.pending_review.length,
    expired: queues.expired.length,
    inactive: queues.inactive.length,
  };

  const run = (fn: () => void) => {
    setError(null);
    try {
      fn();
      setDialog({ type: "closed" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    }
  };

  const handleSubmit = (input: ResourceItemInput) => {
    run(() => {
      if (dialog.type !== "form") return;
      if (dialog.mode === "create") {
        resourceService.adminCreate(input);
      } else {
        resourceService.adminUpdate(dialog.resource.id, input);
      }
    });
  };

  const handleDeactivateConfirm = () => {
    if (dialog.type !== "deactivate") return;
    const target = dialog.resource;
    run(() => resourceService.adminDeactivate(target.id));
  };

  const blankResource: ResourceItem = {
    id: "",
    ...createEmptyResourceInput(),
    createdAt: "",
    updatedAt: "",
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">公共资源索引</h1>
          <p className="mt-1 text-sm text-slate-500">
            维护来源、权利状态、适用范围与复核时间；停用或不合规的资源不会再对用户端产生新推荐。
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setDialog({ type: "form", mode: "create", resource: blankResource })}>
            新增资源
          </Button>
        )}
      </div>

      {!canWrite && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          当前角色为只读：只有<strong>资源审核员</strong>或<strong>管理员</strong>可以新增、编辑、停用或复核资源。
        </div>
      )}

      <Tabs
        tabs={QUEUE_TABS.map((t) => ({ id: t.id, label: `${t.label} ${counts[t.id]}` }))}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as ResourceQueueKey)}
      >
        <p className="mb-3 text-[11px] text-slate-400">
          队列由事实自动派生：手动停用归入“已停用”；链接失效或超过失效时间归入“已失效”；
          权利不明、状态待复核或超过 180 天未复核归入“待复核”。
        </p>
        {QUEUE_TABS.map((tab) => (
          <TabPanel key={tab.id} id={tab.id} activeTab={activeTab}>
            <ResourceList
              resources={queues[tab.id]}
              stats={stats}
              canWrite={canWrite}
              onEdit={(r) => setDialog({ type: "form", mode: "edit", resource: r })}
              onDeactivate={(r) => setDialog({ type: "deactivate", resource: r })}
              onReactivate={(r) => run(() => resourceService.adminReactivate(r.id))}
              onMarkReviewed={(r, alive) => run(() => resourceService.adminMarkReviewed(r.id, alive))}
            />
          </TabPanel>
        ))}
      </Tabs>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {dialog.type === "form" && (
        <ResourceFormModal
          key={`${dialog.mode}-${dialog.resource.id}`}
          mode={dialog.mode}
          initial={dialog.resource}
          onClose={() => setDialog({ type: "closed" })}
          onSubmit={handleSubmit}
        />
      )}
      {dialog.type === "deactivate" && (
        <ConfirmModal
          isOpen
          variant="danger"
          title="停用该资源？"
          description={`停用后《${dialog.resource.title}》不会再对任何缺口产生新推荐；已加入计划的记录保留。可在“已停用”队列重新启用。`}
          confirmLabel="确认停用"
          onClose={() => setDialog({ type: "closed" })}
          onConfirm={handleDeactivateConfirm}
        />
      )}
    </div>
  );
}

function ResourceList({
  resources,
  stats,
  canWrite,
  onEdit,
  onDeactivate,
  onReactivate,
  onMarkReviewed,
}: {
  resources: ResourceItem[];
  stats: Record<string, { views: number; planLinks: number }>;
  canWrite: boolean;
  onEdit: (r: ResourceItem) => void;
  onDeactivate: (r: ResourceItem) => void;
  onReactivate: (r: ResourceItem) => void;
  onMarkReviewed: (r: ResourceItem, linkAlive: boolean) => void;
}) {
  const now = new Date().toISOString();
  if (resources.length === 0) {
    return (
      <Card padding="md">
        <p className="py-6 text-center text-sm text-slate-400">该队列暂无资源</p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {resources.map((r) => {
        const queue = classifyQueue(r, now);
        const gate = checkRecommendable(r, now);
        const usage = stats[r.id] ?? { views: 0, planLinks: 0 };
        return (
          <Card key={r.id} padding="sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">{r.title}</p>
              <Badge variant="info">{RESOURCE_TYPE_LABELS[r.resourceType]}</Badge>
              <Badge variant={RIGHTS_VARIANT[r.rightsStatus]}>{RIGHTS_STATUS_LABELS[r.rightsStatus]}</Badge>
              {queue !== "all" && <Badge variant={QUEUE_BADGE[queue]}>{RESOURCE_STATUS_LABELS[r.status]}</Badge>}
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.modules.map((key) => (
                <Badge key={key} variant="primary">
                  {moduleLabel(key)}
                </Badge>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
              <span>来源：{r.sourceName || "未填写"}</span>
              <span>范围：{scopeSummary(r)}</span>
              <span>复核：{new Date(r.lastReviewedAt).toLocaleDateString("zh-CN")}</span>
              <span>链接：{r.linkAlive ? "可访问" : "已失效"}</span>
              {r.expiresAt && <span>失效时间：{new Date(r.expiresAt).toLocaleDateString("zh-CN")}</span>}
              <span>
                使用记录：查看 {usage.views} 次 · 加入计划 {usage.planLinks} 次
              </span>
            </div>

            {!gate.ok && (
              <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-700">
                不强推原因：{gate.reasons.join("；")}
              </p>
            )}

            {canWrite && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(r)}>
                  编辑
                </Button>
                {r.status === "inactive" ? (
                  <Button variant="secondary" size="sm" onClick={() => onReactivate(r)}>
                    重新启用
                  </Button>
                ) : (
                  <Button variant="danger" size="sm" onClick={() => onDeactivate(r)}>
                    停用
                  </Button>
                )}
                {queue !== "active" && (
                  <Button variant="secondary" size="sm" onClick={() => onMarkReviewed(r, r.linkAlive)}>
                    标记已复核（{r.linkAlive ? "链接有效" : "链接仍失效"}）
                  </Button>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
