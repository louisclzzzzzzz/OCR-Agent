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
  .filter(a => a.type === 'rib' || a.type === 'justif_domicile' || a.face === 'recto' || a.face === 'recto_verso');

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Mistral applique un rate limit par minute : on retente avec backoff sur 429
// plutôt que de compter l'appel comme un échec définitif.
async function withRetry(callFn, label) {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const out = await callFn();
    if (out.statusCode !== 429) return out;
    const backoffMs = 3000 * attempt;
    console.log(`  ${label}: 429 rate limited, retry ${attempt}/${maxAttempts} dans ${backoffMs}ms`);
    await sleep(backoffMs);
  }
  return callFn();
}

async function callOcr(fileBase64, mimeType) {
  return withRetry(async () => {
    const { req, res, get } = mockReqRes({ fileBase64, mimeType });
    await ocrHandler(req, res);
    return get();
  }, 'OCR');
}

async function callExtract(ocrText, docType) {
  return withRetry(async () => {
    const { req, res, get } = mockReqRes({ ocrText, docType });
    await extractHandler(req, res);
    return get();
  }, 'EXTRACT');
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
    const expectedType = item.type || `cni_${item.face}`; // 'rib' | 'justif_domicile' | 'cni_recto' | 'cni_recto_verso'
    const groundTruth = item.ground_truth || item.ocr_ground_truth;
    console.log(`\n=== ${item.file} (type attendu: ${expectedType}, difficulté: ${item.difficulty}) ===`);

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
    const expectedMapped = expectedType === 'justif_domicile' ? 'domicile'
      : expectedType.startsWith('cni') ? 'cni'
      : expectedType;
    console.log(`  Type détecté: ${detectedType} (attendu mappé: ${expectedMapped})`);
    console.log('  Champs extraits:', JSON.stringify(fields, null, 2));

    results.push({
      file: item.file,
      expectedType,
      detectedType,
      ocrText,
      fields,
      groundTruth
    });

    await sleep(800); // throttling doux entre documents pour respecter le rate limit Mistral
  }

  const outPath = path.join(__dirname, 'results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nRésultats écrits dans ${outPath}`);
}

main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
