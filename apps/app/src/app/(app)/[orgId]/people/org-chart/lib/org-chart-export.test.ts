import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const raw = vi.fn();
vi.mock('@/lib/api-client', () => ({ api: { raw: (...args: unknown[]) => raw(...args) } }));

import { exportOrgChart } from './org-chart-export';

// jsdom has no image decoding or canvas: load instantly and return a fixed PNG.
class LoadingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe('exportOrgChart', () => {
  const nodes = [{ id: 'a', position: { x: 0, y: 0 }, data: { name: 'Ada', title: 'CEO' } }];
  const date = new Date('2026-11-20T10:00:00.000Z');

  beforeEach(() => {
    vi.stubGlobal('Image', LoadingImage);
    URL.createObjectURL = vi.fn(() => 'blob:chart');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      scale: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AA==');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    raw.mockReset();
  });

  it('asks the API for the house-style PDF with the chart PNG and metadata', async () => {
    raw.mockResolvedValue(new Response(new Blob(['%PDF-']), { status: 200 }));

    await exportOrgChart({ nodes, edges: [], name: 'Acme chart', date, format: 'pdf' });

    expect(raw).toHaveBeenCalledWith('/v1/org-chart/pdf', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(raw.mock.calls[0][1].body);
    expect(body).toEqual({
      name: 'Acme chart',
      asOf: '2026-11-20T10:00:00.000Z',
      peopleCount: 1,
      image: 'data:image/png;base64,AA==',
    });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it('throws when the API rejects the export', async () => {
    raw.mockResolvedValue(new Response('{}', { status: 400 }));

    await expect(
      exportOrgChart({ nodes, edges: [], name: 'Acme chart', date, format: 'pdf' }),
    ).rejects.toThrow('Failed to export org chart PDF');
  });

  it('keeps the PNG export local', async () => {
    await exportOrgChart({ nodes, edges: [], name: 'Acme chart', date, format: 'png' });

    expect(raw).not.toHaveBeenCalled();
  });
});
