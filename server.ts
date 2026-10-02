import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.set('trust proxy', true);

/* ============================ OCR assets ============================
 * Photos and scanned PDFs are read on the learner's own device with Tesseract
 * (open source). The engine and the language data are served from installed
 * npm packages, so nothing has to be downloaded from a third-party CDN.
 */
const NODE_MODULES = path.join(__dirname, 'node_modules');
const OCR_CACHE = { maxAge: '30d', immutable: true };
app.get('/ocr/worker.min.js', (_req, res) =>
  res.sendFile(path.join(NODE_MODULES, 'tesseract.js', 'dist', 'worker.min.js'), OCR_CACHE)
);
app.use('/ocr/core', express.static(path.join(NODE_MODULES, 'tesseract.js-core'), OCR_CACHE));
const OCR_LANGS = new Set(['eng', 'kor', 'jpn', 'chi_sim', 'spa', 'fra', 'deu', 'heb', 'ell', 'grc']);
app.get('/ocr/lang/:file', (req, res) => {
  const m = /^([a-z_]+)\.traineddata\.gz$/.exec(req.params.file);
  if (!m || !OCR_LANGS.has(m[1])) return res.status(404).end();
  const file = path.join(NODE_MODULES, '@tesseract.js-data', m[1], '4.0.0_best_int', `${m[1]}.traineddata.gz`);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.sendFile(file, OCR_CACHE);
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VocaCurve server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
