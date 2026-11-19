import { z } from 'zod';

/** The company context questions an auditor needs (answered under Settings → Context). */
export const CONTEXT_QUESTIONS = {
  background: 'Company Background & Overview of Operations',
  services: 'Types of Services Provided',
  mission: 'Mission & Vision',
  system: 'System Description',
  vendors: 'Critical Vendors',
  subservice: 'Subservice Organizations',
  employees: 'How many employees do you have?',
  cSuite: 'Who are your C-Suite executives?',
  signatory: 'Who will sign off on the final report?',
} as const;

const cSuiteSchema = z.array(z.object({ name: z.string(), title: z.string() }));
const signatorySchema = z.object({ fullName: z.string(), jobTitle: z.string(), email: z.string() });

export interface CompanyContext {
  organizationName: string;
  logoUrl: string | null;
  answers: Record<string, string>;
  cSuite: z.infer<typeof cSuiteSchema>;
  signatory: z.infer<typeof signatorySchema> | null;
}

function parseJson<T>({ raw, schema }: { raw: string | undefined; schema: z.ZodType<T> }): T | null {
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Shape /v1/organization + /v1/context into what the Company tab shows. */
export function toCompanyContext({
  organization,
  entries,
}: {
  organization: { name: string; logoUrl: string | null } | undefined;
  entries: Array<{ question: string; answer: string }>;
}): CompanyContext {
  const wanted = new Set<string>(Object.values(CONTEXT_QUESTIONS));
  const answers = Object.fromEntries(
    entries.filter((entry) => wanted.has(entry.question)).map((e) => [e.question, e.answer]),
  );
  return {
    organizationName: organization?.name ?? 'Organization',
    logoUrl: organization?.logoUrl ?? null,
    answers,
    cSuite: parseJson({ raw: answers[CONTEXT_QUESTIONS.cSuite], schema: cSuiteSchema }) ?? [],
    signatory: parseJson({ raw: answers[CONTEXT_QUESTIONS.signatory], schema: signatorySchema }),
  };
}
