import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ orgId: string; frameworkInstanceId: string; controlId: string }>;
}

/** Controls have one page; keep the framework so breadcrumbs and new links stay scoped. */
export default async function FrameworkControlPage({ params }: PageProps) {
  const { orgId, frameworkInstanceId, controlId } = await params;
  redirect(`/${orgId}/controls/${controlId}?framework=${frameworkInstanceId}`);
}
