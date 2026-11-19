'use client';

import { useApiSWR } from '@/hooks/use-api-swr';
import { api } from '@/lib/api-client';
import { fileToBase64 } from '@/lib/file-utils';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
} from '@trycompai/design-system';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import type { MemberCompliance } from '../../all/lib/people-compliance';

const today = () => new Date().toISOString().slice(0, 10);

const schema = z.object({
  memberIds: z.array(z.string()).min(1, 'Pick at least one person'),
  provider: z.string().trim().min(1, 'Name who screened them').max(200),
  verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date').refine((v) => v <= today(), 'The date cannot be in the future'),
});
type FormValues = z.infer<typeof schema>;
const EMPTY = (): FormValues => ({ memberIds: [], provider: '', verifiedAt: today() });

/** #97: people screened before Comp AI (agency, HR provider) count as checked, in one step. */
export function VerifyExternallyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, mutate } = useApiSWR<{ data: MemberCompliance[] }>(open ? '/v1/people-lifecycle/compliance' : null);
  const pending = (Array.isArray(data?.data?.data) ? data.data.data : []).filter((e) => {
    const item = e.items.find((i) => i.key === 'background_check');
    return !e.member.former && item && item.status !== 'complete' && item.status !== 'not_required';
  });
  const [file, setFile] = useState<File | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY() });

  const handleClose = (next: boolean) => {
    if (!next) {
      reset(EMPTY());
      setFile(null);
    }
    onOpenChange(next);
  };

  const handleConfirm = handleSubmit(async (values) => {
    const response = await api.post<{ verified: number; skipped: number }>('/v1/people/background-checks/verified-externally', {
      ...values,
      ...(file && { fileName: file.name, fileType: file.type || 'application/octet-stream', fileData: await fileToBase64(file) }),
    });
    if (response.error || !response.data) {
      toast.error(response.error ?? 'Failed to record the background checks');
      return;
    }
    toast.success(`${response.data.verified} background checks recorded`);
    await mutate();
    handleClose(false);
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Record checks done elsewhere</DialogTitle>
          <DialogDescription>
            For people screened before they joined Comp AI. Each one is marked as checked by the provider on the date
            you enter, with the proof file attached.
          </DialogDescription>
        </DialogHeader>
        <form id="verify-externally-form" onSubmit={handleConfirm} className="flex flex-col gap-3">
          <Controller
            control={control}
            name="memberIds"
            render={({ field }) => (
              <div className="flex max-h-[240px] flex-col gap-2 overflow-y-auto rounded-md border p-3">
                {pending.length === 0 && <Text size="sm" variant="muted">Everyone has a background check.</Text>}
                {pending.map((e) => (
                  <label key={e.member.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={field.value.includes(e.member.id)}
                      onCheckedChange={(checked) =>
                        field.onChange(
                          checked === true ? [...field.value, e.member.id] : field.value.filter((id) => id !== e.member.id),
                        )
                      }
                    />
                    <span className="truncate">{e.member.name || e.member.email}</span>
                  </label>
                ))}
              </div>
            )}
          />
          {errors.memberIds && <span role="alert" className="text-xs text-destructive">{errors.memberIds.message}</span>}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="verify-provider">Screened by</Label>
              <Controller
                control={control}
                name="provider"
                render={({ field: { ref: _ref, ...field } }) => <Input {...field} id="verify-provider" placeholder="Agency or HR provider" />}
              />
              {errors.provider && <span role="alert" className="text-xs text-destructive">{errors.provider.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5 sm:w-[180px]">
              <Label htmlFor="verify-date">Completed on</Label>
              <Controller
                control={control}
                name="verifiedAt"
                render={({ field: { ref: _ref, ...field } }) => <Input {...field} id="verify-date" type="date" max={today()} />}
              />
              {errors.verifiedAt && <span role="alert" className="text-xs text-destructive">{errors.verifiedAt.message}</span>}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="verify-file">Proof (optional)</Label>
            <input id="verify-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button type="submit" form="verify-externally-form" loading={isSubmitting}>
            Record checks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
