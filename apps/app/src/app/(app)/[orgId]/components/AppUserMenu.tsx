'use client';

import { authClient } from '@/utils/auth-client';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Text,
  ThemeSwitcher,
  useAppShell,
} from '@trycompai/design-system';
import { Logout, Search, Settings } from '@trycompai/design-system/icons';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { openAppSearch } from './AppCommandSearch';

interface ShellUser {
  name: string | null;
  email: string;
  image: string | null;
}

function useSignOut() {
  const router = useRouter();
  return async () => {
    await authClient.signOut({ fetchOptions: { onSuccess: () => router.push('/auth') } });
  };
}

/** Navbar avatar menu: identity, settings, theme, log out. */
export function AppUserMenu({ orgId, user }: { orgId: string; user: ShellUser }) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const handleSignOut = useSignOut();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id="app-shell-user-menu-trigger"
        aria-label="Account menu"
        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-muted"
      >
        <Avatar>
          {user.image && <AvatarImage src={user.image} />}
          <AvatarFallback>
            {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        id="app-shell-user-menu-content"
        align="end"
        style={{ minWidth: '200px' }}
      >
        <div className="px-2 py-1.5">
          <Text size="sm" weight="medium">
            {user.name}
          </Text>
          <Text size="xs" variant="muted">
            {user.email}
          </Text>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push(`/${orgId}/settings`)}>
            <Settings size={16} />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between px-2 py-1.5">
          <Text size="sm">Theme</Text>
          <ThemeSwitcher
            size="sm"
            value={(theme ?? 'system') as 'light' | 'dark' | 'system'}
            defaultValue="system"
            onChange={(value) => setTheme(value)}
            showSystem
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <Logout size={16} />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const drawerRow =
  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted';

/** Search and account actions at the bottom of the mobile drawer (hidden on desktop). */
export function MobileDrawerActions({
  orgId,
  user,
  showSettings,
}: {
  orgId: string;
  user: ShellUser;
  showSettings: boolean;
}) {
  const { setMobileDrawerOpen } = useAppShell();
  const handleSignOut = useSignOut();

  const handleSearch = () => {
    setMobileDrawerOpen(false);
    openAppSearch();
  };

  return (
    <div className="mt-2 flex flex-col gap-0.5 border-t border-border pt-2 md:hidden">
      <button type="button" className={drawerRow} onClick={handleSearch}>
        <Search size={16} />
        Search
      </button>
      {showSettings && (
        <Link
          href={`/${orgId}/settings`}
          className={drawerRow}
          onClick={() => setMobileDrawerOpen(false)}
        >
          <Settings size={16} />
          Settings
        </Link>
      )}
      <div className="truncate px-2 pt-2 text-xs text-muted-foreground">{user.email}</div>
      <button type="button" className={drawerRow} onClick={handleSignOut}>
        <Logout size={16} />
        Log out
      </button>
    </div>
  );
}
