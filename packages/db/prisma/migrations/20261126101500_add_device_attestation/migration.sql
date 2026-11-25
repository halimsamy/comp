-- Who attested a manual device's checks, and when.
ALTER TABLE "Device" ADD COLUMN "attestedById" TEXT;
ALTER TABLE "Device" ADD COLUMN "attestedAt" TIMESTAMP(3);

ALTER TABLE "Device" ADD CONSTRAINT "Device_attestedById_fkey" FOREIGN KEY ("attestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing manual devices were attested when recorded; the attester was not captured.
UPDATE "Device" SET "attestedAt" = COALESCE("lastCheckIn", "installedAt") WHERE "source" = 'manual';
