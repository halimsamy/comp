-- CreateEnum
CREATE TYPE "RiskReviewTrigger" AS ENUM ('scheduled', 'significant_change');

-- AlterTable
ALTER TABLE "RiskReview" ADD COLUMN     "trigger" "RiskReviewTrigger" NOT NULL DEFAULT 'scheduled';
