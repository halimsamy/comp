'use client';

import { RelatedControls } from '@/components/related-controls/RelatedControls';
import type { IsmsDocument } from '../isms-types';

interface IsmsControlMappingsProps {
  document: IsmsDocument;
  canManage: boolean;
}

/** Controls this ISMS document evidences, with the ISO 27001 / PCI DSS codes each covers. */
export function IsmsControlMappings({ document, canManage }: IsmsControlMappingsProps) {
  return (
    <RelatedControls entityType="isms_document" entityId={document.id} readOnly={!canManage} />
  );
}
