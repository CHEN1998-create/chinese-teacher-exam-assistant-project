"use client";

import { useState } from "react";
import {
  ExamTarget,
  ResourceMatch,
  ResourcePlanLink,
  RightsStatus,
  RIGHTS_STATUS_LABELS,
  RESOURCE_LINK_STATUS_LABELS,
} from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useGapMatches, useMyResourceLinks } from "@/lib/resources/useResources";
import { resourceService } from "@/lib/resources/resourceService";
import { tierLabel } from "@/lib/resources/domain";
import { moduleLabel } from "@/lib/materials/domain";

const RIGHTS_VARIANT: Record<RightsStatus, "success" | "primary" | "info" | "muted" | "warning"> = {
  official: "success",
  self_made: "primary",
  licensed: "info",
  open: "info",
  third_party: "muted",
  unknown: "warning",
};

const LINK_VARIANT: Record<ResourcePlanLink["status"], "warning" | "primary" | "info" | "success" | "muted"> = {
  pending_arrangement: "warning",
  arranged: "primary",
  in_use: "info",
  used: "success",
  dismissed: "muted",
};

function formatDate(iso?: string): string {
  if (!iso) return "未复核";
  return new Date(iso).toLocaleDateString("zh-CN");
}

/**
 * 资料缺口 → 公共资源匹配面板。
 * 每个缺口最多 3 条；没有合规资源时明确展示空态与查找建议。
 */
export function GapResourcePanel({ target, modules }: { target: ExamTarget; modules: string[] }) {
  const { matchesByModule } = useGapMatches(target, modules);
  const links = useMyResourceLinks(target.id);

  if (modules.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs leading-relaxed text-blue-800">
        针对上面的每个缺口，从<strong>与你的私有资料完全分开</strong>的公共资源索引中匹配最多 3 个已核验来源；
        权利不明、关键字段缺失、链接失效或已停用的资源不会被推荐。第三方资源仅提供原始链接与必要摘要。
      </div>
      {modules.map((moduleKey) => (
        <GapSection
          key={moduleKey}
          targetId={target.id}
          moduleKey={moduleKey}
          matches={matchesByModule.get(moduleKey) ?? []}
          links={links.filter((l) => l.module === moduleKey)}
        />
      ))}
    </div>
  );
}

function GapSection({
  targetId,
  moduleKey,
  matches,
  links,
}: {
  targetId: string;
  moduleKey: string;
  matches: ResourceMatch[];
  links: ResourcePlanLink[];
}) {
  const [error, setError] = useState<string | null>(null);
  const advice = resourceService.searchAdvice(moduleKey);
  const linkByResource = new Map(links.filter((l) => l.status !== "dismissed").map((l) => [l.resourceId, l]));

  const handleAdd = (resourceId: string) => {
    setError(null);
    try {
      resourceService.addToPlan(resourceId, targetId, moduleKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加入计划失败");
    }
  };

  const handleDismiss = (linkId: string) => {
    setError(null);
    try {
      resourceService.dismissLink(linkId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    }
  };

  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-900">缺口：{moduleLabel(moduleKey)}</p>
        <Badge variant={matches.length > 0 ? "success" : "muted"}>
          {matches.length > 0 ? `${matches.length} 个已核验资源` : "暂无已核验资源"}
        </Badge>
      </div>

      {matches.length === 0 ? (
        <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-3">
          <p className="text-xs font-medium text-slate-700">暂无已核验资源</p>
          <p className="mt-1 text-xs text-slate-500">
            当前没有来源清楚、权利状态明确且适用于本目标的资源被强推。可以这样自己找：
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
            {advice.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {matches.map((match) => (
            <ResourceMatchCard
              key={`${match.module}-${match.resource.id}`}
              match={match}
              link={linkByResource.get(match.resource.id)}
              onAdd={() => handleAdd(match.resource.id)}
              onDismiss={() => {
                const link = linkByResource.get(match.resource.id);
                if (link) handleDismiss(link.id);
              }}
            />
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </Card>
  );
}

function ResourceMatchCard({
  match,
  link,
  onAdd,
  onDismiss,
}: {
  match: ResourceMatch;
  link?: ResourcePlanLink;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  const r = match.resource;
  const external = /^https?:\/\//.test(r.sourceUrl);

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-900">
          {match.rank}. {r.title}
        </p>
        <Badge variant="primary">{tierLabel(match.tier)}</Badge>
        <Badge variant={RIGHTS_VARIANT[r.rightsStatus]}>{RIGHTS_STATUS_LABELS[r.rightsStatus]}</Badge>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{match.matchReason}</p>

      {r.suggestedChapters.length > 0 && (
        <p className="mt-1 text-[11px] text-slate-500">建议章节：{r.suggestedChapters.join("、")}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span>适用范围：{match.scopeSummary}</span>
        <span>预计使用时间：约 {r.estimatedMinutes} 分钟</span>
        <span>最近复核：{formatDate(r.lastReviewedAt)}</span>
        {r.year && <span>适用年份：{r.year}</span>}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {external ? (
          <a
            href={r.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => resourceService.recordView(r.id)}
            className="inline-flex h-8 items-center rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            查看来源（{r.sourceName}）↗
          </a>
        ) : (
          <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-500">
            站内资料（{r.sourceName}）
          </span>
        )}
        {link ? (
          <>
            <Badge variant={LINK_VARIANT[link.status]}>
              已加入本周计划·{RESOURCE_LINK_STATUS_LABELS[link.status]}
            </Badge>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              移出计划
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={onAdd}>
            加入本周计划
          </Button>
        )}
      </div>
    </div>
  );
}
