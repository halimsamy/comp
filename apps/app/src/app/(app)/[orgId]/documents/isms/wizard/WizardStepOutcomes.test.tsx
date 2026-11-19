import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import type { WizardFormValues } from './wizard-types';

vi.mock('@trycompai/design-system', () => ({
  Field: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FieldDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  FieldError: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FieldLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Section: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('./WizardObjectivesEditor', () => ({
  WizardObjectivesEditor: () => <div data-testid="objectives-editor" />,
}));
vi.mock('./WizardEditableList', () => ({
  WizardEditableList: () => <div />,
}));

import { WizardStepOutcomes } from './WizardStepOutcomes';

function Harness({ objectiveRowCount }: { objectiveRowCount: number }) {
  const { control } = useForm<WizardFormValues>({
    defaultValues: { objectives: [{ objective: 'Stay certified', target: '100%' }] },
  });
  return (
    <WizardStepOutcomes
      control={control}
      organizationId="org-1"
      objectiveRowCount={objectiveRowCount}
    />
  );
}

describe('WizardStepOutcomes', () => {
  it('keeps objectives editable while the 6.2 register is empty', () => {
    render(<Harness objectiveRowCount={0} />);
    expect(screen.getByTestId('objectives-editor')).toBeInTheDocument();
    expect(screen.queryByText('Edit in 6.2 Objectives →')).not.toBeInTheDocument();
  });

  it('is read-only with a link to 6.2 once the register has rows', () => {
    render(<Harness objectiveRowCount={3} />);
    expect(screen.queryByTestId('objectives-editor')).not.toBeInTheDocument();
    expect(screen.getByText(/Your 3 objectives live in the 6.2 Objectives register/)).toBeInTheDocument();
    expect(screen.getByText('Edit in 6.2 Objectives →')).toHaveAttribute(
      'href',
      '/org-1/documents/isms/objectives',
    );
  });
});
