'use client';

import type { UploadVendorDocumentInput } from '@/hooks/use-vendor-tpsp';
import type { VendorDocumentType } from '@db';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Input,
  Label,
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
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { DOCUMENT_TYPE_LABEL } from '../../../lib/vendor-tpsp';

const MAX_BYTES = 100 * 1024 * 1024;
const TYPES = Object.keys(DOCUMENT_TYPE_LABEL) as [VendorDocumentType, ...VendorDocumentType[]];

const uploadSchema = z
  .object({
    type: z.enum(TYPES),
    file: z
      .custom<File>(
        (value) => typeof File !== 'undefined' && value instanceof File,
        'Choose a file',
      )
      .refine((file) => file.size <= MAX_BYTES, 'Files must be 100 MB or smaller'),
    name: z.string().max(255),
    periodStart: z.string(),
    periodEnd: z.string(),
    expiresAt: z.string(),
  })
  .refine((v) => !v.periodStart || !v.periodEnd || v.periodStart <= v.periodEnd, {
    message: 'Period end must be after the start',
    path: ['periodEnd'],
  });
type UploadValues = z.infer<typeof uploadSchema>;

const DEFAULTS = {
  type: 'soc2_type2' as const,
  name: '',
  periodStart: '',
  periodEnd: '',
  expiresAt: '',
};

/** Upload sheet for typed vendor documents. Assurance reports get an AI summary. */
export function UploadVendorDocumentSheet({
  open,
  onOpenChange,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (input: UploadVendorDocumentInput) => Promise<void>;
}) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<UploadValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: DEFAULTS,
  });

  const handleClose = (next: boolean) => {
    if (!next) reset(DEFAULTS);
    onOpenChange(next);
  };

  const handleUpload = handleSubmit(async (values) => {
    await onUpload(values);
    handleClose(false);
  });

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Upload vendor document</SheetTitle>
          <SheetDescription>
            SOC 2 reports, ISO certificates and AOCs are summarized by AI. Leave dates empty to read
            them from the report.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="vendor-document-form" onSubmit={handleUpload} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="vendor-document-type">Document type</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    <SelectTrigger id="vendor-document-type" aria-label="Document type">
                      <SelectValue>{DOCUMENT_TYPE_LABEL[field.value]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {DOCUMENT_TYPE_LABEL[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="vendor-document-file">File</Label>
              <Controller
                control={control}
                name="file"
                render={({ field }) => (
                  <Input
                    id="vendor-document-file"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx"
                    onChange={(e) => field.onChange(e.target.files?.[0])}
                  />
                )}
              />
              {errors.file && (
                <span role="alert" className="text-xs text-destructive">
                  {errors.file.message}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="vendor-document-name">Name (optional)</Label>
              <Controller
                control={control}
                name="name"
                render={({ field: { ref: _ref, ...field } }) => (
                  <Input
                    {...field}
                    id="vendor-document-name"
                    placeholder="e.g. SOC 2 Type II 2026"
                  />
                )}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(['periodStart', 'periodEnd'] as const).map((name) => (
                <div key={name} className="flex flex-col gap-2">
                  <Label htmlFor={`vendor-document-${name}`}>
                    {name === 'periodStart' ? 'Period start' : 'Period end'}
                  </Label>
                  <Controller
                    control={control}
                    name={name}
                    render={({ field: { ref: _ref, ...field } }) => (
                      <Input {...field} id={`vendor-document-${name}`} type="date" />
                    )}
                  />
                </div>
              ))}
            </div>
            {errors.periodEnd && (
              <span role="alert" className="text-xs text-destructive">
                {errors.periodEnd.message}
              </span>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="vendor-document-expires">Expires</Label>
              <Controller
                control={control}
                name="expiresAt"
                render={({ field: { ref: _ref, ...field } }) => (
                  <Input {...field} id="vendor-document-expires" type="date" />
                )}
              />
              <span className="text-xs text-muted-foreground">
                Defaults to 12 months after the period end for SOC 2, ISO and AOC documents.
              </span>
            </div>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleClose(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="vendor-document-form"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Upload
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
