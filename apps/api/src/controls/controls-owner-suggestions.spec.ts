jest.mock('@db', () => ({ db: {} }));

import { pickRoleHolder, type RoleHolder } from './controls-owner-suggestions';

const holders: RoleHolder[] = [
  { roleKey: 'top_management', roleName: 'Top Management', memberId: 'm_ceo', memberName: 'CEO' },
  { roleKey: 'spo', roleName: 'Security & Privacy Owner (SPO)', memberId: 'm_spo', memberName: 'SPO' },
  { roleKey: 'deputy_spo', roleName: 'Deputy SPO', memberId: 'm_dep', memberName: 'Deputy' },
  { roleKey: 'pci_executive_owner', roleName: 'PCI DSS Executive Owner', memberId: 'm_pci', memberName: 'Exec' },
  { roleKey: null, roleName: 'HR Lead', memberId: 'm_hr', memberName: 'HR' },
];
const pick = (frameworkName: string, code: string, list = holders) =>
  pickRoleHolder({ frameworkName, code, holders: list })?.memberId;

describe('pickRoleHolder', () => {
  it('maps ISO Annex A themes to ISMS roles', () => {
    expect(pick('ISO 27001', 'A.5.15')).toBe('m_spo');
    expect(pick('ISO 27001', 'A.6.1')).toBe('m_hr');
    expect(pick('ISO 27001', 'A.7.4')).toBe('m_spo');
    expect(pick('ISO 27001', 'A.8.8')).toBe('m_dep');
    expect(pick('ISO 27001', '5.1')).toBe('m_ceo');
    expect(pick('ISO 27001', '9.2')).toBe('m_spo');
  });

  it('maps PCI requirement 12 to the PCI executive owner', () => {
    expect(pick('PCI DSS Level 1', '12.4.1')).toBe('m_pci');
    expect(pick('PCI DSS Level 1', '1.2.1')).toBe('m_dep');
  });

  it('falls back down the chain when a role has no holder', () => {
    const noHr = holders.filter((h) => h.memberId !== 'm_hr');
    expect(pick('ISO 27001', 'A.6.1', noHr)).toBe('m_ceo');
    expect(pick('ISO 27001', 'A.6.1', [])).toBeUndefined();
  });
});
