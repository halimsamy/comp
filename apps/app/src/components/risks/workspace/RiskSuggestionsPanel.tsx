'use client';

import { useRiskWorkspaceMutations, type RiskSuggestion } from '@/hooks/use-risk-workspace';
import { getRiskLevelFromScore, getRiskScore, LEVEL_LABEL } from '@/lib/risk-score';
import { Badge, Button, Checkbox, Text } from '@trycompai/design-system';
import { MagicWand } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * AI risk suggestions grounded in the org's vendors, devices, integrations and
 * onboarding answers. Nothing is saved until the user adds the ones they pick.
 */
export function RiskSuggestionsPanel({ onAdded }: { onAdded: () => void }) {
  const { suggestRisks, addRisks } = useRiskWorkspaceMutations();
  const [suggestions, setSuggestions] = useState<RiskSuggestion[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSuggest = async () => {
    setLoading(true);
    try {
      const result = await suggestRisks();
      setSuggestions(result);
      setSelected(new Set(result.map((_, index) => index)));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not generate suggestions');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (index: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!suggestions) return;
    const picks = suggestions.filter((_, index) => selected.has(index));
    setSaving(true);
    try {
      const result = await addRisks(
        picks.map(({ source: _source, ...draft }) => draft),
      );
      toast.success(`Added ${result.created.length} risk${result.created.length === 1 ? '' : 's'}`);
      setSuggestions(null);
      setSelected(new Set());
      onAdded();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to add the risks');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-md border border-border bg-background p-4 sm:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-medium">Suggested from your environment</h3>
          <Text size="sm" variant="muted">
            AI reads your vendors, devices, connected integrations and onboarding answers and
            proposes risks your register is missing. Review them before adding.
          </Text>
        </div>
        <div className="shrink-0">
          <Button
            variant="outline"
            iconLeft={<MagicWand size={16} />}
            loading={loading}
            disabled={loading || saving}
            onClick={() => void handleSuggest()}
          >
            {suggestions ? 'Suggest again' : 'Suggest risks'}
          </Button>
        </div>
      </div>

      {suggestions && suggestions.length === 0 && (
        <Text size="sm" variant="muted">
          No new risks found. Your register already covers what the platform knows about.
        </Text>
      )}

      {suggestions && suggestions.length > 0 && (
        <>
          <ul className="flex flex-col divide-y divide-border">
            {suggestions.map((suggestion, index) => (
              <li key={`${suggestion.title}-${index}`} className="flex gap-3 py-3">
                <Checkbox
                  checked={selected.has(index)}
                  onCheckedChange={() => handleToggle(index)}
                  aria-label={`Select ${suggestion.title}`}
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{suggestion.title}</span>
                    <Badge variant="outline">
                      Inherent{' '}
                      {
                        LEVEL_LABEL[
                          getRiskLevelFromScore(getRiskScore(suggestion.likelihood, suggestion.impact).score)
                        ]
                      }
                    </Badge>
                    <Badge variant="secondary" size="sm">
                      {suggestion.source}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{suggestion.description}</p>
                  <p className="text-xs">
                    <span className="font-medium">Treatment: </span>
                    {suggestion.treatmentStrategyDescription}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button
              loading={saving}
              disabled={saving || selected.size === 0}
              onClick={() => void handleAdd()}
            >
              Add {selected.size} to register
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
