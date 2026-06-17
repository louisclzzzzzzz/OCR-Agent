const fs = require('fs');
const path = require('path');

const results = JSON.parse(fs.readFileSync(path.join(__dirname, 'results.json'), 'utf8'));

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ''); // strip spaces/punct
}

// '1982-08-01' -> '01081982' (pour comparer à une date extraite au format JJ/MM/AAAA après norm())
function isoToDdmmyyyyDigits(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}${m}${y}`;
}

let totalFields = 0;
let okFields = 0;

for (const r of results) {
  if (!r.fields) continue;
  const gt = r.groundTruth;
  console.log(`\n${r.file} (${r.expectedType}, type détecté: ${r.detectedType})`);

  let checks = [];
  if (r.expectedType === 'rib') {
    checks = [
      ['titulaire', r.fields.titulaire, gt.titulaire.nom],
      ['iban', r.fields.iban, gt.iban],
      ['bic', r.fields.bic, gt.bic],
      ['nom_banque', r.fields.nom_banque, gt.banque],
    ];
  } else if (r.expectedType === 'justif_domicile') {
    const [prenom, ...rest] = gt.destinataire.nom.split(' ');
    const nom = rest.join(' ') || prenom;
    const [cp, ...villeParts] = gt.destinataire.ville.split(' ');
    checks = [
      ['nom', r.fields.nom, gt.destinataire.nom], // comparé au nom complet (souple)
      ['adresse', r.fields.adresse, gt.destinataire.adresse],
      ['code_postal', r.fields.code_postal, cp],
      ['ville', r.fields.ville, villeParts.join(' ')],
      ['date_document', r.fields.date_document, gt.date_facture],
    ];
  } else if (r.expectedType.startsWith('cni')) {
    checks = [
      ['nom', r.fields.nom, gt.nom],
      ['prenom', r.fields.prenom, gt.prenoms],
      ['date_naissance', r.fields.date_naissance, isoToDdmmyyyyDigits(gt.date_naissance)],
      ['lieu_naissance', r.fields.lieu_naissance, gt.lieu_naissance],
      ['numero_document', r.fields.numero_document, gt.doc_no],
    ];
    if (gt.valable_jusquau) {
      checks.push(['date_expiration', r.fields.date_expiration, isoToDdmmyyyyDigits(gt.valable_jusquau)]);
    }
  }

  for (const [field, got, expected] of checks) {
    totalFields++;
    const a = norm(got);
    const b = norm(expected);
    // pour 'nom' on accepte si le nom extrait est contenu dans le nom complet attendu ou vice versa
    const looseFields = ['nom', 'prenom', 'lieu_naissance'];
    const match = a === b || (looseFields.includes(field) && a.length > 0 && (b.includes(a) || a.includes(b)));
    if (match) okFields++;
    console.log(`  ${match ? 'OK ' : 'XX '} ${field}: got="${got}" expected="${expected}"`);
  }
}

console.log(`\n=== Score global: ${okFields}/${totalFields} champs corrects (${(100*okFields/totalFields).toFixed(1)}%) ===`);
