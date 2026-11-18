'use client';

import { useRisks } from '@/hooks/use-risks';
import { getRiskLevelFromScore, LEVEL_COLOR, LEVEL_LABEL } from '@/lib/risk-score';
import { Button, Text } from '@trycompai/design-system';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';
import {
  buildHeatmapCounts,
  formatHeatmapCell,
  parseHeatmapCell,
  type HeatmapKind,
} from './heatmap-cells';

// shortcut: one page of 250 (the API max) covers registers up to 250 risks;
// add a server-side counts endpoint if a register grows past that.
const ALL_RISKS = { perPage: 250 } as const;
const AXIS = [1, 2, 3, 4, 5];

const levelAt = (likelihood: number, impact: number) =>
  getRiskLevelFromScore(Math.max(1, Math.ceil((likelihood * impact) / 2.5)));

function Heatmap({
  kind,
  title,
  description,
  counts,
  selected,
  onSelect,
}: {
  kind: HeatmapKind;
  title: string;
  description: string;
  counts: number[][];
  selected: string | null;
  onSelect: (value: string | null) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-background p-4">
      <div className="flex flex-col gap-0.5">
        <Text weight="semibold">{title}</Text>
        <Text size="xs" variant="muted">
          {description}
        </Text>
      </div>
      <div className="flex gap-2">
        <div className="flex w-4 items-center justify-center">
          <span className="-rotate-90 whitespace-nowrap text-[10px] uppercase tracking-wide text-muted-foreground">
            Likelihood
          </span>
        </div>
        <div className="grid flex-1 grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1">
          {[...AXIS].reverse().map((likelihood) => (
            <div key={likelihood} className="contents">
              <span className="flex items-center pr-1 text-[10px] text-muted-foreground">
                {likelihood}
              </span>
              {AXIS.map((impact) => {
                const count = counts[likelihood - 1][impact - 1];
                const level = levelAt(likelihood, impact);
                const value = formatHeatmapCell({ kind, likelihood, impact });
                const isSelected = selected === value;
                return (
                  <button
                    key={impact}
                    type="button"
                    disabled={count === 0}
                    aria-pressed={isSelected}
                    aria-label={`${title}: likelihood ${likelihood}, impact ${impact}, ${LEVEL_LABEL[level]}, ${count} risks`}
                    onClick={() => onSelect(isSelected ? null : value)}
                    className={`flex aspect-[4/3] min-h-8 items-center justify-center rounded-sm text-xs font-semibold tabular-nums transition-shadow enabled:cursor-pointer enabled:hover:ring-2 enabled:hover:ring-ring/40 ${
                      isSelected ? 'ring-2 ring-primary' : ''
                    }`}
                    style={{
                      backgroundColor: `color-mix(in oklab, ${LEVEL_COLOR[level]} ${count > 0 ? 45 : 14}%, transparent)`,
                    }}
                  >
                    {count > 0 ? count : ''}
                  </button>
                );
              })}
            </div>
          ))}
          <span />
          {AXIS.map((impact) => (
            <span key={impact} className="text-center text-[10px] text-muted-foreground">
              {impact}
            </span>
          ))}
        </div>
      </div>
      <span className="text-center text-[10px] uppercase tracking-wide text-muted-foreground">
        Impact
      </span>
    </div>
  );
}

/**
 * Register-level inherent vs residual heatmaps (count per cell). Clicking a
 * cell filters the register below through the `cell` URL param.
 */
export function RiskHeatmaps() {
  const { data } = useRisks({ queryParams: ALL_RISKS });
  const [cell, setCell] = useQueryState('cell', parseAsString);
  const risks = useMemo(() => {
    const list = data?.data?.data;
    return Array.isArray(list) ? list.filter((risk) => risk.status !== 'archived') : [];
  }, [data]);

  const inherent = useMemo(() => buildHeatmapCounts({ risks, kind: 'inherent' }), [risks]);
  const residual = useMemo(() => buildHeatmapCounts({ risks, kind: 'residual' }), [risks]);
  const selected = parseHeatmapCell(cell) ? cell : null;

  const handleSelect = (value: string | null) => {
    void setCell(value);
  };

  if (risks.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Heatmap
          kind="inherent"
          title="Inherent risk"
          description="Before treatment"
          counts={inherent}
          selected={selected}
          onSelect={handleSelect}
        />
        <Heatmap
          kind="residual"
          title="Residual risk"
          description="After treatment"
          counts={residual}
          selected={selected}
          onSelect={handleSelect}
        />
      </div>
      {selected && (
        <div className="flex items-center gap-2">
          <Text size="sm" variant="muted">
            Showing risks in the selected cell.
          </Text>
          <Button size="sm" variant="ghost" onClick={() => handleSelect(null)}>
            Clear cell filter
          </Button>
        </div>
      )}
    </div>
  );
}
