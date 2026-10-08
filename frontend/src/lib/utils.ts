import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 完整日期时间（审核留痕使用），例如 2026/10/01 14:30 */
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function formatDateWithWeekday(dateString: string): string {
  const date = new Date(dateString);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${date.getMonth() + 1}月${date.getDate()}日 周${weekdays[date.getDay()]}`;
}

export function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export function getWeekdayName(dayOfWeek: number): string {
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return names[dayOfWeek % 7];
}
