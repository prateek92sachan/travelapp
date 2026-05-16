/**
 * Returns first + last meaningful part of a comma-separated address string.
 * e.g. "123 Main St, Springfield, IL, USA" → "Main St, USA"
 */
export function shortenAddress(str = '') {
  const parts = str
    .split(', ')
    .map((p) => p.replace(/\s+\d+$/, '').trim())
    .filter((p) => p.length > 1 && !/^\d/.test(p));
  if (parts.length <= 2) return str;
  return `${parts[0]}, ${parts[parts.length - 1]}`;
}
