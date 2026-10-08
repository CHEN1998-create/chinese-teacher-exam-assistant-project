import { guestSessionService, draftToProfile } from "@/lib/guest/guestSession";
import type { UserRecruitmentProfile } from "@/lib/profile/types";

const API_BASE = "/api/profile";

/**
 * 用户画像 API（模块 8）。
 * invited 模式下画像持久化在服务端，跨浏览器恢复；
 * demo 模式下本模块不被使用（画像仍走本地 + 请求体）。
 *
 * 注意：本模块不得 import @/lib/auth —— HttpAuthProvider 依赖本模块做画像迁移，
 * 反向引入会形成模块循环（TDZ: Cannot access 'HttpAuthProvider'）。
 * 模式判断由调用方负责（唯一迁移调用方是 invited 模式的 HttpAuthProvider）。
 */
export const profileApi = {
  async getProfile(): Promise<UserRecruitmentProfile | null> {
    const res = await fetch(API_BASE, { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { profile?: UserRecruitmentProfile | null };
    return data.profile ?? null;
  },

  async saveProfile(profile: UserRecruitmentProfile): Promise<void> {
    const res = await fetch(API_BASE, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ profile }),
    });
    if (!res.ok) throw new Error("保存画像失败");
  },

  /**
   * 登录后迁移访客画像到服务端（幂等）。
   * - 仅应在 invited 模式调用（当前唯一调用方为 HttpAuthProvider）；
   * - 仅当服务端尚无该用户画像时才写入，避免覆盖用户已保存的画像；
   * - 重复登录不会产生重复记录（服务端 upsert + 此处先 GET 判断）。
   */
  async migrateGuestProfileIfNeeded(): Promise<void> {
    const session = guestSessionService.load();
    if (!session) return;
    const profile = draftToProfile(session.draft);
    if (!profile) return;
    const existing = await this.getProfile();
    if (existing) return; // 已有服务端画像，不覆盖
    await this.saveProfile(profile);
  },
};
