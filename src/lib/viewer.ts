// Anzeige von PDFs mit dem Viewer-Baustein von pdf.js. Er zeigt Formularfelder
// als echte Eingabefelder an und speichert die Eingaben wieder ins PDF – auch bei
// verschlüsselten PDFs. Der Worker wird mit in die Erweiterung gepackt, weil
// Manifest V3 kein Nachladen von Code erlaubt.

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { EventBus, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface OpenedPdf {
  pages: number;
  hasForm: boolean;
}

export class PdfView {
  private readonly viewer: PDFViewer;
  private readonly linkService: PDFLinkService;
  private task: pdfjs.PDFDocumentLoadingTask | null = null;
  private doc: pdfjs.PDFDocumentProxy | null = null;

  /** `container` muss absolut positioniert sein und ein leeres `div.pdfViewer` enthalten. */
  constructor(container: HTMLDivElement) {
    const eventBus = new EventBus();
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
    this.task = pdfjs.getDocument({ data: data.slice() });
    const doc = await this.task.promise;
    this.doc = doc;
    this.viewer.setDocument(doc);
    this.linkService.setDocument(doc);
    const fields = await doc.getFieldObjects();
    return { pages: doc.numPages, hasForm: fields !== null && fields.size > 0 };
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
