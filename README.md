# OCR Agent — version Mistral (Vercel)

Extraction d'informations à partir de documents administratifs (justificatif de domicile, RIB, CNI) :
- OCR via l'API Mistral OCR (`mistral-ocr-2512`), appelée depuis une fonction serverless Vercel (`api/ocr.js`)
- Extraction structurée via l'API Mistral (chat completions), appelée depuis `api/extract.js`

La clé API Mistral n'est jamais exposée au navigateur : toutes les requêtes vers l'API Mistral passent par les fonctions serverless.

## Structure

```
├── index.html      # Frontend (upload + UI)
├── api/ocr.js      # Fonction serverless : OCR via mistral-ocr-2512
├── api/extract.js  # Fonction serverless : extraction structurée via chat completions
├── package.json
└── .env.example
```

## Déploiement sur Vercel

1. Importer ce dossier comme projet Vercel (ou `vercel` en CLI depuis ce dossier).
2. Dans **Project Settings > Environment Variables**, ajouter :
   - `MISTRAL_API_KEY` = votre clé API Mistral (https://console.mistral.ai/)
   - (optionnel) `MISTRAL_OCR_MODEL` = `mistral-ocr-2512` (par défaut)
   - (optionnel) `MISTRAL_MODEL` = `mistral-small-latest` (par défaut, pour l'extraction structurée)
3. Déployer. `index.html` est servi statiquement, `api/ocr.js` devient `/api/ocr` et `api/extract.js` devient `/api/extract`.

## Développement local

```bash
npm i -g vercel
vercel dev
```

Créer un fichier `.env` (non commité) à partir de `.env.example` avec votre clé Mistral.
