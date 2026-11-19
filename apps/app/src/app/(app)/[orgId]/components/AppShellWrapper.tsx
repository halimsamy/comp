'use client';

import { updateSidebarState } from '@/actions/sidebar';
import Chat from '@/components/ai/chat';
import { CheckoutCompleteDialog } from '@/components/dialogs/checkout-complete-dialog';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { OrganizationSwitcher } from '@/components/organization-switcher';
import { IdleSessionTimeout } from '@/components/session/IdleSessionTimeout';
import { SidebarProvider, useSidebar } from '@/context/sidebar-context';
import { canAccessRoute, type UserPermissions } from '@/lib/permissions';
import type { OrganizationFromMe } from '@/types';
import type { Onboarding, Organization } from '@db';
import {
  AppShell,
  AppShellAIChatTrigger,
  AppShellBody,
  AppShellContent,
  AppShellMain,
  AppShellNavbar,
  AppShellSidebar,
  AppShellSidebarHeader,
  AppShellUserMenu,
  HStack,
  Logo,
  TooltipProvider,
} from '@trycompai/design-system';
import { useAction } from 'next-safe-action/hooks';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminSidebar } from '../admin/components/AdminSidebar';
import { ImpersonationBanner } from '../admin/components/ImpersonationBanner';
import { SecuritySidebar } from '../security/components/SecuritySidebar';
import { SettingsSidebar } from '../settings/components/SettingsSidebar';
import { TrustSidebar } from '../trust/components/TrustSidebar';
import { getAppShellSearchGroups } from './app-shell-search-groups';
import { AppCommandSearch, AppSearchIconButton } from './AppCommandSearch';
import { AppRail, type ShellSection } from './AppRail';
import { AppSidebar } from './AppSidebar';
import { AppUserMenu, MobileDrawerActions } from './AppUserMenu';
import { ConditionalOnboardingTracker } from './ConditionalOnboardingTracker';
import { useNavFeatures } from './use-nav-features';

interface AppShellWrapperProps {
  children: React.ReactNode;
  organization: Organization;
  organizations: OrganizationFromMe[];
  logoUrls: Record<string, string>;
  onboarding: Onboarding | null;
  isCollapsed: boolean;
  isQuestionnaireEnabled: boolean;
  isTrustNdaEnabled: boolean;
  isWebAutomationsEnabled: boolean;
  isSecurityEnabled: boolean;
  hasAuditorRole: boolean;
  isOnlyAuditor: boolean;
  permissions: UserPermissions;
  user: {
    name: string | null;
    email: string;
    image: string | null;
  };
  isAdmin: boolean;
}

type AppShellWrapperContentProps = Omit<AppShellWrapperProps, 'isCollapsed'>;

export function AppShellWrapper({ isCollapsed, ...props }: AppShellWrapperProps) {
  return (
    <SidebarProvider initialIsCollapsed={isCollapsed}>
      <AppShellWrapperContent {...props} />
    </SidebarProvider>
  );
}

function AppShellWrapperContent({
  children,
  organization,
  organizations,
  logoUrls,
  onboarding,
  isQuestionnaireEnabled,
  isTrustNdaEnabled,
  isWebAutomationsEnabled,
  isSecurityEnabled,
  isOnlyAuditor,
  permissions,
  user,
  isAdmin,
}: AppShellWrapperContentProps) {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const previousIsCollapsedRef = useRef(isCollapsed);
  const isSettingsActive = pathname?.startsWith(`/${organization.id}/settings`);
  const isTrustActive = pathname?.startsWith(`/${organization.id}/trust`);
  const isSecurityActive = pathname?.startsWith(`/${organization.id}/security`);
  const isAdminActive = pathname?.startsWith(`/${organization.id}/admin`);
  const sectionTitle: ShellSection = isAdminActive
    ? 'Admin'
    : isSettingsActive
      ? 'Settings'
      : isTrustActive
        ? 'Trust'
        : isSecurityActive
          ? 'Security'
          : 'Compliance';
  const [logoVariant, setLogoVariant] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    if (!resolvedTheme) return;
    setLogoVariant(resolvedTheme === 'light' ? 'dark' : 'light');
  }, [resolvedTheme]);

  // #141: on tablets the secondary sidebar starts collapsed (not persisted) to leave room for content.
  useEffect(() => {
    if (window.matchMedia('(min-width: 768px) and (max-width: 1023.98px)').matches)
      setIsCollapsed(true);
  }, [setIsCollapsed]);

  const { execute } = useAction(updateSidebarState, {
    onError: () => {
      setIsCollapsed(previousIsCollapsedRef.current);
    },
  });

  const handleSidebarOpenChange = useCallback(
    (open: boolean) => {
      const nextIsCollapsed = !open;
      previousIsCollapsedRef.current = isCollapsed;
      setIsCollapsed(nextIsCollapsed);
      execute({ isCollapsed: nextIsCollapsed });
    },
    [execute, isCollapsed, setIsCollapsed],
  );

  const navFeatures = useNavFeatures({
    organizationId: organization.id,
    permissions,
    isQuestionnaireEnabled,
    isTrustNdaEnabled,
    isSecurityEnabled,
  });
  const canSeeSettings = !isOnlyAuditor && canAccessRoute(permissions, 'settings');

  const searchGroups = useMemo(
    () =>
      getAppShellSearchGroups({
        organizationId: organization.id,
        router,
        permissions,
        features: navFeatures,
        isOnlyAuditor,
        showBillingTab: isSecurityEnabled,
        showBrowserTab: isWebAutomationsEnabled,
      }),
    [
      organization.id,
      router,
      permissions,
      navFeatures,
      isOnlyAuditor,
      isSecurityEnabled,
      isWebAutomationsEnabled,
    ],
  );

  return (
    <TooltipProvider>
      <ImpersonationBanner />
      <AppShell
        showAIChat
        aiChatContent={<Chat />}
        sidebarOpen={!isCollapsed}
        onSidebarOpenChange={handleSidebarOpenChange}
      >
        <AppShellNavbar
          startContent={
            <HStack gap="xs" align="center">
              {/* Below sm the wordmark and separator are dropped so Ask AI and the avatar fit at 375px. */}
              <Link href="/" className="hidden sm:inline-flex">
                <Logo style={{ height: 22, width: 'auto' }} variant={logoVariant} />
              </Link>
              <span className="hidden pl-3 pr-1 text-muted-foreground sm:inline">/</span>
              {/* Below sm the switcher is clipped so the avatar stays on screen. */}
              <div className="min-w-0 max-w-[38vw] overflow-hidden sm:max-w-none">
                <OrganizationSwitcher
                  organizations={organizations}
                  organization={organization}
                  logoUrls={logoUrls}
                />
              </div>
            </HStack>
          }
          centerContent={
            <AppCommandSearch organizationId={organization.id} staticGroups={searchGroups} />
          }
          endContent={
            <AppShellUserMenu>
              <AppSearchIconButton />
              <AppShellAIChatTrigger />
              <NotificationBell />
              <AppUserMenu orgId={organization.id} user={user} />
            </AppShellUserMenu>
          }
        />
        <AppShellBody>
          <AppRail
            orgId={organization.id}
            permissions={permissions}
            section={sectionTitle}
            showTrust={isTrustNdaEnabled}
            showSecurity={isSecurityEnabled}
            showSettings={canSeeSettings}
            isAdmin={isAdmin}
          />
          <AppShellMain>
            <AppShellSidebar collapsible>
              <AppShellSidebarHeader title={sectionTitle} />
              {isAdminActive && isAdmin ? (
                <AdminSidebar orgId={organization.id} />
              ) : isSettingsActive ? (
                <SettingsSidebar
                  orgId={organization.id}
                  showBrowserTab={isWebAutomationsEnabled}
                  showBillingTab={isSecurityEnabled}
                  permissions={permissions}
                />
              ) : isTrustActive ? (
                <TrustSidebar orgId={organization.id} />
              ) : isSecurityActive && isSecurityEnabled ? (
                <SecuritySidebar orgId={organization.id} />
              ) : (
                <AppSidebar
                  organizationId={organization.id}
                  permissions={permissions}
                  features={navFeatures}
                />
              )}
              <MobileDrawerActions
                orgId={organization.id}
                user={user}
                showSettings={canSeeSettings}
              />
            </AppShellSidebar>

            <AppShellContent>
              {onboarding?.triggerJobId && <ConditionalOnboardingTracker onboarding={onboarding} />}
              {children}
            </AppShellContent>
          </AppShellMain>

          <Suspense fallback={null}>
            <CheckoutCompleteDialog orgId={organization.id} />
          </Suspense>
          <IdleSessionTimeout />
        </AppShellBody>
      </AppShell>
    </TooltipProvider>
  );
}
