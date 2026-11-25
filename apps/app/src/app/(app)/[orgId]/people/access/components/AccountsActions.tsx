'use client';

import type { AccessSystem } from '@/hooks/use-access-reviews';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  HStack,
} from '@trycompai/design-system';
import { Add, Download, OverflowMenuVertical, TrashCan, Upload } from '@trycompai/design-system/icons';
import { useAccessExports } from './useAccessExports';

/** One primary action and everything else in a menu, like the People header. */
export function AccountsActions({
  systems,
  isManual,
  canUpdate,
  canExportSystem,
  onAddAccount,
  onAddSystem,
  onImport,
  onExportSystem,
  onDeleteSystem,
}: {
  systems: AccessSystem[];
  isManual: boolean;
  canUpdate: boolean;
  canExportSystem: boolean;
  onAddAccount: () => void;
  onAddSystem: () => void;
  onImport: () => void;
  onExportSystem: () => void;
  onDeleteSystem: () => void;
}) {
  const { busy, handleExportAll, handleExportPrivileged } = useAccessExports(systems);
  const addAccount = canUpdate && isManual;

  return (
    <HStack gap="2">
      {canUpdate && (
        <div>
          <Button iconLeft={<Add size={16} />} onClick={addAccount ? onAddAccount : onAddSystem}>
            {addAccount ? 'Add account' : 'Add system'}
          </Button>
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}>
          <OverflowMenuVertical size={16} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {addAccount && (
            <>
              <DropdownMenuItem onClick={onImport}>
                <Upload size={14} />
                Import accounts (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAddSystem}>
                <Add size={14} />
                Add system
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={onExportSystem} disabled={!canExportSystem}>
            <Download size={14} />
            Export this system (CSV)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleExportAll()} disabled={systems.length === 0 || busy !== null}>
            <Download size={14} />
            Export all systems (CSV)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleExportPrivileged()} disabled={busy !== null}>
            <Download size={14} />
            Export privileged users (CSV)
          </DropdownMenuItem>
          {addAccount && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDeleteSystem}>
                <TrashCan size={14} />
                Delete system
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </HStack>
  );
}
