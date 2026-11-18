'use client';

import { useMemberCompliance } from '@/hooks/use-member-compliance';
import { Text } from '@trycompai/design-system';

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Not set';

/** Join date, start date and background check outcome side by side, as auditors compare them. */
export function MemberKeyDates({ memberId }: { memberId: string }) {
  const { compliance } = useMemberCompliance(memberId);
  if (!compliance) return null;

  const { member } = compliance;
  const check = compliance.items.find((i) => i.key === 'background_check');
  const checkValue =
    check?.status === 'complete' && check.completedAt
      ? `Completed ${formatDate(check.completedAt)}`
      : (check?.detail ?? 'Not required');

  const stats = [
    { label: 'Joined', value: formatDate(member.joinedAt) },
    { label: 'Start date', value: formatDate(member.onboardDate) },
    { label: 'Background check', value: checkValue },
    ...(member.offboardDate ? [{ label: 'Offboarded', value: formatDate(member.offboardDate) }] : []),
  ];

  return (
    <dl className="grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-0">
          <dt>
            <Text size="xs" variant="muted">
              {stat.label}
            </Text>
          </dt>
          <dd className="truncate text-sm" title={stat.value}>
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
