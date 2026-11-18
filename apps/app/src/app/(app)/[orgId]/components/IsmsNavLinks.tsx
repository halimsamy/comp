'use client';

import { AppShellNavItem } from '@trycompai/design-system';
import Link from 'next/link';
import { useIso27001FrameworkId } from '../documents/isms/hooks/useIso27001FrameworkId';

/**
 * ISMS and SoA nav links. Mounted only when the ISMS area is enabled, and shown only
 * when ISO 27001 is active (the same rule the documents/isms layout enforces).
 */
export function IsmsNavLinks({
  organizationId,
  pathname,
  isIsmsTab,
}: {
  organizationId: string;
  pathname: string;
  /** The ISMS tab of the Documents page is open. */
  isIsmsTab: boolean;
}) {
  const isoFrameworkId = useIso27001FrameworkId(organizationId);
  if (!isoFrameworkId) return null;

  const base = `/${organizationId}/documents`;
  const isIsmsActive = isIsmsTab || pathname.startsWith(`${base}/isms`);

  return (
    <>
      <Link href={`${base}?tab=iso-27001`}>
        <AppShellNavItem isActive={isIsmsActive}>ISMS</AppShellNavItem>
      </Link>
      <Link href={`${base}/statement-of-applicability`}>
        <AppShellNavItem isActive={pathname.startsWith(`${base}/statement-of-applicability`)}>
          Statement of Applicability
        </AppShellNavItem>
      </Link>
    </>
  );
}
