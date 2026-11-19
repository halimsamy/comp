'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import { Badge, Button, Input, Stack, Text } from '@trycompai/design-system';
import { Close, Email } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email();

/**
 * Invite an auditor by email without leaving the audit (#109): sends an
 * organization invitation with the Auditor role and remembers the email, so
 * the auditor is assigned to this audit when they first sign in. Their access
 * ends with the audit's access end date.
 */
export function InviteAuditorField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (emails: string[]) => void;
}) {
  const { hasPermission } = usePermissions();
  const [email, setEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const canInvite = hasPermission('member', 'create');

  const handleInvite = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error('Enter a valid email address');
      return;
    }
    setIsInviting(true);
    try {
      const { data, error } = await api.post<{
        results: Array<{ email: string; success: boolean; error?: string }>;
      }>('/v1/people/invite', { invites: [{ email: parsed.data, roles: ['auditor'] }] });
      const result = data?.results?.[0];
      if (error || !result?.success) {
        throw new Error(result?.error ?? error ?? 'Could not send the invitation');
      }
      onChange([...new Set([...value, parsed.data])]);
      setEmail('');
      toast.success(`Invitation sent to ${parsed.data}. Save the audit to assign them.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not send the invitation');
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <Stack gap="2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((pending) => (
            <span key={pending} className="inline-flex items-center gap-1">
              <Badge variant="outline">{pending} · invited</Badge>
              <button
                type="button"
                aria-label={`Remove ${pending}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onChange(value.filter((item) => item !== pending))}
              >
                <Close size={14} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {canInvite ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1">
            <Input
              type="email"
              aria-label="Auditor email"
              placeholder="auditor@firm.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                void handleInvite();
              }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            iconLeft={<Email size={16} />}
            loading={isInviting}
            onClick={() => void handleInvite()}
          >
            Invite auditor
          </Button>
        </div>
      ) : (
        <Text size="xs" variant="muted">
          Ask an admin to invite auditors who are not in Comp AI yet.
        </Text>
      )}
    </Stack>
  );
}
