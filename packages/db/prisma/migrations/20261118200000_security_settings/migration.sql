-- Org security settings: idle session timeout (PCI DSS 8.2.8) and allowed sign-in methods
ALTER TABLE "Organization" ADD COLUMN "sessionIdleTimeoutMinutes" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "allowedSignInMethods" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- How each session was created, so allowed sign-in methods apply after an org switch
ALTER TABLE "Session" ADD COLUMN "signInMethod" TEXT;

-- Org-wide event log reads filter by org and sort by time
CREATE INDEX "AuditLog_organizationId_timestamp_idx" ON "AuditLog"("organizationId", "timestamp");

-- Trust portal questionnaire: off for new portals, answers reviewed before release
ALTER TABLE "Trust" ALTER COLUMN "securityQuestionnaireEnabled" SET DEFAULT false;
ALTER TABLE "Trust" ADD COLUMN "securityQuestionnaireRequiresReview" BOOLEAN NOT NULL DEFAULT true;

CREATE TYPE "QuestionnaireReviewStatus" AS ENUM ('pending_review', 'approved');
ALTER TABLE "Questionnaire" ADD COLUMN "reviewStatus" "QuestionnaireReviewStatus";
ALTER TABLE "Questionnaire" ADD COLUMN "requesterEmail" TEXT;
ALTER TABLE "Questionnaire" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Questionnaire" ADD COLUMN "reviewedByUserId" TEXT;
