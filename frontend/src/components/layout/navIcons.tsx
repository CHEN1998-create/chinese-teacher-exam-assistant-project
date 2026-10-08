import type { PrimaryNavId } from "@/lib/ia/nav";

/**
 * 用户端主导航内联 SVG 图标（模块 0A：不使用任何境外图标 CDN/图标字体）。
 * 描边跟随 currentColor，激活态只改颜色与字重，不引入装饰图形。
 */
export function NavIcon({ id, className }: { id: PrimaryNavId; className?: string }) {
  const common = {
    className,
    fill: "none" as const,
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    "aria-hidden": true,
  };
  switch (id) {
    case "opportunities":
      return (
        <svg {...common} strokeWidth={1.8}>
          <circle cx="12" cy="12" r="9" />
          <path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z" strokeLinejoin="round" />
        </svg>
      );
    case "schedule":
      return (
        <svg {...common} strokeWidth={1.8}>
          <rect x="3" y="4.5" width="18" height="17" rx="2" />
          <path d="M16 2.5v4M8 2.5v4M3 10h18" strokeLinecap="round" />
        </svg>
      );
    case "me":
      return (
        <svg {...common} strokeWidth={1.8}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
        </svg>
      );
  }
}
