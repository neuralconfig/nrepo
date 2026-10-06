/**
 * Normalises tag arguments: `--tag a,b --tag c` and `tag 12 a,b c` both mean
 * three tags. Splits on commas, trims, drops empties and duplicates. Case is
 * left alone; the server decides how tags are stored.
 */
export function splitTags(values: string[] | undefined): string[] {
  if (!values) return [];
  const out: string[] = [];
  for (const v of values) {
    for (const part of v.split(',')) {
      const tag = part.trim();
      if (tag && !out.includes(tag)) out.push(tag);
    }
  }
  return out;
}
