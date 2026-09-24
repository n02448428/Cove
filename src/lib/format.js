// Shared display formatting utilities.

/**
 * Format an E.164 number for easy reading: "+19045844697" -> "1 904 584 4697".
 * Falls back to the raw input when the pattern is unfamiliar.
 */
export function formatPhone(e164) {
  if (!e164) return '';
  const d = String(e164).replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') {
    return `${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 11)}`;
  }
  if (d.length === 10) {
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 10)}`;
  }
  return e164;
}
