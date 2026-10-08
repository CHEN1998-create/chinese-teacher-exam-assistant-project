"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/layout/BrandMark";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { Disclosure } from "@/components/ui/Disclosure";
import { LoadingPage } from "@/components/ui/Loading";
import { useCurrentUser } from "@/lib/auth";
import { guestSessionService } from "@/lib/guest/guestSession";
import { GUEST_COVERAGE } from "@/lib/guest/coverage";
import { track } from "@/lib/analytics/eventService";

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
 * 首页路由规则（v6.1 模块 0A 双入口混合式）：
 * - 已登录 → 默认进入「机会」/opportunities；
 * - 未登录且画像问答进行到一半 → 回到 /onboarding；
 * - 未登录且已看完初步结果 → /preview；
 * - 其余访客 → 价值首页（本页内容，无需登录）。
 *
 * 首屏只保留：品牌、核心价值、一句可信说明、一行覆盖摘要、主按钮"开始匹配"、
 * "先了解"文字入口；完整覆盖范围与依据进入按需展开。
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

  const handleStart = () => {
    track("home_start_match_clicked", "home");
    router.push("/onboarding");
  };

  return (
    <div className="min-h-screen bg-canvas px-4 py-10 md:py-16">
      <div className="mx-auto w-full max-w-xl">
        <header className="flex flex-col items-center text-center">
          <BrandMark size="lg" />
          <h1 className="mt-6 text-2xl font-bold leading-snug text-ink md:text-[28px]">
            看看你现在可能能报哪些教师岗位
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            根据官方公告逐项核对。
            <br className="sm:hidden" />
            判断不了的条件，我们会明确标出来。
          </p>
          <p className="mt-3 inline-flex items-center rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand">
            验证期仅开放 · 语文教师岗位
          </p>
        </header>

        {/* 一行覆盖摘要：仅事实，不展开 */}
        <p
          className="mt-7 text-center text-sm text-ink-muted"
          data-testid="home-coverage-summary"
        >
          {regionText}语文岗位持续核对中 · 在报{" "}
          <span className="font-semibold text-ink">
            {GUEST_COVERAGE.openOpportunityCount}
          </span>{" "}
          个（截至 {formatDate(GUEST_COVERAGE.lastCheckedAt)}）
        </p>

        <div className="mt-7 flex flex-col items-center gap-3">
          <Button
            size="lg"
            fullWidth
            onClick={handleStart}
            data-testid="start-onboarding"
            className="max-w-xs"
          >
            开始匹配
          </Button>
          <LinkButton
            href="/learn"
            variant="link"
            data-testid="open-learn"
            className="text-sm"
            iconEnd={
              <svg
                aria-hidden="true"
                className="h-3.5 w-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M7.293 5.293a1 1 0 011.414 0L13 9.414a1 1 0 010 1.414l-4.293 4.293a1 1 0 01-1.414-1.414L10.586 10 7.293 6.707a1 1 0 010-1.414z" />
              </svg>
            }
          >
            先花 30 秒了解我们怎么判断
          </LinkButton>
        </div>

        {/* 完整覆盖范围与依据：按需展开 */}
        <div className="mt-10 space-y-3">
          <Disclosure
            trigger="查看当前覆盖范围与依据"
            triggerVariant="ghost"
            contentClassName="rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed text-ink-muted"
          >
            <dl className="space-y-2">
              <div className="flex gap-2">
                <dt className="shrink-0 text-ink-muted">在报岗位</dt>
                <dd className="text-ink">
                  <span className="font-semibold">
                    {GUEST_COVERAGE.openOpportunityCount} 个
                  </span>
                  <span className="ml-1 text-ink-muted">（截至最近一次核对）</span>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-ink-muted">最近核对</dt>
                <dd className="text-ink">{formatDate(GUEST_COVERAGE.lastCheckedAt)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-ink-muted">下一窗口</dt>
                <dd className="text-ink">{GUEST_COVERAGE.nextWindowNote}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-ink-muted">信息来源</dt>
                <dd className="text-ink">
                  两市教育官方渠道共 {SOURCE_COUNT} 个来源（杭州教育网、宁波市教育局、鄞州区教育局）
                </dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-line pt-2 text-xs leading-relaxed text-ink-muted">
              {GUEST_COVERAGE.scopeNote}
            </p>

            <h3 className="mt-4 text-sm font-semibold text-ink">结论从哪来</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
              <li className="flex gap-2">
                <span aria-hidden="true" className="text-brand">·</span>
                逐条比对官方招聘公告原文与岗位表（地区、学历学位、专业、应届身份、教师资格），每条结论附公告出处。
              </li>
              <li className="flex gap-2">
                <span aria-hidden="true" className="text-brand">·</span>
                只给四档结论：初步符合、补充信息后判断、建议人工确认、明确不符合；没提供的信息不会被当作不符合。
              </li>
              <li className="flex gap-2">
                <span aria-hidden="true" className="text-brand">·</span>
                结果仅为报名前的资格预筛，最终以官方公告和招聘单位审核为准。
              </li>
            </ul>
          </Disclosure>
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed text-ink-muted">
          无需注册登录，你的答案仅保存在这台设备，7 天后自动清除
          <br />
          已有账号？
          <LinkButton href="/login" variant="link" className="ml-1 text-sm">
            直接登录
          </LinkButton>
        </p>
      </div>
    </div>
  );
}
