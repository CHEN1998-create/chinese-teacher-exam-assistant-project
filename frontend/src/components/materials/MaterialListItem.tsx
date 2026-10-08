"use client";

import { useState } from "react";
import {
  MaterialDiagnosis,
  MaterialItem,
  MATERIAL_RECOMMENDATION_LABELS,
  MATERIAL_SOURCE_TYPE_LABELS,
  MaterialRecommendation,
} from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/Modal";
import { materialService } from "@/lib/materials/materialService";
import { moduleLabel } from "@/lib/materials/domain";

const RECOMMENDATION_VARIANT: Record<MaterialRecommendation, "success" | "warning" | "danger"> = {
  continue: "success",
  partial: "warning",
  pause: "danger",
};

interface MaterialListItemProps {
  material: MaterialItem;
  diagnosis?: MaterialDiagnosis;
  onEdit: (material: MaterialItem) => void;
}

export function MaterialListItem({ material, diagnosis, onEdit }: MaterialListItemProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const metaParts = [
    MATERIAL_SOURCE_TYPE_LABELS[material.sourceType],
    material.applicableRegion || "地区未标注",
    material.year ? `${material.year} 年版` : "年份未标注",
    material.applicableLevel !== "unknown"
      ? material.applicableLevel === "middle"
        ? "初中"
        : material.applicableLevel === "primary"
          ? "小学"
          : "高中"
      : "学段未标注",
  ];

  return (
    <Card padding="sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-900">{material.name}</h4>
            {material.sourceType === "unknown_scan" && <Badge variant="danger">来源不明扫描件</Badge>}
            {!material.catalogConfirmed && material.chapters.length > 0 && (
              <Badge variant="warning">目录未核对</Badge>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {metaParts.map((part) => (
              <Badge key={part} variant="muted">
                {part}
              </Badge>
            ))}
            {material.coversModules.map((key) => (
              <Badge key={key} variant="primary">
                {moduleLabel(key)}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit(material)}>
            编辑
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
            删除
          </Button>
        </div>
      </div>

      {/* 进度与章节 */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>学习进度</span>
          <span>{material.progress}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${material.progress}%` }} />
        </div>
        {material.chapters.length > 0 && (
          <ul className="mt-2 space-y-1">
            {material.chapters.map((chapter) => (
              <li key={chapter.id} className="flex items-center gap-2 text-xs text-slate-600">
                <span className={chapter.isCompleted ? "text-emerald-600" : "text-slate-300"}>
                  {chapter.isCompleted ? "✓" : "○"}
                </span>
                <span className={chapter.isCompleted ? "line-through text-slate-400" : ""}>
                  {chapter.title}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {material.note && <p className="mt-2.5 text-xs text-slate-500">备注：{material.note}</p>}

      {/* 该项资料的总体诊断 */}
      {diagnosis && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={RECOMMENDATION_VARIANT[diagnosis.recommendation]}>
              {MATERIAL_RECOMMENDATION_LABELS[diagnosis.recommendation]}
            </Badge>
            <span className="text-xs text-slate-600">{diagnosis.reason}</span>
          </div>
          {diagnosis.items.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">考试模块</th>
                    <th className="px-2 py-1.5 font-medium">结论</th>
                    <th className="px-2 py-1.5 font-medium">原因</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {diagnosis.items.map((item) => (
                    <tr key={item.module}>
                      <td className="px-2 py-1.5 text-slate-700">{item.moduleLabel}</td>
                      <td className="px-2 py-1.5">
                        <Badge variant={RECOMMENDATION_VARIANT[item.recommendation]}>
                          {MATERIAL_RECOMMENDATION_LABELS[item.recommendation]}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {diagnosis.suggestedChapterTitles.length > 0 && (
            <p className="mt-1.5 text-xs text-slate-600">
              建议优先看：{diagnosis.suggestedChapterTitles.join("、")}
            </p>
          )}
          {diagnosis.warnings.map((warning) => (
            <p key={warning} className="mt-1 text-xs text-red-600">
              ⚠ {warning}
            </p>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          materialService.remove(material.id);
          setConfirmOpen(false);
        }}
        title="删除这份资料？"
        description={`将删除《${material.name}》及其章节记录，资料分析结果会在下次重新计算时更新。`}
        confirmLabel="删除"
        variant="danger"
      />
    </Card>
  );
}
