"use client";

import { useState } from "react";
import { DailyPlan } from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TaskCard } from "@/components/ui/TaskCard";
import { Button } from "@/components/ui/Button";
import { formatTime, getWeekdayName } from "@/lib/utils";

interface DailyPlanCardProps {
  plan: DailyPlan;
  onAdjustTime?: (dailyPlanId: string, minutes: number) => void;
}

export function DailyPlanCard({ plan, onAdjustTime }: DailyPlanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [timeValue, setTimeValue] = useState(String(plan.availableMinutes));

  const isToday = plan.date === new Date().toISOString().split("T")[0];
  const completedCount = plan.tasks.filter((t) => t.status === "completed").length;
  const allDone = completedCount === plan.tasks.length && plan.tasks.length > 0;

  const handleSaveTime = () => {
    const mins = Math.max(0, Math.min(600, Number(timeValue) || 0));
    onAdjustTime?.(plan.id, mins);
    setEditingTime(false);
  };

  return (
    <Card>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center ${
              allDone
                ? "bg-emerald-100"
                : isToday
                  ? "bg-blue-100"
                  : "bg-slate-100"
            }`}
          >
            <span className="text-[10px] text-slate-500">
              {getWeekdayName(plan.dayOfWeek)}
            </span>
            <span
              className={`text-lg font-bold ${
                allDone ? "text-emerald-700" : isToday ? "text-blue-700" : "text-slate-700"
              }`}
            >
              {plan.date.split("-")[2]}
            </span>
          </div>
          <div>
            <p className="font-medium text-slate-900">
              {plan.tasks.length} 项任务
              {isToday && <span className="ml-2 text-blue-600 text-sm">今天</span>}
            </p>
            <p className="text-sm text-slate-500">
              预计 {formatTime(plan.totalEstimatedTime)} / 可用{" "}
              {formatTime(plan.availableMinutes)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {plan.isMinimumViable && (
            <Badge variant="warning">最低可完成</Badge>
          )}
          {allDone && <Badge variant="success">全部完成</Badge>}
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 space-y-3">
          {plan.tasks.map((task) => (
            <TaskCard key={task.id} task={task} showPlanMeta />
          ))}

          {/* 调整每日可用时间 */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            {editingTime ? (
              <>
                <input
                  type="number"
                  min={0}
                  max={600}
                  value={timeValue}
                  onChange={(e) => setTimeValue(e.target.value)}
                  className="w-20 h-8 px-2 border border-slate-300 rounded-lg text-sm"
                />
                <span className="text-sm text-slate-500">分钟</span>
                <Button size="sm" variant="primary" onClick={handleSaveTime}>
                  保存
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingTime(false)}>
                  取消
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTimeValue(String(plan.availableMinutes));
                  setEditingTime(true);
                }}
              >
                调整可用时间
              </Button>
            )}
            <span className="text-xs text-slate-400 ml-auto">
              调整时间不会自动重排任务，如需重排请重新生成草稿
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
