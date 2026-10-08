"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useCurrentUser, DEMO_ACCOUNTS } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo/config";
import { opportunitiesApi } from "@/lib/opportunities/api";
import {
  listGuestFollows,
  clearGuestFollows,
} from "@/lib/guest/guestFollows";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, status } = useCurrentUser();
  const demo = isDemoMode;

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const nextParam = searchParams.get("next");
  const reason = searchParams.get("reason");

  // 会话过期标记（由 DemoAuthProvider 写入 sessionStorage）
  const [sessionExpired] = useState(() => {
    if (typeof window === "undefined") return false;
    const expired = window.sessionStorage.getItem("kb_session_expired") === "1";
    if (expired) window.sessionStorage.removeItem("kb_session_expired");
    return expired;
  });

  const safeNext = (value: string | null): string | null => {
    if (!value) return null;
    // 只允许站内相对路径，防止开放重定向
    if (!value.startsWith("/") || value.startsWith("//")) return null;
    return value;
  };

  // 已登录用户访问登录页时直接跳转；登录成功后先合并访客本机关注，再跳转。
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      const guestItems = listGuestFollows();
      let merged = guestItems.length === 0;
      if (guestItems.length > 0) {
        try {
          await opportunitiesApi.mergeGuestFollows(
            guestItems.map((g) => ({
              unitId: g.unitId,
              status: g.status,
              materialStatuses: g.materialStatuses,
              consultationNotes: g.consultationNotes,
            })),
          );
          merged = true;
        } catch {
          // 合并失败不阻塞登录：保留本地记录，下次登录再试
        }
      }
      if (cancelled) return;
      if (merged) clearGuestFollows();
      router.replace(safeNext(nextParam) ?? "/opportunities");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const fillDemoAccount = (demoAccount: string, demoPassword: string) => {
    setAccount(demoAccount);
    setPassword(demoPassword);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!account.trim() || !password) {
      setError("请输入账号和密码");
      return;
    }

    setSubmitting(true);
    try {
      await login({ account: account.trim(), password });
      // 登录成功后的访客迁移与跳转统一在上面的 useEffect（status 变化）中处理，
      // 避免两次调用迁移、两次 router.replace 互相覆盖。
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-soft to-slate-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* 品牌区 */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-brand-soft rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">📝</span>
          </div>
          <h1 className="text-xl font-bold text-ink">教招有据</h1>
          <p className="text-sm text-ink-muted mt-1">教师招聘机会与资格预筛</p>
          <p className="mt-3 text-xs leading-5 text-ink-muted">
            登录后可以保存关注机会与报考进度；资格结果为预筛，最终以官方公告和招聘单位审核为准
          </p>
        </div>

        <div className="bg-surface rounded-2xl border border-line shadow-sm p-6">
          {/* Demo 声明 */}
          {demo && (
            <div className="mb-4 p-3 rounded-lg bg-warn-soft border border-warn/30">
              <p className="text-xs leading-5 text-warn">
                <strong>演示环境提示：</strong>
                这里使用的是内置演示账号，<strong>不是真实身份认证</strong>，没有真实注册与密码校验；
                演示数据仅保存在本机浏览器，不代表正式服务数据。请勿输入真实密码或其他个人信息。
              </p>
            </div>
          )}

          {/* 会话失效提示 */}
          {(sessionExpired || reason === "expired") && (
            <div className="mb-4 p-3 rounded-lg bg-canvas border border-line">
              <p className="text-xs leading-5 text-ink-muted">
                登录状态已过期，请重新登录。
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="account"
                className="block text-sm font-medium text-ink mb-1.5"
              >
                账号
              </label>
              <input
                id="account"
                type="text"
                autoComplete="username"
                placeholder={demo ? "演示邮箱，例如 student@demo.app" : "邮箱"}
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-line bg-surface text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-ink mb-1.5"
              >
                密码
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder={demo ? "演示密码：demo1234" : "密码"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-line bg-surface text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-danger-soft border border-danger/30">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            <Button type="submit" fullWidth size="lg" disabled={submitting}>
              {submitting ? "登录中..." : "登录"}
            </Button>
          </form>

          {/* 演示账号快捷填充 */}
          {demo && (
            <div className="mt-6">
              <p className="text-xs font-medium text-ink-muted mb-2">
                演示账号（点击自动填充，密码均为 demo1234）
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((item) => (
                  <button
                    key={item.account}
                    type="button"
                    onClick={() => fillDemoAccount(item.account, item.password)}
                    className="text-left p-2.5 rounded-lg border border-line hover:border-blue-400 hover:bg-brand-soft/50 transition-colors"
                  >
                    <p className="text-sm font-medium text-ink">{item.description}</p>
                    <p className="text-xs text-ink-muted truncate mt-0.5">{item.account}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-ink-muted mt-4">
          {demo
            ? "未注册账号？Demo 阶段无需注册，请直接使用演示账号"
            : "仅限受邀测试用户，不开放公开注册"}
        </p>
        {safeNext(nextParam) === "/preview" && (
          <p className="text-center text-xs mt-3">
            <a href="/preview" className="text-brand hover:underline">
              暂不登录，返回查看我的结果
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams 需要 Suspense 边界以支持静态预渲染
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
