"use client";

import { useCallback, useEffect, useState } from "react";
import { AUTH_MODE } from "@/lib/auth";
import {
  buildActiveProfile,
  type ActiveProfileReason,
} from "@/lib/profile/activeProfile";
import type { UserRecruitmentProfile } from "@/lib/profile/types";
import { opportunitiesApi } from "./api";
import { trackOncePerUser } from "@/lib/analytics/eventService";
import type {
  FollowStatus,
  MatchResponse,
  StudyTargetRole,
  UnitMatchDTO,
} from "./api-types";

/** invited 模式占位画像：后端会忽略请求体，读取已持久化画像 */
const INVITED_PLACEHOLDER_PROFILE = {} as UserRecruitmentProfile;

/** P0 漏斗②：匹配成功且至少有一个初步符合（有效）机会；同用户只记一次 */
function recordRevealed(data: MatchResponse): void {
  const validCount = data.groups.preliminary.length;
  if (validCount <= 0) return;
  trackOncePerUser("opportunity_revealed", "opportunity", {
    targetId: data.groups.preliminary[0]?.unit.id,
    props: { validCount },
  });
}

export type OpportunitiesLoadState =
  | { status: "loading" }
  | { status: "no-profile"; reason: ActiveProfileReason }
  | {
      status: "ready";
      data: MatchResponse;
      profile: UserRecruitmentProfile;
    }
  | { status: "error"; error: string };

export interface OpportunitiesApi {
  state: OpportunitiesLoadState;
  reload: () => Promise<void>;
  followBusyId: string | null;
  actionError: string | null;
  toggleFollow: (unit: UnitMatchDTO) => Promise<void>;
}

function computeInitialState():
  | { status: "loading" }
  | { status: "no-profile"; reason: ActiveProfileReason } {
  if (AUTH_MODE === "invited") return { status: "loading" };
  const active = buildActiveProfile();
  return active.ready
    ? { status: "loading" }
    : { status: "no-profile", reason: active.reason };
}

/**
 * 机会列表数据：登录后只读后端匹配结果（按请求即时计算）。
 * - demo：画像来自本机基础画像草稿 + 补充事实；
 * - invited：画像由后端读取已持久化数据，前端不依赖本地草稿。
 */
export function useOpportunities(): OpportunitiesApi {
  const [state, setState] = useState<OpportunitiesLoadState>(computeInitialState);
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setState({ status: "loading" });
    let profile: UserRecruitmentProfile;
    if (AUTH_MODE === "invited") {
      profile = INVITED_PLACEHOLDER_PROFILE;
    } else {
      const active = buildActiveProfile();
      if (!active.ready) {
        setState({ status: "no-profile", reason: active.reason });
        return;
      }
      profile = active.profile;
    }
    try {
      const data = await opportunitiesApi.match(profile);
      recordRevealed(data);
      setState({ status: "ready", data, profile });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "机会加载失败";
      // 后端提示未保存画像：展示无画像引导
      if (msg.includes("尚未保存画像")) {
        setState({ status: "no-profile", reason: "incomplete" });
      } else {
        setState({ status: "error", error: msg });
      }
    }
  }, []);

  // 初次加载：setState 均在异步回调中
  useEffect(() => {
    let cancelled = false;
    const profile =
      AUTH_MODE === "invited"
        ? INVITED_PLACEHOLDER_PROFILE
        : (() => {
            const active = buildActiveProfile();
            return active.ready ? active.profile : null;
          })();
    if (profile === null) return;
    opportunitiesApi
      .match(profile)
      .then((data) => {
        if (!cancelled) {
          recordRevealed(data);
          setState({ status: "ready", data, profile });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const msg = error instanceof Error ? error.message : "机会加载失败";
          if (msg.includes("尚未保存画像")) {
            setState({ status: "no-profile", reason: "incomplete" });
          } else {
            setState({ status: "error", error: msg });
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFollow = useCallback(
    async (unit: UnitMatchDTO) => {
      setFollowBusyId(unit.unit.id);
      setActionError(null);
      try {
        if (unit.follow) {
          await opportunitiesApi.unfollow(unit.unit.id);
        } else {
          await opportunitiesApi.follow(unit.unit.id);
        }
        await reload(true);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "操作失败");
      } finally {
        setFollowBusyId(null);
      }
    },
    [reload],
  );

  return {
    state,
    reload: () => reload(false),
    followBusyId,
    actionError,
    toggleFollow,
  };
}

export type ActiveProfileLoadState =
  | { status: "no-profile"; reason: ActiveProfileReason }
  | { status: "ready"; profile: UserRecruitmentProfile };

/** 供详情页复用的画像读取。
 * - demo：本地草稿 + 补充事实；
 * - invited：占位 ready，由后端读取已持久化画像。 */
export function useActiveProfile(): ActiveProfileLoadState {
  const [state] = useState<ActiveProfileLoadState>(() => {
    if (AUTH_MODE === "invited") {
      return { status: "ready", profile: INVITED_PLACEHOLDER_PROFILE };
    }
    const active = buildActiveProfile();
    return active.ready
      ? { status: "ready", profile: active.profile }
      : { status: "no-profile", reason: active.reason };
  });
  return state;
}

export type { FollowStatus, StudyTargetRole };
