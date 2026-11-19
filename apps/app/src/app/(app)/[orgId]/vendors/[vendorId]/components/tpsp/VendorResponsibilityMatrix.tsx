'use client';

import type { ResponsibilityMatrixRow } from '@/hooks/use-vendors';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@trycompai/design-system';
import { Add, Edit, ListChecked, MagicWand, TrashCan } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

const OWNERS = [
  { value: 'tpsp', label: 'Vendor (TPSP)', variant: 'default' },
  { value: 'entity', label: 'Us', variant: 'accent' },
  { value: 'shared', label: 'Shared', variant: 'secondary' },
] as const;

/** PCI DSS v4.0.1 principal requirements, to start a matrix in one click. */
export const PCI_REQUIREMENTS = [
  '1 Network security controls',
  '2 Secure configurations',
  '3 Protect stored account data',
  '4 Encrypt transmission over open networks',
  '5 Anti-malware',
  '6 Secure systems and software',
  '7 Restrict access by need to know',
  '8 Identify users and authenticate access',
  '9 Restrict physical access',
  '10 Log and monitor access',
  '11 Test security regularly',
  '12 Policies and programs',
];

const matrixSchema = z.object({
  rows: z.array(
    z.object({
      requirement: z.string().trim().min(1, 'Required').max(200),
      owner: z.enum(['tpsp', 'entity', 'shared']),
      notes: z.string().max(1000),
      confirmed: z.boolean(),
    }),
  ),
}).superRefine((value, ctx) =>
  value.rows.forEach((row, index) => {
    if (row.owner === 'shared' && row.confirmed && !row.notes.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['rows', index, 'notes'],
        message: 'Say how a shared requirement is split before confirming it',
      });
    }
  }),
);
type MatrixValues = z.infer<typeof matrixSchema>;

/** PCI DSS 12.8.5: which requirements the TPSP, we, or both manage. */
export function VendorResponsibilityMatrix({
  rows,
  canUpdate,
  onSave,
  aocRows = [],
}: {
  rows: ResponsibilityMatrixRow[];
  canUpdate: boolean;
  onSave: (rows: ResponsibilityMatrixRow[]) => Promise<void>;
  /** The split read from the newest AOC, used to prefill (rows stay unconfirmed). */
  aocRows?: ResponsibilityMatrixRow[];
}) {
  const [editing, setEditing] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<MatrixValues>({
    resolver: zodResolver(matrixSchema),
    values: {
      rows: rows.map((r) => ({
        requirement: r.requirement,
        owner: r.owner,
        notes: r.notes ?? '',
        confirmed: Boolean(r.confirmed),
      })),
    },
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'rows' });

  const handleCancel = () => {
    reset();
    setEditing(false);
  };
  const handleSave = handleSubmit(async (values) => {
    await onSave(values.rows.map((r) => ({ ...r, notes: r.notes.trim() || undefined })));
    setEditing(false);
  });
  const handleAddPciRequirements = () =>
    PCI_REQUIREMENTS.filter((req) => !fields.some((f) => f.requirement === req)).forEach(
      (requirement) => append({ requirement, owner: 'shared', notes: '', confirmed: false }),
    );
  const handlePrefillFromAoc = () => {
    replace(aocRows.map((r) => ({ ...r, notes: r.notes ?? '', confirmed: false })));
    setEditing(true);
  };
  const unconfirmed = rows.filter((r) => !r.confirmed).length;

  return (
    <section className="flex flex-col gap-4 rounded-md border border-border bg-background p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-normal tracking-[-0.01em]">Responsibility matrix</h3>
          <span className="text-xs text-muted-foreground">
            Which PCI DSS requirements this vendor manages, which you manage, and which are shared
            (12.8.5).
          </span>
        </div>
        {canUpdate && !editing && (
          <div className="flex flex-wrap gap-2">
            {aocRows.length > 0 && (
              <Button variant="outline" iconLeft={<MagicWand size={16} />} onClick={handlePrefillFromAoc}>
                Prefill from AOC
              </Button>
            )}
            <Button variant="outline" iconLeft={<Edit size={16} />} onClick={() => setEditing(true)}>
              {rows.length ? 'Edit matrix' : 'Build matrix'}
            </Button>
          </div>
        )}
      </div>

      {!editing && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No matrix yet. Copy it from the vendor&apos;s AOC (section 2g) or responsibility summary.
        </p>
      )}

      {!editing && unconfirmed > 0 && (
        <p className="text-xs text-muted-foreground">
          {unconfirmed} row{unconfirmed === 1 ? '' : 's'} not yet confirmed against the vendor&apos;s
          AOC or agreement.
        </p>
      )}

      {!editing && rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((row) => {
            const owner = OWNERS.find((o) => o.value === row.owner);
            return (
              <li
                key={row.requirement}
                className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="flex-1 text-sm">{row.requirement}</span>
                {owner && <Badge variant={owner.variant}>{owner.label}</Badge>}
                <Badge variant={row.confirmed ? 'accent' : 'outline'}>
                  {row.confirmed ? 'Confirmed' : 'Unconfirmed'}
                </Badge>
                {row.notes && (
                  <span className="text-xs text-muted-foreground sm:max-w-[40%]">{row.notes}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 md:grid-cols-[2fr_1fr_2fr_auto_auto] md:items-center md:border-0 md:p-0"
            >
              <Controller
                control={control}
                name={`rows.${index}.requirement`}
                render={({ field: { ref: _ref, ...f } }) => (
                  <Input {...f} aria-label="Requirement" placeholder="e.g. 8.4 MFA into the CDE" />
                )}
              />
              <Controller
                control={control}
                name={`rows.${index}.owner`}
                render={({ field: f }) => (
                  <Select value={f.value} onValueChange={(v) => v && f.onChange(v)}>
                    <SelectTrigger aria-label="Responsible">
                      <SelectValue>{OWNERS.find((o) => o.value === f.value)?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {OWNERS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <Controller
                control={control}
                name={`rows.${index}.notes`}
                render={({ field: { ref: _ref, ...f } }) => (
                  <Input {...f} aria-label="Notes" placeholder="Notes (optional)" />
                )}
              />
              <Controller
                control={control}
                name={`rows.${index}.confirmed`}
                render={({ field: f }) => (
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={f.value}
                      onCheckedChange={(checked) => f.onChange(Boolean(checked))}
                    />
                    Confirmed
                  </label>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove row"
                onClick={() => remove(index)}
              >
                <TrashCan size={16} />
              </Button>
              {(errors.rows?.[index]?.requirement || errors.rows?.[index]?.notes) && (
                <span role="alert" className="text-xs text-destructive md:col-span-5">
                  {errors.rows[index]?.requirement?.message ?? errors.rows[index]?.notes?.message}
                </span>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              iconLeft={<Add size={16} />}
              onClick={() => append({ requirement: '', owner: 'shared', notes: '', confirmed: false })}
            >
              Add row
            </Button>
            <Button
              type="button"
              variant="outline"
              iconLeft={<ListChecked size={16} />}
              onClick={handleAddPciRequirements}
            >
              Add the 12 PCI DSS requirements
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
              Save matrix
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
