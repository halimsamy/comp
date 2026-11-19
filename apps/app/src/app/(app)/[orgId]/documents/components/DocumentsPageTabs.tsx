'use client';

import {
  PageHeader,
  PageLayout,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@trycompai/design-system';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback } from 'react';

interface DocumentsPageTabsProps {
  companyFormsContent: ReactNode;
  settingsContent: ReactNode;
}

const COMPANY_FORMS_TAB = 'overview';
const SETTINGS_TAB = 'settings';
const DEFAULT_TAB = COMPANY_FORMS_TAB;

/** Documents: company forms and settings. The ISMS has its own page (#53). */
export function DocumentsPageTabs({ companyFormsContent, settingsContent }: DocumentsPageTabsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') === SETTINGS_TAB ? SETTINGS_TAB : DEFAULT_TAB;

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === DEFAULT_TAB) {
        params.delete('tab');
      } else {
        params.set('tab', value);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <PageLayout
        header={
          <PageHeader
            title="Documents"
            tabs={
              <TabsList variant="underline">
                <TabsTrigger value={COMPANY_FORMS_TAB}>Overview</TabsTrigger>
                <TabsTrigger value={SETTINGS_TAB}>Settings</TabsTrigger>
              </TabsList>
            }
          />
        }
      >
        <TabsContent value={COMPANY_FORMS_TAB}>{companyFormsContent}</TabsContent>
        <TabsContent value={SETTINGS_TAB}>{settingsContent}</TabsContent>
      </PageLayout>
    </Tabs>
  );
}
