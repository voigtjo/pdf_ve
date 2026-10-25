// Seitenbearbeitung mit pdf-lib (Fork @cantoo/pdf-lib, der auch verschlüsselte
// PDFs entschlüsseln kann). Jede Funktion nimmt die PDF-Bytes und liefert neue
// Bytes zurück; das Original bleibt unverändert, was ein einfaches Rückgängig erlaubt.

import { degrees, PDFDict, PDFDocument, PDFName, PDFRef, type PDFPage } from '@cantoo/pdf-lib';

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  // Leeres Passwort öffnet PDFs, die nur ein Besitzerpasswort haben (z. B. Bankformulare).
  return PDFDocument.load(bytes, { password: '' });
}

async function edit(bytes: Uint8Array, change: (doc: PDFDocument) => void | Promise<void>): Promise<Uint8Array> {
  const doc = await load(bytes);
  await change(doc);
  return doc.save();
}

/** Löscht die Seite `index` (0-basiert). */
export function deletePage(bytes: Uint8Array, index: number): Promise<Uint8Array> {
  return edit(bytes, (doc) => {
    if (doc.getPageCount() <= 1) throw new Error('Die letzte Seite kann nicht gelöscht werden.');
    doc.removePage(index);
  });
}

/** Dreht die Seite `index` um 90° im Uhrzeigersinn. */
export function rotatePage(bytes: Uint8Array, index: number): Promise<Uint8Array> {
  return edit(bytes, (doc) => {
    const page = doc.getPage(index);
    page.setRotation(degrees((page.getRotation().angle + 90) % 360));
  });
}

/** Verschiebt die Seite von `from` nach `to` (beides 0-basiert, `to` bezogen auf das Ergebnis). */
export function movePage(bytes: Uint8Array, from: number, to: number): Promise<Uint8Array> {
  return edit(bytes, (doc) => {
    if (from === to) return;
    // Nicht removePage + insertPage: removePage löscht das Seitenobjekt, und die
    // wieder eingefügte Seite zeigte dann ins Leere. Stattdessen nur den Eintrag
    // im Seitenbaum umhängen; Formularfelder bleiben so mit der Seite verbunden.
    const page = doc.getPage(from);
    doc.catalog.removeLeafNode(from);
    page.node.setParent(doc.catalog.insertLeafNode(page.ref, to));
  });
}

/** Fügt nach `after` eine leere Seite im Format der Nachbarseite ein (`after` = -1: ganz vorne). */
export function insertBlankPage(bytes: Uint8Array, after: number): Promise<Uint8Array> {
  return edit(bytes, (doc) => {
    const ref = doc.getPage(Math.max(0, after));
    const { width, height } = ref.getSize();
    doc.insertPage(after + 1, [width, height]);
  });
}

/** Fügt alle Seiten eines anderen PDFs nach `after` ein (`after` = -1: ganz vorne). */
export function insertPdf(bytes: Uint8Array, after: number, other: Uint8Array): Promise<Uint8Array> {
  return edit(bytes, async (doc) => {
    const src = await load(other);
    const pages = await doc.copyPages(src, src.getPageIndices());
    pages.forEach((page, i) => doc.insertPage(after + 1 + i, page));
    registerFormFields(doc, pages);
  });
}

/**
 * copyPages übernimmt die Felder eines Formulars nur als Seitenanmerkungen.
 * Damit sie ausfüllbar bleiben, müssen sie im Formular (AcroForm) des Ziels stehen.
 */
function registerFormFields(doc: PDFDocument, pages: PDFPage[]): void {
  const widget = PDFName.of('Widget');
  const known = new Set<PDFRef>();
  let acroForm: ReturnType<PDFDocument['getForm']>['acroForm'] | null = null;
  for (const page of pages) {
    const annots = page.node.Annots();
    for (let i = 0; i < (annots?.size() ?? 0); i++) {
      const item = annots!.get(i);
      if (!(item instanceof PDFRef)) continue;
      let ref: PDFRef = item;
      let dict = doc.context.lookup(ref, PDFDict);
      if (dict.get(PDFName.of('Subtype')) !== widget) continue;
      // Zum obersten Feld hochgehen (Gruppen wie Radio-Buttons haben ein gemeinsames Elternfeld).
      for (let parent = dict.get(PDFName.of('Parent')); parent instanceof PDFRef; parent = dict.get(PDFName.of('Parent'))) {
        ref = parent;
        dict = doc.context.lookup(parent, PDFDict);
      }
      if (known.has(ref)) continue;
      known.add(ref);
      acroForm ??= doc.getForm().acroForm;
      acroForm.addField(ref);
    }
  }
}
