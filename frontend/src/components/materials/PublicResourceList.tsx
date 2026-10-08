"use client";

import {
  ResourceItem,
  RESOURCE_TYPE_LABELS,
  RIGHTS_STATUS_LABELS,
  RightsStatus,
} from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBrowseableResources } from "@/lib/resources/useResources";
import { resourceService } from "@/lib/resources/resourceService";
import { scopeSummary } from "@/lib/resources/domain";
import { moduleLabel } from "@/lib/materials/domain";

const RIGHTS_VARIANT: Record<RightsStatus, "success" | "primary" | "info" | "muted" | "warning"> = {
  official: "success",
  self_made: "primary",
  licensed: "info",
  open: "info",
  third_party: "muted",
  unknown: "warning",
};

/**
 * 公共资源只读浏览列表（与缺口匹配同一合规闸门）。
 * 公共资源与用户私有资料分开存储；停用、失效、待复核、权利不明项不会出现在这里。
 * 不做付费、网盘下载与第三方全文复制。
 */
export function PublicResourceList() {
  const resources = useBrowseableResources();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs leading-relaxed text-blue-800">
        这里是与你个人资料<strong>完全分开</strong>的公共资源库，仅展示来源可核实、权利状态明确、链接已核验的资源；
        第三方资源只提供原始链接与必要摘要。停用、失效或超过复核周期的资源不在此展示。
      </div>

      {resources.length === 0 ? (
        <EmptyState
          icon={<span className="text-4xl">🗂️</span>}
          title="暂无已核验的公共资源"
          description="公共资源需完成来源、权利状态与链接核验后才会展示。"
        />
      ) : (
        <div className="space-y-3">
          {resources.map((resource) => (
            <ResourceRow key={resource.id} resource={resource} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResourceRow({ resource }: { resource: ResourceItem }) {
  const external = /^https?:\/\//.test(resource.sourceUrl);
  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-900">{resource.title}</p>
        <Badge variant="info">{RESOURCE_TYPE_LABELS[resource.resourceType]}</Badge>
        <Badge variant={RIGHTS_VARIANT[resource.rightsStatus]}>
          {RIGHTS_STATUS_LABELS[resource.rightsStatus]}
        </Badge>
      </div>
      {resource.description && (
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{resource.description}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {resource.modules.map((key) => (
          <Badge key={key} variant="primary">
            {moduleLabel(key)}
          </Badge>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span>来源：{resource.sourceName}</span>
        <span>适用范围：{scopeSummary(resource)}</span>
        <span>最近复核：{new Date(resource.lastReviewedAt).toLocaleDateString("zh-CN")}</span>
      </div>
      <div className="mt-2.5">
        {external ? (
          <a
            href={resource.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => resourceService.recordView(resource.id)}
            className="inline-flex h-8 items-center rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            查看原始来源 ↗
          </a>
        ) : (
          <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-500">
            站内资料（{resource.sourceName}）
          </span>
        )}
      </div>
    </Card>
  );
}
