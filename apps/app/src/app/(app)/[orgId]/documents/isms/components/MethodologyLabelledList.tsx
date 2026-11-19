'use client';

import { Text, Textarea } from '@trycompai/design-system';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { Controller } from 'react-hook-form';

interface MethodologyLabelledListProps<T extends FieldValues> {
  title: string;
  helper: string;
  /** Fixed row labels (levels/options) — not editable, mirror the export. */
  labels: readonly string[];
  /** RHF array-field name; one string per label. */
  name: Path<T>;
  control: Control<T>;
  canEdit: boolean;
  /** Current values (watched) for the read-only rendering. */
  values: string[];
  /** Per-row validation messages (aligned with labels), shown under each row. */
  rowErrors?: (string | undefined)[];
  /** Read-only computed text per row (aligned with labels), shown above the description. */
  computed?: string[];
}

/**
 * One editable description per fixed label — the shape shared by the 6.1.2
 * likelihood/impact scales, acceptance thresholds, and treatment options. The
 * labels are platform constants (they render into the document verbatim);
 * only each row's description is customer text.
 */
export function MethodologyLabelledList<T extends FieldValues>({
  title,
  helper,
  labels,
  name,
  control,
  canEdit,
  values,
  rowErrors,
  computed,
}: MethodologyLabelledListProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      <Text weight="semibold">{title}</Text>
      <div className="text-muted-foreground">
        <Text variant="muted">{helper}</Text>
      </div>
      <div className="flex flex-col gap-3">
        {labels.map((label, index) => (
          <div
            key={label}
            className="grid grid-cols-1 gap-1 sm:grid-cols-[180px_1fr] sm:items-start sm:gap-3"
          >
            <div className="flex flex-col gap-0.5 pt-2">
              <span className="text-sm font-medium">{label}</span>
              {computed?.[index] && (
                <span className="text-xs text-muted-foreground">{computed[index]}</span>
              )}
            </div>
            {canEdit ? (
              <div className="flex flex-col gap-1">
                <Controller
                  control={control}
                  name={`${name}.${index}` as Path<T>}
                  render={({ field: { ref: _ref, ...field } }) => (
                    <Textarea {...field} rows={2} aria-label={`${title}: ${label}`} />
                  )}
                />
                {rowErrors?.[index] && (
                  <span role="alert" className="text-xs text-destructive">
                    {rowErrors[index]}
                  </span>
                )}
              </div>
            ) : (
              <p className="whitespace-pre-wrap pt-2 text-sm">{values[index] || '—'}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
