-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('jrun'::text),
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "output" JSONB,
    "error" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "organizationId" TEXT,
    "parentRunId" TEXT,
    "rootRunId" TEXT,
    "bossJobId" TEXT,
    "idempotencyKey" TEXT,
    "idempotencyKeyExpiresAt" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRun_organizationId_idx" ON "JobRun"("organizationId");

-- CreateIndex
CREATE INDEX "JobRun_taskId_status_idx" ON "JobRun"("taskId", "status");

-- CreateIndex
CREATE INDEX "JobRun_status_idx" ON "JobRun"("status");

-- CreateIndex
CREATE INDEX "JobRun_finishedAt_idx" ON "JobRun"("finishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_taskId_idempotencyKey_key" ON "JobRun"("taskId", "idempotencyKey");
