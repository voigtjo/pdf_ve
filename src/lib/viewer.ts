// Anzeige von PDFs mit pdf.js. Der Worker wird mit in die Erweiterung gepackt,
// weil Manifest V3 kein Nachladen von Code erlaubt.

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function renderPdf(data: Uint8Array, container: HTMLElement, scale = 1.25): Promise<number> {
  // pdf.js übernimmt den Puffer; eine Kopie lässt das Original für pdf-lib intakt.
  const task = pdfjs.getDocument({ data: data.slice() });
  const doc = await task.promise;
  container.replaceChildren();
  const ratio = window.devicePixelRatio || 1;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.className = 'page';
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    container.append(canvas);
    await page.render({
      canvas,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    }).promise;
  }
  const pages = doc.numPages;
  await task.destroy();
  return pages;
}
