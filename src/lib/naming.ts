// Dateinamen für Ergebnisse in Out, z. B. "Vertrag_bearbeitet_2026-10-25.pdf".

export function outputName(original: string, suffix = 'bearbeitet', date = new Date()): string {
  const base = original.replace(/\.pdf$/i, '');
  const day = date.toISOString().slice(0, 10);
  return `${base}_${suffix}_${day}.pdf`;
}
