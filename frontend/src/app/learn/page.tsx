"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrandMark } from "@/components/layout/BrandMark";
import { Button } from "@/components/ui/Button";
import { USER_COPY } from "@/lib/ux/userCopy";
import { track, trackOncePerUser } from "@/lib/analytics/eventService";

/**
 * "先了解我们怎么判断"路径（模块 0A §4.3 / §7.2）：
 * - 最多三张简短资讯卡：用户为什么难判断 → 产品怎么核对 → 结果边界；
 * - 全程可直接开始匹配；
 * - 不使用自动播放轮播；
 * - 浏览器返回键可预测（返回到首页）；
 * - 手机和桌面均可使用；
 * - 该路径独立分析事件，但不采集个人信息。
 */
const CARDS = [
  {
    id: "why" as const,
    title: USER_COPY.LEARN.CARD1_TITLE,
    body: USER_COPY.LEARN.CARD1_BODY,
  },
  {
    id: "how" as const,
    title: USER_COPY.LEARN.CARD2_TITLE,
    body: USER_COPY.LEARN.CARD2_BODY,
  },
  {
    id: "boundary" as const,
    title: USER_COPY.LEARN.CARD3_TITLE,
    body: USER_COPY.LEARN.CARD3_BODY,
  },
];

export default function LearnPage() {
  const router = useRouter();

  // 进入 30 秒说明路径：独立事件，同浏览器只记一次，不采集个人信息
  useEffect(() => {
    trackOncePerUser("learn_opened", "learn");
  }, []);

  const handleStart = () => {
    track("learn_start_match_clicked", "learn");
    router.push("/onboarding");
  };

  return (
    <div className="min-h-screen bg-canvas px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-xl">
        <header className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414L6 10l5.293-5.293a1 1 0 011.414 0z" />
            </svg>
            返回首页
          </Link>
          <BrandMark size="sm" />
        </header>

        <h1 className="mt-8 text-xl font-bold leading-snug text-ink md:text-2xl">
          先花 30 秒了解我们怎么判断
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          看完可以直接开始匹配。
        </p>

        <ol className="mt-8 space-y-4" aria-label="我们怎么判断：三段说明">
          {CARDS.map((card, i) => (
            <li
              key={card.id}
              data-testid={`learn-card-${card.id}`}
              className="rounded-2xl border border-line bg-surface p-5"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
                >
                  {i + 1}
                </span>
                <h2 className="text-base font-semibold text-ink">{card.title}</h2>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {card.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Button
            size="lg"
            fullWidth
            onClick={handleStart}
            data-testid="learn-start-match"
            className="max-w-xs"
          >
            开始匹配
          </Button>
          <Link href="/" className="text-sm text-ink-muted hover:text-ink">
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
