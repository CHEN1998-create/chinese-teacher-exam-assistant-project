"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PRIMARY_NAV, isNavActive } from "@/lib/ia/nav";
import { NavIcon } from "./navIcons";

/**
 * 移动端主导航（v7.0）：只有 机会 / 日程 / 我的 三个入口。
 * - 激活态同时用 顶部指示条 + 字重 + 颜色 + aria-current 表达，不只靠颜色；
 * - 每个入口等宽、高 64px，满足移动端触控目标；
 * - 备考不在主导航（次级入口）；设置/通知/资料/账号进入头像菜单或「我的」页面。
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="主导航"
      className="fixed bottom-0 left-0 right-0 z-50 bg-white md:hidden"
    >
      <div className="flex h-16 items-stretch justify-around border-t border-slate-200">
        {PRIMARY_NAV.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mt-px flex flex-1 flex-col items-center justify-center gap-1 border-t-2 transition-colors",
                active
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              <NavIcon id={item.id} className="h-6 w-6" />
              <span className={cn("text-xs", active ? "font-semibold" : "font-medium")}>
                {item.label}
              </span>
              {active && <span className="sr-only">（当前页面）</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
