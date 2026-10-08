"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { EDUCATION_LEVEL_LABELS, STAFF_ROLES, USER_ROLE_LABELS } from "@/types";
import { useCurrentUser } from "@/lib/auth";
import { useCurrentExamTarget } from "@/lib/targets/useCurrentExamTarget";
import { canGeneratePlan } from "@/lib/targets/domain";
import { Badge } from "@/components/ui/Badge";
import { NotificationCenter } from "@/components/governance/NotificationCenter";
import { isDemoMode } from "@/lib/demo/config";
import { PRIMARY_NAV, isNavActive } from "@/lib/ia/nav";
import { NavIcon } from "./navIcons";

// v7.0：主导航只有 机会 / 日程 / 我的；
// 备考为次级入口（已设主要目标后从「我的」与目标上下文进入）；
// 设置、资料、通知、账号进入头像菜单或「我的」页面，不在主导航中。

export function Sidebar() {
  const pathname = usePathname();
  const { user, role, hasRole, logout, status } = useCurrentUser();
  const currentExam = useCurrentExamTarget();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击菜单外部时收起头像菜单
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  // 会话恢复完成前只渲染与服务端一致的静态骨架，
  // 避免硬刷新时“服务端无会话 / 客户端 localStorage 有会话”造成水合不匹配
  const ready = status === "authenticated";

  return (
    <aside
      className={cn(
        "fixed inset-y-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white md:flex",
        // 演示模式：为顶部固定横幅让出空间
        isDemoMode && "top-8 h-[calc(100%-2rem]",
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-slate-200 px-6">
        <Link href="/opportunities" className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">📝</span>
          <span className="text-lg font-semibold text-slate-900">教招有据</span>
        </Link>
      </div>

      {/* 我关注的机会（v5.2 考试目标区块的兼容占位；模块 7 后由主要目标替代） */}
      <div className="border-b border-slate-200 px-4 py-3">
        {!ready ? (
          // 加载占位（服务端与客户端首次渲染一致）
          <div className="h-[86px] animate-pulse rounded-lg bg-slate-50" aria-hidden="true" />
        ) : currentExam ? (
          <Link href="/opportunities" className="block rounded-lg bg-blue-50 p-3 transition-colors hover:bg-blue-100/70">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium text-blue-600">我关注的机会</p>
              {canGeneratePlan(currentExam) ? (
                <Badge variant="success">已确认</Badge>
              ) : (
                <Badge variant="warning">待确认</Badge>
              )}
            </div>
            <p className="line-clamp-2 text-sm font-medium text-slate-900">
              {currentExam.name}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {[
                currentExam.region || "地区待确认",
                currentExam.educationLevel
                  ? EDUCATION_LEVEL_LABELS[currentExam.educationLevel]
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </Link>
        ) : (
          <Link href="/onboarding" className="block rounded-lg border border-dashed border-slate-300 p-3 transition-colors hover:border-blue-400">
            <p className="mb-0.5 text-xs font-medium text-slate-500">还没说要考哪里</p>
            <p className="text-sm font-medium text-blue-600">开始快速问答 →</p>
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav aria-label="主导航" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {PRIMARY_NAV.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-blue-50 font-semibold text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-blue-600"
                />
              )}
              <NavIcon id={item.id} className="h-5 w-5" />
              {item.label}
              {active && <span className="sr-only">（当前页面）</span>}
            </Link>
          );
        })}

        {ready && hasRole(STAFF_ROLES) && !isDemoMode && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/admin")
                ? "bg-slate-800 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <span className="text-lg" aria-hidden="true">🛡️</span>
            运营后台
          </Link>
        )}
      </nav>

      {/* 头像菜单：设置、我的资料与退出登录；通知为上下文入口 */}
      <div className="relative border-t border-slate-200 px-3 py-3" ref={menuRef}>
        {!ready ? (
          <div className="h-[52px] animate-pulse rounded-lg bg-slate-50" aria-hidden="true" />
        ) : (
          user && (
            <>
              {menuOpen && (
                <div className="absolute bottom-full left-3 right-3 z-50 mb-2 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-500">
                      {role ? USER_ROLE_LABELS[role] : ""}
                    </p>
                  </div>
                  <Link
                    href="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span aria-hidden="true">⚙️</span> 设置
                  </Link>
                  <Link
                    href="/materials"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span aria-hidden="true">📚</span> 我的资料
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span aria-hidden="true">🚪</span> 退出登录
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100">
                    <span className="text-base" aria-hidden="true">👤</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
                  </div>
                  <svg
                    aria-hidden="true"
                    className={cn("h-4 w-4 text-slate-400 transition-transform", menuOpen && "rotate-180")}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <NotificationCenter />
              </div>
            </>
          )
        )}
      </div>
    </aside>
  );
}
