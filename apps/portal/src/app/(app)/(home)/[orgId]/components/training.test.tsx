import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleTrainingAccordionItem } from './tasks/RoleTrainingAccordionItem';
import { YoutubeEmbed } from './video/YoutubeEmbed';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@trycompai/design-system', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { ...actual, AccordionItem: Pass, AccordionTrigger: Pass, AccordionContent: Pass };
});

const video = { id: 'sat-1', title: 'Phishing', description: '', youtubeId: 'abc', url: '', isCompleted: false };

describe('portal training (#64)', () => {
  let onStateChange: ((event: { data: number }) => void) | undefined;

  beforeEach(() => {
    onStateChange = undefined;
    window.YT = {
      Player: class {
        constructor(_el: HTMLIFrameElement, options: { events: { onStateChange: (e: { data: number }) => void } }) {
          onStateChange = options.events.onStateChange;
        }
        destroy() {}
      },
    };
  });

  it('only lets the employee complete a video after it played to the end', async () => {
    const onComplete = vi.fn();
    render(<YoutubeEmbed video={video} isCompleted={false} onComplete={onComplete} allVideosCompleted={false} isMarkingComplete={false} />);
    const button = await screen.findByRole('button', { name: /Watch to the end/ });
    expect(button).toBeDisabled();

    await act(async () => onStateChange?.({ data: 0 }));
    fireEvent.click(screen.getByRole('button', { name: /Mark as Complete/ }));
    expect(onComplete).toHaveBeenCalled();
  });

  it('only lets the employee complete role training after opening its content', () => {
    render(
      <RoleTrainingAccordionItem
        organizationId="org_1"
        onCompleted={vi.fn()}
        modules={[
          {
            id: 'tm_1',
            title: 'Secure coding',
            description: null,
            frameworkReference: 'PCI DSS 6.2.2',
            contentUrl: 'https://example.com/course',
            isCurrent: false,
            completedAt: null,
            expiresAt: null,
          } as never,
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Mark as complete' })).toBeDisabled();
    fireEvent.click(screen.getByRole('link'));
    expect(screen.getByRole('button', { name: 'Mark as complete' })).toBeEnabled();
  });
});
