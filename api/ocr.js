const MISTRAL_OCR_URL = 'https://api.mistral.ai/v1/ocr';
const DEFAULT_OCR_MODEL = 'mistral-ocr-2512';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée.' });
    return;
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Variable d'environnement MISTRAL_API_KEY non configurée sur le serveur." });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      res.status(400).json({ error: 'Corps de requête JSON invalide.' });
      return;
    }
  }

  const { fileBase64, mimeType } = body || {};

  if (!fileBase64 || !mimeType) {
    res.status(400).json({ error: 'Fichier manquant.' });
    return;
  }

  const document = mimeType === 'application/pdf'
    ? { type: 'document_url', document_url: fileBase64 }
    : { type: 'image_url', image_url: fileBase64 };

  try {
    const ocrResponse = await fetch(MISTRAL_OCR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_OCR_MODEL || DEFAULT_OCR_MODEL,
        document
      })
    });

    if (!ocrResponse.ok) {
      const errText = await ocrResponse.text();
      res.status(502).json({ error: `Erreur de l'API Mistral OCR (${ocrResponse.status}) : ${errText}` });
      return;
    }

    const data = await ocrResponse.json();
    const pages = Array.isArray(data.pages) ? data.pages : [];
    const text = pages.map(page => page.markdown || '').join('\n\n').trim();

    if (!text) {
      res.status(502).json({ error: "Aucun texte n'a pu être extrait du document.", raw: data });
      return;
    }

    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: `Erreur lors de l'appel à l'API Mistral OCR : ${err.message || err}` });
  }
};
