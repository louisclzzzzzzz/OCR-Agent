const fs = require('fs');
const path = require('path');

const results = JSON.parse(fs.readFileSync(path.join(__dirname, 'results.json'), 'utf8'));

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ''); // strip spaces/punct
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
  }

  for (const [field, got, expected] of checks) {
    totalFields++;
    const a = norm(got);
    const b = norm(expected);
    // pour 'nom' on accepte si le nom extrait est contenu dans le nom complet attendu ou vice versa
    const match = a === b || (field === 'nom' && (b.includes(a) && a.length > 0));
    if (match) okFields++;
    console.log(`  ${match ? 'OK ' : 'XX '} ${field}: got="${got}" expected="${expected}"`);
  }
}

console.log(`\n=== Score global: ${okFields}/${totalFields} champs corrects (${(100*okFields/totalFields).toFixed(1)}%) ===`);
