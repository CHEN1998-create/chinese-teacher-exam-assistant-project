"use client";

import { useState } from "react";
import {
  AbilityBaseline,
  ModuleSelfAssessment,
  PracticeScore,
  SELF_ASSESSMENT_LEVEL_LABELS,
} from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import {
  CHINESE_MODULES,
  EXAM_MODULES,
  GENERAL_MODULES,
  moduleDef,
} from "@/lib/materials/domain";
import { materialService } from "@/lib/materials/materialService";
import { cn } from "@/lib/utils";

interface AbilityBaselineFormProps {
  baseline: AbilityBaseline;
}

type AssessmentMap = Record<string, { level: number; note?: string }>;

const MODULE_OPTIONS = EXAM_MODULES.map((m) => ({ value: m.key, label: m.label }));

function toAssessmentMap(items: ModuleSelfAssessment[]): AssessmentMap {
  const map: AssessmentMap = {};
  items.forEach((item) => {
    map[item.module] = { level: item.level, note: item.note };
  });
  return map;
}

export function AbilityBaselineForm({ baseline }: AbilityBaselineFormProps) {
  const [chinese, setChinese] = useState<AssessmentMap>(() => toAssessmentMap(baseline.chineseAssessments));
  const [general, setGeneral] = useState<AssessmentMap>(() => toAssessmentMap(baseline.generalAssessments));
  const [scores, setScores] = useState<PracticeScore[]>(baseline.recentScores);
  const [weakModules, setWeakModules] = useState<string[]>(baseline.weakModules);
  const [dailyMinutes, setDailyMinutes] = useState(baseline.dailyAvailableMinutes);
  const [weeklyHours, setWeeklyHours] = useState(baseline.weeklyAvailableHours);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const setLevel = (
    map: AssessmentMap,
    setter: (m: AssessmentMap) => void,
    key: string,
    level: number
  ) => {
    if (map[key]?.level === level) {
      const next = { ...map };
      delete next[key];
      setter(next);
    } else {
      setter({ ...map, [key]: { level } });
    }
  };

  const toggleWeak = (key: string) => {
    setWeakModules((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const updateScore = (id: string, patch: Partial<PracticeScore>) => {
    setScores((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addScore = () => {
    setScores((prev) => [
      ...prev,
      { id: `ps-${Date.now()}`, module: EXAM_MODULES[0].key, scoreText: "" },
    ]);
  };

  const removeScore = (id: string) => setScores((prev) => prev.filter((s) => s.id !== id));

  const handleSave = () => {
    const toItems = (map: AssessmentMap): ModuleSelfAssessment[] =>
      Object.entries(map).map(([module, v]) => ({ module, level: v.level as 1 | 2 | 3 | 4 | 5, note: v.note }));
    materialService.saveBaseline({
      ...baseline,
      chineseAssessments: toItems(chinese),
      generalAssessments: toItems(general),
      recentScores: scores.filter((s) => s.scoreText.trim()),
      weakModules,
      dailyAvailableMinutes: Math.max(0, dailyMinutes),
      weeklyAvailableHours: Math.max(0, weeklyHours),
    });
    setSavedAt(new Date().toLocaleTimeString("zh-CN"));
  };

  const AssessmentRow = ({
    moduleKey,
    map,
    setter,
  }: {
    moduleKey: string;
    map: AssessmentMap;
    setter: (m: AssessmentMap) => void;
  }) => (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-sm text-ink">{moduleDef(moduleKey)?.label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setLevel(map, setter, moduleKey, level)}
            className={cn(
              "h-7 w-7 rounded-md text-xs font-medium border transition-colors",
              map[moduleKey]?.level === level
                ? "border-brand bg-brand-soft text-brand"
                : "border-line text-ink-muted hover:bg-canvas"
            )}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card padding="sm">
        <h4 className="text-sm font-semibold text-ink">模块掌握度自评</h4>
        <p className="mt-1 text-xs text-ink-muted">
          1={SELF_ASSESSMENT_LEVEL_LABELS[1]}，5={SELF_ASSESSMENT_LEVEL_LABELS[5]}；再次点选可取消。
          评 1-2 分的模块会自动纳入薄弱项参考。
        </p>
        <div className="mt-2">
          <p className="text-xs font-semibold text-ink-muted">语文学科</p>
          {CHINESE_MODULES.map((m) => (
            <AssessmentRow key={m.key} moduleKey={m.key} map={chinese} setter={setChinese} />
          ))}
          <p className="mt-2 text-xs font-semibold text-ink-muted">教综 / 其他模块（只评你目标考的）</p>
          {GENERAL_MODULES.map((m) => (
            <AssessmentRow key={m.key} moduleKey={m.key} map={general} setter={setGeneral} />
          ))}
        </div>
      </Card>

      <Card padding="sm">
        <h4 className="text-sm font-semibold text-ink">最近练习成绩</h4>
        <p className="mt-1 text-xs text-ink-muted">
          填写近 1-2 个月的模考或章节练习成绩；低于 60% 的模块会计入薄弱项参考。
        </p>
        <div className="mt-2 space-y-2">
          {scores.length === 0 && <p className="text-xs text-ink-muted">还没有记录。</p>}
          {scores.map((score) => (
            <div key={score.id} className="grid grid-cols-12 gap-2">
              <div className="col-span-4">
                <Select
                  value={score.module}
                  onChange={(e) => updateScore(score.id, { module: e.target.value })}
                  options={MODULE_OPTIONS}
                />
              </div>
              <div className="col-span-3">
                <Input
                  placeholder="如 72分"
                  value={score.scoreText}
                  onChange={(e) => updateScore(score.id, { scoreText: e.target.value })}
                />
              </div>
              <div className="col-span-3">
                <Input
                  type="number"
                  placeholder="正确率%"
                  value={score.scorePercent ?? ""}
                  onChange={(e) =>
                    updateScore(score.id, {
                      scorePercent: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="col-span-2 flex items-center">
                <button
                  type="button"
                  onClick={() => removeScore(score.id)}
                  className="text-xs text-ink-muted hover:text-danger"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
          <button type="button" onClick={addScore} className="text-xs font-medium text-brand hover:underline">
            + 添加成绩
          </button>
        </div>
      </Card>

      <Card padding="sm">
        <h4 className="text-sm font-semibold text-ink">明显薄弱项</h4>
        <p className="mt-1 text-xs text-ink-muted">除自评与成绩自动识别外，你可以在这里手动补充（如：案例分析题）。</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAM_MODULES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => toggleWeak(m.key)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs border transition-colors",
                weakModules.includes(m.key)
                  ? "border-warn bg-warn-soft text-warn"
                  : "border-line bg-surface text-ink-muted hover:bg-canvas"
              )}
            >
              {weakModules.includes(m.key) ? "✓ " : ""}
              {m.label}
            </button>
          ))}
        </div>
      </Card>

      <Card padding="sm">
        <h4 className="text-sm font-semibold text-ink">可用时间</h4>
        <p className="mt-1 text-xs text-ink-muted">
          每周可用时间过少时，分析会主动收缩并行资料数量，避免多套资料同时摊开。
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Input
            label="工作日每天可用（分钟）"
            type="number"
            min={0}
            value={dailyMinutes}
            onChange={(e) => setDailyMinutes(Number(e.target.value) || 0)}
          />
          <Input
            label="每周可用（小时）"
            type="number"
            min={0}
            value={weeklyHours}
            onChange={(e) => setWeeklyHours(Number(e.target.value) || 0)}
          />
        </div>
        {weeklyHours > 0 && weeklyHours < 8 && (
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="warning">时间偏紧</Badge>
            <span className="text-xs text-ink-muted">分析将优先保留覆盖面最匹配的一套主资料。</span>
          </div>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave}>保存准备情况</Button>
        {savedAt && <span className="text-xs text-ink-muted">已于 {savedAt} 保存</span>}
      </div>
    </div>
  );
}
