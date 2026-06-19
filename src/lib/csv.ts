// Tiny CSV builder + save helper. The renderer assembles the rows and hands
// the text to the main process (window.api.files.exportCsv) which opens a
// save dialog and writes the file.

type Cell = string | number | null | undefined;

function escapeCell(v: Cell): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((r) => r.map(escapeCell).join(',')).join('\r\n');
}

/** Build CSV and prompt to save it. Returns the saved path, or null if cancelled. */
export async function exportCsv(
  defaultName: string,
  headers: string[],
  rows: Cell[][]
): Promise<string | null> {
  const res = await window.api.files.exportCsv(defaultName, toCsv(headers, rows));
  return res.ok ? (res.path ?? null) : null;
}
