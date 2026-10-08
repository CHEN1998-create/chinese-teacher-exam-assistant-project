-- 公告版本变更通知基线（v6.1 模块 7）
-- 记录用户「上次已被通知到时」的公告状态 { versionId, lifecycle, sourceOk }，
-- 用于变更通知幂等：同一变更对同一用户只通知一次。可空，历史记录首次同步时回填。

ALTER TABLE "followed_opportunities"
  ADD COLUMN "last_notified_state" JSONB;
