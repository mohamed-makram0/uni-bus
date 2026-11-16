/**
 * Normalizes Arabic text and numerals so search queries match seamlessly across
 * hamza variants (أ/إ/آ -> ا), ta marbuta (ة -> ه), alef maksura (ى -> ي),
 * Arabic diacritics (tashkeel), and Arabic-Indic numerals (٠-٩ -> 0-9).
 */
export function normalizeArabicText(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  return String(value)
    // Remove diacritics / tashkeel & tatweel
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    // Normalize alef variants
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize ta marbuta and alef maksura
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    // Normalize Arabic-Indic digits (٠-٩) and Extended Arabic-Indic (۰-۹)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Token-based Arabic-aware search matcher across one or more fields.
 * Every whitespace-separated token in the query must appear in at least one field
 * (or across the combined fields string).
 */
export function matchesArabicSearch(
  query: string | undefined | null,
  ...fields: (string | number | undefined | null)[]
): boolean {
  const normalizedQuery = normalizeArabicText(query);
  if (!normalizedQuery) return true;

  const combinedFields = fields.map((f) => normalizeArabicText(f)).join(' ');
  const tokens = normalizedQuery.split(' ').filter(Boolean);

  return tokens.every((token) => combinedFields.includes(token));
}
