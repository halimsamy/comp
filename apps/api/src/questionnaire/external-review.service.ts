import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import AdmZip from 'adm-zip';
import { triggerEmail } from '../email/trigger-email';
import { QuestionnaireReviewEmail } from '../email/templates/questionnaire-review';
import { generateExportFile, type ExportFormat } from './utils/export-generator';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.trycomp.ai';

/**
 * Review gate for questionnaires uploaded from the public trust portal: AI
 * answers are held until an owner/admin approves them, then emailed to the
 * requester. Nothing the AI drafted leaves the org without a human check.
 */
@Injectable()
export class ExternalQuestionnaireReviewService {
  private readonly logger = new Logger(ExternalQuestionnaireReviewService.name);

  async requiresReview(organizationId: string): Promise<boolean> {
    const trust = await db.trust.findUnique({
      where: { organizationId },
      select: { securityQuestionnaireRequiresReview: true },
    });
    return trust?.securityQuestionnaireRequiresReview ?? true;
  }

  async getRequesterEmail(token: string): Promise<string> {
    const grant = await db.trustAccessGrant.findUnique({
      where: { accessToken: token },
      select: { subjectEmail: true },
    });
    if (!grant) throw new NotFoundException('Access grant not found');
    return grant.subjectEmail;
  }

  async notifyReviewers({
    organizationId,
    requesterEmail,
  }: {
    organizationId: string;
    requesterEmail: string;
  }): Promise<void> {
    const reviewers = await db.member.findMany({
      where: {
        organizationId,
        deactivated: false,
        OR: [{ role: { contains: 'owner' } }, { role: { contains: 'admin' } }],
      },
      select: { user: { select: { email: true } } },
    });
    const url = `${APP_URL}/${organizationId}/questionnaire`;
    await Promise.all(
      reviewers.map(({ user }) =>
        triggerEmail({
          to: user.email,
          subject: 'A trust portal questionnaire is waiting for your review',
          react: QuestionnaireReviewEmail({
            preview: `Questionnaire from ${requesterEmail} needs review`,
            heading: 'Questionnaire needs review',
            message: `${requesterEmail} uploaded a security questionnaire on your trust portal. AI drafted the answers. Review and approve them before they are sent.`,
            ctaUrl: url,
            ctaLabel: 'Review answers',
          }),
        }).catch((err) => this.logger.error('Failed to notify reviewer', err)),
      ),
    );
  }

  /** Approve the reviewed answers and email them (PDF, CSV, XLSX in a ZIP) to the requester. */
  async approve({
    organizationId,
    questionnaireId,
    userId,
  }: {
    organizationId: string;
    questionnaireId: string;
    userId: string | undefined;
  }) {
    const questionnaire = await db.questionnaire.findFirst({
      where: { id: questionnaireId, organizationId },
      select: {
        filename: true,
        reviewStatus: true,
        requesterEmail: true,
        organization: { select: { name: true } },
        questions: {
          orderBy: { questionIndex: 'asc' },
          select: { question: true, answer: true },
        },
      },
    });
    if (!questionnaire) throw new NotFoundException('Questionnaire not found');
    if (questionnaire.reviewStatus !== 'pending_review' || !questionnaire.requesterEmail) {
      throw new BadRequestException('This questionnaire is not waiting for review');
    }

    const baseName = questionnaire.filename.replace(/\.[^/.]+$/, '') || 'questionnaire';
    const zip = new AdmZip();
    const formats: ExportFormat[] = ['pdf', 'csv', 'xlsx'];
    for (const format of formats) {
      const file = await generateExportFile(questionnaire.questions, format, baseName);
      zip.addFile(file.filename, file.fileBuffer);
    }

    await triggerEmail({
      to: questionnaire.requesterEmail,
      subject: `${questionnaire.organization.name}: your security questionnaire answers`,
      trustPortal: true,
      react: QuestionnaireReviewEmail({
        preview: 'Your questionnaire answers are attached',
        heading: 'Your questionnaire answers',
        message: `${questionnaire.organization.name} reviewed the answers to your security questionnaire. They are attached as PDF, CSV and XLSX.`,
      }),
      attachments: [
        {
          filename: `${baseName}-answers.zip`,
          content: zip.toBuffer(),
          contentType: 'application/zip',
        },
      ],
    });

    return db.questionnaire.update({
      where: { id: questionnaireId },
      data: {
        reviewStatus: 'approved',
        reviewedAt: new Date(),
        reviewedByUserId: userId ?? null,
      },
      select: { id: true, reviewStatus: true, reviewedAt: true, requesterEmail: true },
    });
  }
}
