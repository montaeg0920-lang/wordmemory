/**
 * Reads the text of a PDF in the browser with PDF.js. Pages that are scanned
 * images (no text layer) are rendered and read with on-device OCR instead.
 */
// The legacy build includes fallbacks so it also runs on older phone browsers.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { recognizeText } from './ocr';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PAGES = 30;
const MAX_OCR_PAGES = 10;

interface TextPiece {
  str: string;
  x: number;
  y: number;
  height: number;
}

/** Joins a page's text pieces into lines (same baseline = same line, left to right). */
function piecesToLines(pieces: TextPiece[]): string[] {
  const sorted = pieces.filter(p => p.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextPiece[][] = [];
  for (const p of sorted) {
    const line = lines[lines.length - 1];
    const tolerance = Math.max(2, (line?.[0].height || p.height) * 0.5);
    if (line && Math.abs(line[0].y - p.y) <= tolerance) line.push(p);
    else lines.push([p]);
  }
  return lines.map(line =>
    line
      .sort((a, b) => a.x - b.x)
      .map(p => p.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export interface PdfTextProgress {
  page: number;
  pages: number;
  ocr: boolean;
}

export async function extractPdfText(
  file: File,
  lang: string,
  onProgress?: (p: PdfTextProgress) => void
): Promise<string> {
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    const pages = Math.min(doc.numPages, MAX_PAGES);
    const out: string[] = [];
    let ocrPages = 0;
    for (let n = 1; n <= pages; n++) {
      onProgress?.({ page: n, pages, ocr: false });
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const pieces: TextPiece[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        pieces.push({ str: item.str, x: item.transform[4], y: item.transform[5], height: item.height || 10 });
      }
      let text = piecesToLines(pieces).join('\n');

      // Scanned page: no (or almost no) text layer -> read the rendered page with OCR.
      if (text.replace(/\s/g, '').length < 10 && ocrPages < MAX_OCR_PAGES) {
        ocrPages++;
        onProgress?.({ page: n, pages, ocr: true });
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          text = await recognizeText(canvas, lang);
        }
      }
      page.cleanup();
      out.push(text);
    }
    return out.join('\n');
  } finally {
    await task.destroy();
  }
}
