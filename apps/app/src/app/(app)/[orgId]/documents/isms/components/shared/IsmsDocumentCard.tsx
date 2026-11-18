import { Badge, HStack, Heading, Progress, Stack, Text } from '@trycompai/design-system';
import { ArrowRight } from '@trycompai/design-system/icons';
import Link from 'next/link';
import type { IsmsDocumentStatus } from '../../isms-types';
import { IsmsStatusBadge } from './IsmsStatusBadge';

export interface IsmsDocumentCardProps {
  /** Destination detail route. */
  href: string;
  /** Clause chip label rendered verbatim, e.g. "Clause 4.1" or "Annex A". */
  clauseLabel: string;
  /** Document title (without the clause prefix). */
  title: string;
  /** One-line description; clamped to a single line. */
  description: string;
  status: IsmsDocumentStatus | null;
  /** Renders the "Needs review" drift indicator alongside the status. */
  isStale?: boolean;
  /** Clause checklist progress; the first missing step is shown as "Next". */
  readiness?: { percent: number; missing: string[] };
}

/**
 * A foundational-document card for the ISMS overview grid. The whole card is a
 * link; the clause chip + status badge use the shared status language, and the
 * arrow appears on hover as the affordance. The surface is a semantic-token
 * layout element (DS Card cannot carry interactive hover/focus state) following
 * the app's established link-card pattern.
 */
export function IsmsDocumentCard({
  href,
  clauseLabel,
  title,
  description,
  status,
  isStale,
  readiness,
}: IsmsDocumentCardProps) {
  const nextStep = readiness?.missing[0];
  return (
    <Link
      href={href}
      className="group/doc-card flex h-full flex-col justify-between gap-4 rounded-md border border-border bg-card p-4 shadow-sm outline-none transition-colors hover:border-foreground/20 hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Stack gap="3">
        <HStack gap="2" align="center" justify="between">
          <Badge variant="outline">{clauseLabel}</Badge>
          <ArrowRight
            size={16}
            className="text-muted-foreground opacity-0 transition-opacity group-hover/doc-card:opacity-100"
          />
        </HStack>
        <Stack gap="1">
          <Heading level="4">{title}</Heading>
          <div className="line-clamp-1">
            <Text size="sm" variant="muted">
              {description}
            </Text>
          </div>
        </Stack>
      </Stack>
      <Stack gap="2">
        {readiness ? (
          <>
            <Progress value={readiness.percent} aria-label={`${title} progress`} />
            <div className="line-clamp-2">
              <Text size="xs" variant="muted">
                {nextStep ? `Next: ${nextStep}` : 'All steps complete'}
              </Text>
            </div>
          </>
        ) : null}
        <IsmsStatusBadge status={status} isStale={isStale} />
      </Stack>
    </Link>
  );
}
