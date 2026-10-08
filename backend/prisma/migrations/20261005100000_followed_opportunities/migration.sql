-- 模块 5：多机会关注与报名推进（PRD 7.5）
-- 用户与报考单元的关注关系：状态机 + 备考主要目标唯一性 + 只追加状态历史

-- CreateTable
CREATE TABLE "followed_opportunities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'considering',
    "role" TEXT,
    "followed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_history" JSONB NOT NULL,
    "abandon_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "followed_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "followed_opportunities_user_id_unit_id_key"
    ON "followed_opportunities"("user_id", "unit_id");

-- CreateIndex
CREATE INDEX "followed_opportunities_user_id_status_idx"
    ON "followed_opportunities"("user_id", "status");

-- 机会详情纠错提交（PRD 7.10）：证据层留痕，不自动改判

-- CreateTable
CREATE TABLE "opportunity_corrections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "field_path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunity_corrections_announcement_id_version_id_idx"
    ON "opportunity_corrections"("announcement_id", "version_id");
