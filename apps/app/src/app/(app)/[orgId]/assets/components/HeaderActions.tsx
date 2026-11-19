'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@trycompai/design-system';
import { OverflowMenuHorizontal } from '@trycompai/design-system/icons';
import type { ReactNode } from 'react';

export interface HeaderAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  loading?: boolean;
  /** The main call to action: a filled button at every width. */
  primary?: boolean;
  /** Secondary actions that live in the "…" menu at every width. */
  menuOnly?: boolean;
}

/**
 * Page header actions that never overflow: from `sm` up, secondary actions are
 * outline buttons and `menuOnly` ones sit in a "…" menu; below `sm` everything
 * but the primary action folds into the menu.
 */
export function HeaderActions({ actions }: { actions: HeaderAction[] }) {
  const primary = actions.filter((a) => a.primary);
  const inline = actions.filter((a) => !a.primary && !a.menuOnly);
  const menu = actions.filter((a) => a.menuOnly);
  const renderMenu = (items: HeaderAction[], className: string) =>
    items.length === 0 ? null : (
      <div className={className}>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" aria-label="More actions" />}>
            <OverflowMenuHorizontal size={16} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {items.map((action) => (
              <DropdownMenuItem
                key={action.label}
                disabled={action.loading}
                onClick={action.onClick}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="hidden items-center gap-2 sm:flex">
        {inline.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            iconLeft={action.icon}
            loading={action.loading}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
      </div>
      {renderMenu(menu, 'hidden sm:block')}
      {renderMenu([...inline, ...menu], 'sm:hidden')}
      {primary.map((action) => (
        <Button
          key={action.label}
          iconLeft={action.icon}
          loading={action.loading}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
