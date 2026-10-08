"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { NotificationPreferencePanel } from "@/components/governance/NotificationPreferencePanel";
import { useCurrentUser, AUTH_MODE } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo/config";
import { formatDateTime } from "@/lib/utils";
import { STAFF_ROLES } from "@/types";
import {
  buildActiveProfile,
  supplementFactsService,
} from "@/lib/profile/activeProfile";
import { profileApi } from "@/lib/profile/profileApi";
import {
  CREDENTIAL_LEVEL_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  TEACHER_CERT_STATUS_OPTIONS,
} from "@/lib/guest/guestSession";
import { opportunitiesApi } from "@/lib/opportunities/api";
import type {
  GoalsResponse,
  OpportunityCorrectionDTO,
  OpportunityCorrectionStatus,
} from "@/lib/opportunities/api-types";
import type { UserRecruitmentProfile } from "@/lib/profile/types";

const AUTH_MODE_INVITED = AUTH_MODE === "invited";

const CORRECTION_STATUS_META: Record<
  OpportunityCorrectionStatus,
  { label: string; variant: "warning" | "info" | "success" | "muted" }
> = {
  submitted: { label: "待核对", variant: "warning" },
  reviewing: { label: "核对中", variant: "info" },
  resolved: { label: "已修正", variant: "success" },
  rejected: { label: "不采纳", variant: "muted" },
};

/**
 * 「我的」（v7.0 信息架构）：个人画像、报考偏好、备考次级入口、
 * 纠错记录、通知、隐私与账号设置的统一入口。
 * 不设置独立「备考」主导航：备考入口仅在用户已设置主要目标时出现。
 */
export default function MePage() {
  const { user, role, hasRole, logout } = useCurrentUser();

  if (!user || !role) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">我的</h1>

      {/* 账号 */}
      <Card>
        <CardHeader title="账号信息" description="当前登录会话与角色" />
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <span className="text-xl">👤</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-slate-900">{user.name}</p>
              <Badge variant="primary">
                {role === "admin"
                  ? "管理员"
                  : role === "exam_reviewer"
                    ? "考情审核员"
                    : role === "resource_reviewer"
                      ? "资源审核员"
                      : "受邀用户"}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 mt-0.5 truncate">
              用户ID：{user.id}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            退出登录
          </Button>
          {hasRole(STAFF_ROLES) && !isDemoMode && (
            <Link href="/admin/corrections">
              <Button variant="outline" size="sm">
                进入运营后台
              </Button>
            </Link>
          )}
        </div>
      </Card>

      {/* 个人画像 */}
      <ProfileCard />

      {/* 备考（次级入口：仅已设置主要目标时出现） */}
      <StudyEntryCard />

      {/* 我的纠错 */}
      <MyCorrectionsCard />

      {/* 通知偏好 */}
      <NotificationPreferencePanel />

      {/* 隐私与账号设置 */}
      <Card>
        <CardHeader
          title="隐私与账号设置"
          description="数据类别说明、删除测试数据、注销账号与学习资料设置"
        />
        <div className="divide-y divide-slate-100">
          <SettingsRow
            href="/settings"
            icon="🔒"
            title="隐私与数据"
            description="查看我们保存的数据类别，申请删除测试数据或注销账号"
          />
          <SettingsRow
            href="/settings"
            icon="⚙️"
            title="账号与学习资料设置"
            description="学段、每日可用时间等偏好"
          />
        </div>
      </Card>
    </div>
  );
}

function SettingsRow({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-slate-50/60 -mx-2 px-2 rounded-lg transition-colors"
    >
      <span className="text-lg" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500 mt-0.5">{description}</span>
      </span>
      <span className="text-slate-400" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

function ProfileCard() {
  // 本地演示：画像来自 localStorage，惰性初始化即可，无需 effect 内同步 setState；
  // invited：初始为加载态，由 effect 异步拉取服务端画像后更新。
  const [profile, setProfile] = useState<UserRecruitmentProfile | null>(() => {
    if (AUTH_MODE_INVITED) return null;
    const active = buildActiveProfile();
    return active.ready ? active.profile : null;
  });
  const [loaded, setLoaded] = useState(!AUTH_MODE_INVITED);

  useEffect(() => {
    if (!AUTH_MODE_INVITED) return;
    let cancelled = false;
    profileApi.getProfile().then((persisted) => {
      if (cancelled) return;
      setProfile(persisted);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return (
      <Card>
        <p className="text-sm text-slate-500">画像加载中…</p>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardHeader
          title="我的画像"
          description="完成五组基础画像后才能看到资格预筛结果"
        />
        <Link href="/onboarding">
          <Button size="sm">开始基础画像</Button>
        </Link>
      </Card>
    );
  }

  const facts = supplementFactsService.load();
  const supplementCount = [
    facts.birthDate,
    facts.hukouCityCode ?? facts.hukouProvinceCode,
    facts.socialSecurityMonths !== undefined,
    facts.workExperienceMonths !== undefined,
  ].filter(Boolean).length + (facts.extraAnswers ? Object.keys(facts.extraAnswers).length : 0);

  const rows: { label: string; value: string }[] = [
    {
      label: "意向地区",
      value:
        profile.regions.map((r) => [r.province, r.city].filter(Boolean).join(" ")).join("、") ||
        "未填写",
    },
    {
      label: "学历 / 学位",
      value: [
        CREDENTIAL_LEVEL_OPTIONS.find((o) => o.value === profile.educationLevel)?.label,
        profile.degree && profile.degree !== "none"
          ? { bachelor: "学士", master: "硕士", doctorate: "博士" }[profile.degree]
          : null,
      ]
        .filter(Boolean)
        .join(" / "),
    },
    { label: "毕业证专业", value: profile.majorFullName || "未填写" },
    {
      label: "毕业与就业状态",
      value:
        [
          profile.graduationDate,
          EMPLOYMENT_STATUS_OPTIONS.find((o) => o.value === profile.employmentStatus)?.label,
        ]
          .filter(Boolean)
          .join(" · ") || "未填写",
    },
    {
      label: "教师资格",
      value:
        TEACHER_CERT_STATUS_OPTIONS.find((o) => o.value === profile.teacherCert.status)?.label ??
        "未填写",
    },
    {
      label: "按需补充的信息",
      value:
        supplementCount > 0 ? `已补充 ${supplementCount} 项（年龄/户籍/社保等）` : "暂无补充",
    },
  ];

  return (
    <Card>
      <CardHeader
        title="我的画像"
        description="基础五组 + 按需补充；缺信息不会被判定为不符合"
      />
      <dl className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 py-2.5 text-sm">
            <dt className="text-slate-500 shrink-0">{row.label}</dt>
            <dd className="text-slate-900 text-right">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3">
        <Link href="/onboarding">
          <Button variant="outline" size="sm">
            编辑画像
          </Button>
        </Link>
      </div>
    </Card>
  );
}

/** 备考次级入口：只有已设置主要目标的用户才看得到；无后端/无目标时不渲染 */
function StudyEntryCard() {
  const [primary, setPrimary] = useState<GoalsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    opportunitiesApi
      .getGoals()
      .then((data) => {
        if (!cancelled && data.primaryTargetUnitId) setPrimary(data);
      })
      .catch(() => {
        // 公开演示无后端或尚无关注：不展示备考入口（v7.0 不设独立备考主导航）
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!primary || !primary.primaryTargetUnitId) return null;
  const target = primary.goals.find((g) => g.unitId === primary.primaryTargetUnitId);

  return (
    <Card>
      <Link
        href="/study"
        className="flex items-center gap-3 -m-1 p-3 rounded-lg hover:bg-slate-50 transition-colors"
      >
        <span className="text-lg" aria-hidden="true">
          📚
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-slate-900">我的备考</span>
          <span className="block text-xs text-slate-500 mt-0.5 truncate">
            {target ? `${target.unitName} · 备考计划与材料` : "备考计划与材料"}
          </span>
        </span>
        <span className="text-slate-400" aria-hidden="true">
          ›
        </span>
      </Link>
    </Card>
  );
}

function MyCorrectionsCard() {
  const [items, setItems] = useState<OpportunityCorrectionDTO[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    opportunitiesApi
      .listMyCorrections()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {
        // 无后端环境（如公开演示）不展示该卡片
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) return null;

  return (
    <Card>
      <CardHeader
        title="我的纠错"
        description="你在机会详情页提交的信息纠错及官方核对结果"
      />
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">还没有提交过纠错。</p>
      ) : (
        <ul className="space-y-3">
          {items.slice(0, 10).map((c) => (
            <li key={c.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {c.unitName ?? "岗位已随旧版本移除"} · {c.fieldLabel}
                </p>
                <Badge variant={CORRECTION_STATUS_META[c.status].variant}>
                  {CORRECTION_STATUS_META[c.status].label}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-600 line-clamp-2">{c.content}</p>
              {c.reviewNote && (
                <p className="mt-1.5 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600 whitespace-pre-line">
                  处理说明：{c.reviewNote}
                </p>
              )}
              <p className="mt-1 text-[11px] text-slate-400">
                提交于 {formatDateTime(c.createdAt)}
                {c.reviewedAt ? ` · 处理于 ${formatDateTime(c.reviewedAt)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
