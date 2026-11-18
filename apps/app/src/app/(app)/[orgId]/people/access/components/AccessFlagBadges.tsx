'use client';

import type { AccessFlag } from '@/hooks/use-access-reviews';
import { Badge } from '@trycompai/design-system';
import { FLAG_HINT, FLAG_LABEL } from '../lib/access-labels';

const SEVERE: AccessFlag[] = ['owner_departed', 'unmapped', 'inactive'];

/** Pre-flags on an account, with a hint on hover. */
export function AccessFlagBadges({ flags }: { flags: AccessFlag[] }) {
  if (flags.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span key={flag} title={FLAG_HINT[flag]}>
          <Badge variant={SEVERE.includes(flag) ? 'destructive' : 'outline'}>{FLAG_LABEL[flag]}</Badge>
        </span>
      ))}
    </div>
  );
}
