import ExcelJS from 'exceljs';
import { formatExportDate } from '../../isms/utils/export-shared';
import { renderHousePdf, type PdfBlock } from '../../utils/house-pdf';
import type { QuestionAnswer } from './question-parser';

export type ExportFormat = 'pdf' | 'csv' | 'xlsx';

export interface ExportResult {
  fileBuffer: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Generates an export file in the specified format
 */
export async function generateExportFile(
  questionsAndAnswers: QuestionAnswer[],
  format: ExportFormat,
  vendorName: string,
  branding?: ExportBranding,
): Promise<ExportResult> {
  // Remove original extension if present and get base name
  const baseName = vendorName.replace(/\.[^/.]+$/, '');
  // Keep the original name but sanitize only dangerous characters for filenames
  const sanitizedBaseName = baseName.replace(/[<>:"/\\|?*]/g, '_');

  switch (format) {
    case 'xlsx':
      return {
        fileBuffer: await generateXLSX(questionsAndAnswers),
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${sanitizedBaseName}.xlsx`,
      };

    case 'csv':
      return {
        fileBuffer: Buffer.from(generateCSV(questionsAndAnswers), 'utf-8'),
        mimeType: 'text/csv',
        filename: `${sanitizedBaseName}.csv`,
      };

    case 'pdf':
    default:
      return {
        fileBuffer: generatePDF(questionsAndAnswers, baseName, branding),
        mimeType: 'application/pdf',
        filename: `${sanitizedBaseName}.pdf`,
      };
  }
}

/**
 * Generates an XLSX file buffer from questions and answers
 */
export async function generateXLSX(
  questionsAndAnswers: QuestionAnswer[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Questionnaire');

  // Set column widths
  worksheet.columns = [
    { header: '#', key: 'num', width: 5 },
    { header: 'Question', key: 'question', width: 60 },
    { header: 'Answer', key: 'answer', width: 60 },
  ];

  // Add data rows
  for (let i = 0; i < questionsAndAnswers.length; i++) {
    const qa = questionsAndAnswers[i];
    worksheet.addRow({
      num: i + 1,
      question: qa.question,
      answer: qa.answer || '',
    });
  }

  const xlsxBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(xlsxBuffer);
}

/**
 * Generates a CSV string from questions and answers
 */
export function generateCSV(questionsAndAnswers: QuestionAnswer[]): string {
  const rows = [
    ['#', 'Question', 'Answer'],
    ...questionsAndAnswers.map((qa, index) => [
      String(index + 1),
      qa.question.replace(/"/g, '""'),
      (qa.answer || '').replace(/"/g, '""'),
    ]),
  ];
  return rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
}

/** Organization shown on the PDF cover and footer, and its accent colour. */
export interface ExportBranding {
  organizationName: string | null;
  primaryColor: string | null;
}

/**
 * Generates a PDF buffer from questions and answers, in the house PDF style.
 */
export function generatePDF(
  questionsAndAnswers: QuestionAnswer[],
  vendorName?: string,
  branding?: ExportBranding,
): Buffer {
  const answered = questionsAndAnswers.filter((qa) => qa.answer?.trim()).length;
  return renderHousePdf({
    title: vendorName || 'Questionnaire',
    label: 'Security Questionnaire',
    subtitle: 'Questions and answers',
    documentCode: 'QUESTIONNAIRE',
    organizationName: branding?.organizationName ?? null,
    primaryColor: branding?.primaryColor ?? null,
    rows: [
      { label: 'Questionnaire', value: vendorName || 'Questionnaire' },
      { label: 'Generated', value: formatExportDate(new Date()) },
      { label: 'Questions', value: String(questionsAndAnswers.length) },
      { label: 'Answered', value: `${answered} of ${questionsAndAnswers.length}` },
    ],
    sections: [
      {
        heading: '1. Questions and answers',
        emptyText: 'No questions in this questionnaire.',
        blocks: questionsAndAnswers.flatMap((qa, index): PdfBlock[] => [
          { kind: 'subheading', text: `1.${index + 1} ${qa.question}` },
          ...answerBlocks(qa.answer),
        ]),
      },
    ],
  });
}

const BULLET_LINE = /^\s*[-*•]\s+/;

/** Splits an answer into paragraphs on blank lines and markdown list lines into house bullets. */
export function answerBlocks(answer: string | null | undefined): PdfBlock[] {
  if (!answer?.trim()) {
    return [{ kind: 'paragraph', text: 'No answer provided', muted: true }];
  }
  const blocks: PdfBlock[] = [];
  for (const chunk of answer.split(/\n\s*\n/)) {
    let text: string[] = [];
    let items: string[] = [];
    const flush = () => {
      if (text.length) blocks.push({ kind: 'paragraph', text: text.join('\n') });
      if (items.length) blocks.push({ kind: 'bullets', items });
      text = [];
      items = [];
    };
    for (const line of chunk.split('\n')) {
      if (!line.trim()) continue;
      const isBullet = BULLET_LINE.test(line);
      if (isBullet ? text.length : items.length) flush();
      if (isBullet) items.push(line.replace(BULLET_LINE, '').trim());
      else text.push(line.trim());
    }
    flush();
  }
  return blocks;
}
