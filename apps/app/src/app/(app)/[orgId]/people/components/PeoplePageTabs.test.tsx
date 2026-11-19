import {
  ADMIN_PERMISSIONS,
  EMPLOYEE_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExport = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/org_1/people',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('@/components/register-export/ExportRegisterButton', () => ({
  useRegisterExport: () => ({ exporting: null, handleExport: mockExport }),
}));
vi.mock('../all/components/InviteMembersModal', () => ({ InviteMembersModal: () => null }));
vi.mock('@trycompai/design-system/icons', () => ({
  Add: () => null,
  Download: () => null,
  OverflowMenuVertical: () => null,
}));
vi.mock('@trycompai/design-system', () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Button: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
    DropdownMenu: passthrough,
    DropdownMenuContent: passthrough,
    DropdownMenuTrigger: passthrough,
    DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
      <div role="menuitem" onClick={onClick}>
        {children}
      </div>
    ),
    HStack: passthrough,
    PageHeader: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
    PageLayout: ({ header, children }: { header?: ReactNode; children?: ReactNode }) => (
      <div>
        {header}
        {children}
      </div>
    ),
    Tabs: passthrough,
    TabsContent: passthrough,
    TabsList: passthrough,
    TabsTrigger: passthrough,
  };
});

import { PeoplePageTabs } from './PeoplePageTabs';

function renderTabs() {
  render(
    <PeoplePageTabs
      peopleContent={null}
      devicesContent={null}
      orgChartContent={null}
      roleMappingContent={null}
      showRoleMapping={false}
      settingsContent={null}
      showSettings={false}
      canInviteUsers
      canManageMembers
      allowedBuiltInRoles={[]}
      organizationId="org_1"
    />,
  );
}

const items = () => screen.queryAllByRole('menuitem').map((i) => i.textContent);

describe('PeoplePageTabs register exports', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers people and device CSVs and one offboarding evidence export to members readers (#85)', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    renderTabs();

    expect(items()).toEqual([
      'Export offboarding evidence',
      'Export people (CSV)',
      'Export devices (CSV)',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export devices (CSV)' }));
    expect(mockExport).toHaveBeenCalledWith('devices');
  });

  it('hides every export without member read access', () => {
    setMockPermissions(EMPLOYEE_PERMISSIONS);
    renderTabs();

    expect(items()).toEqual([]);
  });
});
