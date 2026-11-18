import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@trycompai/design-system', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
  Label: ({ children, ...props }: ComponentProps<'label'>) => <label {...props}>{children}</label>,
}));

import { FrameworkExportDialog } from './FrameworkExportDialog';

describe('FrameworkExportDialog', () => {
  const onExport = vi.fn();
  const onOpenChange = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  function renderDialog() {
    render(
      <FrameworkExportDialog
        open
        onOpenChange={onOpenChange}
        frameworkName="ISO 27001"
        onExport={onExport}
      />,
    );
  }

  it('lists what the ZIP holds and exports everything by default', async () => {
    renderDialog();

    expect(screen.getByText('Export ISO 27001 evidence')).toBeInTheDocument();
    expect(screen.getByText(/Statement of Applicability/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export ZIP' }));

    await waitFor(() => expect(onExport).toHaveBeenCalledWith({ from: '', to: '' }));
  });

  it('passes the chosen audit period', async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export ZIP' }));

    await waitFor(() =>
      expect(onExport).toHaveBeenCalledWith({ from: '2026-01-01', to: '2026-12-31' }),
    );
  });

  it('rejects a period that ends before it starts', async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export ZIP' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('start before it ends');
    expect(onExport).not.toHaveBeenCalled();
  });

  it('closes on cancel', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
