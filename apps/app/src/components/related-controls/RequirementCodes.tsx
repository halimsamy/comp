import type { FrameworkRequirements } from '@/hooks/use-controls-overview';

/** "PCI DSS Level 1" → "PCI DSS": the level is the org's, not the requirement's. */
export function shortFrameworkName(name: string): string {
  return name.replace(/\s+Level\s+\d+$/i, '');
}

/** Flatten to "ISO 27001 · A.5.15" style chips, framework by framework. */
export function requirementChips(frameworks: FrameworkRequirements[]) {
  return frameworks.flatMap((f) =>
    f.requirements.map((r) => ({
      key: `${f.frameworkInstanceId}:${r.identifier}`,
      label: `${shortFrameworkName(f.frameworkName)} · ${r.identifier}`,
      title: `${f.frameworkName} ${r.identifier}: ${r.name}`,
    })),
  );
}

/**
 * Requirement-code chips (Vanta-style "SOC 2 · CC 6.5 +2") for a control's
 * mappings across ISO 27001, PCI DSS and any other framework.
 */
export function RequirementCodes({
  frameworks,
  max = 3,
}: {
  frameworks: FrameworkRequirements[];
  max?: number;
}) {
  const chips = requirementChips(frameworks);
  if (chips.length === 0) {
    return <span className="text-muted-foreground text-sm">Not mapped</span>;
  }
  const shown = chips.slice(0, max);
  const hidden = chips.slice(max);
  return (
    <div className="flex min-w-[10rem] flex-wrap items-center gap-1 whitespace-normal">
      {shown.map((chip) => (
        <span
          key={chip.key}
          title={chip.title}
          className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs whitespace-nowrap"
        >
          {chip.label}
        </span>
      ))}
      {hidden.length > 0 && (
        <span
          className="text-muted-foreground text-xs"
          title={hidden.map((chip) => chip.label).join(', ')}
        >
          +{hidden.length}
        </span>
      )}
    </div>
  );
}
