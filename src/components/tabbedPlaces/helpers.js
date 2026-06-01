import { shortenAddress } from '../../utils/shortenAddress';

export const shortListName = shortenAddress;

// City-segment match: ghost may carry a full formatted address ("Cairo,
// Cairo Governorate, Egypt") while saved list destinations may be just the
// locality ("Cairo"). Strip to first comma-segment + lowercase so both sides
// align on the city token.
export function cityKey(s) {
  return (s || '').split(',')[0].trim().toLowerCase();
}

// City chip label = city (first address segment) on row 1, country on row 2.
// Country comes from the stored `list.country`; falls back to the trailing
// segment of a formatted-address destination for lists created before we
// tracked it. Keeps the chip compact instead of one long address line.
export function cityCountryLabel(name, destination, country) {
  const city = shortListName(((name || destination || '').split(',')[0] || '').trim());
  let land = country || '';
  if (!land) {
    const parts = (destination || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) land = parts[parts.length - 1];
  }
  return { city, country: land };
}
