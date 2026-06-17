// Test harness: appelle directement les handlers serverless api/ocr.js et api/extract.js
// sur le jeu de données data-synth/ocr_test_data, et compare au ground truth.

const fs = require('fs');
const path = require('path');

// Charge .env (clé Mistral)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const ocrHandler = require('../api/ocr.js');
const extractHandler = require('../api/extract.js');

const DATA_DIR = path.join(__dirname, '..', '..', 'data-synth', 'dataset');
const annotations = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'annotations_ocr.json'), 'utf8'))
  .filter(a => a.type === 'rib' || a.type === 'justif_domicile');

function mockReqRes(body) {
  const req = { method: 'POST', body };
  let result = null;
  let statusCode = 200;
  const res = {
    status(code) { statusCode = code; return this; },
    json(obj) { result = obj; }
  };
  return { req, res, get: () => ({ statusCode, body: result }) };
}

async function callOcr(fileBase64, mimeType) {
  const { req, res, get } = mockReqRes({ fileBase64, mimeType });
  await ocrHandler(req, res);
  return get();
}

async function callExtract(ocrText, docType) {
  const { req, res, get } = mockReqRes({ ocrText, docType });
  await extractHandler(req, res);
  return get();
}

function fileToDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  const b64 = fs.readFileSync(filePath).toString('base64');
  return { dataUrl: `data:${mime};base64,${b64}`, mime };
}

async function main() {
  const onlyArg = process.argv[2]; // optional filter, ex: "rib"
  const items = annotations.filter(a => !onlyArg || a.file.startsWith(onlyArg));

  const results = [];
  for (const item of items) {
    const filePath = path.join(DATA_DIR, item.file);
    console.log(`\n=== ${item.file} (type attendu: ${item.type}, difficulté: ${item.difficulty}) ===`);

    const { dataUrl, mime } = fileToDataUrl(filePath);

    const ocrRes = await callOcr(dataUrl, mime);
    if (ocrRes.statusCode !== 200) {
      console.log('  OCR ERROR:', ocrRes.statusCode, JSON.stringify(ocrRes.body).slice(0, 500));
      results.push({ file: item.file, ocrOk: false, error: ocrRes.body });
      continue;
    }
    const ocrText = ocrRes.body.text;
    console.log(`  OCR OK (${ocrText.length} chars)`);

    const extractRes = await callExtract(ocrText, undefined); // auto-détection
    if (extractRes.statusCode !== 200) {
      console.log('  EXTRACT ERROR:', extractRes.statusCode, JSON.stringify(extractRes.body).slice(0, 500));
      results.push({ file: item.file, ocrOk: true, ocrText, extractOk: false, error: extractRes.body });
      continue;
    }

    const detectedType = extractRes.body.docType;
    const fields = extractRes.body.result;
    console.log(`  Type détecté: ${detectedType} (attendu mappé: ${item.type === 'justif_domicile' ? 'domicile' : item.type})`);
    console.log('  Champs extraits:', JSON.stringify(fields, null, 2));

    results.push({
      file: item.file,
      expectedType: item.type,
      detectedType,
      ocrText,
      fields,
      groundTruth: item.ground_truth
    });
  }

  const outPath = path.join(__dirname, 'results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nRésultats écrits dans ${outPath}`);
}

main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
