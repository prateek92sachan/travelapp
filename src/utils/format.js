export function formatCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// Normalize price display to rupees regardless of source ($ from Google
// Places, ₹ from new fetches, or legacy values in saved wishlists).
export function formatPrice(v) {
  if (v == null) return v;
  return String(v).replace(/\$/g, '₹');
}
