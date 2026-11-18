/**
 * Catalog merges: a template that was folded into another one. Integration
 * checks still name the old template in `taskMapping`, so their results must
 * also feed the task created from the successor template.
 */
const TASK_TEMPLATE_SUCCESSORS: Readonly<Record<string, readonly string[]>> = {
  // Monitoring & Alerting → Detection & Log Review Evidence Pack (ISO/PCI)
  frk_tt_68406af04a4acb93083413b9: ['frk_tt_d04535046e66e84d10b92068'],
  // Production Firewall & No-Public-Access Controls → NSC Rule-set Review
  frk_tt_68fa2a852e70f757188f0c39: ['frk_tt_9d21cfa9d3ba3a694587c610'],
};

/** Every task template a check's `taskMapping` feeds: itself plus successors. */
export function templatesForMapping(mapping: string): string[] {
  return [mapping, ...(TASK_TEMPLATE_SUCCESSORS[mapping] ?? [])];
}

/** True when a check mapped to `mapping` applies to a task of `templateId`. */
export function mappingAppliesTo({
  mapping,
  templateId,
}: {
  mapping: string | null | undefined;
  templateId: string | null | undefined;
}): boolean {
  if (!mapping || !templateId) return false;
  return templatesForMapping(mapping).includes(templateId);
}
