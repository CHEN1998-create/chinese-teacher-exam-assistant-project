"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { useCurrentExamTarget } from "@/lib/targets/useCurrentExamTarget";
import { materialService } from "@/lib/materials/materialService";
import { useMaterialsModule } from "@/lib/materials/useMaterials";
import { InventoryStatusPicker } from "@/components/materials/InventoryStatusPicker";
import { MaterialForm } from "@/components/materials/MaterialForm";
import { MaterialListItem } from "@/components/materials/MaterialListItem";
import { AbilityBaselineForm } from "@/components/materials/AbilityBaselineForm";
import { DiagnosisPanel } from "@/components/materials/DiagnosisPanel";
import { PublicResourceList } from "@/components/materials/PublicResourceList";
import { MaterialItem, USAGE_STATUS_LABELS } from "@/types";

const TABS = [
  { id: "materials", label: "我的资料" },
  { id: "baseline", label: "准备情况" },
  { id: "diagnosis", label: "资料怎么用" },
  { id: "public", label: "公共资源" },
];

export default function MaterialsPage() {
  const target = useCurrentExamTarget();
  const { materials, baseline, snapshot, readiness, stale } = useMaterialsModule(target?.id ?? null);
  const [activeTab, setActiveTab] = useState("materials");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialItem | null>(null);

  if (!target) {
    return (
      <EmptyState
        icon={<span className="text-4xl">🎯</span>}
        title="先确认你准备的考试"
        description="资料怎么用只针对你准备的考试：先确定报考地区与考试，再整理资料。"
        actionLabel="去设置目标"
        actionHref="/opportunities"
      />
    );
  }

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (material: MaterialItem) => {
    setEditing(material);
    setFormOpen(true);
  };

  const diagnosisByMaterial = new Map((snapshot?.materialDiagnoses ?? []).map((d) => [d.materialId, d]));

  return (
    <div className="space-y-5">
      {/* 标题与当前目标范围声明 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">我的资料与准备情况</h2>
          <p className="mt-1 text-sm text-slate-500">
            分析范围仅限你准备的考试：
            <span className="font-medium text-slate-700">「{target.name}」</span>
            （{target.region}
            {target.educationLevel === "middle" ? "·初中" : target.educationLevel === "primary" ? "·小学" : target.educationLevel === "high" ? "·高中" : ""}
            {target.year ? `·${target.year}` : ""}）
          </p>
        </div>
        <Button onClick={openCreate}>新增资料</Button>
      </div>

      {target.name.includes("【演示案例") && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
          你正在查看内置演示目标：可在「我的考试」页切换当前主目标，或在「设置」里清空本地数据后从空状态开始体验。
          演示资料只保存在你的浏览器中，不构成任何购买建议。
        </div>
      )}

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab}>
        {/* ==================== 我的资料 ==================== */}
        <TabPanel id="materials" activeTab={activeTab}>
          <div className="space-y-4">
            <Card padding="sm">
              <InventoryStatusPicker
                value={baseline?.inventoryStatus ?? "none"}
                onSelect={(status) => materialService.setInventoryStatus(target.id, status)}
              />
              <p className="mt-2 text-[11px] text-slate-400">
                当前选择：{USAGE_STATUS_LABELS[baseline?.inventoryStatus ?? "none"]}
                ；新增或删除资料后此状态会自动同步。
              </p>
            </Card>

            {materials.length === 0 ? (
              <EmptyState
                icon={<span className="text-4xl">📭</span>}
                title="这次考试下还没有资料"
                description="无需上传完整 PDF：填写名称、来源和大致章节目录即可。想先知道最少需要什么，可去「资料怎么用」查看最小资料类别。"
                actionLabel="新增我的第一份资料"
                onAction={openCreate}
              />
            ) : (
              <>
                <div className="flex items-center justify-between px-1">
                  <p className="text-sm text-slate-500">
                    共 {materials.length} 份私有资料
                    {snapshot && <Badge variant="muted" className="ml-2">已分析 {snapshot.materialDiagnoses.length} 份</Badge>}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab("diagnosis")}>
                    查看资料怎么用
                  </Button>
                </div>
                <div className="space-y-3">
                  {materials.map((material) => (
                    <MaterialListItem
                      key={material.id}
                      material={material}
                      diagnosis={diagnosisByMaterial.get(material.id)}
                      onEdit={openEdit}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </TabPanel>

        {/* ==================== 能力基线 ==================== */}
        <TabPanel id="baseline" activeTab={activeTab}>
          {baseline && (
            <>
              <p className="mb-3 text-xs text-slate-500">
                准备情况用于判断资料怎么用（如时间不足时收缩并行资料、薄弱模块优先保留），只保存在本地，不与公共资源混用。
              </p>
              <AbilityBaselineForm key={target.id} baseline={baseline} />
            </>
          )}
        </TabPanel>

        {/* ==================== 诊断结果 ==================== */}
        <TabPanel id="diagnosis" activeTab={activeTab}>
          <DiagnosisPanel
            target={target}
            targetId={target.id}
            inventoryStatus={baseline?.inventoryStatus ?? "none"}
            materials={materials}
            snapshot={snapshot}
            readiness={readiness}
            stale={stale}
          />
        </TabPanel>

        {/* ==================== 公共资源 ==================== */}
        <TabPanel id="public" activeTab={activeTab}>
          <PublicResourceList />
        </TabPanel>
      </Tabs>

      {formOpen && (
        <MaterialForm
          targetId={target.id}
          initial={editing}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
