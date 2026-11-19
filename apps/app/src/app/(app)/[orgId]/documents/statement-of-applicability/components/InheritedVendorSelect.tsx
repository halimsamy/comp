'use client';

import { useVendors } from '@/hooks/use-vendors';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@trycompai/design-system';

const NONE = 'none';

/** Optional supplier this applicable control is inherited from (e.g. a cloud provider for A.7.x). */
export function InheritedVendorSelect({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (vendorId: string | null) => void;
  disabled?: boolean;
}) {
  const { data, isLoading } = useVendors();
  const vendors = Array.isArray(data?.data?.data) ? data.data.data : [];

  const items = [
    { value: NONE, label: 'Not inherited' },
    ...vendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
  ];
  const handleChange = (next: unknown) =>
    onChange(typeof next === 'string' && next !== NONE ? next : null);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        Inherited from supplier (optional)
      </label>
      <Select items={items} value={value ?? NONE} onValueChange={handleChange}>
        <SelectTrigger disabled={disabled || isLoading}>
          <SelectValue placeholder={isLoading ? 'Loading suppliers…' : 'Not inherited'} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
