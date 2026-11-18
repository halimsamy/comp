'use client';

import { useAuditComments } from '@/hooks/use-audits';
import { Button, Stack, Text, Textarea } from '@trycompai/design-system';
import { formatDistanceToNowStrict } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';

/** Q&A between the team and the auditors on one requirement. */
export function AuditCommentsThread({
  auditId,
  requirementId,
}: {
  auditId: string;
  requirementId: string;
}) {
  const { comments, isLoading, error, add } = useAuditComments({ auditId, requirementId });
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!draft.trim()) return;
    setIsSending(true);
    try {
      await add(draft.trim());
      setDraft('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post the comment');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Stack gap="3">
      {error ? (
        <Text size="sm" variant="destructive">
          Could not load comments.
        </Text>
      ) : isLoading ? (
        <Text size="sm" variant="muted">
          Loading comments…
        </Text>
      ) : comments.length === 0 ? (
        <Text size="sm" variant="muted">
          No comments yet. Ask or answer a question about this requirement's evidence.
        </Text>
      ) : (
        comments.map((comment) => (
          <div key={comment.id} className="rounded-md border border-border p-3">
            <Text size="xs" variant="muted">
              {comment.author?.name || comment.author?.email || 'Former member'} ·{' '}
              {formatDistanceToNowStrict(new Date(comment.createdAt), { addSuffix: true })}
            </Text>
            <div className="whitespace-pre-wrap break-words">
              <Text size="sm">{comment.content}</Text>
            </div>
          </div>
        ))
      )}
      <Textarea
        aria-label="New comment"
        placeholder="Write a comment"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={4000}
      />
      <div className="flex justify-end">
        <Button size="sm" loading={isSending} disabled={!draft.trim()} onClick={() => void handleSend()}>
          Comment
        </Button>
      </div>
    </Stack>
  );
}
