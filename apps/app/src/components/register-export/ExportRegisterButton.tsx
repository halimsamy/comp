'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { downloadRegisterCsv, type RegisterExportKey } from '@/lib/evidence-download';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@trycompai/design-system';
import { Download } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';

/** The `<resource>:read` permission each register export needs (mirrors the API). */
export const REGISTER_RESOURCE: Record<RegisterExportKey, string> = {
  risks: 'risk',
  'risk-acceptances': 'risk',
  vendors: 'vendor',
  people: 'member',
  devices: 'member',
  offboarding: 'member',
  findings: 'finding',
  assets: 'integration',
  vulnerabilities: 'integration',
};

export function useRegisterExport() {
  const [exporting, setExporting] = useState<RegisterExportKey | null>(null);

  const handleExport = async (register: RegisterExportKey) => {
    setExporting(register);
    try {
      await downloadRegisterCsv(register);
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  return { exporting, handleExport };
}

type RegisterOption = { register: RegisterExportKey; label: string };

/**
 * "Export CSV" for one or more platform registers. Registers the user cannot
 * read are hidden; one option renders a button, several a menu.
 */
export function ExportRegisterButton({ options }: { options: RegisterOption[] }) {
  const { hasPermission } = usePermissions();
  const { exporting, handleExport } = useRegisterExport();

  const visible = options.filter((o) => hasPermission(REGISTER_RESOURCE[o.register], 'read'));
  if (visible.length === 0) return null;

  if (visible.length === 1) {
    const [only] = visible;
    return (
      <Button
        variant="outline"
        iconLeft={<Download size={16} />}
        loading={exporting !== null}
        onClick={() => handleExport(only.register)}
      >
        Export CSV
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            iconLeft={<Download size={16} />}
            loading={exporting !== null}
          />
        }
      >
        Export CSV
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visible.map((o) => (
          <DropdownMenuItem key={o.register} onClick={() => handleExport(o.register)}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
