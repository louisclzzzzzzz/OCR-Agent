const DOC_SCHEMAS = {
  domicile: {
    label: 'justificatif de domicile',
    fields: {
      nom: 'Nom de famille de la personne',
      prenom: 'Prénom de la personne',
      adresse: 'Adresse postale (numéro et nom de rue)',
      code_postal: 'Code postal',
      ville: 'Ville',
      date_document: "Date d'émission du document (telle qu'écrite, ex JJ/MM/AAAA)"
    }
  },
  rib: {
    label: 'RIB (relevé d\'identité bancaire)',
    fields: {
      titulaire: 'Nom et prénom du titulaire du compte',
      iban: "IBAN, sans espaces",
      bic: 'BIC / code SWIFT',
      nom_banque: "Nom de l'établissement bancaire"
    }
  },
  cni: {
    label: "carte nationale d'identité",
    fields: {
      nom: 'Nom de famille',
      prenom: 'Prénom(s)',
      date_naissance: 'Date de naissance (telle qu\'écrite, ex JJ/MM/AAAA)',
      lieu_naissance: 'Lieu de naissance',
      numero_document: "Numéro du document d'identité",
      date_expiration: "Date d'expiration (telle qu'écrite, ex JJ/MM/AAAA)"
    }
  }
};

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const DEFAULT_MODEL = 'mistral-small-latest';

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

  const { docType, ocrText } = body || {};

  const schema = DOC_SCHEMAS[docType];
  if (!schema) {
    res.status(400).json({ error: 'Type de document inconnu.' });
    return;
  }

  if (!ocrText || !String(ocrText).trim()) {
    res.status(400).json({ error: 'Texte OCR manquant.' });
    return;
  }

  const prompt = buildPrompt(schema, String(ocrText).trim());

  try {
    const mistralResponse = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL || DEFAULT_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Tu es un assistant qui extrait des informations structurées à partir de texte OCR de documents administratifs français. Tu réponds uniquement en JSON, sans aucun texte additionnel.'
          },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0
      })
    });

    if (!mistralResponse.ok) {
      const errText = await mistralResponse.text();
      res.status(502).json({ error: `Erreur de l'API Mistral (${mistralResponse.status}) : ${errText}` });
      return;
    }

    const data = await mistralResponse.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;

    if (!content) {
      res.status(502).json({ error: "Réponse Mistral vide ou inattendue.", raw: data });
      return;
    }

    const parsed = extractJson(content);
    if (!parsed) {
      res.status(502).json({ error: "La réponse de l'IA ne contient pas de JSON valide.", raw: content });
      return;
    }

    res.status(200).json({ result: parsed });
  } catch (err) {
    res.status(500).json({ error: `Erreur lors de l'appel à l'API Mistral : ${err.message || err}` });
  }
};

function buildPrompt(schema, ocrText) {
  const schemaObj = {};
  const descriptions = [];
  Object.entries(schema.fields).forEach(([key, description]) => {
    schemaObj[key] = '';
    descriptions.push(`- "${key}" : ${description}`);
  });

  return `Voici le texte brut extrait par OCR à partir d'un document de type "${schema.label}" :

"""
${ocrText}
"""

Analyse ce texte et extrait les informations suivantes :
${descriptions.join('\n')}

Réponds UNIQUEMENT avec un objet JSON valide respectant exactement ce schéma (mêmes clés, mêmes noms, aucune clé ajoutée ou manquante) :
${JSON.stringify(schemaObj, null, 2)}

Règles :
- Si une information est absente, illisible ou non présente dans le texte, mets une chaîne vide "" pour la clé correspondante.
- Ne devine et n'invente jamais une valeur.
- Restitue les dates telles qu'elles apparaissent dans le texte, sans les reformater.
- Réponds uniquement avec l'objet JSON, sans texte, sans commentaire, sans bloc de code.`;
}

function extractJson(text) {
  let cleaned = text.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // continue
  }

  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch (e) {
          return null;
        }
      }
    }
  }
  return null;
}
