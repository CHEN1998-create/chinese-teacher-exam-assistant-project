-- 受邀用户账号、服务端会话、画像与学习计划持久化（模块 8）

CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "profile" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "weekly_plans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "exam_target_id" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "focus" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "previous_version_id" TEXT,
    "generation_reason" TEXT NOT NULL,
    "adjustments" JSONB NOT NULL DEFAULT '[]',
    "reviews" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "daily_plans" (
    "id" TEXT NOT NULL,
    "weekly_plan_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "tasks" JSONB NOT NULL,
    "total_estimated_time" INTEGER NOT NULL,
    "is_minimum_viable" BOOLEAN NOT NULL DEFAULT false,
    "available_minutes" INTEGER NOT NULL,
    "adjustment_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_feedbacks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "weekly_plan_id" TEXT NOT NULL,
    "weekly_version" INTEGER NOT NULL,
    "daily_plan_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actual_time" INTEGER,
    "incomplete_reason" TEXT,
    "error_types" JSONB NOT NULL DEFAULT '[]',
    "has_second_practice" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_feedbacks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credentials_user_id_key" ON "credentials"("user_id");
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");
CREATE INDEX "weekly_plans_user_id_exam_target_id_idx" ON "weekly_plans"("user_id", "exam_target_id");
CREATE UNIQUE INDEX "daily_plans_weekly_plan_id_date_key" ON "daily_plans"("weekly_plan_id", "date");
CREATE INDEX "daily_plans_user_id_date_idx" ON "daily_plans"("user_id", "date");
CREATE UNIQUE INDEX "task_feedbacks_user_id_task_id_key" ON "task_feedbacks"("user_id", "task_id");
CREATE INDEX "task_feedbacks_user_id_date_idx" ON "task_feedbacks"("user_id", "date");

ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_weekly_plan_id_fkey" FOREIGN KEY ("weekly_plan_id") REFERENCES "weekly_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_feedbacks" ADD CONSTRAINT "task_feedbacks_weekly_plan_id_fkey" FOREIGN KEY ("weekly_plan_id") REFERENCES "weekly_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
