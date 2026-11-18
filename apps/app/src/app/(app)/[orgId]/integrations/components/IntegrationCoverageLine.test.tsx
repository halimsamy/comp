import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IntegrationCoverageLine } from './IntegrationCoverageLine';

describe('IntegrationCoverageLine', () => {
  it('shows tasks closed and requirements per framework', () => {
    render(
      <IntegrationCoverageLine
        coverage={{
          providerSlug: 'google-workspace',
          tasks: 4,
          openTasks: 3,
          frameworks: [
            { name: 'ISO 27001', requirements: 11 },
            { name: 'PCI DSS', requirements: 9 },
          ],
        }}
      />,
    );
    expect(screen.getByTestId('integration-coverage')).toHaveTextContent(
      'Closes 4 tasks (3 open) · 11 ISO / 9 PCI requirements',
    );
  });

  it('renders nothing when the integration feeds no task', () => {
    const { container } = render(
      <IntegrationCoverageLine
        coverage={{ providerSlug: 'x', tasks: 0, openTasks: 0, frameworks: [] }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
