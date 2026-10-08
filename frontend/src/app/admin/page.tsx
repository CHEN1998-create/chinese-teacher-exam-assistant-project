"use client";

import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useCurrentUser } from "@/lib/auth";
import { USER_ROLE_LABELS } from "@/types";
import { useReviewQueue } from "@/lib/admin/useAdminReviews";
import { useAdminResources } from "@/lib/resources/useResources";
import { useAdminCorrections } from "@/lib/governance/useGovernance";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AnalyticsDictionaries } from "@/components/admin/AnalyticsDictionaries";

interface AdminModule {
  title: string;
  path: string;
  desc: string;
  roles: string[];
  /** 模块状态徽标；受邀试用类模块不得标注「已上线」 */
  badge?: { label: string; variant: "success" | "warning" };
}

export default function AdminHomePage() {
  const { role } = useCurrentUser();
  const { counts } = useReviewQueue("pending");
  const { queues } = useAdminResources();
  const { counts: correctionCounts } = useAdminCorrections("open");

  const modules: AdminModule[] = [
    {
      title: "考情与证据",
      path: "/admin/exams",
      desc: "按目标查看证据状态、来源、适用范围，进入审核",
      roles: ["考情审核员", "资源审核员（只读）", "管理员"],
    },
    {
      title: "审核队列",
      path: "/admin/reviews",
      desc: `待审核 ${counts.pending} · 冲突 ${counts.conflict} · 临期 ${counts.expiring} · 已完成 ${counts.completed}`,
      roles: ["考情审核员", "资源审核员（仅低影响）", "管理员"],
    },
    {
      title: "资源索引",
      path: "/admin/resources",
      desc: `正常 ${queues.active.length} · 待复核 ${queues.pending_review.length} · 已失效 ${queues.expired.length} · 已停用 ${queues.inactive.length}`,
      roles: ["管理员", "资源审核员（可写）", "考情审核员（只读）"],
    },
    {
      title: "纠错与治理",
      path: "/admin/feedback",
      desc: `待处理纠错 ${correctionCounts.open} · 采纳/驳回/要求补充 · 错误结论撤回与影响范围留痕`,
      roles: ["考情审核员（可写）", "资源审核员（只读）", "管理员"],
    },
    {
      title: "受邀试用看板",
      path: "/admin/trial",
      desc: "服务端真实事件 · 北极星与受邀漏斗 · seed/员工/演示分群隔离；发布前检查存在缺项即停止邀请",
      roles: ["管理员", "考情审核员", "资源审核员"],
      badge: { label: "受邀试用 · 未上线", variant: "warning" },
    },
  ];

  return (
    <div className="space-y-8">
      {/* 数据指标、后台概览与异常监控 */}
      <AdminOverview />

      {/* 指标/事件字典：统一口径说明 */}
      <section>
        <div className="mb-3">
          <h2 className="text-base font-semibold text-slate-900">指标与事件字典</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            当前角色：{role ? USER_ROLE_LABELS[role] : "-"}
            。所有指标仅按字典口径由统一规则层计算，组件不重复计算。
          </p>
        </div>
        <AnalyticsDictionaries />
      </section>

      {/* 后台模块入口 */}
      <section>
        <div className="mb-3">
          <h2 className="text-base font-semibold text-slate-900">后台模块</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            高影响考情（报名时间/考试日期/科目/分值/资格条件）仅考情审核员与管理员可操作
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modules.map((mod) => (
            <Card key={mod.path}>
              <CardHeader
                title={mod.title}
                description={mod.desc}
                action={
                  <Badge variant={mod.badge?.variant ?? "success"}>
                    {mod.badge?.label ?? "已上线"}
                  </Badge>
                }
              />
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">{mod.path}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400 truncate">
                    可访问角色：{mod.roles.join("、")}
                  </p>
                </div>
                <Link
                  href={mod.path}
                  className="shrink-0 h-8 px-3 inline-flex items-center rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  进入
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
