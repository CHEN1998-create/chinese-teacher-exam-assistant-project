-- 受邀试用服务端事件（v7.0 模块 7）：漏斗/北极星指标的唯一事实来源。
-- 只存枚举与计数维度，不存资格原文、证件信息等任何用户正文。
CREATE TABLE "trial_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "unit_id" TEXT,
    "announcement_id" TEXT,
    "dataset" TEXT,
    "props" JSONB,
    "source" TEXT NOT NULL DEFAULT 'live',
    "auth_mode" TEXT NOT NULL DEFAULT 'invited',
    "user_role" TEXT NOT NULL,
    "dedup_key" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_events_pkey" PRIMARY KEY ("id")
);

-- once-per-user(/unit/step) 去重：同账号同去重键只保留第一条；
-- dedup_key 为 NULL 的行不参与唯一约束（Postgres 允许多个 NULL）。
CREATE UNIQUE INDEX "trial_events_user_id_dedup_key_key" ON "trial_events"("user_id", "dedup_key");

-- 看板按观察窗口扫描最近 90 天
CREATE INDEX "trial_events_occurred_at_idx" ON "trial_events"("occurred_at");
CREATE INDEX "trial_events_type_idx" ON "trial_events"("type");
