'use client';

import type { SignOffVendorReviewInput, VendorDocument } from '@/hooks/use-vendor-tpsp';
import type { VendorPciStatus } from '@db';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Checkbox,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
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
  Textarea,
} from '@trycompai/design-system';
import { Add, TrashCan } from '@trycompai/design-system/icons';
import { useEffect, useMemo } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { DOCUMENT_TYPE_LABEL, PCI_STATUS, REVIEW_OUTCOME } from '../../../lib/vendor-tpsp';
import {
  signOffDefaults,
  signOffSchema,
  toSignOffInput,
  type SignOffValues,
} from './sign-off-review-form';

const CHECKLIST = [
  {
    name: 'assuranceReviewed',
    label: 'Reviewed the current SOC 2 / ISO certificate / AOC, its exceptions and our CUECs',
  },
  { name: 'pciStatusConfirmed', label: 'Confirmed the vendor’s PCI DSS compliance status (12.8.4)' },
  { name: 'contractReviewed', label: 'Contract, security and confidentiality clauses still valid' },
  { name: 'riskReassessed', label: 'Inherent and residual risk re-assessed' },
] as const;

const FieldError = ({ message }: { message?: string }) =>
  message ? (
    <span role="alert" className="text-xs text-destructive">
      {message}
    </span>
  ) : null;

/** Sign-off form for a periodic vendor review (ISO 27001 A.5.22, PCI DSS 12.8.4). */
export function SignOffReviewSheet({
  open,
  onOpenChange,
  cadenceLabel,
  onSignOff,
  inPciScope,
  documents,
  currentPciStatus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cadenceLabel: string;
  onSignOff: (input: SignOffVendorReviewInput) => Promise<void>;
  inPciScope: boolean;
  documents: VendorDocument[];
  currentPciStatus?: VendorPciStatus | null;
}) {
  const defaults = useMemo(
    () => signOffDefaults({ documents, currentPciStatus }),
    [documents, currentPciStatus],
  );
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<SignOffValues>({
    resolver: zodResolver(signOffSchema({ inPciScope })),
    defaultValues: defaults,
  });
  const conditions = useFieldArray({ control, name: 'conditions' });
  const outcome = watch('outcome');
  const pciConfirmed = watch('pciStatusConfirmed');

  // Prefill from the latest documents each time the sheet opens.
  useEffect(() => {
    if (open) reset(defaults);
  }, [open, defaults, reset]);

  const handleSignOff = handleSubmit(async (values) => {
    await onSignOff(toSignOffInput(values));
    onOpenChange(false);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sign off vendor review</SheetTitle>
          <SheetDescription>
            Your name and the date are recorded. Reviews cannot be edited afterwards.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="vendor-review-form" onSubmit={handleSignOff} className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Documents reviewed</legend>
              {documents.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  No documents on file. Upload the vendor&apos;s SOC 2, ISO certificate or AOC first.
                </span>
              )}
              <Controller
                control={control}
                name="reviewedDocumentIds"
                render={({ field }) => (
                  <>
                    {documents.map((doc) => (
                      <label key={doc.id} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={field.value.includes(doc.id)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked
                                ? [...field.value, doc.id]
                                : field.value.filter((id) => id !== doc.id),
                            )
                          }
                        />
                        <span className="min-w-0">
                          {doc.name}{' '}
                          <span className="text-muted-foreground">
                            ({DOCUMENT_TYPE_LABEL[doc.type]})
                          </span>
                        </span>
                      </label>
                    ))}
                  </>
                )}
              />
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">What did you check?</legend>
              {CHECKLIST.filter((item) => inPciScope || item.name !== 'pciStatusConfirmed').map(
                (item) => (
                  <Controller
                    key={item.name}
                    control={control}
                    name={item.name}
                    render={({ field }) => (
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                        />
                        <span>{item.label}</span>
                      </label>
                    )}
                  />
                ),
              )}
              {pciConfirmed && (
                <div className="flex flex-col gap-1 pl-6">
                  <Label htmlFor="vendor-review-pci">Confirmed PCI DSS status</Label>
                  <Controller
                    control={control}
                    name="pciStatus"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                        <SelectTrigger id="vendor-review-pci">
                          <SelectValue placeholder="Choose a status">
                            {field.value ? PCI_STATUS[field.value].label : undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PCI_STATUS)
                            .filter(([value]) => value !== 'unknown')
                            .map(([value, { label }]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError message={errors.pciStatus?.message} />
                </div>
              )}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Outcome</legend>
              <Controller
                control={control}
                name="outcome"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={(value) => field.onChange(value)}>
                    {Object.entries(REVIEW_OUTCOME).map(([value, { label }]) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value={value} />
                        {label}
                      </label>
                    ))}
                  </RadioGroup>
                )}
              />
              <FieldError message={errors.outcome?.message} />
            </fieldset>
            {outcome === 'approved_with_conditions' && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">Conditions</legend>
                <span className="text-xs text-muted-foreground">
                  Each condition becomes an action on this vendor, due in 90 days.
                </span>
                {conditions.fields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <Controller
                      control={control}
                      name={`conditions.${index}.text`}
                      render={({ field: { ref: _ref, ...f } }) => (
                        <Input
                          {...f}
                          aria-label={`Condition ${index + 1}`}
                          placeholder="e.g. Provide the 2026 SOC 2 bridge letter"
                        />
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove condition"
                      onClick={() => conditions.remove(index)}
                    >
                      <TrashCan size={16} />
                    </Button>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    iconLeft={<Add size={14} />}
                    onClick={() => conditions.append({ text: '' })}
                  >
                    Add condition
                  </Button>
                </div>
                <FieldError message={errors.conditions?.message ?? errors.conditions?.root?.message} />
              </fieldset>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="vendor-review-notes">Notes</Label>
              <Controller
                control={control}
                name="notes"
                render={({ field: { ref: _ref, ...field } }) => (
                  <Textarea
                    {...field}
                    id="vendor-review-notes"
                    rows={4}
                    placeholder="Findings, CUECs mapped to our controls, reason for rejection…"
                  />
                )}
              />
              <FieldError message={errors.notes?.message} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="vendor-review-next">Next review (optional)</Label>
              <Controller
                control={control}
                name="nextReviewDue"
                render={({ field: { ref: _ref, ...field } }) => (
                  <Input {...field} id="vendor-review-next" type="date" />
                )}
              />
              <span className="text-xs text-muted-foreground">
                Leave empty to use the {cadenceLabel} cadence.
              </span>
            </div>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="vendor-review-form"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Sign off review
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
