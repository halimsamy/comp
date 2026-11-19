import { redirect } from 'next/navigation';

/** The background check lives in the person's Background check tab; keep old links working. */
export default async function EmployeeBackgroundCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string; orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { employeeId, orgId } = await params;
  const query = new URLSearchParams({ tab: 'background-check' });
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string' && key !== 'tab') query.set(key, value);
  }
  redirect(`/${orgId}/people/${employeeId}?${query.toString()}`);
}
