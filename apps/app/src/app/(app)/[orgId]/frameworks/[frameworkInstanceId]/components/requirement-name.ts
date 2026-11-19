/** "A.5.15 Access control" -> "Access control" when the identifier is shown on its own. */
export function stripIdentifier({ name, identifier }: { name: string; identifier?: string | null }): string {
  const id = identifier?.trim();
  if (!id || !name.startsWith(id)) return name;
  const rest = name.slice(id.length).replace(/^[\s:.\-–—]+/, '');
  return rest || name;
}
