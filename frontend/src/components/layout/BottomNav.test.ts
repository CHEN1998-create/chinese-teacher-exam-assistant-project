/**
 * 移动端主导航渲染测试（无 @testing-library 依赖，使用 react-dom/server）：
 * 验证三个入口、激活态 aria-current 与可见文字（状态不只靠颜色）。
 */
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let mockPathname = "/opportunities";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => createElement("a", { href, ...rest }, children),
}));

import { BottomNav } from "./BottomNav";

function render() {
  return renderToString(createElement(BottomNav));
}

describe("BottomNav 移动端主导航", () => {
  it("只渲染机会/日程/我的三个入口", () => {
    mockPathname = "/opportunities";
    const html = render();
    expect(html).toContain("机会");
    expect(html).toContain("日程");
    expect(html).toContain("我的");
    expect(html).not.toContain("备考");
    expect(html).not.toContain("设置");
    expect(html).not.toContain("我的资料");
    expect(html).toContain('href="/opportunities"');
    expect(html).toContain('href="/schedule"');
    expect(html).toContain('href="/me"');
  });

  it("当前页带 aria-current=page 与「当前页面」文字提示", () => {
    mockPathname = "/schedule";
    const html = render();
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("当前页面");
  });

  it("子路由高亮所属分区（/me/corrections 高亮我的）", () => {
    mockPathname = "/me";
    const html = render();
    expect(html).toContain('aria-current="page"');
  });

  it("二级页面无任何导航高亮（备考降级为次级入口）", () => {
    mockPathname = "/study";
    const html = render();
    expect(html).not.toContain('aria-current="page"');
  });

  it("设置页无任何导航高亮", () => {
    mockPathname = "/settings";
    const html = render();
    expect(html).not.toContain('aria-current="page"');
  });
});
