// 公开演示站上线后安全冒烟：不暴露受邀 API 与管理后台。
import { BASE, check, runBrowser } from "./helpers.mjs";

await runBrowser(async (page) => {
  const api = await page.goto(`${BASE}/api/health`, { waitUntil: "domcontentloaded" });
  check("公开演示 API 代理已关闭", api?.status() === 503, `HTTP ${api?.status()}`);

  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  check(
    "公开演示管理后台已关闭",
    await page.getByText("管理后台未在公开演示环境开放").isVisible(),
  );
});
