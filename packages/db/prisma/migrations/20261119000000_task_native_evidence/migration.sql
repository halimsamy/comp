-- Auto-evidence derived from native module state (additive, nullable).
ALTER TABLE "Task" ADD COLUMN "nativeEvidenceFingerprint" TEXT;
ALTER TABLE "Task" ADD COLUMN "nativeEvidenceSubmittedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "nativeEvidenceAttachmentId" TEXT;
