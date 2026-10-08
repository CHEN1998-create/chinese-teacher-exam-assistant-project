/**
 * 运行环境配置。
 *
 * 仅使用 NEXT_PUBLIC_* 变量：它们会被内联到浏览器产物中，
 * 因此这里只能放置非敏感的环境标识，严禁放入任何密钥。
 *
 * - NEXT_PUBLIC_APP_ENV：demo | production（未设置时本地开发视为 development）
 * - NEXT_PUBLIC_DEMO_MODE："true" 时强制开启公开演示模式
 */
export const APP_ENV: string =
  process.env.NEXT_PUBLIC_APP_ENV ?? "development";

export const isDemoMode: boolean =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" || APP_ENV === "demo";
