# OCR Agent — version Mistral (Vercel)

Extraction d'informations à partir de documents administratifs (justificatif de domicile, RIB, CNI) :
- OCR côté navigateur (Tesseract.js + pdf.js pour les PDF)
- Extraction structurée via l'API Mistral, appelée depuis une fonction serverless Vercel (`api/extract.js`) afin de ne jamais exposer la clé API au navigateur

## Structure

```
mistral-version/
├── index.html        # Frontend (OCR + UI)
├── api/extract.js    # Fonction serverless Vercel : appelle l'API Mistral
├── package.json
└── .env.example
```

## Déploiement sur Vercel

1. Importer ce dossier comme projet Vercel (ou `vercel` en CLI depuis ce dossier).
2. Dans **Project Settings > Environment Variables**, ajouter :
   - `MISTRAL_API_KEY` = votre clé API Mistral (https://console.mistral.ai/)
   - (optionnel) `MISTRAL_MODEL` = `mistral-small-latest` (par défaut) ou un autre modèle
3. Déployer. `index.html` est servi statiquement, `api/extract.js` devient `/api/extract`.

## Développement local

```bash
npm i -g vercel
cd mistral-version
vercel dev
```

Créer un fichier `.env` (non commité) à partir de `.env.example` avec votre clé Mistral.
