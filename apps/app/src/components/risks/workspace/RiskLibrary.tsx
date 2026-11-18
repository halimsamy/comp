'use client';

import { usePermissions } from '@/hooks/use-permissions';
import {
  useRefreshRiskLists,
  useRiskLibrary,
  useRiskWorkspaceMutations,
  type RiskLibraryTemplate,
} from '@/hooks/use-risk-workspace';
import { getRiskLevelFromScore, getRiskScore, LEVEL_LABEL } from '@/lib/risk-score';
import { Badge, Button, Spinner, Text } from '@trycompai/design-system';
import { Add, CheckmarkFilled } from '@trycompai/design-system/icons';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RiskSuggestionsPanel } from './RiskSuggestionsPanel';

const inherentLabel = (template: Pick<RiskLibraryTemplate, 'likelihood' | 'impact'>) =>
  LEVEL_LABEL[getRiskLevelFromScore(getRiskScore(template.likelihood, template.impact).score)];

/** Groups templates in catalog order. */
function groupTemplates(templates: RiskLibraryTemplate[]) {
  const groups = new Map<string, RiskLibraryTemplate[]>();
  for (const template of templates) {
    groups.set(template.group, [...(groups.get(template.group) ?? []), template]);
  }
  return [...groups.entries()];
}

/**
 * The risk library (payments / PCI scenarios mapped to ISO 27001 Annex A and
 * PCI DSS) plus AI suggestions from the org's vendors, devices and
 * integrations. Adding creates a scored risk with a suggested treatment.
 */
export function RiskLibrary() {
  const { templates, error, isLoading, mutate } = useRiskLibrary();
  const refreshRisks = useRefreshRiskLists();
  const { addRisks } = useRiskWorkspaceMutations();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('risk', 'create');
  const [adding, setAdding] = useState<string | null>(null);
  const groups = useMemo(() => groupTemplates(templates), [templates]);
  const addedCount = templates.filter((template) => template.added).length;

  const handleAdd = async (template: RiskLibraryTemplate) => {
    setAdding(template.id);
    try {
      const result = await addRisks([
        {
          title: template.title,
          description: template.description,
          category: template.category,
          likelihood: template.likelihood,
          impact: template.impact,
          treatmentStrategyDescription: template.treatment,
        },
      ]);
      await Promise.all([mutate(), refreshRisks()]);
      toast.success(result.created.length > 0 ? 'Risk added to the register' : 'Already in the register');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to add the risk');
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {canCreate && <RiskSuggestionsPanel onAdded={() => void Promise.all([mutate(), refreshRisks()])} />}

      <div className="flex flex-col gap-1">
        <Text weight="semibold">Risk library</Text>
        <Text size="sm" variant="muted">
          Common scenarios for payment and fintech companies, with ISO 27001:2022 and PCI DSS
          v4.0.1 references. {templates.length > 0 && `${addedCount} of ${templates.length} in your register.`}
        </Text>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center gap-3">
          <Text variant="muted">Couldn&apos;t load the risk library.</Text>
          <Button size="sm" variant="outline" onClick={() => void mutate()}>
            Retry
          </Button>
        </div>
      ) : isLoading && templates.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        groups.map(([group, items]) => (
          <section key={group} className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-muted-foreground">{group}</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {items.map((template) => (
                <article
                  key={template.id}
                  className="flex flex-col gap-3 rounded-md border border-border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium">{template.title}</span>
                    <Badge variant="outline">Inherent {inherentLabel(template)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{template.description}</p>
                  <p className="text-xs">
                    <span className="font-medium">Treatment: </span>
                    {template.treatment}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {template.references.map((reference) => (
                      <Badge key={reference} variant="secondary" size="sm">
                        {reference}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-auto flex justify-end">
                    {template.added ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckmarkFilled size={14} className="text-primary" />
                        In register
                      </span>
                    ) : (
                      canCreate && (
                        <Button
                          size="sm"
                          variant="outline"
                          iconLeft={<Add size={14} />}
                          loading={adding === template.id}
                          disabled={adding !== null}
                          onClick={() => void handleAdd(template)}
                        >
                          Add to register
                        </Button>
                      )
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
