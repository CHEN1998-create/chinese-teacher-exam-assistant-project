/**
 * 运行时外部依赖扫描器（v6.1 模块 0A：国内普通网络可访问基线）。
 *
 * 作用：
 * - 列出前端源码与构建产物中出现的所有绝对 URL origin，形成外部依赖清单；
 * - 对“浏览器会自动加载、且在中国大陆普通网络下可能被阻断”的境外字体/CDN
 *   主机名做硬阻断（BLOCKED_HOSTS），一旦重新引入即检查失败；
 * - 构建产物检查：浏览器静态 chunk 中不得出现服务端密钥变量名，防止
 *   INTERNAL_TOKEN 等被打进客户端。
 *
 * 设计取舍：
 * - 普通官方公告链接（政府网站等，仅供用户点击跳转、不会自动加载）不在阻断
 *   清单内，只做清单输出；
 * - 文档（*.md）与本脚本自身会提到被禁域名，属于“说明文字”，因此扫描根目录
 *   不包含 docs、scripts 与 README，只扫描真正会进入应用的源码/资源/产物；
 * - 不读取任何 .env* 文件，避免把真实密钥读入检查过程。
 */
import fs from "node:fs";
import path from "node:path";

/**
 * 阻断清单：主机名按“相等或子域后缀”匹配。
 * 新增条目时必须同步 docs/china-network-accessibility.md 的说明。
 */
export const BLOCKED_HOSTS = [
  // Google 字体与通用 CDN（大陆普通网络不稳定/被阻断）
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "ajax.googleapis.com",
  "themes.googleusercontent.com",
  // 常见境外静态资源 CDN
  "unpkg.com",
  "jsdelivr.net",
  "cdnjs.cloudflare.com",
  "maxcdn.bootstrapcdn.com",
  "stackpath.bootstrapcdn.com",
  "cdn.skypack.dev",
  "esm.sh",
  // GitHub 原始内容/头像（境外，且常被用作运行时资源）
  "raw.githubusercontent.com",
  "camo.githubusercontent.com",
  "avatars.githubusercontent.com",
  "objects.githubusercontent.com",
  // Font Awesome 官方 CDN
  "use.fontawesome.com",
  "fonts.fontawesome.com",
];

/** 浏览器静态产物中不允许出现的服务端密钥变量名（子串匹配）。 */
export const CLIENT_SECRET_MARKERS = [
  "INTERNAL_TOKEN",
  "SECRET_ACCESS_KEY",
  "PRIVATE_KEY",
  "DATABASE_URL",
];

const URL_PATTERN = /https?:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:[/?#][^\s"'`)<>\\]*)?/g;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "cache",
  // .next/dev 是 next dev 的历史开发产物缓存（非交付物），生产构建不输出
  // 到这里；基线只检查真正会部署的 .next/static、.next/server 等目录。
  "dev",
]);
const SKIP_FILE_PREFIXES = [".env"];
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".html",
  ".svg",
  ".txt",
  ".map",
]);

/**
 * @param {string} host
 * @returns {boolean}
 */
export function isBlockedHost(host) {
  const normalized = host.toLowerCase();
  return BLOCKED_HOSTS.some(
    (blocked) =>
      normalized === blocked || normalized.endsWith(`.${blocked}`),
  );
}

/**
 * @param {string} origin
 * @returns {string} 分类：blocked / local / external-click
 */
export function classifyOrigin(origin) {
  try {
    const host = new URL(origin).hostname;
    if (isBlockedHost(host)) return "blocked";
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host.endsWith(".local")
    ) {
      return "local";
    }
    return "external-click";
  } catch {
    return "unknown";
  }
}

/**
 * 递归收集目录下的可检查文本文件。
 * @param {string} root
 * @returns {string[]}
 */
export function collectFiles(root) {
  let stat;
  try {
    stat = fs.statSync(root);
  } catch {
    // 根目录在扫描间隙被移除（如并发构建重写 .next），视为无文件
    return [];
  }
  if (stat.isFile()) {
    const ext = path.extname(root).toLowerCase();
    return TEXT_EXTENSIONS.has(ext) ? [root] : [];
  }
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // 子目录在遍历间隙被移除或暂不可读（并发构建/清理），跳过
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.endsWith(".tsbuildinfo")) {
          continue;
        }
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        if (SKIP_FILE_PREFIXES.some((p) => entry.name.startsWith(p))) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (TEXT_EXTENSIONS.has(ext)) files.push(path.join(dir, entry.name));
      }
    }
  };
  walk(root);
  return files;
}

/**
 * 从文件内容提取所有绝对 URL。
 * @param {string} content
 * @returns {string[]} origin 列表（去重，保序）
 */
export function extractOrigins(content) {
  const origins = new Set();
  for (const match of content.matchAll(URL_PATTERN)) {
    const url = match[0];
    const urlEndPunctuation = /[.,;:!?]$/;
    const cleaned = urlEndPunctuation.test(url) ? url.slice(0, -1) : url;
    try {
      origins.add(new URL(cleaned).origin);
    } catch {
      // 忽略无法解析的片段
    }
  }
  return [...origins];
}

/**
 * 扫描一组根目录，返回来源清单与阻断项。
 * @param {string[]} roots
 */
export function scanRoots(roots) {
  /** @type {Map<string, Set<string>>} origin -> 出现文件 */
  const originFiles = new Map();
  /** @type {{origin: string, file: string}[]} */
  const blocked = [];

  for (const root of roots) {
    for (const file of collectFiles(root)) {
      let content;
      try {
        content = fs.readFileSync(file, "utf8");
      } catch {
        continue; // 二进制或无法解码文件直接跳过
      }
      if (content.includes("\u0000")) continue;
      for (const origin of extractOrigins(content)) {
        if (!originFiles.has(origin)) originFiles.set(origin, new Set());
        originFiles.get(origin).add(file);
        if (classifyOrigin(origin) === "blocked") {
          blocked.push({ origin, file });
        }
      }
    }
  }

  const inventory = [...originFiles.entries()]
    .map(([origin, files]) => ({
      origin,
      category: classifyOrigin(origin),
      files: [...files],
    }))
    .sort((a, b) => a.origin.localeCompare(b.origin));

  return { inventory, blocked };
}

/**
 * 检查浏览器静态 chunk 中是否混入服务端密钥标记。
 * @param {string} staticDir 通常是 frontend/.next/static
 */
export function scanClientSecrets(staticDir) {
  if (!fs.existsSync(staticDir)) return [];
  const leaks = [];
  for (const file of collectFiles(staticDir)) {
    if (![".js", ".mjs"].includes(path.extname(file).toLowerCase())) continue;
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const marker of CLIENT_SECRET_MARKERS) {
      if (content.includes(marker)) {
        leaks.push({ marker, file });
      }
    }
  }
  return leaks;
}

/**
 * 打印人类可读报告，返回 exit code。
 * @param {{roots: string[], staticDir?: string}} options
 */
export function runReport({ roots, staticDir }) {
  const { inventory, blocked } = scanRoots(roots);
  const leaks = staticDir ? scanClientSecrets(staticDir) : [];

  const grouped = { blocked: [], local: [], "external-click": [], unknown: [] };
  for (const item of inventory) grouped[item.category].push(item);

  console.log("=== 运行时外部依赖清单 ===");
  for (const [category, label] of [
    ["local", "本机/开发地址（不阻断）"],
    ["external-click", "外部链接（仅用户点击跳转，不自动加载，不阻断）"],
    ["blocked", "阻断项（浏览器自动加载的境外字体/CDN，必须移除）"],
  ]) {
    console.log(`\n[${label}] ${grouped[category].length} 个 origin`);
    for (const item of grouped[category]) {
      console.log(`  ${item.origin}`);
      for (const file of item.files) console.log(`    └─ ${file}`);
    }
  }

  if (staticDir) {
    console.log(`\n[客户端密钥泄漏检查] ${staticDir}`);
    if (leaks.length === 0) {
      console.log("  通过：浏览器静态产物中未发现服务端密钥变量名");
    } else {
      for (const leak of leaks) {
        console.log(`  泄漏：${leak.marker} 出现在 ${leak.file}`);
      }
    }
  }

  const failed = blocked.length > 0 || leaks.length > 0;
  if (failed) {
    console.error(
      `\n网络依赖检查失败：${blocked.length} 个阻断项，${leaks.length} 个密钥泄漏。` +
        "移除依赖或改用随项目部署的本地资源；详见 docs/china-network-accessibility.md。",
    );
  } else {
    console.log("\n网络依赖检查通过：未发现被阻断的境外运行依赖。");
  }
  return failed ? 1 : 0;
}
