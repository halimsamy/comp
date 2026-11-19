/** The statement an employee ticks before accepting a policy (stored on the acknowledgement). */
export function policyAttestationText({
  policyName,
  version,
}: {
  policyName: string;
  version?: number | null;
}): string {
  const label = version ? `${policyName} (version ${version})` : policyName;
  return `I have read and understood ${label} and I agree to comply with it.`;
}
