"use client";

import { isDemoMode } from "@/lib/demo/config";

/**
 * 公开演示环境全局横幅（fixed 置顶，全宽）。
 * 高度约定：移动端 h-11（两行文案），桌面端 h-8（一行）。
 * 引用方需放置同尺寸的占位元素（见 AppShell / admin 布局）。
 */
export const DEMO_BANNER_SPACER_CLASS = "h-11 md:h-8";

export function DemoBanner() {
  if (!isDemoMode) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] h-11 md:h-8 flex items-center bg-amber-400 text-amber-950 border-b border-amber-500"
    >
      <p className="w-full px-3 text-[11px] md:text-xs leading-4 font-medium text-center">
        📢 产品演示环境：数据仅用于功能展示，请勿填写真实个人信息；输入仅保存在本机浏览器，不会上传服务器。
      </p>
    </div>
  );
}
