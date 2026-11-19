'use client';

import type { PortalTrainingModule } from '@/lib/training-modules';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  cn,
} from '@trycompai/design-system';
import { CheckmarkFilled, CircleDash, Launch } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';

interface RoleTrainingAccordionItemProps {
  organizationId: string;
  modules: PortalTrainingModule[];
  onCompleted: (module: PortalTrainingModule) => void;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export function RoleTrainingAccordionItem({
  organizationId,
  modules,
  onCompleted,
}: RoleTrainingAccordionItemProps) {
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  // #64: a module with content can only be marked complete after it was opened.
  const [openedIds, setOpenedIds] = useState<Set<string>>(() => new Set());
  const handleOpen = (id: string) => setOpenedIds((current) => new Set(current).add(id));
  const isCompleted = modules.every((m) => m.isCurrent);

  const handleComplete = async (module: PortalTrainingModule) => {
    setSubmittingId(module.id);
    try {
      const res = await fetch('/api/portal/complete-training-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ moduleId: module.id, organizationId }),
      });
      if (!res.ok) throw new Error('Failed');
      const { data } = (await res.json()) as {
        data: { completedAt: string; expiresAt: string };
      };
      onCompleted({ ...module, ...data, isCurrent: true });
      toast.success(`${module.title} completed`);
    } catch {
      toast.error('Could not record the training. Try again.');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="border rounded-xs">
      <AccordionItem value="role-training">
        <div className="px-4">
          <AccordionTrigger>
            <div className="flex items-center gap-3">
              <div className={isCompleted ? 'text-primary' : 'text-muted-foreground'}>
                {isCompleted ? <CheckmarkFilled size={20} /> : <CircleDash size={20} />}
              </div>
              <span
                className={cn('text-base', isCompleted && 'text-muted-foreground line-through')}
              >
                Complete role-based training
              </span>
            </div>
          </AccordionTrigger>
        </div>
        <AccordionContent>
          <div className="px-4 pb-4 space-y-3">
            <p className="text-muted-foreground text-sm">
              Training assigned to your role. Open each training, complete it, then mark it as
              done. Training expires and is assigned again after its renewal period.
            </p>
            {modules.map((module) => (
              <div
                key={module.id}
                className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{module.title}</span>
                    {module.frameworkReference && (
                      <Badge variant="outline">{module.frameworkReference}</Badge>
                    )}
                  </div>
                  {module.description && (
                    <p className="text-xs text-muted-foreground">{module.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {module.isCurrent && module.expiresAt
                      ? `Completed · renew by ${formatDate(module.expiresAt)}`
                      : module.completedAt
                        ? `Expired · last completed ${formatDate(module.completedAt)}`
                        : 'Not started'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {module.contentUrl && (
                    <a
                      href={module.contentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleOpen(module.id)}
                    >
                      <Button variant="outline" iconRight={<Launch size={16} />}>
                        Open
                      </Button>
                    </a>
                  )}
                  {!module.isCurrent && (
                    <Button
                      onClick={() => handleComplete(module)}
                      loading={submittingId === module.id}
                      disabled={
                        submittingId !== null || (!!module.contentUrl && !openedIds.has(module.id))
                      }
                    >
                      Mark as complete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </div>
  );
}
