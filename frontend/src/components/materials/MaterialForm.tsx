"use client";

import { useState } from "react";
import {
  EDUCATION_LEVEL_LABELS,
  EducationLevel,
  MaterialItem,
  MATERIAL_SOURCE_TYPE_LABELS,
  MaterialSourceType,
} from "@/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { materialService } from "@/lib/materials/materialService";
import {
  CHINESE_MODULES,
  EXAM_MODULES,
  GENERAL_MODULES,
  guessModulesFromChapterTitles,
  moduleLabel,
} from "@/lib/materials/domain";

interface MaterialFormProps {
  targetId: string;
  /** 传入则为编辑，否则新增 */
  initial?: MaterialItem | null;
  onClose: () => void;
}

interface ChapterDraft {
  title: string;
  isCompleted: boolean;
}

interface FormState {
  name: string;
  sourceType: MaterialSourceType;
  author: string;
  publisher: string;
  applicableRegion: string;
  yearText: string;
  applicableLevel: EducationLevel | "unknown";
  coversModules: string[];
  chapters: ChapterDraft[];
  catalogConfirmed: boolean;
  progress: number;
  note: string;
}

const SOURCE_OPTIONS = (Object.keys(MATERIAL_SOURCE_TYPE_LABELS) as MaterialSourceType[]).map(
  (value) => ({ value, label: MATERIAL_SOURCE_TYPE_LABELS[value] })
);

const LEVEL_OPTIONS = [
  { value: "unknown", label: "未标注" },
  ...(Object.keys(EDUCATION_LEVEL_LABELS) as EducationLevel[]).map((value) => ({
    value,
    label: EDUCATION_LEVEL_LABELS[value],
  })),
];

function toFormState(material?: MaterialItem | null): FormState {
  return {
    name: material?.name ?? "",
    sourceType: material?.sourceType ?? "published",
    author: material?.author ?? "",
    publisher: material?.publisher ?? "",
    applicableRegion: material?.applicableRegion ?? "",
    yearText: material?.year ? String(material.year) : "",
    applicableLevel: material?.applicableLevel ?? "unknown",
    coversModules: material?.coversModules ?? [],
    chapters: (material?.chapters ?? []).map((c) => ({ title: c.title, isCompleted: c.isCompleted })),
    catalogConfirmed: material?.catalogConfirmed ?? false,
    progress: material?.progress ?? 0,
    note: material?.note ?? "",
  };
}

function ModuleCheckboxGroup({
  title,
  modules,
  selected,
  onToggle,
}: {
  title: string;
  modules: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {modules.map((m) => {
          const checked = selected.includes(m.key);
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onToggle(m.key)}
              className={
                "px-2.5 py-1 rounded-full text-xs border transition-colors " +
                (checked
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50")
              }
            >
              {checked ? "✓ " : ""}
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 资料新增/编辑弹窗：挂载即新鲜状态（父组件用条件挂载，无需 effect 重置） */
export function MaterialForm({ targetId, initial, onClose }: MaterialFormProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  const patch = (p: Partial<FormState>) => setForm((prev) => ({ ...prev, ...p }));

  const toggleModule = (key: string) => {
    patch({
      coversModules: form.coversModules.includes(key)
        ? form.coversModules.filter((k) => k !== key)
        : [...form.coversModules, key],
    });
  };

  const updateChapter = (index: number, title: string) => {
    patch({
      chapters: form.chapters.map((c, i) => (i === index ? { ...c, title } : c)),
    });
  };

  const addChapter = () => patch({ chapters: [...form.chapters, { title: "", isCompleted: false }] });

  const removeChapter = (index: number) =>
    patch({ chapters: form.chapters.filter((_, i) => i !== index) });

  const recognizeChapters = () => {
    const guessed = guessModulesFromChapterTitles(form.chapters.map((c) => c.title).filter(Boolean));
    patch({ coversModules: Array.from(new Set([...form.coversModules, ...guessed])) });
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      setError("请填写资料名称");
      return;
    }
    setError(null);
    const chapters = form.chapters
      .map((c, i) => ({
        id: initial?.chapters[i]?.id ?? "",
        materialId: initial?.id ?? "",
        title: c.title.trim(),
        order: i + 1,
        isCompleted: c.isCompleted,
      }))
      .filter((c) => c.title);
    const payload = {
      examTargetId: targetId,
      name: form.name.trim(),
      sourceType: form.sourceType,
      author: form.author.trim() || undefined,
      publisher: form.publisher.trim() || undefined,
      applicableRegion: form.applicableRegion.trim(),
      year: form.yearText ? Number(form.yearText) || undefined : undefined,
      applicableLevel: form.applicableLevel,
      coversModules: form.coversModules,
      chapters,
      catalogConfirmed: form.catalogConfirmed,
      progress: Math.min(100, Math.max(0, form.progress)),
      note: form.note.trim() || undefined,
    };
    try {
      if (initial) {
        materialService.update(initial.id, payload);
      } else {
        materialService.create(payload);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试");
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? "编辑资料" : "新增资料"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!form.name.trim()}>
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="资料名称（必填）"
          placeholder="例如：《语文考编通关宝典（浙江专版）》"
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="来源类型"
            value={form.sourceType}
            onChange={(e) => patch({ sourceType: e.target.value as MaterialSourceType })}
            options={SOURCE_OPTIONS}
          />
          <Select
            label="适用学段"
            value={form.applicableLevel}
            onChange={(e) => patch({ applicableLevel: e.target.value as EducationLevel | "unknown" })}
            options={LEVEL_OPTIONS}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="作者/主编"
            value={form.author}
            onChange={(e) => patch({ author: e.target.value })}
          />
          <Input
            label="出版社/出品方"
            value={form.publisher}
            onChange={(e) => patch({ publisher: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="适用地区"
            placeholder="全国 / 浙江省 / 杭州市"
            value={form.applicableRegion}
            onChange={(e) => patch({ applicableRegion: e.target.value })}
          />
          <Input
            label="出版/发行年份"
            type="number"
            placeholder="如 2025"
            value={form.yearText}
            onChange={(e) => patch({ yearText: e.target.value })}
          />
        </div>

        {form.sourceType === "unknown_scan" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            来源不明的完整扫描件存在版权风险：仅可作个人临时参考，<strong>不能进入公共资源库</strong>，
            分析也会建议本周暂不使用。
          </div>
        )}

        {/* 目录章节：允许手动维护，不做 PDF 解析 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-sm font-medium text-slate-700">目录 / 章节</p>
            <button
              type="button"
              onClick={recognizeChapters}
              className="text-xs text-blue-600 hover:underline"
            >
              根据章节名识别覆盖模块
            </button>
          </div>
          <div className="space-y-1.5">
            {form.chapters.length === 0 && (
              <p className="text-xs text-slate-400">还没有章节，点下方按钮手动添加（无需上传 PDF）。</p>
            )}
            {form.chapters.map((chapter, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-5 shrink-0">{i + 1}.</span>
                <input
                  value={chapter.title}
                  onChange={(e) => updateChapter(i, e.target.value)}
                  placeholder="章节标题，如：古代汉语"
                  className="h-9 flex-1 min-w-0 px-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => removeChapter(i)}
                  className="text-xs text-slate-400 hover:text-red-600 shrink-0"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addChapter}
            className="mt-2 text-xs font-medium text-blue-600 hover:underline"
          >
            + 添加章节
          </button>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={form.catalogConfirmed}
              onChange={(e) => patch({ catalogConfirmed: e.target.checked })}
              className="rounded border-slate-300"
            />
            我已核对章节目录（识别不准时可直接手动修改标题或覆盖模块）
          </label>
        </div>

        {/* 覆盖模块 */}
        <div className="space-y-2.5 rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-700">覆盖的考试模块</p>
          <ModuleCheckboxGroup
            title="语文学科"
            modules={CHINESE_MODULES}
            selected={form.coversModules}
            onToggle={toggleModule}
          />
          <ModuleCheckboxGroup
            title="教综 / 其他"
            modules={GENERAL_MODULES}
            selected={form.coversModules}
            onToggle={toggleModule}
          />
          <ModuleCheckboxGroup
            title="练习类"
            modules={EXAM_MODULES.filter((m) => m.group === "practice")}
            selected={form.coversModules}
            onToggle={toggleModule}
          />
        </div>

        <Input
          label="学习进度（0-100）"
          type="number"
          min={0}
          max={100}
          value={String(form.progress)}
          onChange={(e) => patch({ progress: Number(e.target.value) || 0 })}
        />
        <Textarea
          label="备注（选填）"
          className="min-h-[64px]"
          placeholder="购入渠道、使用感受、为什么保留它……"
          value={form.note}
          onChange={(e) => patch({ note: e.target.value })}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-[11px] text-slate-400">
          已选覆盖模块：
          {form.coversModules.length > 0
            ? form.coversModules.map((k) => moduleLabel(k)).join("、")
            : "未选择"}
        </p>
      </div>
    </Modal>
  );
}
