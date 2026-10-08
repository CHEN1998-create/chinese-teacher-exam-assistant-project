import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/lib/auth";

// 字体策略（v6.1 模块 0A，国内普通网络可访问基线）：
// 不使用任何 Google 网络字体或境外字体 CDN（在中国大陆普通网络下可能被
// 阻断，导致构建或首屏失败）。统一使用系统字体栈，见 globals.css 中的
// --font-sans / --font-mono；如后续确有品牌字体需求，须使用有授权的
// 字体文件，放 public/ 下以本地字体加载方式随项目部署。

export const metadata: Metadata = {
  title: "教招有据｜教师招聘机会与资格预筛",
  description: "查看可追溯的教师招聘机会，逐项理解资格判断依据，推进报考下一步。当前先开放语文岗位。",
  // 公开演示环境：禁止搜索引擎收录（配合 X-Robots-Tag 响应头双保险）
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
