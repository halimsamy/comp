'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { authClient } from '@/utils/auth-client';
import type { Member, User } from '@db';
import {
  Checkbox,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Spinner,
  Stack,
} from '@trycompai/design-system';
import { Search } from '@trycompai/design-system/icons';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { usePolicyOnboardingStatus } from '../../(overview)/hooks/use-policy-onboarding-status';
import {
  filterPolicyRegister,
  type PolicyRegisterRow,
  type RegisterSort,
  type StageFilter,
} from '../../lib/policy-register';
import { PoliciesTableDS } from './PoliciesTableDS';
import { PolicyBulkActions } from './PolicyBulkActions';
import { FilterSelect, STAGE_OPTIONS } from './PolicyFilterSelect';
import { PolicyTailoringProvider } from './policy-tailoring-context';

interface PolicyFiltersProps {
  policies: PolicyRegisterRow[];
  members: (Member & { user: User })[];
  onboardingRunId?: string | null;
}

export function PolicyFilters({ policies, members, onboardingRunId }: PolicyFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const { data: activeMember } = authClient.useActiveMember();
  const canUpdate = hasPermission('policy', 'update');

  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<StageFilter>('all');
  const [department, setDepartment] = useState('all');
  const [framework, setFramework] = useState('all');
  const [reviewOverdue, setReviewOverdue] = useState(false);
  const [sort, setSort] = useState<RegisterSort>('name');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // "Awaiting my approval" lives in the URL so the header chip can link to it.
  const awaitingMine = searchParams.get('awaiting') === 'me';
  const currentMemberId = activeMember?.id ?? null;

  const { itemStatuses, progress, isActive } = usePolicyOnboardingStatus(onboardingRunId);
  const showTailoringBanner = isActive && policies.length > 0 && progress !== null;

  const departments = useMemo(
    () => [...new Set(policies.flatMap((p) => (p.department ? [p.department] : [])))].sort(),
    [policies],
  );
  const frameworks = useMemo(
    () => [...new Set(policies.flatMap((p) => p.frameworks ?? []))].sort(),
    [policies],
  );

  const visible = useMemo(
    () =>
      filterPolicyRegister(policies, {
        search,
        stage,
        department,
        framework,
        reviewOverdue,
        awaitingMemberId: awaitingMine ? currentMemberId : null,
        sort,
        direction,
      }),
    [policies, search, stage, department, framework, reviewOverdue, awaitingMine, currentMemberId, sort, direction],
  );
  const selected = visible.filter((policy) => selectedIds.has(policy.id));

  const handleSort = (column: RegisterSort) => {
    if (sort === column) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSort(column);
    setDirection('asc');
  };

  const handleToggleAwaiting = (checked: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (checked) params.set('awaiting', 'me');
    else params.delete('awaiting');
    router.replace(`${pathname}?${params.toString()}`);
  };

  const handleToggle = (policyId: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(policyId)) next.delete(policyId);
      else next.add(policyId);
      return next;
    });

  const handleBulkDone = () => {
    setSelectedIds(new Set());
    router.refresh();
  };

  return (
    <PolicyTailoringProvider statuses={itemStatuses}>
      <Stack gap="md">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="w-full lg:max-w-[260px]">
            <InputGroup>
              <InputGroupAddon>
                <Search size={16} />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search policies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
            <FilterSelect
              value={stage}
              onChange={(v) => setStage(v as StageFilter)}
              options={STAGE_OPTIONS}
            />
            <FilterSelect
              value={department}
              onChange={setDepartment}
              options={[
                { value: 'all', label: 'All departments' },
                ...departments.map((d) => ({ value: d, label: d.toUpperCase() })),
              ]}
            />
            <FilterSelect
              value={framework}
              onChange={setFramework}
              options={[
                { value: 'all', label: 'All frameworks' },
                ...frameworks.map((f) => ({ value: f, label: f })),
              ]}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={reviewOverdue} onCheckedChange={(c) => setReviewOverdue(c === true)} />
              Review overdue
            </label>
            {currentMemberId && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={awaitingMine} onCheckedChange={(c) => handleToggleAwaiting(c === true)} />
                Awaiting my approval
              </label>
            )}
          </div>
        </div>
        {showTailoringBanner && progress !== null && (
          <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-linear-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Spinner size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-primary">Tailoring your policies</span>
              <span className="text-xs text-muted-foreground">
                Personalized {progress.completed}/{progress.total} policies
              </span>
            </div>
          </div>
        )}
        {canUpdate && selected.length > 0 && (
          <PolicyBulkActions
            selected={selected}
            members={members}
            currentMemberId={currentMemberId}
            onDone={handleBulkDone}
          />
        )}
        <PoliciesTableDS
          policies={visible}
          sort={sort}
          direction={direction}
          onSort={handleSort}
          selection={
            canUpdate
              ? {
                  selectedIds,
                  onToggle: handleToggle,
                  onToggleAll: (checked) =>
                    setSelectedIds(checked ? new Set(visible.map((p) => p.id)) : new Set()),
                }
              : undefined
          }
        />
      </Stack>
    </PolicyTailoringProvider>
  );
}
