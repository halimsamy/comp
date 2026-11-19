import Link from 'next/link';
import { toAnnexCode } from './soa-display';

/** "A.5.1", linking to the requirement page when known. The id lets cards deep-link to the row. */
export function SOAControlCode({
  closure,
  href,
  anchor = false,
}: {
  closure: string;
  href?: string;
  /** Only one view (the desktop table) carries the id, so ids stay unique. */
  anchor?: boolean;
}) {
  const code = toAnnexCode(closure);
  const id = anchor ? code : undefined;
  if (!href) return <span id={id} className="font-mono text-sm">{code || '—'}</span>;
  return (
    <Link id={id} href={href} className="font-mono text-sm text-primary hover:underline">
      {code}
    </Link>
  );
}
