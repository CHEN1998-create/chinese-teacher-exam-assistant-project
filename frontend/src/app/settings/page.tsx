"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { NotificationPreferencePanel } from "@/components/governance/NotificationPreferencePanel";
import { DataPrivacyPanel } from "@/components/governance/DataPrivacyPanel";
import { useCurrentUser } from "@/lib/auth";
import { clearAllStorage } from "@/lib/storage";
import { isDemoMode } from "@/lib/demo/config";
import {
  EducationLevel,
  EDUCATION_LEVEL_LABELS,
  STAFF_ROLES,
  USER_ROLE_LABELS,
} from "@/types";

export default function SettingsPage() {
  const router = useRouter();
  const { user, role, hasRole, logout, updateProfile } = useCurrentUser();

  const [isSaving, setIsSaving] = useState(false);
  const [savedTip, setSavedTip] = useState(false);

  const [formData, setFormData] = useState({
    educationLevel: user?.educationLevel ?? ("middle" as EducationLevel),
    dailyAvailableTime: user?.dailyAvailableTime ?? 180,
  });

  const handleSave = async () => {
    setIsSaving(true);
    // 模拟保存延迟
    await new Promise((r) => setTimeout(r, 300));
    updateProfile({
      educationLevel: formData.educationLevel,
      dailyAvailableTime: formData.dailyAvailableTime,
    });
    setIsSaving(false);
    setSavedTip(true);
    setTimeout(() => setSavedTip(false), 2000);
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  if (!user || !role) return null;

  return (
    <div className="space-y-6">
      {/* 账号信息 */}
      <Card>
        <CardHeader title="账号信息" description="当前登录会话与角色" />
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-brand-soft flex items-center justify-center shrink-0">
            <span className="text-xl">👤</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-ink">{user.name}</p>
              <Badge variant="primary">{USER_ROLE_LABELS[role]}</Badge>
            </div>
            <p className="text-sm text-ink-muted mt-0.5">用户ID：{user.id}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" size="sm" onClick={handleLogout}>
            退出登录
          </Button>
          {hasRole(STAFF_ROLES) && !isDemoMode && (
            <Link href="/admin">
              <Button variant="outline" size="sm">
                进入运营后台
              </Button>
            </Link>
          )}
        </div>
      </Card>

      {/* 基本信息 */}
      <Card>
        <CardHeader
          title="学习资料设置"
          description="设置你的学段和每日可用学习时间"
        />
        <div className="space-y-4">
          <Select
            label="学段"
            options={Object.entries(EDUCATION_LEVEL_LABELS).map(([v, l]) => ({
              value: v,
              label: l,
            }))}
            value={formData.educationLevel}
            onChange={(e) =>
              setFormData((p) => ({
                ...p,
                educationLevel: e.target.value as EducationLevel,
              }))
            }
          />
          <Input
            label="每日可用时间（分钟）"
            type="number"
            value={formData.dailyAvailableTime}
            onChange={(e) =>
              setFormData((p) => ({
                ...p,
                dailyAvailableTime: parseInt(e.target.value) || 180,
              }))
            }
            hint="建议 60-300 分钟，系统会根据此安排每日任务"
          />
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          {savedTip && <span className="text-sm text-success">已保存</span>}
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "保存中..." : "保存设置"}
          </Button>
        </div>
      </Card>

      {/* 通知设置（即时生效，无需保存） */}
      <NotificationPreferencePanel />

      {/* 演示环境：一键重置浏览器中的全部演示数据 */}
      {isDemoMode && <ResetDemoDataCard />}

      {/* invited 模式：删除测试数据 / 注销账号 */}
      {!isDemoMode && <AccountDangerZoneCard />}

      {/* 隐私说明、数据类别与删除申请 */}
      <DataPrivacyPanel />
    </div>
  );
}

/**
 * 重置演示数据：
 * 清空本浏览器中的全部业务数据（含演示会话）并刷新页面，
 * 刷新后各服务重新播种默认演示数据。
 * 两步确认，避免误触。
 */
function ResetDemoDataCard() {
  const [confirming, setConfirming] = useState(false);

  const handleReset = () => {
    clearAllStorage();
    window.location.reload();
  };

  return (
    <Card>
      <CardHeader
        title="重置演示数据"
        description="清除本浏览器中的全部操作记录与演示会话，恢复到默认演示状态"
      />
      <p className="text-sm text-ink-muted mb-4">
        该操作只影响当前浏览器：你创建的目标、提交的公告、资料、计划与反馈都会被清空，
        页面刷新后自动恢复内置演示数据。
      </p>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="danger" size="sm" onClick={handleReset}>
            再次点击确认重置
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
            取消
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
          重置演示数据
        </Button>
      )}
    </Card>
  );
}

/**
 * invited 模式危险操作区：
 * - 删除测试数据：清空该用户的画像、关注、目标、计划、反馈，账号与登录会话保留；
 * - 注销账号：删除账号及全部数据并退出登录。
 * 均两步确认，避免误触。
 */
function AccountDangerZoneCard() {
  const router = useRouter();
  const [confirmTarget, setConfirmTarget] = useState<"data" | "account" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteTestData = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/test-data", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("删除测试数据失败");
      setConfirmTarget(null);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/account", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("注销账号失败");
      clearAllStorage();
      router.replace("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="账号与数据"
        description="管理你的测试数据与账号"
      />
      <div className="space-y-4">
        <div>
          <p className="text-sm text-ink-muted">
            删除测试数据会清空你的画像、关注、目标、计划与反馈，账号与登录状态保留。
          </p>
          {confirmTarget === "data" ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button variant="danger" size="sm" onClick={deleteTestData} disabled={busy}>
                {busy ? "处理中..." : "再次点击确认删除测试数据"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmTarget(null)} disabled={busy}>
                取消
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setConfirmTarget("data")}
            >
              删除测试数据
            </Button>
          )}
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-sm text-ink-muted">
            注销账号会永久删除你的账号及全部数据，且无法恢复。
          </p>
          {confirmTarget === "account" ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button variant="danger" size="sm" onClick={deleteAccount} disabled={busy}>
                {busy ? "处理中..." : "再次点击确认注销账号"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmTarget(null)} disabled={busy}>
                取消
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setConfirmTarget("account")}
            >
              注销账号
            </Button>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Card>
  );
}
