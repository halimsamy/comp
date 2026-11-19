'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@trycompai/design-system';
import { COMPLIANCE_FILTERS, type ComplianceFilter } from '../lib/people-compliance';

/** Compliance status and department filters of the People table (#86). */
export function ComplianceFilters({
  compliance,
  department,
  departments,
  onComplianceChange,
  onDepartmentChange,
}: {
  compliance: ComplianceFilter;
  department: string;
  departments: string[];
  onComplianceChange: (value: ComplianceFilter) => void;
  onDepartmentChange: (value: string) => void;
}) {
  return (
    <>
      <div className="w-full sm:w-[170px]">
        <Select value={compliance} onValueChange={(value) => onComplianceChange(value ?? 'all')}>
          <SelectTrigger aria-label="Compliance">
            <SelectValue>{(value: string) => COMPLIANCE_FILTERS.find((f) => f.value === value)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {COMPLIANCE_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {departments.length > 1 && (
        <div className="w-full sm:w-[160px]">
          <Select value={department} onValueChange={(value) => onDepartmentChange(value ?? 'all')}>
            <SelectTrigger aria-label="Department">
              <SelectValue>
                {(value: string) => (value === 'all' ? 'All departments' : value.toUpperCase())}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}
