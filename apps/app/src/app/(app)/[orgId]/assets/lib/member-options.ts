import { serverApi } from '@/lib/api-server';
import type { MemberOption } from '../components/AssetFormFields';

interface PeopleApiResponse {
  data: Array<{
    id: string;
    deactivated: boolean;
    user: { name: string | null; email: string } | null;
  }>;
}

/** Active members for owner pickers; empty without member:read. */
export async function fetchMemberOptions(): Promise<MemberOption[]> {
  const res = await serverApi.get<PeopleApiResponse>('/v1/people');
  return (res.data?.data ?? [])
    .filter((person) => !person.deactivated)
    .map((person) => ({
      id: person.id,
      name: person.user?.name || person.user?.email || 'Unknown',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
