/** Pure helpers shared by the overview builders (no DB imports, so specs stay light). */
export const DAY_MS = 24 * 60 * 60 * 1000;

export function personName(
  member: { user: { name: string | null; email: string } } | null,
): string | null {
  if (!member) return null;
  return member.user.name || member.user.email;
}

/** Only the latest-expiring document of each type matters; older ones are superseded. */
export function newestDocuments<
  T extends { type: string; expiresAt: Date | null },
>(documents: T[]): Array<T & { expiresAt: Date }> {
  const newest = new Map<string, T & { expiresAt: Date }>();
  for (const doc of documents) {
    const { expiresAt } = doc;
    if (!expiresAt) continue;
    const current = newest.get(doc.type);
    if (!current || current.expiresAt < expiresAt)
      newest.set(doc.type, { ...doc, expiresAt });
  }
  return [...newest.values()];
}
