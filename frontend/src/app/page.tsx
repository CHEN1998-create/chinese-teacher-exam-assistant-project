"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCurrentUser } from "@/lib/auth";
import { guestSessionService } from "@/lib/guest/guestSession";
import { GUEST_COVERAGE } from "@/lib/guest/coverage";
import { LoadingPage } from "@/components/ui/Loading";

/** "YYYY-MM-DD..." → "YYYY年M月D日"；无法解析时原样返回 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

const SOURCE_COUNT = GUEST_COVERAGE.regions.reduce(
  (sum, region) => sum + region.sources.length,
  0,
);

/**
 * 首页路由规则（v6.1）：
 * - 已登录 → 默认进入「机会」/opportunities（不做复杂智能路由；紧急报名事项
 *   在机会页顶部作为唯一优先行动展示）；
 * - 未登录且画像问答进行到一半 → 回到 /onboarding；
 * - 未登录且已看完初步结果 → /preview；
 * - 其余访客 → 价值首页（本页内容，无需登录）。
 *
 * 模块 4：首屏只陈述真实事实——覆盖哪两个市、核对时间、在报数、下一窗口、
 * 仅语文、依据来自官方原文、预筛边界；不写任何未经实测的完成时长承诺。
 */
export default function Home() {
  const router = useRouter();
  const { status } = useCurrentUser();

  useEffect(() => {
    if (status === "loading") return;

    if (status === "authenticated") {
      router.replace("/opportunities");
      return;
    }

    if (guestSessionService.isInProgress()) {
      router.replace("/onboarding");
      return;
    }
    if (guestSessionService.isComplete()) {
      router.replace("/preview");
    }
  }, [status, router]);

  if (status === "loading") return <LoadingPage />;

  const regionText = GUEST_COVERAGE.regions.map((r) => r.label).join("、");

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 md:py-14">
      <div className="mx-auto w-full max-w-xl">
        <header className="text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
            <span className="text-2xl" aria-hidden="true">📝</span>
          </div>
          <p className="text-sm font-semibold tracking-wide text-blue-700">教招有据</p>
          <p className="mt-0.5 text-xs text-slate-500">教师招聘机会与资格预筛</p>
          <h1 className="mt-4 text-2xl font-bold leading-snug text-slate-900 md:text-[28px]">
            先看官方公告要求，
            <br className="sm:hidden" />
            再看自己可能能报哪些教师岗位
          </h1>
          <p className="mt-3 inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            验证期仅开放 · 语文教师岗位
          </p>
        </header>

        {/* 真实监测覆盖：不把 seed 演示数据当事实，事实来自 guest/coverage 镜像 */}
        <section
          aria-label="当前真实监测覆盖"
          data-testid="home-coverage"
          className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-left"
        >
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-emerald-900">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full bg-emerald-500"
            />
            官方渠道持续监测中 · {regionText}
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="shrink-0 text-slate-500">在报岗位</dt>
              <dd className="text-emerald-900">
                <span className="font-semibold">
                  {GUEST_COVERAGE.openOpportunityCount} 个
                </span>
                <span className="ml-1 text-slate-500">（截至最近一次核对）</span>
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-slate-500">最近核对</dt>
              <dd className="text-slate-700">{formatDate(GUEST_COVERAGE.lastCheckedAt)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0">下一窗口</dt>
              <dd className="text-slate-700">{GUEST_COVERAGE.nextWindowNote}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0">信息来源</dt>
              <dd className="text-slate-700">
                两市教育官方渠道共 {SOURCE_COUNT} 个来源（杭州教育网、宁波市教育局、鄞州区教育局）
              </dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-emerald-100 pt-2 text-xs leading-relaxed text-slate-500">
            {GUEST_COVERAGE.scopeNote}
          </p>
        </section>

        {/* 依据与预筛边界 */}
        <section
          aria-label="预筛依据与边界"
          className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-left"
          data-testid="home-basis"
        >
          <h2 className="text-sm font-semibold text-slate-900">结论从哪来</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-blue-500">·</span>
              逐条比对官方招聘公告原文与岗位表（地区、学历学位、专业、应届身份、教师资格），每条结论附公告出处。
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-blue-500">·</span>
              只给四档结论：初步符合、补充信息后判断、建议人工确认、明确不符合；没提供的信息不会被当作不符合。
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-blue-500">·</span>
              结果仅为报名前的资格预筛，最终以官方公告和招聘单位审核为准。
            </li>
          </ul>
        </section>

        <div className="mt-8 text-center">
          <Link
            href="/onboarding"
            data-testid="start-onboarding"
            className="inline-flex h-12 w-full max-w-xs items-center justify-center rounded-xl bg-blue-600 px-8 text-base font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            开始免登录资格预筛
          </Link>
          <p className="mt-3 text-xs text-slate-400">
            无需注册登录，你的答案只保存在本机浏览器，7 天后自动清除
          </p>
          <p className="mt-6 text-xs text-slate-400">
            已有账号？
            <Link href="/login" className="ml-1 text-blue-600 hover:underline">
              直接登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
