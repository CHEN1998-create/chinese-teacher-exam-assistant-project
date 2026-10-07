// 模块 9 端到端：访客画像 → 查看初步机会 → 登录保存 → 查看依据 → 关注
// → 查看日程 → 设为主要目标 → 备考确认/资料/计划 → 开始第一项学习任务。
//
// 运行前提（真实环境）：
//   1) frontend 已启动（默认 http://localhost:3000；线上验收设置 QA_BASE_URL）；
//   2) demo 模式无需 backend：机会/关注/日程保存在当前浏览器；
//      invited 模式请改跑 m9-invited-flow.mjs（需要 backend + PostgreSQL）；
//   3) node 中可解析 playwright（.qa-harness 已独立安装）。
// 本脚本只验公开演示模式；不会向服务端发送个人画像或事件。
import { BASE, check, note, runBrowser, clearLocalStorage } from "./helpers.mjs";

async function loginFromPreview(page) {
  await page.getByRole("link", { name: /关注.*登录后保存/ }).first().click();
  await page.waitForURL("**/login**", { timeout: 10000 });
  await page.fill("#account", "student@demo.app");
  await page.fill("#password", "demo1234");
  await page.click('button[type="submit"]');
  // 已登录访问 /preview 会被送回 /opportunities
  await page.waitForURL("**/opportunities", { timeout: 15000 });
}

async function fillOnboarding(page) {
  // 第 1 组：地区（添加第一个地区，默认浙江省·必须接受）
  await page.getByRole("button", { name: "添加第一个地区" }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();

  // 第 2 组：学历 + 学位
  await page.getByRole("button", { name: "本科", exact: true }).click();
  await page.getByRole("button", { name: "学士学位", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();

  // 第 3 组：专业
  await page.getByPlaceholder("毕业证专业全称").fill("汉语言文学（师范）");
  await page.getByRole("button", { name: "下一步", exact: true }).click();

  // 第 4 组：毕业时间 + 当前状态
  await page.locator('input[type="month"]').fill("2024-06");
  await page.getByRole("button", { name: "已毕业，暂时没落实工作", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();

  // 第 5 组：教资（默认语文/初中）+ 至少一种用工形式
  await page.getByRole("button", { name: "已经取得教师资格证", exact: true }).click();
  await page.getByText("事业编", { exact: true }).click();
  await page.getByRole("button", { name: "查看初步匹配结果" }).click();
}

/** 资料 + 能力基线 + 诊断（沿用 s07 已验证的准备路径，路由更新为 v6.1） */
async function setupStudyMaterials(page) {
  await page.goto(`${BASE}/materials`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /新增资料|添加资料/ }).first().click();
  await page.waitForTimeout(400);
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel(/资料名称/).fill("语文考编通关宝典（M9验收）");
  await dlg.getByLabel("来源类型").selectOption({ index: 1 });
  await dlg.getByLabel("适用学段").selectOption({ label: "初中" });
  await dlg.getByLabel("适用地区").fill("浙江省");
  for (const n of ["现代汉语基础", "古代汉语（文言实词虚词句式）", "教育学基础"]) {
    await dlg.getByRole("button", { name: n, exact: true }).click();
  }
  await dlg.getByRole("button", { name: "保存" }).click();
  await page.waitForTimeout(500);

  await page.locator("button", { hasText: "准备情况" }).first().click();
  await page.waitForTimeout(300);
  await page.getByLabel("工作日每天可用（分钟）").fill("120");
  await page.getByLabel("每周可用（小时）").fill("10");
  await page.getByRole("button", { name: "保存准备情况" }).click();
  await page.waitForTimeout(500);

  await page.locator("button", { hasText: "资料怎么用" }).first().click();
  await page.waitForTimeout(300);
  const gen = page.getByRole("button", { name: /重新计算|再算一次|生成诊断|分析资料怎么用/ });
  if ((await gen.count()) > 0) {
    await gen.first().click();
    await page.waitForTimeout(1500);
  }
}

async function readEvents(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("kb_analytics_events") || "[]"),
  );
}

await runBrowser(async (page) => {
  const apiRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });
  await clearLocalStorage(page);

  // —— 访客：首页进入画像 ——
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByTestId("start-onboarding").click();
  await page.waitForURL("**/onboarding", { timeout: 10000 });
  check("画像页第 1 组展示", (await page.locator("body").innerText()).includes("你能接受去哪些地区"), "");

  await fillOnboarding(page);
  await page.waitForURL("**/preview", { timeout: 10000 });
  await page.waitForTimeout(600);
  let body = await page.locator("body").innerText();
  check("访客看到初步机会结果", body.includes("最值得先看的机会"), "");
  check(
    "结果页保留口径提示（初步匹配不等于可报名，最终以单位审核为准）",
    body.includes("初步匹配结果不等于保证可以报名"),
    "",
  );
  check("访客阶段画像事件已暂存", await page.evaluate(() =>
    (JSON.parse(localStorage.getItem("kb_guest_analytics_pending") || "[]")).some((e) => e.type === "profile_completed")
  ), "kb_guest_analytics_pending");

  // —— 登录保存 ——
  await loginFromPreview(page);
  // 演示匹配在浏览器本机完成，轮询等待界面稳定。
  await page.getByText(/有效机会\s*\d+\s*个/).waitFor({ timeout: 15000 });
  body = await page.locator("body").innerText();
  check("登录后进入机会列表", body.includes("有效机会"), body.match(/有效机会\s*\d+\s*个/)?.[0] ?? "");
  check("访客暂存事件登录后已迁移", await page.evaluate(() =>
    localStorage.getItem("kb_guest_analytics_pending") === "[]"
  ), "pending 清空");

  // —— 查看匹配依据 ——
  await page.getByRole("link", { name: "查看优先机会的依据与下一步" }).click();
  await page.waitForURL(/\/opportunities\/.+/, { timeout: 10000 });
  await page.getByText("关键依据与不确定项").waitFor({ timeout: 15000 });
  await page.getByText("示例公告与岗位表位置").waitFor({ timeout: 5000 });
  body = await page.locator("body").innerText();
  check("详情页展示关键依据与不确定项", body.includes("关键依据与不确定项"), "");
  check("详情页明确标示示例公告", body.includes("示例公告与岗位表位置") && body.includes("虚构演示"), "");
  check("虚构官方域名不可点击", await page.locator('a[href*="example.gov.cn"]').count() === 0, "");

  // —— 关注 ——
  await page.getByRole("button", { name: "关注（加入考虑中）" }).click();
  await page.waitForTimeout(900);
  body = await page.locator("body").innerText();
  check("关注成功：进入考虑中", body.includes("考虑中"), "");

  // —— 查看日程 ——
  await page.goto(`${BASE}/schedule`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  body = await page.locator("body").innerText();
  check("日程页可打开（时间线或空态）", body.includes("关注机会时间线") || body.includes("还没有不能错过的事"), "");

  // —— 标记准备报名 + 设为主要目标 ——
  await page.goBack({ waitUntil: "networkidle" }).catch(() => undefined);
  await page.waitForURL(/\/opportunities\/.+/, { timeout: 10000 }).catch(() => undefined);
  if (!page.url().match(/\/opportunities\/[^/]+$/)) {
    await page.goto(`${BASE}/opportunities`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "查看优先机会的依据与下一步" }).click();
    await page.waitForURL(/\/opportunities\/.+/, { timeout: 10000 });
  }
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "标记为准备报名" }).first().click();
  await page.waitForTimeout(900);
  body = await page.locator("body").innerText();
  check("已标记准备报名", body.includes("准备报名"), "");

  await page.getByRole("button", { name: /设为主要备考目标/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /确认设为主要|设为主要目标|确认切换/ }).click();
  await page.waitForTimeout(900);
  body = await page.locator("body").innerText();
  check("设为主要目标成功", body.includes("主要备考目标") || body.includes("改为备选目标"), "");

  // —— 备考：核对考试内容 → 资料/基线/诊断 → 生成并确认计划 → 开始第一项任务 ——
  await page.goto(`${BASE}/study`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  body = await page.locator("body").innerText();
  if (body.includes("继续演示：确认示例考情")) {
    note("存在考试内容核对门禁，先确认");
    await page.getByRole("button", { name: "继续演示：确认示例考情" }).click();
    await page.waitForTimeout(600);
  }

  await setupStudyMaterials(page);

  await page.goto(`${BASE}/study`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  body = await page.locator("body").innerText();
  if (body.includes("生成草稿计划")) {
    await page.getByRole("button", { name: "生成草稿计划" }).click();
    await page.waitForTimeout(1000);
  }
  body = await page.locator("body").innerText();
  if (body.includes("确认计划，开始执行")) {
    await page.getByRole("button", { name: "确认计划，开始执行" }).click();
    await page.waitForTimeout(900);
  }
  body = await page.locator("body").innerText();
  check("备考页出现今日任务", body.includes("今天先做这一项") || body.includes("做完后来点一下"), "");

  // 开始第一项学习任务（点击反馈即代表已开始；埋点在该动作触发）
  await page.getByRole("button", { name: "我做完了" }).first().click();
  // 反馈提交后的界面随当天剩余任务数变化（全部完成页 / 调整卡 / 下一项任务），
  // 用 task_feedback_submitted 事件落库作为行为级判据，轮询等待。
  const feedbackOk = await page.evaluate(() => new Promise((resolve) => {
    const deadline = Date.now() + 10000;
    const tick = () => {
      const events = JSON.parse(localStorage.getItem("kb_analytics_events") || "[]");
      const hit = events.some(
        (e) => e.type === "task_feedback_submitted" && e.source === "live"
          && e.userId === "u-001" && e.props?.status === "completed",
      );
      if (hit) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(tick, 300);
    };
    tick();
  }));
  check("首项任务执行反馈已提交（live/task_feedback_submitted=completed）", feedbackOk, "");

  // —— 分析事件验收：P0 事件全部为 live 且按用户归属 ——
  const events = await readEvents(page);
  const live = events.filter((e) => e.source === "live" && e.userId === "u-001");
  const types = new Set(live.map((e) => e.type));
  const required = [
    "profile_completed",
    "opportunity_revealed",
    "match_basis_viewed",
    "opportunity_followed",
    "follow_status_changed",
    "primary_target_set",
    "task_started",
  ];
  for (const t of required) {
    check(`P0 事件已记录（live/u-001）：${t}`, types.has(t), types.has(t) ? "" : "缺失");
  }
  const preparing = live.find(
    (e) => e.type === "follow_status_changed" && e.props?.to === "preparing",
  );
  check("follow_status_changed 带 to=preparing", Boolean(preparing), preparing ? JSON.stringify(preparing.props) : "");
  check("没有 live 事件被错误标记为 seed", live.every((e) => e.source === "live"), "");
  check("公开演示未请求后端 API", apiRequests.length === 0, apiRequests.slice(0, 3).join(" | ") || "0 次");
});
