'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../term-catalogues.js');
const { parseTerms, requireReusableLicense } = require('./import-open-obo.cjs');
const folder = path.join(__dirname, '..', 'catalogues');
const files = ['conditions.v1.json', 'medicines.v1.json', 'allergies-reactions.v1.json'];
const catalogues = files.map(file => JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8')));
const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.v1.json'), 'utf8'));
const mappings = JSON.parse(fs.readFileSync(path.join(folder, 'alert-mappings.v1.json'), 'utf8'));
assert.equal(core.validate(catalogues), true);
assert.deepEqual(mappings.rules, [], 'Terminology labels must not introduce alert rules.');
assert.deepEqual(manifest.coverage, {
  conditions: catalogues[0].entries.length,
  medicineIngredients: catalogues[1].ingredients.length,
  localMedicineProducts: catalogues[1].localProducts.length,
  allergySubstances: catalogues[2].substances.length,
  reactionLabels: catalogues[2].reactions.length,
  clinicalRulesFromTheseCatalogues: 0,
  jurisdictionsWithProductMapping: 0,
  languages: ['en']
});
assert.equal(core.search(catalogues[0].entries, 'HTN')[0].id, 'DOID:10763');
assert.equal(core.search(catalogues[0].entries, 'type 2 diabetes')[0].id, 'DOID:9352');
assert.equal(core.search(catalogues[2].reactions, 'skin rash')[0].id, 'SYMP:0000487');
assert.deepEqual(core.search(catalogues[0].entries, 'not in the catalogue'), []);
const legacy = { conditions: 'asthma, older condition', allergies: 'penicillin' };
const conditions = core.conditionEntries(legacy), allergies = core.allergyEntries(legacy);
assert.equal(conditions.length, 2);
assert.equal(allergies[0].certainty, 'legacy');
assert.deepEqual(core.compatibilityFields([{ ...conditions[0], status: 'historical' }, conditions[1]], allergies), { conditions: 'older condition', allergies: 'penicillin' });
assert.deepEqual(core.compatibilityFields([], [{ ...allergies[0], certainty: 'suspected' }]), { conditions: '', allergies: '' });
assert.deepEqual(parseTerms('[Term]\nid: SYMP:1\nname: rash\nsynonym: "skin rash" EXACT []\n[Term]\nid: SYMP:2\nname: obsolete\nis_obsolete: true', 'SYMP'), [{ id: 'SYMP:1', label: 'rash', aliases: ['skin rash'] }]);
assert.throws(() => requireReusableLicense('unknown'));
assert.equal(requireReusableLicense('CC-BY-4.0'), 'CC-BY-4.0');
console.log('Open catalogue provenance, search, migration and offline import checks passed.');
