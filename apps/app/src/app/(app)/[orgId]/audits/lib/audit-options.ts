import { serverApi } from '@/lib/api-server';
import type { Option } from '../components/AuditFormFields';

interface FrameworksResponse {
  data: Array<{
    id: string;
    framework: { name: string } | null;
    customFramework?: { name: string } | null;
  }>;
}

interface PeopleResponse {
  data: Array<{
    id: string;
    role: string;
    deactivated: boolean;
    user: { name: string | null; email: string } | null;
  }>;
}

const byName = (a: Option, b: Option) => a.name.localeCompare(b.name);

/** Frameworks to audit and members with the auditor role; empty without read access. */
export async function fetchAuditOptions(): Promise<{ frameworks: Option[]; auditors: Option[] }> {
  const [frameworksRes, peopleRes] = await Promise.all([
    serverApi.get<FrameworksResponse>('/v1/frameworks'),
    serverApi.get<PeopleResponse>('/v1/people'),
  ]);
  const frameworks = (frameworksRes.data?.data ?? []).map((fi) => ({
    id: fi.id,
    name: fi.framework?.name ?? fi.customFramework?.name ?? 'Framework',
  }));
  const auditors = (peopleRes.data?.data ?? [])
    .filter((p) => !p.deactivated && p.role.split(',').some((r) => r.trim() === 'auditor'))
    .map((p) => ({ id: p.id, name: p.user?.name || p.user?.email || 'Unknown' }));
  return { frameworks: frameworks.sort(byName), auditors: auditors.sort(byName) };
}
