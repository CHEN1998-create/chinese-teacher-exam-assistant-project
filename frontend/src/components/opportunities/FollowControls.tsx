"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Input";
import {
  canTransition,
  FOLLOW_STATUS_LABELS,
  STUDY_TARGET_ROLE_LABELS,
  type FollowStatus,
} from "@/lib/opportunities";
import type { FollowDTO } from "@/lib/opportunities/api-types";
import { opportunitiesApi } from "@/lib/opportunities/api";
import {
  describePrimarySwitchImpact,
  type PrimarySwitchImpact,
} from "@/lib/goals/domain";
import { cn } from "@/lib/utils";

/**
 * 关注状态与备考目标控制（详情页第一/第二层之间）。
 * 可流转按钮由状态机推导（前端只做展示门禁，后端会再次校验非法边）；
 * “已结束”为终态，不展示任何转出按钮。
 */
const NEXT_BUTTONS: Array<{
  status: FollowStatus;
  variant: "primary" | "outline" | "secondary" | "ghost";
}> = [
  { status: "preparing", variant: "primary" },
  { status: "registered", variant: "secondary" },
  { status: "considering", variant: "outline" },
  { status: "abandoned", variant: "ghost" },
  { status: "closed", variant: "ghost" },
];

interface FollowControlsProps {
  follow: FollowDTO | null;
  /** 当前机会单元名（设为主要目标前的影响说明用） */
  unitName: string;
  busy: boolean;
  onFollow: () => void;
  onTransition: (
    status: FollowStatus,
    options?: { note?: string; abandonReason?: string },
  ) => void;
  onSetRole: (role: "primary" | "backup") => void;
  onUnfollow: () => void;
}

export function FollowControls({
  follow,
  unitName,
  busy,
  onFollow,
  onTransition,
  onSetRole,
  onUnfollow,
}: FollowControlsProps) {
  const [showAbandon, setShowAbandon] = useState(false);
  const [abandonReason, setAbandonReason] = useState("");
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);
  const [primaryImpact, setPrimaryImpact] = useState<PrimarySwitchImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);

  /** 设为主要目标前：拉取当前主要目标并展示影响说明（模块 7） */
  const handleSetPrimaryClick = async () => {
    setImpactLoading(true);
    let currentName: string | null = null;
    try {
      const res = await opportunitiesApi.getGoals();
      const primary = res.goals.find(
        (g) => g.role === "primary" && g.unitId !== follow?.unitId,
      );
      currentName = primary?.unitName ?? null;
    } catch {
      // 获取当前主要目标失败时仍展示通用影响说明
    } finally {
      setImpactLoading(false);
    }
    setPrimaryImpact(describePrimarySwitchImpact(currentName, unitName));
  };

  if (!follow) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">
          还没有关注这个机会。关注后可以在这里推进“考虑中 → 准备报名 →
          已报名”，并把它设为主要或备选备考目标。
        </p>
        <Button
          size="sm"
          className="mt-3"
          disabled={busy}
          onClick={onFollow}
        >
          关注（加入考虑中）
        </Button>
      </div>
    );
  }

  const available = NEXT_BUTTONS.filter((b) =>
    canTransition(follow.status, b.status),
  );

  const handleAbandon = () => {
    onTransition("abandoned", {
      abandonReason: abandonReason.trim() || undefined,
    });
    setShowAbandon(false);
    setAbandonReason("");
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">我的跟进</span>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {FOLLOW_STATUS_LABELS[follow.status]}
        </span>
        {follow.role && (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
              follow.role === "primary"
                ? "bg-blue-50 text-blue-700"
                : "bg-slate-100 text-slate-600",
            )}
          >
            {follow.role === "primary" ? "★ " : ""}
            {STUDY_TARGET_ROLE_LABELS[follow.role]}
          </span>
        )}
        {follow.abandonReason && (
          <span className="text-xs text-slate-400">
            放弃原因：{follow.abandonReason}
          </span>
        )}
      </div>

      {available.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {available.map(({ status, variant }) => (
            <Button
              key={status}
              size="sm"
              variant={variant}
              disabled={busy}
              onClick={() => {
                if (status === "abandoned") {
                  setShowAbandon((v) => !v);
                } else {
                  onTransition(status);
                }
              }}
            >
              {status === "preparing"
                ? "标记为准备报名"
                : status === "registered"
                  ? "我已完成报名"
                  : status === "considering"
                    ? "移回考虑中"
                    : status === "closed"
                      ? "标记为已结束"
                      : "放弃这个机会"}
            </Button>
          ))}
        </div>
      )}

      {showAbandon && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3">
          <Textarea
            label="放弃原因（可选，仅自己可见）"
            value={abandonReason}
            onChange={(e) => setAbandonReason(e.target.value)}
            placeholder="如：专业不符、地区太远、时间冲突……"
            maxLength={200}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setShowAbandon(false)}
            >
              取消
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={handleAbandon}
            >
              确认放弃
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {follow.role === "primary" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onSetRole("backup")}
          >
            改为备选目标
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || impactLoading}
            onClick={() => void handleSetPrimaryClick()}
          >
            ★ 设为主要备考目标
          </Button>
        )}
        <button
          type="button"
          className="text-xs text-slate-400 underline underline-offset-2 hover:text-red-600"
          onClick={() => setConfirmUnfollow(true)}
        >
          取消关注并删除记录
        </button>
        <span className="text-[11px] text-slate-400">
          设为主要目标后，原主要目标会自动转为备选。
        </span>
      </div>

      <ConfirmModal
        isOpen={confirmUnfollow}
        onClose={() => setConfirmUnfollow(false)}
        onConfirm={() => {
          setConfirmUnfollow(false);
          onUnfollow();
        }}
        title="取消关注？"
        description="将删除这个机会的关注与跟进状态，其他机会的关注记录不受影响。"
        confirmLabel="取消关注"
        variant="danger"
      />

      {/* 设为主要目标前的影响说明（模块 7）：确认后才真正切换 */}
      <Modal
        isOpen={primaryImpact !== null}
        onClose={() => setPrimaryImpact(null)}
        title={primaryImpact?.title ?? ""}
        footer={
          <>
            <Button variant="outline" onClick={() => setPrimaryImpact(null)}>
              再想想
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                setPrimaryImpact(null);
                onSetRole("primary");
              }}
            >
              确认设为主要目标
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-sm">
          {primaryImpact?.points.map((p, i) => (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5 text-slate-400">·</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </section>
  );
}
