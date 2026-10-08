import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * 安全响应头（v6.1 模块 0A 起同时服务演示与受邀环境）：
 * - 浏览器基础防护：nosniff / Referrer-Policy / 禁止 iframe 嵌入 / 禁用无关能力
 * - X-Robots-Tag：演示与受邀试用阶段均禁止搜索引擎收录
 * - CSP：默认同源，不使用任何境外 CDN/字体；开发环境放开 unsafe-eval 以支持
 *   HMR / Fast Refresh。新增确需的境内 origin 时，必须先登记到
 *   docs/china-network-accessibility.md 的允许域名清单，再在此逐项放开。
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // Next 生产产物含少量内联引导脚本，未启用 nonce 方案前保留 unsafe-inline
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // 产品没有运行时外部图片：无 <img>/next/image 外链，公告外链只供用户点击
  // 跳转、不自动加载；data:/blob: 仅用于本机选择文件的预览
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // 浏览器只能调用同源 /api/*；后端访问数据库、对象存储、AI/OCR 对浏览器不可见
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "X-Robots-Tag", value: "none" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  // 受邀环境 Docker 部署（根仓库 deploy/）：产出可独立运行的最小服务端目录
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
