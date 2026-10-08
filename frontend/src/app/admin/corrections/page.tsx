"use client";

import { OpportunityCorrectionPanel } from "@/components/admin/OpportunityCorrectionPanel";

/**
 * 机会纠错处理后台（v7.0 P0-F 发布门槛：纠错处理闭环）。
 * 由 /admin 布局统一做 STAFF_ROLES 权限守卫；公开演示环境整站关闭。
 */
export default function AdminCorrectionsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">机会纠错处理</h1>
        <p className="mt-1 text-sm text-slate-500">
          核对用户在机会详情页提交的信息纠错。确认有误的通过公告新版本更正；
          不采纳需写明原因。终态结果会通过站内通知回复提交人，记录全程留痕不可删除。
        </p>
      </div>
      <OpportunityCorrectionPanel />
    </div>
  );
}
