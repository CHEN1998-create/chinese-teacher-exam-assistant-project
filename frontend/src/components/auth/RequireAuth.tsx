"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { UserRole, USER_ROLE_LABELS } from "@/types";
import { useAuth } from "@/lib/auth";
import { LoadingPage } from "@/components/ui/Loading";

/**
 * 用户端路由守卫：
 * - 会话恢复中显示加载状态；
 * - 未登录（含会话失效）时重定向到登录页，并携带 next 回跳地址。
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = encodeURIComponent(pathname || "/opportunities");
      router.replace(`/login?next=${next}`);
    }
  }, [status, pathname, router]);

  if (status !== "authenticated") {
    return <LoadingPage />;
  }

  return <>{children}</>;
}

/**
 * 角色路由守卫：先要求登录，再校验角色，不满足时显示权限不足状态。
 */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { hasRole } = useAuth();

  return (
    <RequireAuth>
      {hasRole(roles) ? children : <ForbiddenState requiredRoles={roles} />}
    </RequireAuth>
  );
}

/** 权限不足状态（文字 + 图标，不仅依赖颜色） */
export function ForbiddenState({ requiredRoles }: { requiredRoles?: UserRole[] }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M12 9v2m0 4h.01M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">权限不足</h1>
        <p className="text-sm text-slate-500 mb-6">
          当前账号没有访问该页面的权限
          {requiredRoles && requiredRoles.length > 0 && (
            <>
              ，需要以下角色之一：
              {requiredRoles.map((r) => USER_ROLE_LABELS[r]).join("、")}
              。请切换具备权限的演示账号后重试
            </>
          )}
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/opportunities"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            返回机会页
          </Link>
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            切换账号
          </Link>
        </div>
      </div>
    </div>
  );
}
