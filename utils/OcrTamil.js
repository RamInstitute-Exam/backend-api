import { createWorker } from 'tesseract.js';
import { fromPath } from 'pdf2pic';

export async function extractTamilOCR(pdfPath) {
  const convert = fromPath(pdfPath, { density: 200, saveFilename: 'ocr_img', format: 'png', savePath: './tmp' });
  const pages = await convert.bulk(-1, false);

  const worker = await createWorker('tam+eng'); // Use Tamil + English for better recognition
  let tamilText = '';

  for (const page of pages) {
    const { data: { text } } = await worker.recognize(page.path);
    tamilText += text + '\n';
  }

  await worker.terminate();
  return tamilText;
}