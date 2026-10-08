"use client";

import { useState } from "react";
import {
  EducationLevel,
  ExamType,
  ResourceItem,
  ResourceStatus,
  ResourceType,
  RightsStatus,
  EDUCATION_LEVEL_LABELS,
  EXAM_TYPE_LABELS,
  RESOURCE_STATUS_LABELS,
  RESOURCE_TYPE_LABELS,
  RIGHTS_STATUS_LABELS,
} from "@/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { EXAM_MODULES } from "@/lib/materials/domain";
import { ResourceItemInput } from "@/lib/resources/resourceService";

function toDateInput(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function dateToIso(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00`).toISOString();
}

type FormState = {
  title: string;
  description: string;
  resourceType: ResourceType;
  sourceName: string;
  sourceUrl: string;
  rightsStatus: RightsStatus;
  regionsText: string;
  yearText: string;
  levels: EducationLevel[];
  examTypes: ExamType[];
  modules: string[];
  recommendReason: string;
  chaptersText: string;
  estimatedMinutesText: string;
  lastReviewedDate: string;
  expiresDate: string;
  linkAlive: boolean;
  status: ResourceStatus;
};

function toFormState(resource: ResourceItem): FormState {
  return {
    title: resource.title,
    description: resource.description ?? "",
    resourceType: resource.resourceType,
    sourceName: resource.sourceName,
    sourceUrl: resource.sourceUrl,
    rightsStatus: resource.rightsStatus,
    regionsText: resource.applicableRegions.join("、"),
    yearText: resource.year ? String(resource.year) : "",
    levels: [...resource.applicableLevels],
    examTypes: [...resource.applicableTypes],
    modules: [...resource.modules],
    recommendReason: resource.recommendReason,
    chaptersText: resource.suggestedChapters.join("、"),
    estimatedMinutesText: String(resource.estimatedMinutes),
    lastReviewedDate: toDateInput(resource.lastReviewedAt),
    expiresDate: toDateInput(resource.expiresAt),
    linkAlive: resource.linkAlive,
    status: resource.status,
  };
}

function splitList(text: string): string[] {
  return text
    .split(/[、,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 新增/编辑公共资源。
 * 权限在 service 层强制（resource_reviewer / admin）；页面层只控制按钮可用性。
 */
export function ResourceFormModal({
  mode,
  initial,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  initial: ResourceItem;
  onClose: () => void;
  onSubmit: (input: ResourceItemInput) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isEdit = mode === "edit";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleIn = <T extends string>(key: "levels" | "examTypes" | "modules", value: T) => {
    setForm((prev) => {
      const list = prev[key] as string[];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [key]: next };
    });
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = "请填写资源名称";
    if (!form.sourceName.trim()) next.sourceName = "请填写来源名称（第三方须为可识别的原始来源）";
    if (!form.sourceUrl.trim()) next.sourceUrl = "请填写原始来源链接";
    if (splitList(form.regionsText).length === 0) next.regionsText = "至少标注一个适用地区（全国或具体省/市）";
    if (form.levels.length === 0) next.levels = "至少选择一个适用学段";
    if (form.modules.length === 0) next.modules = "至少选择一个对应考试模块";
    if (!form.recommendReason.trim()) next.recommendReason = "请填写推荐理由（强推荐的必填项）";
    const minutes = Number(form.estimatedMinutesText);
    if (!Number.isFinite(minutes) || minutes < 0) next.estimatedMinutesText = "请输入不小于 0 的分钟数";
    if (form.yearText && !/^\d{4}$/.test(form.yearText.trim())) next.yearText = "年份格式为 4 位数字";
    if (!form.lastReviewedDate) next.lastReviewedDate = "请选择最近复核日期";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSubmit({
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      resourceType: form.resourceType,
      sourceName: form.sourceName.trim(),
      sourceUrl: form.sourceUrl.trim(),
      rightsStatus: form.rightsStatus,
      applicableRegions: splitList(form.regionsText),
      year: form.yearText.trim() ? Number(form.yearText.trim()) : undefined,
      applicableLevels: form.levels,
      applicableTypes: form.examTypes,
      modules: form.modules,
      recommendReason: form.recommendReason.trim(),
      suggestedChapters: splitList(form.chaptersText),
      estimatedMinutes: Number(form.estimatedMinutesText),
      lastReviewedAt: dateToIso(form.lastReviewedDate) ?? new Date(0).toISOString(),
      expiresAt: dateToIso(form.expiresDate),
      linkCheckedAt: initial.linkCheckedAt ?? new Date().toISOString(),
      linkAlive: form.linkAlive,
      status: form.status,
      reviewedBy: initial.reviewedBy,
    });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? "编辑公共资源" : "新增公共资源"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit}>保存</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label="资源名称"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          error={errors.title}
          placeholder="如：义务教育语文课程标准（2022年版）"
        />
        <Textarea
          label="简介（可选）"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          className="min-h-[64px]"
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="资源类型"
            value={form.resourceType}
            onChange={(e) => set("resourceType", e.target.value as ResourceType)}
            options={Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Select
            label="权利状态"
            value={form.rightsStatus}
            onChange={(e) => set("rightsStatus", e.target.value as RightsStatus)}
            options={Object.entries(RIGHTS_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <p className="-mt-1 text-[11px] text-slate-400">
          权利状态选择“权利状态不明”的资源不会进入用户端推荐，只会出现在待复核队列。
        </p>
        <Input
          label="来源名称"
          value={form.sourceName}
          onChange={(e) => set("sourceName", e.target.value)}
          error={errors.sourceName}
          placeholder="如：浙江省教育考试院 / 本平台自制"
        />
        <Input
          label="原始来源链接"
          value={form.sourceUrl}
          onChange={(e) => set("sourceUrl", e.target.value)}
          error={errors.sourceUrl}
          placeholder="https://…（只索引原始链接，不存网盘与全文）"
        />
        <Input
          label="适用地区（顿号或逗号分隔，可填“全国”）"
          value={form.regionsText}
          onChange={(e) => set("regionsText", e.target.value)}
          error={errors.regionsText}
          placeholder="全国 / 浙江省、杭州市"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="适用年份（可空）"
            value={form.yearText}
            onChange={(e) => set("yearText", e.target.value)}
            error={errors.yearText}
            placeholder="2026"
          />
          <Input
            label="预计使用时间（分钟）"
            type="number"
            min={0}
            value={form.estimatedMinutesText}
            onChange={(e) => set("estimatedMinutesText", e.target.value)}
            error={errors.estimatedMinutesText}
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">适用学段（必选）</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(EDUCATION_LEVEL_LABELS) as EducationLevel[]).map((level) => (
              <CheckChip
                key={level}
                active={form.levels.includes(level)}
                label={EDUCATION_LEVEL_LABELS[level]}
                onClick={() => toggleIn("levels", level)}
              />
            ))}
          </div>
          {errors.levels && <p className="mt-1 text-sm text-red-600">{errors.levels}</p>}
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">招聘类型（可多选；不选视为不限）</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(EXAM_TYPE_LABELS) as ExamType[]).map((type) => (
              <CheckChip
                key={type}
                active={form.examTypes.includes(type)}
                label={EXAM_TYPE_LABELS[type]}
                onClick={() => toggleIn("examTypes", type)}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">对应考试模块（必选）</legend>
          <div className="flex flex-wrap gap-2">
            {EXAM_MODULES.map((mod) => (
              <CheckChip
                key={mod.key}
                active={form.modules.includes(mod.key)}
                label={mod.label}
                onClick={() => toggleIn("modules", mod.key)}
              />
            ))}
          </div>
          {errors.modules && <p className="mt-1 text-sm text-red-600">{errors.modules}</p>}
        </fieldset>

        <Textarea
          label="推荐理由"
          value={form.recommendReason}
          onChange={(e) => set("recommendReason", e.target.value)}
          error={errors.recommendReason}
          placeholder="为什么这个缺口适用该资源；第三方须注明“仅索引原始链接与摘要”"
        />
        <Input
          label="建议章节（顿号或逗号分隔，可空）"
          value={form.chaptersText}
          onChange={(e) => set("chaptersText", e.target.value)}
          placeholder="第一部分 课程性质、第三部分 课程目标"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="最近复核日期"
            type="date"
            value={form.lastReviewedDate}
            onChange={(e) => set("lastReviewedDate", e.target.value)}
            error={errors.lastReviewedDate}
          />
          <Input
            label="失效时间（可空）"
            type="date"
            value={form.expiresDate}
            onChange={(e) => set("expiresDate", e.target.value)}
          />
        </div>
        <p className="-mt-1 text-[11px] text-slate-400">
          超过 180 天未复核的资源会自动进入待复核队列并停止推荐。
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="状态"
            value={form.status}
            onChange={(e) => set("status", e.target.value as ResourceStatus)}
            options={Object.entries(RESOURCE_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">链接核验</label>
            <CheckChip
              active={form.linkAlive}
              label={form.linkAlive ? "原始链接可访问" : "原始链接已失效"}
              onClick={() => set("linkAlive", !form.linkAlive)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CheckChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "border-blue-500 bg-blue-50 text-blue-700"
          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50")
      }
    >
      {active ? "✓ " : ""}
      {label}
    </button>
  );
}
