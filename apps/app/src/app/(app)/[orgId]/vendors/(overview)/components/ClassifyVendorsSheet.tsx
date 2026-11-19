'use client';

import { useVendorRegisterActions } from '@/hooks/use-vendor-register';
import type { Vendor } from '@/hooks/use-vendors';
import type { VendorCriticality } from '@db';
import {
  Button,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@trycompai/design-system';
import { useEffect, useMemo } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { suggestClassification, type ClassificationSuggestion } from '../../lib/vendor-classify';
import { CRITICALITY_OPTIONS } from '../../lib/vendor-tpsp';

type Row = ClassificationSuggestion & { selected: boolean };
type Values = { rows: Row[] };

/**
 * "Classify vendors": suggested criticality and PCI DSS 12.8.1 scope for every
 * unclassified vendor, reviewed in one table and saved in one request.
 */
export function ClassifyVendorsSheet({
  open,
  onOpenChange,
  vendors,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendors: Vendor[];
}) {
  const { bulkUpdateVendors } = useVendorRegisterActions();
  const suggestions = useMemo(
    () =>
      vendors
        .filter((v) => !v.criticality)
        .map((v) => ({ ...suggestClassification(v), selected: true })),
    [vendors],
  );
  const { control, handleSubmit, reset, watch, formState } = useForm<Values>({
    defaultValues: { rows: suggestions },
  });
  const { fields } = useFieldArray({ control, name: 'rows' });
  const selectedCount = watch('rows').filter((r) => r.selected).length;

  useEffect(() => {
    if (open) reset({ rows: suggestions });
  }, [open, suggestions, reset]);

  const handleSave = handleSubmit(async ({ rows }) => {
    const updates = rows
      .filter((r) => r.selected)
      .map(({ id, criticality, handlesCardholderData, affectsCdeSecurity }) => ({
        id,
        criticality,
        handlesCardholderData,
        affectsCdeSecurity,
      }));
    if (updates.length === 0) return;
    try {
      await bulkUpdateVendors(updates);
      toast.success(`${updates.length} vendor${updates.length === 1 ? '' : 's'} classified`);
      onOpenChange(false);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to classify vendors');
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Classify vendors</SheetTitle>
          <SheetDescription>
            Suggestions from each vendor&apos;s inherent risk, category and description. Check them,
            adjust, and save. Vendors that share account data or can affect the CDE are reviewed at
            least every 12 months (PCI DSS 12.8.4).
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every vendor already has a criticality.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {fields.map((field, index) => (
                <li key={field.id} className="flex items-start gap-3 py-3">
                  <Controller
                    control={control}
                    name={`rows.${index}.selected`}
                    render={({ field: f }) => (
                      <Checkbox
                        aria-label={`Classify ${field.name}`}
                        checked={f.value}
                        onCheckedChange={(checked) => f.onChange(Boolean(checked))}
                      />
                    )}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{field.name}</span>
                      <span className="text-xs text-muted-foreground">{field.why.join(' · ')}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="w-[140px]">
                        <Controller
                          control={control}
                          name={`rows.${index}.criticality`}
                          render={({ field: f }) => (
                            <Select
                              value={f.value}
                              onValueChange={(v) => v && f.onChange(v as VendorCriticality)}
                            >
                              <SelectTrigger aria-label={`Criticality of ${field.name}`}>
                                <SelectValue>
                                  {CRITICALITY_OPTIONS.find((o) => o.value === f.value)?.label}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {CRITICALITY_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <Controller
                        control={control}
                        name={`rows.${index}.handlesCardholderData`}
                        render={({ field: f }) => (
                          <label className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={f.value}
                              onCheckedChange={(c) => f.onChange(Boolean(c))}
                            />
                            Account data
                          </label>
                        )}
                      />
                      <Controller
                        control={control}
                        name={`rows.${index}.affectsCdeSecurity`}
                        render={({ field: f }) => (
                          <label className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={f.value}
                              onCheckedChange={(c) => f.onChange(Boolean(c))}
                            />
                            Affects CDE
                          </label>
                        )}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            loading={formState.isSubmitting}
            disabled={selectedCount === 0 || formState.isSubmitting}
          >
            Save {selectedCount} vendor{selectedCount === 1 ? '' : 's'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
