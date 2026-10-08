-- 机会纠错处理闭环（v7.0 P0-F / 模块 8）：
-- 员工可将纠错从 submitted 推进到 reviewing/resolved/rejected，并记录处理说明、处理人与处理时间；
-- 终态（resolved/rejected）不可再改，处理结果随站内通知发给提交人。
ALTER TABLE "opportunity_corrections" ADD COLUMN "review_note" TEXT;
ALTER TABLE "opportunity_corrections" ADD COLUMN "reviewer_id" TEXT;
ALTER TABLE "opportunity_corrections" ADD COLUMN "reviewed_at" TIMESTAMP(3);

-- 员工队列按状态扫描、同状态内按提交时间排序
CREATE INDEX "opportunity_corrections_status_created_at_idx" ON "opportunity_corrections"("status", "created_at");
