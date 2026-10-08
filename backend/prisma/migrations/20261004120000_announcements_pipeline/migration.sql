-- 公告数据流水线：来源、快照、提取任务、证据锚点、审核留痕、已发布版本
-- 对应 docs/v6.1-data-pipeline.md

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "regionCode" TEXT,
    "officialUrl" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "contactInfo" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailReason" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_snapshots" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "officialUrl" TEXT,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "httpStatus" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_runs" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "announcementId" TEXT,
    "parserVersion" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "candidate" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "submittedBy" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "extraction_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_anchors" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "locatorKind" TEXT NOT NULL,
    "locatorData" JSONB NOT NULL,
    "excerpt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_anchors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_records" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "beforePayload" JSONB NOT NULL,
    "afterPayload" JSONB NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_announcement_versions" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "payload" JSONB NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous_version_id" TEXT,
    "superseded_at" TIMESTAMP(3),

    CONSTRAINT "published_announcement_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_snapshots_contentHash_idx" ON "source_snapshots"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "source_snapshots_sourceId_contentHash_key" ON "source_snapshots"("sourceId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "extraction_runs_idempotency_key_key" ON "extraction_runs"("idempotency_key");

-- CreateIndex
CREATE INDEX "extraction_runs_status_idx" ON "extraction_runs"("status");

-- CreateIndex
CREATE INDEX "extraction_runs_announcementId_idx" ON "extraction_runs"("announcementId");

-- CreateIndex
CREATE INDEX "evidence_anchors_runId_field_idx" ON "evidence_anchors"("runId", "field");

-- CreateIndex
CREATE INDEX "review_records_runId_idx" ON "review_records"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "published_announcement_versions_runId_key" ON "published_announcement_versions"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "published_announcement_versions_previous_version_id_key" ON "published_announcement_versions"("previous_version_id");

-- CreateIndex
CREATE INDEX "published_announcement_versions_announcementId_status_idx" ON "published_announcement_versions"("announcementId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "published_announcement_versions_announcementId_versionNumbe_key" ON "published_announcement_versions"("announcementId", "versionNumber");

-- AddForeignKey
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "source_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_anchors" ADD CONSTRAINT "evidence_anchors_runId_fkey" FOREIGN KEY ("runId") REFERENCES "extraction_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_runId_fkey" FOREIGN KEY ("runId") REFERENCES "extraction_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_announcement_versions" ADD CONSTRAINT "published_announcement_versions_runId_fkey" FOREIGN KEY ("runId") REFERENCES "extraction_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_announcement_versions" ADD CONSTRAINT "published_announcement_versions_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "published_announcement_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
