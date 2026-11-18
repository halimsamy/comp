'use client';

import type { AuditEventFilters } from '@/hooks/use-audit-events';
import { useOrganizationMembers } from '@/hooks/use-organization-members';
import {
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@trycompai/design-system';
import { Search } from '@trycompai/design-system/icons';
import { EVENT_TYPE_OPTIONS } from './event-log-options';

const ALL = 'all';

export function EventLogFilters({
  filters,
  search,
  onSearchChange,
  onChange,
}: {
  filters: AuditEventFilters;
  search: string;
  onSearchChange: (value: string) => void;
  onChange: (filters: AuditEventFilters) => void;
}) {
  const { members } = useOrganizationMembers();
  const users = (Array.isArray(members) ? members : []).map((m) => ({
    id: m.user.id,
    label: m.user.name || m.user.email,
  }));
  const userLabel = users.find((u) => u.id === filters.userId)?.label ?? 'All users';
  const typeLabel =
    EVENT_TYPE_OPTIONS.find((o) => o.value === (filters.resource ?? ALL))?.label ?? 'All events';

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_180px_150px_150px]">
      <InputGroup>
        <InputGroupAddon>
          <Search size={16} />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search events"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search events"
        />
      </InputGroup>
      <Select
        value={filters.resource ?? ALL}
        onValueChange={(v) => v && onChange({ ...filters, resource: v === ALL ? undefined : v })}
      >
        <SelectTrigger aria-label="Event type">
          <SelectValue>{typeLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {EVENT_TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.userId ?? ALL}
        onValueChange={(v) => v && onChange({ ...filters, userId: v === ALL ? undefined : v })}
      >
        <SelectTrigger aria-label="User">
          <SelectValue>{userLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All users</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="date"
        aria-label="From date"
        value={filters.from ?? ''}
        max={filters.to}
        onChange={(e) => onChange({ ...filters, from: e.target.value || undefined })}
      />
      <Input
        type="date"
        aria-label="To date"
        value={filters.to ?? ''}
        min={filters.from}
        onChange={(e) => onChange({ ...filters, to: e.target.value || undefined })}
      />
    </div>
  );
}
