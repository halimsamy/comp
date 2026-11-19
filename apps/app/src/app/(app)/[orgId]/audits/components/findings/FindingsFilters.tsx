import type { FindingSeverity, FindingStatus, FindingType } from '@db';
import {
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
import { SEVERITY_OPTIONS, STATUS_OPTIONS } from './finding-labels';

/** Search plus status, severity and framework filters for the findings list. */
export function FindingsFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  severityFilter,
  onSeverityChange,
  frameworkFilter,
  onFrameworkChange,
  frameworkOptions,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: FindingStatus | 'all';
  onStatusChange: (value: FindingStatus | 'all') => void;
  severityFilter: FindingSeverity | 'all';
  onSeverityChange: (value: FindingSeverity | 'all') => void;
  frameworkFilter: FindingType | 'all';
  onFrameworkChange: (value: FindingType | 'all') => void;
  frameworkOptions: { value: FindingType | 'all'; label: string }[];
}) {
  const statusLabel = STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? 'Status';
  const severityLabel =
    SEVERITY_OPTIONS.find((o) => o.value === severityFilter)?.label ?? 'Severity';
  const frameworkLabel =
    frameworkOptions.find((o) => o.value === frameworkFilter)?.label ?? 'Framework';

  return (
<div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="w-full md:max-w-[300px]">
            <InputGroup>
              <InputGroupAddon>
                <Search size={16} />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search findings..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </InputGroup>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 md:w-[180px] md:flex-none">
              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  onStatusChange((v ?? 'all') as FindingStatus | 'all')
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status">{statusLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 md:w-[180px] md:flex-none">
              <Select
                value={severityFilter}
                onValueChange={(v) =>
                  onSeverityChange((v ?? 'all') as FindingSeverity | 'all')
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Severity">{severityLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 md:w-[180px] md:flex-none">
              <Select
                value={frameworkFilter}
                onValueChange={(v) =>
                  onFrameworkChange((v ?? 'all') as FindingType | 'all')
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Framework">{frameworkLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {frameworkOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
  );
}
