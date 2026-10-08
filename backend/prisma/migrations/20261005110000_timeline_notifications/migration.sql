-- 报名日程与站内提醒（v6.1 模块 6）

-- 关注表：新增“关闭该机会提醒”开关（日程仍可见，只是不产生通知）
ALTER TABLE "followed_opportunities"
  ADD COLUMN "reminders_muted" BOOLEAN NOT NULL DEFAULT false;

-- 时间线事件：从已发布公告版本生成，按用户关注单元落库
CREATE TABLE "timeline_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "unit_id" TEXT NOT NULL,
  "announcement_id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "event_key" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "date_iso" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "change_history" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "timeline_events_user_id_event_key_key"
  ON "timeline_events"("user_id", "event_key");
CREATE INDEX "timeline_events_user_id_status_idx"
  ON "timeline_events"("user_id", "status");
CREATE INDEX "timeline_events_unit_id_idx"
  ON "timeline_events"("unit_id");

-- 站内通知记录（不接短信/微信/邮件/Web Push）
CREATE TABLE "notification_records" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "event_key" TEXT,
  "related_unit_id" TEXT,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_records_user_id_read_at_idx"
  ON "notification_records"("user_id", "read_at");
CREATE INDEX "notification_records_user_id_severity_idx"
  ON "notification_records"("user_id", "severity");
