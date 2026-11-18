import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IsmsDocument } from '../isms-types';
import { IsmsControlMappings } from './IsmsControlMappings';

const RelatedControls = vi.fn((_props: unknown) => null);
vi.mock('@/components/related-controls/RelatedControls', () => ({
  RelatedControls: (props: unknown) => RelatedControls(props),
}));

const document = { id: 'isms_doc_1' } as IsmsDocument;

describe('IsmsControlMappings', () => {
  it('shows the shared related-controls panel for the document', () => {
    render(<IsmsControlMappings document={document} canManage />);
    expect(RelatedControls).toHaveBeenCalledWith({
      entityType: 'isms_document',
      entityId: 'isms_doc_1',
      readOnly: false,
    });
  });

  it('is read-only for members who cannot manage ISMS documents', () => {
    render(<IsmsControlMappings document={document} canManage={false} />);
    expect(RelatedControls).toHaveBeenLastCalledWith(expect.objectContaining({ readOnly: true }));
  });
});
