import { describe, expect, it, vi } from 'vitest';
import CompanyFormLayout from './layout';

const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ redirect }));

describe('CompanyFormLayout', () => {
  it('sends the penetration test form to Vulnerabilities > Scans', async () => {
    await CompanyFormLayout({ children: null, params: Promise.resolve({ orgId: 'org_1', formType: 'penetration-test' }) });
    expect(redirect).toHaveBeenCalledWith('/org_1/vulnerabilities?tab=scans');
  });

  it('renders every other form', async () => {
    redirect.mockClear();
    const result = await CompanyFormLayout({ children: 'form', params: Promise.resolve({ orgId: 'org_1', formType: 'network-diagram' }) });
    expect(result).toBe('form');
    expect(redirect).not.toHaveBeenCalled();
  });
});
