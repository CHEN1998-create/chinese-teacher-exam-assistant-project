#!/usr/bin/env node
/**
 * 网络依赖检查 CLI（v6.1 模块 0A）。
 *
 * 用法：
 *   node scripts/check-external-deps.mjs            # 只扫源码与 public
 *   node scripts/check-external-deps.mjs --build    # 额外扫描 .next 构建产物
 *
 * 也可在构建后自动执行（package.json 的 postbuild 钩子）。
 * 退出码 0 通过，1 发现被阻断的境外字体/CDN 或客户端密钥泄漏。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runReport } from "./external-deps-scanner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

const includeBuild = process.argv.includes("--build");

const roots = [
  path.join(frontendRoot, "src"),
  path.join(frontendRoot, "public"),
  path.join(frontendRoot, "next.config.ts"),
  path.join(frontendRoot, "postcss.config.mjs"),
  path.join(frontendRoot, "package.json"),
];

const staticDir = includeBuild
  ? path.join(frontendRoot, ".next", "static")
  : undefined;

const exitCode = runReport({ roots, staticDir });
process.exit(exitCode);
