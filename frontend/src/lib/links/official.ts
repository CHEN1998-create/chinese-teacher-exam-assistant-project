/** 阻止虚构示例 URL 被误当作可访问的官方公告或报名入口。 */
export function safeOfficialLink(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.hostname.split(".").some((label) =>
      label === "example" || label.startsWith("example-") || label.endsWith("-example"))) return null;
    return url.href;
  } catch {
    return null;
  }
}
