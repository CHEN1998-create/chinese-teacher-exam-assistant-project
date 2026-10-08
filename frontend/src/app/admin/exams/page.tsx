"use client";

import { AdminExamList } from "@/components/admin/AdminExamList";

export default function AdminExamsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">考情与证据管理</h1>
        <p className="text-sm text-slate-500 mt-1">
          跨用户查看全部目标考试的证据状态，进入审核队列处理 AI 提取结论
        </p>
      </div>

      {/* Mock 边界提示 */}
      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
        <p className="text-xs leading-relaxed text-amber-800">
          ⚠️ 非生产实现：审核数据存储在浏览器 localStorage，权限校验为前端 Mock，
          不能防范恶意用户。接入真实后端时请由服务端鉴权并持久化审核留痕。
        </p>
      </div>

      <AdminExamList />
    </div>
  );
}
