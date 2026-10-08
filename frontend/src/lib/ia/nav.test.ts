import { describe, expect, it } from "vitest";
import {
  PRIMARY_NAV,
  activeNavId,
  isNavActive,
  LEGACY_ROUTE_REDIRECTS,
} from "./nav";

describe("主导航 IA v7.0（机会 / 日程 / 我的）", () => {
  it("主导航永远只有三个入口且顺序固定", () => {
    expect(PRIMARY_NAV.map((item) => item.id)).toEqual([
      "opportunities",
      "schedule",
      "me",
    ]);
    expect(PRIMARY_NAV.map((item) => item.href)).toEqual([
      "/opportunities",
      "/schedule",
      "/me",
    ]);
    expect(PRIMARY_NAV.map((item) => item.label)).toEqual([
      "机会",
      "日程",
      "我的",
    ]);
  });

  it("v7.0 不设置独立备考主导航（P0-5）", () => {
    expect(PRIMARY_NAV.some((item) => item.href === "/study")).toBe(false);
    // /study 仍是可访问的次级路由，但不产生主导航高亮
    expect(activeNavId("/study")).toBeNull();
    expect(activeNavId("/study/materials")).toBeNull();
  });

  it("精确路径与子路由正确高亮", () => {
    expect(isNavActive("/opportunities", "/opportunities")).toBe(true);
    expect(isNavActive("/opportunities/unit-hangzhou-01", "/opportunities")).toBe(true);
    expect(isNavActive("/schedule", "/schedule")).toBe(true);
    expect(isNavActive("/me", "/me")).toBe(true);
  });

  it("相似前缀路径不产生误高亮", () => {
    expect(isNavActive("/opportunities-x", "/opportunities")).toBe(false);
    expect(isNavActive("/memo", "/me")).toBe(false);
    expect(isNavActive("/settings", "/schedule")).toBe(false);
  });

  it("二级页面（设置/资料/备考）没有主导航高亮", () => {
    expect(activeNavId("/settings")).toBeNull();
    expect(activeNavId("/materials")).toBeNull();
  });

  it("旧路由跳转表覆盖 /exam /today /plan 且落到语义最接近的新页面", () => {
    expect(LEGACY_ROUTE_REDIRECTS["/exam"]).toBe("/opportunities");
    expect(LEGACY_ROUTE_REDIRECTS["/today"]).toBe("/study");
    expect(LEGACY_ROUTE_REDIRECTS["/plan"]).toBe("/study");
  });
});
