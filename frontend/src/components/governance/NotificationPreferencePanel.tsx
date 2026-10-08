"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { useNotificationPreference } from "@/lib/governance/useGovernance";
import { notificationService } from "@/lib/governance/notificationService";
import { NotificationPreference } from "@/types";

/**
 * 通知偏好：修改后立即落库生效（无需“保存设置”）。
 * - 总开关只关闭非必要通知（学习提醒、考情变化）；
 * - 纠错结果、计划重新确认属于必要功能通知，仍有各自开关；
 * - 学习提醒每天最多一条，提醒时间仅用于展示与文案（Mock 无真实定时通道）。
 */
export function NotificationPreferencePanel() {
  const pref = useNotificationPreference();
  const [error, setError] = useState<string | null>(null);

  if (!pref) return null;

  const update = (patch: Partial<NotificationPreference>) => {
    setError(null);
    try {
      notificationService.updatePreference(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "设置更新失败");
    }
  };

  return (
    <Card>
      <CardHeader
        title="通知设置"
        description="所有开关修改后立即生效。我们不做排名提醒、断签提示或惩罚性催促。"
      />
      <div className="space-y-4">
        <Switch
          checked={!pref.nonEssentialOff}
          onChange={(checked) => update({ nonEssentialOff: !checked })}
          label="接收非必要通知"
          description="关闭后将不再收到学习提醒与考情变化推送；纠错结果、计划重新确认等必要通知不受影响"
        />

        <div className="border-t border-line pt-4 space-y-4">
          <Switch
            checked={pref.studyReminder && !pref.nonEssentialOff}
            disabled={pref.nonEssentialOff}
            onChange={(checked) => update({ studyReminder: checked })}
            label="每日学习提醒"
            description="每天最多一条，仅在当天有提醒需要时生成"
          />

          <div className="flex items-center gap-3 pl-1">
            <label htmlFor="reminder-time" className="text-sm text-ink-muted shrink-0">
              每日提醒时间
            </label>
            <input
              id="reminder-time"
              type="time"
              value={pref.reminderTime}
              disabled={pref.nonEssentialOff || !pref.studyReminder}
              onChange={(e) => update({ reminderTime: e.target.value })}
              className="h-9 rounded-lg border border-line px-2 text-sm disabled:bg-canvas disabled:text-ink-muted"
            />
            <span className="text-xs text-ink-muted">
              演示环境仅记录偏好，不会真实定时推送
            </span>
          </div>

          <Switch
            checked={pref.examChange && !pref.nonEssentialOff}
            disabled={pref.nonEssentialOff}
            onChange={(checked) => update({ examChange: checked })}
            label="重要考情变化"
            description="只在结论撤回等重要变化时通知；没有重要变化不会发送"
          />

          <Switch
            checked={pref.planReconfirm}
            onChange={(checked) => update({ planReconfirm: checked })}
            label="计划需要重新确认"
            description="考情变化影响本周计划时，提示你重新确认相关任务"
          />

          <Switch
            checked={pref.correctionResult}
            onChange={(checked) => update({ correctionResult: checked })}
            label="纠错处理结果"
            description="你的纠错被采纳、未采纳或被要求补充时通知你"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Card>
  );
}
