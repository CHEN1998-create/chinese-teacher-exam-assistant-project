/**
 * 旧路由兼容跳转（删除 v5.2 旧页面前的前置保证）：
 * /exam /today /plan 必须 307 到新路由，其余路径放行。
 */
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("v5.2 旧路由兼容跳转", () => {
  it("/exam → /opportunities（307，保留查询参数）", () => {
    const res = middleware(request("/exam?target=t-1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/opportunities?target=t-1");
  });

  it("/today → /study（307）", () => {
    const res = middleware(request("/today"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/study");
  });

  it("/plan → /study（307）", () => {
    const res = middleware(request("/plan"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/study");
  });

  it("新路由与其他路径直接放行", () => {
    for (const p of ["/opportunities", "/schedule", "/study", "/login"]) {
      expect(middleware(request(p)).status).toBe(200);
    }
  });
});
