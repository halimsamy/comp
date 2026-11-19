import { Text } from '@trycompai/design-system';

/**
 * ISO: the control objective (from the SoA). PCI: the catalog description lists
 * the evidence an assessor expects, so it is shown as "Expected evidence".
 */
export function RequirementIntro({
  isPci,
  description,
  objective,
}: {
  isPci: boolean;
  description: string | null;
  objective: string | null;
}) {
  if (isPci && description) {
    return (
      <div className="rounded-md border bg-muted/30 p-4">
        <Text size="sm" weight="medium">
          Expected evidence
        </Text>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {description
            .split(';')
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => (
              <li key={item}>{item}</li>
            ))}
        </ul>
      </div>
    );
  }
  if (!objective) return null;
  return (
    <div className="rounded-md border bg-muted/30 p-4">
      <Text size="sm" weight="medium">
        Objective
      </Text>
      <Text size="sm">{objective}</Text>
    </div>
  );
}
