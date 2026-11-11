import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { db, type EvidenceFormType as DbEvidenceFormType } from '@db';
import archiver, { type Archiver } from 'archiver';
import { format } from 'date-fns';
import { toCsvRow } from '../../evidence-forms/evidence-forms-csv';
import { loadRequirementDefinitions } from '../../frameworks/frameworks-requirements.helper';
import { PolicyPdfRendererService } from '../../trust-portal/policy-pdf-renderer.service';
import {
  appendAttachmentToArchive,
  createFilenameTracker,
} from './evidence-attachment-streamer';
import type { EvidenceZipStream } from './evidence-export.types';
import { sanitizeFilename } from './evidence-pdf-generator';
import {
  appendDocumentEvidence,
  loadDocumentBundle,
  type DocumentBundle,
} from './framework-evidence-documents';
import {
  buildRequirementReadme,
  planRequirementFolders,
  safeSegment,
  type MappedControl,
} from './framework-evidence-plan';
import {
  appendTaskEvidence,
  loadTaskBundle,
  type TaskBundle,
} from './framework-evidence-tasks';

type FrameworkForExport = {
  id: string;
  frameworkId: string | null;
  customFrameworkId: string | null;
  currentVersionId: string | null;
  frameworkName: string;
  organizationName: string;
  primaryColor: string | null;
};

@Injectable()
export class FrameworkEvidenceExportService {
  private readonly logger = new Logger(FrameworkEvidenceExportService.name);

  constructor(private readonly policyPdfRenderer: PolicyPdfRendererService) {}

  /** ZIP with one folder per framework requirement holding its policies, tasks and documents. */
  async streamFrameworkEvidenceZip(
    organizationId: string,
    frameworkInstanceId: string,
  ): Promise<EvidenceZipStream> {
    const fi = await db.frameworkInstance.findFirst({
      where: { id: frameworkInstanceId, organizationId },
      select: {
        id: true,
        frameworkId: true,
        customFrameworkId: true,
        currentVersionId: true,
        framework: { select: { name: true } },
        customFramework: { select: { name: true } },
        organization: { select: { name: true, primaryColor: true } },
      },
    });
    if (!fi) throw new NotFoundException('Framework not found');

    const framework: FrameworkForExport = {
      ...fi,
      frameworkName: fi.framework?.name ?? fi.customFramework?.name ?? 'Framework',
      organizationName: fi.organization.name,
      primaryColor: fi.organization.primaryColor,
    };
    const root = `${sanitizeFilename(framework.organizationName)}_${sanitizeFilename(framework.frameworkName)}_evidence_${format(new Date(), 'yyyy-MM-dd')}`;

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => {
      this.logger.warn(`Archive warning (framework ${fi.id}): ${err.message}`);
    });

    void this.populate({ archive, organizationId, framework, root }).catch(
      (err) => {
        this.logger.error(
          `Failed to populate framework ZIP for ${fi.id}: ${err instanceof Error ? err.stack : String(err)}`,
        );
        archive.abort();
      },
    );

    return { archive, filename: `${root}.zip` };
  }

  private async populate({
    archive,
    organizationId,
    framework,
    root,
  }: {
    archive: Archiver;
    organizationId: string;
    framework: FrameworkForExport;
    root: string;
  }): Promise<void> {
    // Emit a byte right away so proxies see the response is alive while we load data.
    archive.append(
      `${framework.frameworkName} evidence export for ${framework.organizationName}\nGenerated: ${new Date().toISOString()}\nOne folder per requirement; index.csv lists them all.\n`,
      { name: `${root}/README.txt` },
    );

    const [requirements, mappings, notRelevant] = await Promise.all([
      loadRequirementDefinitions(framework),
      this.loadMappings(framework.id),
      db.evidenceFormSetting.findMany({
        where: { organizationId, isNotRelevant: true },
        select: { formType: true },
      }),
    ]);
    const skippedFormTypes = new Set(notRelevant.map((s) => s.formType));
    const folders = planRequirementFolders({
      requirements,
      mappings: mappings.map((m) => ({
        ...m,
        control: {
          ...m.control,
          formTypes: m.control.formTypes.filter((t) => !skippedFormTypes.has(t)),
        },
      })),
    });

    const policies = await db.policy.findMany({
      where: {
        organizationId,
        id: { in: Array.from(new Set(folders.flatMap((f) => f.policyIds))) },
      },
      select: {
        id: true,
        name: true,
        content: true,
        pdfUrl: true,
        currentVersion: { select: { content: true, pdfUrl: true } },
      },
    });
    const policiesById = new Map(policies.map((p) => [p.id, p]));

    // shortcut: rendered PDFs are cached for the whole export (fine for one org's
    // framework); move to the background-job + S3 flow if exports get very large.
    const renderedPolicies = new Map<string, Buffer>();
    const taskBundles = new Map<string, TaskBundle>();
    const documentBundles = new Map<DbEvidenceFormType, DocumentBundle>();
    const indexRows: string[][] = [];

    for (const folder of folders) {
      const base = `${root}/${folder.folder}`;
      const folderPolicies = folder.policyIds.flatMap((id) => policiesById.get(id) ?? []);

      for (const taskId of folder.taskIds) {
        if (!taskBundles.has(taskId)) {
          taskBundles.set(taskId, await loadTaskBundle({ organizationId, taskId }));
        }
      }
      for (const formType of folder.formTypes) {
        if (!documentBundles.has(formType)) {
          documentBundles.set(formType, await loadDocumentBundle({ organizationId, formType }));
        }
      }
      const tasks = folder.taskIds.flatMap((id) => taskBundles.get(id) ?? []);
      const documents = folder.formTypes.flatMap((t) => documentBundles.get(t) ?? []);

      archive.append(
        buildRequirementReadme({
          folder,
          frameworkName: framework.frameworkName,
          policyNames: folderPolicies.map((p) => p.name),
          taskTitles: tasks.map((t) => t.title),
          documentTitles: documents.map((d) => d.title),
        }),
        { name: `${base}/00-requirement.txt` },
      );

      const uniquePolicyName = createFilenameTracker();
      for (const policy of folderPolicies) {
        const fileName = uniquePolicyName(`${safeSegment(policy.name)}.pdf`);
        const uploadedPdf = policy.currentVersion?.pdfUrl || policy.pdfUrl;
        if (uploadedPdf) {
          await appendAttachmentToArchive({
            archive,
            attachment: { id: policy.id, name: fileName, url: uploadedPdf },
            folderPath: `${base}/Policies`,
            uniqueName: (name) => name,
          });
          continue;
        }
        let pdf = renderedPolicies.get(policy.id);
        if (!pdf) {
          pdf = this.policyPdfRenderer.renderPoliciesPdfBuffer(
            [{ name: policy.name, content: policy.currentVersion?.content ?? policy.content }],
            framework.organizationName,
            framework.primaryColor,
          );
          renderedPolicies.set(policy.id, pdf);
        }
        archive.append(pdf, { name: `${base}/Policies/${fileName}` });
      }

      const uniqueTaskFolder = createFilenameTracker();
      for (const task of tasks) {
        await appendTaskEvidence({
          archive,
          bundle: task,
          folderPath: `${base}/Tasks/${uniqueTaskFolder(safeSegment(task.title))}`,
        });
      }
      for (const document of documents) {
        await appendDocumentEvidence({
          archive,
          bundle: document,
          folderPath: `${base}/Documents/${safeSegment(document.title)}`,
        });
      }

      indexRows.push([
        folder.requirement.identifier,
        folder.requirement.name,
        folder.folder,
        String(folder.controlNames.length),
        String(folderPolicies.length),
        String(tasks.length),
        String(documents.length),
      ]);
    }

    archive.append(
      [
        toCsvRow(['requirement', 'name', 'folder', 'controls', 'policies', 'tasks', 'documents']),
        ...indexRows.map((row) => toCsvRow(row)),
      ].join('\n'),
      { name: `${root}/index.csv` },
    );
    await archive.finalize();
  }

  private async loadMappings(frameworkInstanceId: string): Promise<MappedControl[]> {
    const rows = await db.requirementMap.findMany({
      where: { frameworkInstanceId, archivedAt: null, control: { archivedAt: null } },
      select: {
        requirementId: true,
        customRequirementId: true,
        control: {
          select: {
            name: true,
            frameworkPolicyLinks: {
              where: { frameworkInstanceId, policy: { archivedAt: null, isArchived: false } },
              select: { policyId: true },
            },
            frameworkTaskLinks: {
              where: { frameworkInstanceId, task: { archivedAt: null } },
              select: { taskId: true },
            },
            frameworkDocumentLinks: {
              where: { frameworkInstanceId },
              select: { formType: true },
            },
          },
        },
      },
    });

    return rows.map(({ requirementId, customRequirementId, control }) => ({
      requirementId,
      customRequirementId,
      control: {
        name: control.name,
        policyIds: control.frameworkPolicyLinks.map((l) => l.policyId),
        taskIds: control.frameworkTaskLinks.map((l) => l.taskId),
        formTypes: control.frameworkDocumentLinks.map((l) => l.formType),
      },
    }));
  }
}
