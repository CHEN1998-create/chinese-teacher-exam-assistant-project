/**
 * 公告版本只追加规则（PRD 7.10 / 数据管道文档）。
 *
 * - 已发布的版本不可变：补充/更正公告只追加新版本；
 * - 旧版本内容永不覆盖，只在副本上标记 supersededAt；
 * - 版本号严格递增，同内容快照（哈希一致）不产生新版本；
 * - 撤回是公告级生命周期事件，不删除任何版本。
 */
import type {
  AnnouncementVersion,
  ApplicationUnit,
  RecruitmentAnnouncement,
} from "./types";

/** 取当前版本（未被取代的最高版本号） */
export function currentVersion(announcement: RecruitmentAnnouncement): AnnouncementVersion {
  return [...announcement.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
}

/** 报名是否仍在开放（以当前版本的报名截止时间为准） */
export function isRegistrationOpen(version: AnnouncementVersion, nowIso: string): boolean {
  const now = new Date(nowIso).getTime();
  return (
    new Date(version.timeline.registrationStart).getTime() <= now &&
    new Date(version.timeline.registrationEnd).getTime() >= now
  );
}

/** 生成版本内容指纹（SHA-256 不可用时回退到 FNV-1a 风格字符串哈希，仅用于去重比较） */
export async function snapshotFingerprint(version: {
  timeline: AnnouncementVersion["timeline"];
  units: Pick<ApplicationUnit, "id" | "code" | "headcount" | "requirements">[];
  changeNote?: string;
}): Promise<string> {
  const payload = JSON.stringify({
    timeline: version.timeline,
    units: version.units.map((u) => ({
      id: u.id,
      code: u.code,
      headcount: u.headcount,
      requirements: u.requirements,
    })),
    changeNote: version.changeNote ?? null,
  });
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(payload),
    );
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv-${(hash >>> 0).toString(16)}`;
}

/** 追加新版本所需的输入（不含版本号等系统字段） */
export interface NewVersionDraft {
  sourceKind: AnnouncementVersion["sourceKind"];
  publishedAt: string;
  officialSource: AnnouncementVersion["officialSource"];
  timeline: AnnouncementVersion["timeline"];
  units: ApplicationUnit[];
  changeNote?: string;
  /** 新内容的指纹；与上一版本相同则不增殖新版本 */
  fingerprint?: string;
}

export interface AppendVersionResult {
  announcement: RecruitmentAnnouncement;
  version: AnnouncementVersion;
  /** 内容指纹与上一版本相同，未产生新版本 */
  deduplicated: boolean;
}

/**
 * 追加公告版本（纯函数，不修改入参）。
 * 旧版本对象的业务内容（时间线、单元、证据）保持原样，
 * 仅在新版本数组中以副本形式携带 supersededAt 标记。
 */
export function appendVersion(
  announcement: RecruitmentAnnouncement,
  draft: NewVersionDraft,
  nowIso: string,
): AppendVersionResult {
  const previous = currentVersion(announcement);

  if (previous && draft.fingerprint && draft.fingerprint === previous.fingerprint) {
    return { announcement, version: previous, deduplicated: true };
  }

  const version: AnnouncementVersion = {
    id: `${announcement.id}-v${previous ? previous.versionNumber + 1 : 1}`,
    announcementId: announcement.id,
    versionNumber: previous ? previous.versionNumber + 1 : 1,
    sourceKind: draft.sourceKind,
    publishedAt: draft.publishedAt,
    officialSource: draft.officialSource,
    timeline: draft.timeline,
    units: draft.units,
    changeNote: draft.changeNote,
    fingerprint: draft.fingerprint,
  };

  const supersededVersions = announcement.versions.map((v) =>
    v.id === previous?.id
      ? {
          ...v,
          supersededAt: nowIso,
        }
      : v,
  );

  const next: RecruitmentAnnouncement = {
    ...announcement,
    versions: [...supersededVersions, version],
  };

  return { announcement: next, version, deduplicated: false };
}

/** 标记公告撤回（公告级事件，保留全部版本） */
export function withdrawAnnouncement(
  announcement: RecruitmentAnnouncement,
): RecruitmentAnnouncement {
  if (announcement.lifecycle === "withdrawn") return announcement;
  return { ...announcement, lifecycle: "withdrawn" };
}

/**
 * 建立补充公告关联：返回新公告，记录被补充的原公告 id。
 * 补充公告与原公告属于同一招聘活动链，不产生孤立的新公告记录。
 */
export function linkSupplement(
  supplement: RecruitmentAnnouncement,
  originalAnnouncementId: string,
): RecruitmentAnnouncement {
  if (supplement.id === originalAnnouncementId) {
    throw new Error("补充公告不能关联自身");
  }
  return {
    ...supplement,
    supplementOfAnnouncementId: originalAnnouncementId,
  };
}
