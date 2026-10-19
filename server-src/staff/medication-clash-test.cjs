'use strict';

const { defaultMedicationSafetyProvider } = require('../medication/safety-provider.cjs');

const confirmed = (name, ingredients, dose = '') => ({
  name,
  ...(dose ? { dose } : {}),
  activeIngredients: ingredients,
  activeIngredientsConfirmed: true
});

const fixtures = Object.freeze({
  'voltaren-ibuprofen': {
    title: 'Voltaren suppository 100 mg + ibuprofen 400 mg',
    expectation: 'Medsafe source wording raises a potential concern with using two or more NSAIDs together. The exact formulation and rule scope still need pharmacist adjudication. Current expected software state: unassessed, not safe.',
    source: { label: 'Medsafe Brufen Extra data sheet, section 4.5', url: 'https://www.medsafe.govt.nz/Profs/Datasheet/b/BrufenExtratab.pdf' },
    medications: [
      confirmed('Voltaren - Diclofenac sodium - Suppos 100 mg', ['diclofenac'], '100 mg'),
      confirmed('Ibuprofen - Tab 400 mg', ['ibuprofen'], '400 mg')
    ]
  },
  'warfarin-ibuprofen': {
    title: 'Warfarin + ibuprofen',
    expectation: 'No warfarin–NSAID pair rule is retained. The pair must stay unassessed; the excluded candidate is not active.',
    source: { label: 'Internal ruleset scope and exclusions' },
    medications: [confirmed('Marevan', ['warfarin']), confirmed('Ibuprofen', ['ibuprofen'])]
  },
  'retained-warfarin-sulfamethoxazole': {
    title: 'Retained positive: warfarin + Trisul',
    expectation: 'Synthetic software fixture for the retained warfarin–sulfamethoxazole rule. This checks rule wiring, not clinical completeness.',
    source: { label: 'Vega AJ et al. Life (Basel). 2023;13(8):1661. CC BY 4.0', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10455514/' },
    medications: [
      confirmed('Marevan', ['warfarin']),
      confirmed('Trisul - Trimethoprim with sulphamethoxazole [Co-trimoxazole] - Tab 80 mg with sulphamethoxazole 400 mg', ['trimethoprim', 'sulfamethoxazole'])
    ]
  },
  'retained-warfarin-sertraline': {
    title: 'Retained positive: warfarin + sertraline',
    expectation: 'Synthetic software fixture for the retained oral-anticoagulant–SSRI rule. This checks rule wiring, not clinical completeness.',
    source: { label: 'Rahman AA et al. JAMA Netw Open. 2024;7(3):e243208. CC BY 4.0', url: 'https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2816687' },
    medications: [confirmed('Marevan', ['warfarin']), confirmed('Sertraline', ['sertraline'])]
  },
  'duplicate-ibuprofen': {
    title: 'Duplicate ingredient: ibuprofen + Nurofen',
    expectation: 'Synthetic software fixture for the duplicate-ingredient warning. Each ingredient is explicitly label-confirmed in the fixture.',
    source: { label: 'Internal DoctorAI duplicate-ingredient behavior' },
    medications: [confirmed('Ibuprofen', ['ibuprofen']), confirmed('Nurofen', ['ibuprofen'])]
  },
  'three-medicine-rule': {
    title: 'Three-medicine rule: lisinopril + furosemide + ibuprofen',
    expectation: 'Synthetic software fixture for the retained three-medicine rule. Pairwise coverage can remain unassessed even when the three-medicine rule matches.',
    source: { label: 'Kunitsu Y et al. J Pharm Health Care Sci. 2026;12:42. CC BY 4.0', url: 'https://link.springer.com/article/10.1186/s40780-026-00560-8' },
    medications: [confirmed('Lisinopril', ['lisinopril']), confirmed('Furosemide', ['furosemide']), confirmed('Ibuprofen', ['ibuprofen'])]
  },
  'unmatched-pair': {
    title: 'Unmatched medicines: synthetic pair',
    expectation: 'Synthetic unknown terms must stay unmatched and unassessed. No alert must not be presented as safety clearance.',
    source: { label: 'Checker coverage limits and incomplete terminology handling' },
    medications: [{ name: 'Fictional test medicine alpha' }, { name: 'Fictional test medicine beta' }]
  },
  'no-medicines': {
    title: 'No medicines',
    expectation: 'Empty synthetic list: no medicine rules run and no medication safety conclusion is made.',
    source: { label: 'Empty-list behavior in the local checker' },
    medications: []
  }
});

function createMedicationClashTestHandler({ core, provider = defaultMedicationSafetyProvider } = {}) {
  if (!core || typeof core.identityFromRequest !== 'function' || typeof core.isAdmin !== 'function' || typeof core.json !== 'function') {
    throw new TypeError('A staff access core is required.');
  }
  if (!provider || typeof provider.review !== 'function') throw new TypeError('A medication safety provider is required.');

  return async function medicationClashTestHandler(request, response) {
    core.noStore?.(response);
    if (request.method !== 'POST') return core.json(response, 405, { error: 'Method not allowed.' });

    let session;
    try { session = await core.identityFromRequest(request); } catch { session = null; }
    if (!session) return core.json(response, 401, { error: 'Sign in with an authorised staff admin account.' });
    if (!core.isAdmin(session)) return core.json(response, 403, { error: 'Staff admin access is required.' });

    let body = request.body;
    try { body = typeof body === 'string' ? JSON.parse(body) : body; } catch { body = null; }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'scenarioId')) {
      return core.json(response, 400, { error: 'Choose one built-in synthetic scenario. Custom medicine data is not accepted.' });
    }
    const scenarioId = body.scenarioId;
    if (scenarioId !== 'all' && (typeof scenarioId !== 'string' || !Object.hasOwn(fixtures, scenarioId))) {
      return core.json(response, 400, { error: 'Unknown synthetic scenario.' });
    }

    const selected = scenarioId === 'all' ? Object.entries(fixtures) : [[scenarioId, fixtures[scenarioId]]];
    try {
      const results = await Promise.all(selected.map(async ([id, scenario]) => ({
        id,
        title: scenario.title,
        expectation: scenario.expectation,
        source: scenario.source,
        medicineCount: scenario.medications.length,
        result: await provider.review({ medications: scenario.medications.map(item => ({ ...item, activeIngredients: item.activeIngredients ? [...item.activeIngredients] : undefined })) })
      })));
      return core.json(response, 200, { synthetic: true, persisted: false, results });
    } catch {
      return core.json(response, 503, { error: 'The local medication rules could not run. No scenario result was returned.' });
    }
  };
}

module.exports = { createMedicationClashTestHandler, fixtures };
