import { redirect } from 'next/navigation';

/** Retired page: tasks have one home under /tasks. */
export default async function LegacyTaskPage({
  params,
}: {
  params: Promise<{ orgId: string; taskId: string }>;
}) {
  const { orgId, taskId } = await params;
  redirect(`/${orgId}/tasks/${taskId}`);
}
