// Anzeige von PDFs mit dem Viewer-Baustein von pdf.js. Er zeigt Formularfelder
// als echte Eingabefelder an und speichert die Eingaben wieder ins PDF – auch bei
// verschlüsselten PDFs. Der Worker wird mit in die Erweiterung gepackt, weil
// Manifest V3 kein Nachladen von Code erlaubt.

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { EventBus, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Liegen beim Bauen unter dist/pdfjs/ (siehe vite.config.ts).
const assets = (dir: string) => chrome.runtime.getURL(`pdfjs/${dir}/`);

export interface OpenedPdf {
  pages: number;
  hasForm: boolean;
}

export class PdfView {
  private readonly viewer: PDFViewer;
  private readonly linkService: PDFLinkService;
  private task: pdfjs.PDFDocumentLoadingTask | null = null;
  private doc: pdfjs.PDFDocumentProxy | null = null;
  private readonly eventBus: EventBus;
  /** Wird aufgerufen, sobald ein Formularfeld geändert wird. */
  onFormChange: (() => void) | null = null;

  /** `container` muss absolut positioniert sein und ein leeres `div.pdfViewer` enthalten. */
  constructor(container: HTMLDivElement) {
    const eventBus = new EventBus();
    this.eventBus = eventBus;
    this.linkService = new PDFLinkService({ eventBus });
    this.viewer = new PDFViewer({
      container,
      eventBus,
      linkService: this.linkService,
      annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS,
    });
    this.linkService.setViewer(this.viewer);
    eventBus.on('pagesinit', () => {
      this.viewer.currentScaleValue = 'page-width';
    });
  }

  async open(data: Uint8Array): Promise<OpenedPdf> {
    await this.close();
    // pdf.js übernimmt den Puffer; eine Kopie lässt das Original intakt.
    this.task = pdfjs.getDocument({
      data: data.slice(),
      wasmUrl: assets('wasm'),
      cMapUrl: assets('cmaps'),
      standardFontDataUrl: assets('standard_fonts'),
      iccUrl: assets('iccs'),
    });
    const doc = await this.task.promise;
    this.doc = doc;
    // Typen von pdf.js deklarieren das Feld nur als null; zur Laufzeit ist es ein Callback.
    (doc.annotationStorage as unknown as { onSetModified: () => void }).onSetModified = () => this.onFormChange?.();
    const ready = new Promise<void>((resolve) => this.eventBus.on('pagesinit', () => resolve(), { once: true }));
    this.viewer.setDocument(doc);
    this.linkService.setDocument(doc);
    await ready;
    const fields = await doc.getFieldObjects();
    return { pages: doc.numPages, hasForm: fields !== null && fields.size > 0 };
  }

  get pageCount(): number {
    return this.doc?.numPages ?? 0;
  }

  /** Aktuell sichtbare Seite (1-basiert). */
  get currentPage(): number {
    return this.viewer.currentPageNumber;
  }

  set currentPage(n: number) {
    if (n >= 1 && n <= this.pageCount) this.viewer.currentPageNumber = n;
  }

  /** Zeichnet eine verkleinerte Seite (1-basiert) in `canvas`, `width` in CSS-Pixeln. */
  async renderThumbnail(n: number, canvas: HTMLCanvasElement, width: number): Promise<void> {
    if (!this.doc) return;
    const page = await this.doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const ratio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: (width / base.width) * ratio });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
    canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
    await page.render({ canvas, viewport }).promise;
  }

  /** true, sobald im angezeigten PDF ein Formularfeld geändert wurde. */
  get modified(): boolean {
    return (this.doc?.annotationStorage.size ?? 0) > 0;
  }

  /** Das PDF samt Formulareingaben als neue Datei. */
  async save(): Promise<Uint8Array> {
    if (!this.doc) throw new Error('Kein PDF geöffnet');
    return this.doc.saveDocument();
  }

  async close(): Promise<void> {
    this.viewer.setDocument(null as unknown as pdfjs.PDFDocumentProxy);
    this.linkService.setDocument(null);
    this.doc = null;
    await this.task?.destroy();
    this.task = null;
  }
}
