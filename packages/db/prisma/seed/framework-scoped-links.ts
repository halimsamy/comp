import type { IsmsDocumentType, PrismaClient } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Populate the framework-scoped Framework Editor link tables from the seeded
 * global relations. Publishing a framework version (FrameworkVersionsService)
 * builds its manifest from these scoped tables, so without them a publish would
 * drop every task, policy and evidence form.
 *
 * A control's links are scoped to every framework whose requirements the
 * control maps to. Insert-only (ON CONFLICT DO NOTHING), like the relation
 * seeding: links removed from the seed must be removed from an existing DB
 * separately.
 */
export async function seedFrameworkScopedEditorLinks(prisma: PrismaClient) {
  const controlFrameworks = `
    SELECT DISTINCT r."frameworkId", cr."A" AS "controlTemplateId"
    FROM "_FrameworkEditorControlTemplateToFrameworkEditorRequirement" cr
    JOIN "FrameworkEditorRequirement" r ON r.id = cr."B"`;

  const tasks = await prisma.$executeRawUnsafe(`
    INSERT INTO "FrameworkEditorControlTaskTemplateLink" ("frameworkId", "controlTemplateId", "taskTemplateId")
    SELECT cf."frameworkId", cf."controlTemplateId", ct."B"
    FROM (${controlFrameworks}) cf
    JOIN "_FrameworkEditorControlTemplateToFrameworkEditorTaskTemplate" ct ON ct."A" = cf."controlTemplateId"
    ON CONFLICT ("frameworkId", "controlTemplateId", "taskTemplateId") DO NOTHING`);

  const policies = await prisma.$executeRawUnsafe(`
    INSERT INTO "FrameworkEditorControlPolicyTemplateLink" ("frameworkId", "controlTemplateId", "policyTemplateId")
    SELECT cf."frameworkId", cf."controlTemplateId", cp."B"
    FROM (${controlFrameworks}) cf
    JOIN "_FrameworkEditorControlTemplateToFrameworkEditorPolicyTemplate" cp ON cp."A" = cf."controlTemplateId"
    ON CONFLICT ("frameworkId", "controlTemplateId", "policyTemplateId") DO NOTHING`);

  const documentTypes = await prisma.$executeRawUnsafe(`
    INSERT INTO "FrameworkEditorControlDocumentTypeLink" ("frameworkId", "controlTemplateId", "formType")
    SELECT cf."frameworkId", cf."controlTemplateId", form_type
    FROM (${controlFrameworks}) cf
    JOIN "FrameworkEditorControlTemplate" c ON c.id = cf."controlTemplateId"
    CROSS JOIN LATERAL unnest(c."documentTypes") AS form_type
    ON CONFLICT ("frameworkId", "controlTemplateId", "formType") DO NOTHING`);

  const isms = await seedIsmsControlLinks(prisma);
  console.log(
    `Framework-scoped editor links: ${tasks} task, ${policies} policy, ${documentTypes} form, ${isms} ISMS document links added.`,
  );
}

interface IsmsControlLinkSeed {
  frameworkId: string;
  controlTemplateId: string;
  documentType: IsmsDocumentType;
}

async function seedIsmsControlLinks(prisma: PrismaClient): Promise<number> {
  const file = path.join(__dirname, 'isms-control-links.json');
  const links: IsmsControlLinkSeed[] = JSON.parse(await fs.readFile(file, 'utf-8'));
  const templates = await prisma.frameworkEditorIsmsDocumentTemplate.findMany({
    select: { id: true, documentType: true },
  });
  const templateIdByType = new Map(templates.map((t) => [t.documentType, t.id]));

  const data = links.flatMap((link) => {
    const ismsDocumentTemplateId = templateIdByType.get(link.documentType);
    if (!ismsDocumentTemplateId) {
      console.warn(`No ISMS document template for ${link.documentType}; skipping its control link.`);
      return [];
    }
    return [
      {
        frameworkId: link.frameworkId,
        controlTemplateId: link.controlTemplateId,
        ismsDocumentTemplateId,
      },
    ];
  });

  const { count } = await prisma.frameworkEditorControlIsmsDocumentLink.createMany({
    data,
    skipDuplicates: true,
  });
  return count;
}
