-- Getting Started guide: items a team chose to skip (with a reason). Completion is computed, not stored.
ALTER TABLE "Onboarding" ADD COLUMN "checklistSkips" JSONB NOT NULL DEFAULT '{}';
