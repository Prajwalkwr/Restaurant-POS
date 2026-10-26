export function getOrderItemCustomizations(modifiers: unknown, notes?: string | null): string[] {
  const selectedModifiers = Array.isArray(modifiers)
    ? modifiers.flatMap((modifier): string[] => {
        if (!modifier || typeof modifier !== 'object' || Array.isArray(modifier) || !('name' in modifier)) return [];
        return typeof modifier.name === 'string' && modifier.name.trim()
          ? [`Custom: ${modifier.name.trim()}`]
          : [];
      })
    : [];
  const note = notes?.trim();
  return note ? [...selectedModifiers, `Note: ${note}`] : selectedModifiers;
}
