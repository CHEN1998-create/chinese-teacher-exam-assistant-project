/**
 * 访客关注本地存储（模块 6）。
 *
 * 未登录用户在机会卡上「关注」时，把关注记录暂存在本机 localStorage，
 * 以便跨刷新保留状态；登录后通过 POST /follows/merge 合并到服务端，
 * 服务端已有关注记录时以服务端为准（不覆盖）。
 *
 * 存储结构：{ unitId: GuestFollowRecord }
 * 只存状态/材料进度/咨询结论，不存证件号或扫描件。
 */

export const GUEST_FOLLOWS_KEY = "kb_guest_follows_v1";

export type GuestFollowStatus =
  | "considering"
  | "preparing"
  | "registered"
  | "abandoned";

export interface GuestFollowRecord {
  unitId: string;
  status: GuestFollowStatus;
  materialStatuses: Record<string, string>;
  consultationNotes: Record<string, string>;
  updatedAt: string;
}

type GuestFollowsMap = Record<string, GuestFollowRecord>;

function readMap(): GuestFollowsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(GUEST_FOLLOWS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as GuestFollowsMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: GuestFollowsMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_FOLLOWS_KEY, JSON.stringify(map));
  } catch {
    // 存储不可用时静默降级
  }
}

export function getGuestFollow(unitId: string): GuestFollowRecord | null {
  return readMap()[unitId] ?? null;
}

export function listGuestFollows(): GuestFollowRecord[] {
  return Object.values(readMap());
}

export function isGuestFollowing(unitId: string): boolean {
  return Boolean(readMap()[unitId]);
}

export function upsertGuestFollow(
  unitId: string,
  patch: Partial<Omit<GuestFollowRecord, "unitId" | "updatedAt">>,
): GuestFollowRecord {
  const map = readMap();
  const existing = map[unitId];
  const next: GuestFollowRecord = {
    unitId,
    status: existing?.status ?? "considering",
    materialStatuses: existing?.materialStatuses ?? {},
    consultationNotes: existing?.consultationNotes ?? {},
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  map[unitId] = next;
  writeMap(map);
  return next;
}

export function removeGuestFollow(unitId: string) {
  const map = readMap();
  delete map[unitId];
  writeMap(map);
}

export function clearGuestFollows() {
  writeMap({});
}
