const core = require('../../server-src/_lib/doctorai-core.cjs');

const reviewPacket = Object.freeze({
  title: 'Medication safety review',
  notice: 'Admin-only review and visual test. This packet does not change active checks or evaluate anyone’s health information.',
  release: {
    active: [
      '2 pairwise interaction rules',
      '1 multi-medicine rule',
      '2 internal allergy prompts'
    ],
    inactiveCandidateCount: 1269,
    summary: 'No medicine-condition prompts are active. Excluded candidates remain inactive while source reuse rights, currentness, and independent pharmacist review are unresolved.'
  },
  candidate: {
    id: 'systemic-nonaspirin-nsaid-duplicate-toxicity',
    status: 'Excluded from active checks',
    scope: 'Class-scope candidate; both sides are tagged systemic for rule scope. Those tags are not verified administration-route evidence.',
    source: {
      label: 'Medsafe Brufen Extra New Zealand Data Sheet, section 4.5',
      reviewed: 'Source sheet revised 1 September 2025; checked 14 October 2026.',
      summary: 'The cited sheet advises avoiding concomitant use of two or more NSAIDs because adverse effects may increase.',
      url: 'https://medsafe.govt.nz/profs/Datasheet/b/BrufenExtratab.pdf'
    },
    blockers: [
      'Reuse permission for this source-derived rule is not verified; a public source link alone does not grant reuse rights.',
      'No independent pharmacist sign-off is recorded for this candidate.',
      'The cited sheet does not establish applicability to every product, formulation, route, dose, or person.',
      'Exact current New Zealand product sources and a documented risk/action review are required before considering activation.'
    ]
  },
  catalogue: {
    summary: 'The bundled Pharmac snapshot contains 3,419 formulations; 113 ingredient mappings are incomplete. It is not a complete catalogue of every New Zealand retail or over-the-counter medicine.',
    safeguards: [
      'An exact catalogue selection keeps its identity and ingredients visibly source-derived; it does not enter ingredient-based interaction matching until the person confirms the ingredients against the original label.',
      'The existing name-resolution path is unchanged. Incomplete mappings remain unknown, and no top-100 coverage claim is made.'
    ],
    ocr: 'Example scan text “90 Fexofenadine HCl Ta 120mg (FEX)” is flagged for strength review. The original text is preserved; uncertain strength is not promoted into the dose.'
  },
  requirements: [
    'Record an explicit reusable-rights basis and required attribution for each source.',
    'Check current New Zealand sources for the exact products and formulations in scope.',
    'Obtain independent pharmacist review of exact pair, route applicability, severity, action, caveats, and review date.',
    'Keep unknown product or route cases fail-closed and test them before any activation.'
  ]
});

module.exports = async function medicationReview(request, response) {
  core.noStore(response);
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' });

  const session = await core.identityFromRequest(request);
  if (!session) return response.status(401).json({ error: 'Sign in with an authorised DoctorAI staff account.' });
  if (!core.isAdmin(session)) return response.status(403).json({ error: 'DoctorAI staff admin access is required.' });

  return response.status(200).json({ packet: reviewPacket });
};
