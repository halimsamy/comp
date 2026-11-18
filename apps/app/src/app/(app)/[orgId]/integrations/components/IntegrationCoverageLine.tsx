import type { IntegrationCoverage } from '@/hooks/use-overview';

/** "ISO 27001" -> "ISO", "PCI DSS Level 1" -> "PCI": short labels for the card line. */
function shortFrameworkName(name: string): string {
  const match = name.match(/^(ISO|PCI|SOC|HIPAA|GDPR|NIST|NEN|CCPA)/i);
  return match ? match[1].toUpperCase() : name;
}

/**
 * Vanta-style forecast on an integration card: "Closes 3 tasks · 11 ISO / 9 PCI
 * requirements". Renders nothing when the integration feeds no org task.
 */
export function IntegrationCoverageLine({ coverage }: { coverage?: IntegrationCoverage }) {
  if (!coverage || coverage.tasks === 0) return null;
  const taskLabel = `${coverage.tasks} ${coverage.tasks === 1 ? 'task' : 'tasks'}`;
  const requirements = coverage.frameworks
    .map((f) => `${f.requirements} ${shortFrameworkName(f.name)}`)
    .join(' / ');
  const openNote = coverage.openTasks > 0 ? ` (${coverage.openTasks} open)` : '';

  return (
    <p className="text-xs text-muted-foreground" data-testid="integration-coverage">
      <span className="font-medium text-foreground">Closes {taskLabel}</span>
      {openNote}
      {requirements && ` · ${requirements} requirements`}
    </p>
  );
}
