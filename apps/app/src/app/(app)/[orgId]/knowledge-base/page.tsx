import { redirect } from 'next/navigation';

/** Retired page: the knowledge base is a tab of Questionnaires. */
export default async function KnowledgeBasePage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/${orgId}/questionnaire?tab=knowledge-base`);
}
