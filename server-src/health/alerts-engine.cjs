'use strict';
const { currentMedicines } = require('../../medication-records.js');

// Pure, local review prompts. The medicine rules are supplied by the existing
// medication engine; this module does not fetch, store, or log a health record.
function createHealthAlertsEngine(medicineEngine) {
  if (!medicineEngine || typeof medicineEngine.review !== 'function' || typeof medicineEngine.reviewResolved !== 'function') {
    throw new TypeError('The existing local medication engine is required.');
  }

  const MAX_MEDICINES = 60;
  const MAX_DETAILS = 80;
  const MAX_SYMPTOMS = 200;
  const RECENT_DAYS = 7;
  const checkedOn = '2026-10-11';
  const source = (publisher, title, url, scope) => ({ publisher, title, url, checkedOn, sourceStatus: 'primary-source-checked', currentnessNote: scope });
  const sources = {
    ibuprofen: source('NHS', 'Ibuprofen for adults', 'https://www.nhs.uk/medicines/ibuprofen-for-adults/', 'Adult ibuprofen guidance; this prompt does not assess route, dose, suitability or other NSAIDs.'),
    asthma: source('NHS Specialist Pharmacy Service', 'Using NSAIDs in asthma', 'https://sps.nhs.uk/articles/using-nsaids-in-asthma/', 'Some people with asthma tolerate NSAIDs; the record match does not establish sensitivity or causation.'),
    warfarin: source('NHS', 'Warfarin', 'https://www.nhs.uk/medicines/warfarin/', 'Warfarin-specific guidance; this prompt cannot diagnose bleeding or assess INR.'),
    breath: source('NHS', 'Shortness of breath', 'https://www.nhs.uk/symptoms/shortness-of-breath/', 'Urgency guidance only; a saved entry does not establish the cause or current symptoms.'),
    allergy: source('NHS', 'Anaphylaxis', 'https://www.nhs.uk/conditions/anaphylaxis/', 'Emergency symptom guidance only; this is not an allergy diagnosis.'),
    chest: source('NHS', 'Chest pain', 'https://www.nhs.uk/symptoms/chest-pain/', 'Symptom guidance only; this is not a diagnosis. The page review was due 8 August 2026; confirm current guidance with a clinician.'),
    amoxicillinAllergy: source('NHS', 'Who can and cannot take amoxicillin', 'https://www.nhs.uk/medicines/amoxicillin/who-can-and-cannot-take-amoxicillin/', 'Amoxicillin-specific allergy context. This does not verify every penicillin product, class mapping or individual cross-reactivity.'),
    nsaidAllergy: source('NHS', 'NSAIDs', 'https://www.nhs.uk/medicines/nsaids/', 'Class information describes possible allergic reactions. This does not verify individual cross-reactivity or every NSAID product label.')
  };
  const internal = { publisher: 'DoctorAI record consistency check', kind: 'internal-rule', sourceStatus: 'not-clinical-evidence', currentnessNote: 'Compares saved values only; none is verified as correct.' };
  const officialHosts = new Set(['www.nhs.uk', 'sps.nhs.uk', 'www.medsafe.govt.nz', 'medsafe.govt.nz', 'www.accessdata.fda.gov', 'accessdata.fda.gov', 'schedule.pharmac.govt.nz']);
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, 2000) : '';
  const negativeContractions = { "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not', "won't": 'will not', "ain't": 'is not' };
  const norm = value => text(value).toLowerCase().replace(/[’‘]/g, "'").replace(/\b(?:don't|doesn't|didn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|won't|ain't)\b/g, word => negativeContractions[word]).replace(/\s+/g, ' ').trim();
  const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const unique = values => [...new Set(values)];
  const inactive = item => item.deleted === true || item.dismissed === true || item.archived === true || item.active === false || /^(?:deleted|dismissed|archived|inactive|stopped|discontinued|completed|resolved)$/i.test(text(item.status));
  const hash = value => {
    let output = 2166136261;
    for (const char of value) { output ^= char.charCodeAt(0); output = Math.imul(output, 16777619); }
    return (output >>> 0).toString(16).padStart(8, '0');
  };

  function safeSources(values) {
    return list(values).map(value => {
      const item = record(value);
      const out = {};
      for (const key of ['publisher', 'title', 'kind', 'sourceStatus', 'checkedOn', 'currentnessNote', 'linkCheckAttemptedOn', 'recordVersion']) {
        if (typeof item[key] === 'string' || typeof item[key] === 'number') out[key] = item[key];
      }
      try {
        const url = new URL(item.url);
        if (url.protocol === 'https:' && !url.username && !url.password && officialHosts.has(url.hostname)) out.url = url.href;
      } catch { /* Internal and unverified sources remain labelled without a link. */ }
      return out;
    }).filter(value => value.publisher);
  }

  function clauses(value) {
    return text(value).replace(/[’‘]/g, "'").split(/[;\n.!]|\b(?:but|however)\b/gi).map(item => item.trim()).filter(Boolean);
  }

  // Negation and history handling are deliberately conservative. Excluded or
  // unrecognised language stays outside coverage rather than being called safe.
  function affirmativeMatches(value, pattern, historyAllowed = false) {
    const found = [];
    for (const clause of clauses(value)) {
      const expression = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      for (const match of clause.matchAll(expression)) {
        const before = norm(clause.slice(0, match.index));
        const after = norm(clause.slice(match.index + match[0].length));
        const recentPrefix = before.split(' ').slice(-10).join(' ');
        const family = /\b(?:family history|mother|father|sister|brother|parent|partner|child|son|daughter)\b/.test(before);
        const negated = /\b(?:no|not|without|denies?|denied|never|negative for|ruled out|free of|absence of|no longer)\b/.test(recentPrefix)
          || /^(?:is |was |are |were )?(?:absent|denied|resolved|gone|not present|ruled out)\b/.test(after);
        const history = /\b(?:history of|historical|previously|last year|childhood|used to|past episode|resolved|recovered from)\b/.test(before)
          || /^(?:(?:was|happened|occurred|back|in|during|from) )?(?:last year|(?:\d+ |one |two |three |several )?(?:years?|months?|weeks?) ago|as a child|childhood|previously|historical|in the past|history only)\b/.test(after);
        const uncertain = /\b(?:possible|possibly|suspected|maybe|query|rule out|worried about|risk of|if|in case|watch for|look out for|advice about|asked about)\b/.test(recentPrefix) || after.startsWith('?');
        if (!family && !negated && !uncertain && (historyAllowed || !history)) found.push(match[0]);
      }
    }
    return unique(found);
  }

  function detailItems(value, kind) {
    const raw = Array.isArray(value) ? value : text(value).split(/[,;\n]/);
    return raw.slice(0, MAX_DETAILS).flatMap((item, index) => {
      const object = record(item);
      const value = text(typeof item === 'string' ? item : object.name || object.value || object.label);
      return clauses(value).map((clause, clauseIndex) => ({ kind, id: `${text(object.id) || `${kind}-${index}`}-${clauseIndex}`, label: kind === 'allergy' ? 'Recorded allergy' : 'Recorded condition', value: clause, excluded: inactive(object) || object.present === false || object.confirmed === false }));
    }).filter(item => item.value);
  }

  const detailCount = value => Array.isArray(value) ? value.length : text(value).split(/[,;\n]/).filter(item => item.trim()).length;

  function positiveDetail(item) {
    if (item.excluded) return false;
    const value = norm(item.value);
    if (/^(?:none|none known|no known allergies|no allergies|nkda|nka|unknown|not added|not known|not provided|n\/a)$/.test(value)) return false;
    if (/\b(?:no|not|without|denies?|denied|never|negative for|ruled out|free of|absence of|possible|possibly|suspected|maybe|query|family history|mother|father|sister|brother|parent|partner|child|son|daughter)\b/.test(value) || value.endsWith('?')) return false;
    return affirmativeMatches(value, /[a-z][a-z -]*/i, true).length > 0;
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return null;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
  }

  function medicineTrigger(item, index) {
    return { kind: 'medication', id: text(item.id) || `medication-${index}`, label: 'Saved medicine', value: text(item.name) || 'Medicine name missing' };
  }

  function evaluate(input = {}) {
    const state = record(input);
    const profile = record(state.profile);
    const suppliedNow = state.now instanceof Date ? state.now : new Date(state.now || Date.now());
    const now = Number.isNaN(suppliedNow.getTime()) ? new Date() : suppliedNow;
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayDate = validDate(today);
    const allMedicines = list(state.medications).map(item => typeof item === 'string' ? { name: item } : { ...record(item), activeIngredientsConfirmed: record(item).activeIngredientsConfirmed === true || record(item).activeIngredientsManuallyConfirmed === true });
    const activeMedicines = currentMedicines(allMedicines, now);
    const excludedMedicines = allMedicines.filter(item => !activeMedicines.includes(item));
    const medicines = activeMedicines.slice(0, MAX_MEDICINES);
    const medicineTriggers = medicines.map(medicineTrigger);
    const allergyItems = [...detailItems(profile.allergies, 'allergy'), ...detailItems(state.allergies, 'allergy')];
    const conditionItems = [...detailItems(profile.conditions, 'condition'), ...detailItems(state.conditions, 'condition')];
    if (profile.pregnant === true || record(state.healthDetails).pregnant === true) conditionItems.push({ kind: 'health-detail', id: 'pregnant', label: 'Saved health detail', value: 'Pregnant' });
    if (profile.breastfeeding === true || record(state.healthDetails).breastfeeding === true) conditionItems.push({ kind: 'health-detail', id: 'breastfeeding', label: 'Saved health detail', value: 'Breastfeeding' });
    const allergies = allergyItems.filter(positiveDetail);
    const conditions = conditionItems.filter(positiveDetail);
    const medicationReview = medicineEngine.review({ medications: medicines, allergies: [], conditions: conditions.map(item => item.value) });
    const resolved = medicationReview.resolved;
    const alerts = [];
    const add = ({ type, severity = 'review', title, message, triggers, nextAction, ruleId, sources: evidence = [], currentness }) => {
      const triggerList = triggers.map(item => ({ kind: item.kind, id: item.id, label: item.label, value: item.value }));
      const stableKey = `${type}|${ruleId || ''}|${triggerList.map(item => `${item.kind}:${item.id}:${item.value}`).sort().join('|')}`;
      const id = `health-${hash(stableKey)}`;
      alerts.push({ id, fingerprint: hash(`${stableKey}|${severity}|${message}`), type, severity, title, message, triggers: triggerList, nextAction, sources: safeSources(evidence), ruleId: ruleId || null, coverage: 'limited', currentness: currentness || 'saved-record', dismissible: severity !== 'urgent' });
    };
    const reviewAction = 'Ask a pharmacist or prescriber to review these saved details and your actual labels. Do not change prescribed treatment based on DoctorAI.';
    const urgentAction = 'If this is happening now, seek urgent medical advice now. For severe symptoms, collapse or immediate danger, call your local emergency service. If it has resolved but was not assessed, contact a clinician promptly.';
    const emergencyAction = 'If this is happening now, call your local emergency service now (111 in New Zealand). Do not wait for DoctorAI. If the episode has resolved and was not assessed, seek prompt clinical advice.';

    // Reuse the original rule evaluation for each exact pair so each prompt has
    // explicit medicine triggers, without inferring pairs from message text.
    // Absence of a retained rule is recorded as unassessed, never as a clean pair.
    const pairCoverage = { requestedPairs: 0, assessedPairs: 0, unassessedPairs: 0, unassessed: [] };
    for (let left = 0; left < resolved.length; left += 1) {
      for (let right = left + 1; right < resolved.length; right += 1) {
        pairCoverage.requestedPairs += 1;
        if (resolved[left].status !== 'resolved' || resolved[right].status !== 'resolved') {
          pairCoverage.unassessedPairs += 1;
          if (pairCoverage.unassessed.length < 20) pairCoverage.unassessed.push({ left: resolved[left].name || 'Unknown medicine', right: resolved[right].name || 'Unknown medicine', reason: 'Medicine identity incomplete' });
          continue;
        }
        const pair = medicineEngine.reviewResolved({ resolved: [resolved[left], resolved[right]] });
        const interactionAlerts = pair.alerts.filter(item => item.type === 'interaction');
        if (interactionAlerts.length) pairCoverage.assessedPairs += 1;
        else {
          pairCoverage.unassessedPairs += 1;
          if (pairCoverage.unassessed.length < 20) pairCoverage.unassessed.push({ left: resolved[left].name || 'Medicine', right: resolved[right].name || 'Medicine', reason: 'No retained pairwise rule matched' });
        }
        for (const alert of pair.alerts.filter(item => ['interaction', 'duplicate-ingredient'].includes(item.type))) {
          add({ type: alert.type === 'interaction' ? 'medication-medication' : 'duplicate-ingredient', severity: alert.severity, title: alert.title, message: alert.message, triggers: [medicineTriggers[left], medicineTriggers[right]], nextAction: reviewAction, ruleId: alert.ruleId, sources: [alert.source] });
        }
      }
    }
    if (pairCoverage.unassessedPairs > 0) {
      const examples = pairCoverage.unassessed.slice(0, 3).map(pair => `${pair.left} + ${pair.right}`).join('; ');
      const extra = pairCoverage.unassessedPairs > pairCoverage.unassessed.length ? ` ${pairCoverage.unassessedPairs - pairCoverage.unassessed.length} more pair(s) are not listed here.` : '';
      const triggerIndexes = new Set();
      for (let left = 0; left < resolved.length && triggerIndexes.size < 6; left += 1) {
        for (let right = left + 1; right < resolved.length && triggerIndexes.size < 6; right += 1) {
          const leftName = resolved[left].name || 'Unknown medicine';
          const rightName = resolved[right].name || 'Unknown medicine';
          if (pairCoverage.unassessed.some(pair => pair.left === leftName && pair.right === rightName)) {
            triggerIndexes.add(left);
            triggerIndexes.add(right);
          }
        }
      }
      const pairTriggers = [...triggerIndexes].map(index => medicineTriggers[index]);
      if (pairTriggers.length) add({ type: 'medication-medication-unassessed', severity: 'unknown', title: 'Medicine pair coverage is unassessed', message: `${pairCoverage.unassessedPairs} of ${pairCoverage.requestedPairs} saved medicine pair(s) have no retained pairwise rule or a complete medicine identity${examples ? `; examples: ${examples}` : ''}.${extra} No alert does not mean safe. Ask a pharmacist or prescriber to review the full list.`, triggers: pairTriggers, nextAction: reviewAction, ruleId: 'medication-pair-unassessed', sources: [internal] });
    }
    for (let index = 0; index < resolved.length; index += 1) {
      for (const allergy of allergies) {
        const review = medicineEngine.reviewResolved({ resolved: [resolved[index]], allergies: [allergy.value] });
        for (const alert of review.alerts.filter(item => item.type === 'allergy')) {
          const contextEvidence = [];
          if (alert.ruleId === 'penicillin-class' || resolved[index].ingredients.some(item => item.id === 'amoxicillin')) contextEvidence.push(sources.amoxicillinAllergy);
          if (alert.ruleId === 'nsaid-class' || resolved[index].ingredients.some(item => item.id === 'ibuprofen')) contextEvidence.push(sources.nsaidAllergy);
          add({ type: 'allergy-medication', severity: alert.severity, title: alert.title, message: alert.message, triggers: [medicineTriggers[index], allergy], nextAction: reviewAction, ruleId: alert.ruleId, sources: [alert.source, ...contextEvidence] });
        }
      }
    }
    for (const alert of medicationReview.alerts.filter(item => item.type === 'strength-review')) {
      const index = resolved.findIndex(item => alert.message.startsWith(`${item.name}:`));
      if (index >= 0) add({ type: 'medication-detail', severity: 'unknown', title: alert.title, message: alert.message, triggers: [medicineTriggers[index]], nextAction: 'Check the saved name and strength against the original label with a pharmacist. This check does not assess the prescribed dose.', sources: [alert.source] });
    }
    for (let index = 0; index < resolved.length; index += 1) {
      if (resolved[index].status !== 'resolved') add({ type: 'unknown-medication', severity: 'unknown', title: 'Medicine identity is not fully matched', message: resolved[index].reason || 'No complete ingredient mapping is available.', triggers: [medicineTriggers[index]], nextAction: 'Review the full medicine name, formulation and active ingredients against the original label with a pharmacist. This medicine remains outside ingredient-based checks.', sources: [internal] });
    }

    const matchedConditions = new Set();
    for (let index = 0; index < resolved.length; index += 1) {
      for (const condition of conditions) {
        const conditionReview = medicineEngine.reviewResolved({ resolved: [resolved[index]], conditions: [condition.value] });
        for (const alert of conditionReview.alerts.filter(item => item.type === 'contraindication')) {
          matchedConditions.add(condition);
          add({ type: 'condition-medication', severity: alert.severity, title: alert.title, message: alert.message, triggers: [medicineTriggers[index], condition], nextAction: reviewAction, ruleId: alert.ruleId, sources: [alert.source] });
        }
      }
    }

    const timelineSymptoms = list(state.timeline).filter(item => record(item).source === 'symptom-diary' || record(item).type === 'symptom');
    const rawSymptoms = [...list(state.symptoms), ...timelineSymptoms];
    const symptomRecords = new Map();
    rawSymptoms.forEach(item => {
      const object = record(item);
      const key = text(object.id) || JSON.stringify([object.name, object.title, object.date, object.time, object.notes]);
      // Canonical timeline entries are processed last and replace duplicate IDs;
      // an older caller-supplied symptoms array cannot restore an edited record.
      symptomRecords.set(key, item);
    });
    const symptoms = [...symptomRecords.values()].slice(0, MAX_SYMPTOMS).map((item, index) => ({ ...record(item), _id: text(record(item).id) || `symptom-${index}` }));
    let historicalSymptoms = 0;
    let undatedSymptoms = 0;
    const recentSymptoms = symptoms.filter(item => {
      if (inactive(item) || item.resolved === true || item.current === false || item.present === false) { historicalSymptoms += 1; return false; }
      const narrative = [item.name, item.title, item.description, item.notes, item.context].map(text).join('; ');
      if (/\b(?:historical entry|history only|not current|not happening now|not present now|symptoms? (?:has |have )?resolved|has resolved|no longer present|last year|(?:\d+ |one |two |three |several )?(?:years?|months?|weeks?) ago|childhood)\b/i.test(narrative)) { historicalSymptoms += 1; return false; }
      if (item.current === true || item.ongoing === true || item.presentNow === true) return true;
      const date = validDate(item.date);
      if (!date) { undatedSymptoms += 1; return false; }
      const age = (todayDate - date) / 86400000;
      if (age < 0 || age > RECENT_DAYS) { historicalSymptoms += 1; return false; }
      return true;
    });
    const symptomTrigger = (item, patterns = []) => {
      const entry = [text(item.name || item.title).replace(/^Symptom recorded:\s*/i, ''), text(item.date)].filter(Boolean).join(' · ') || 'Saved symptom';
      const wording = unique(patterns.flatMap(pattern => affirmativeMatches(symptomText(item), pattern))).join('; ').slice(0, 240);
      return { kind: 'symptom', id: item._id, label: item.current || item.presentNow ? 'Current symptom entry' : 'Recent symptom entry', value: wording ? `${entry} · Matched wording: ${wording}` : entry };
    };
    const symptomText = item => [item.name, item.title, item.description, item.associatedSymptoms, item.quality, item.notes, item.context, item.triggers].map(text).filter(Boolean).join('; ');
    const symptomMatches = (item, pattern) => {
      // A specific negation in the narrative overrides a terse positive title
      // for the same pattern. Different symptoms separated by 'but' keep their
      // own affirmative meaning. This still is not a complete language parser.
      const narrative = [item.description, item.notes, item.context, item.associatedSymptoms].map(text).filter(Boolean);
      if (narrative.some(value => new RegExp(pattern.source, pattern.flags.replace('g', '')).test(value) && !affirmativeMatches(value, pattern).length)) return false;
      return affirmativeMatches(symptomText(item), pattern).length > 0;
    };
    const breathingPattern = /\b(?:shortness of breath|short of breath|breathless(?:ness)?|difficulty breathing|trouble breathing|wheez(?:e|ing))\b/i;
    const bleedingPattern = /\b(?:blood in (?:my |the )?(?:urine|pee|stool|poo)|black (?:tarry |sticky )?(?:stools?|poo)|vomit(?:ing)? blood|cough(?:ing)? up blood|unexplained bruising|nosebleed|head injury)\b/i;
    const ibuprofenBleedingPattern = /\b(?:blood in (?:my |the )?(?:urine|pee)|black (?:tarry |sticky )?(?:stools?|poo)|vomit(?:ing)? blood)\b/i;
    const severeBreath = /\b(?:severe (?:difficulty breathing|breathlessness)|gasping|choking|(?:cannot|can't|couldn't|unable to|not able to) (?:breathe|speak|talk|get words out)|(?:blue|grey|gray) (?:lips|skin))\b/i;
    const swelling = /\b(?:(?:swollen|swelling) (?:throat|tongue|lips)|swelling of (?:(?:my|the) )?(?:throat|tongue|lips)|(?:throat|tongue|lips) (?:(?:is|are|became|suddenly) )*(?:swollen|swelling)|struggling to swallow)\b/i;
    const chestPain = /\b(?:chest (?:pain|pressure|tightness)|tight (?:or heavy )?chest|heavy chest)\b/i;
    const chestEmergency = /\b(?:sudden|persistent|does not go away|won't go away|spreads? to (?:my |the )?(?:arms?|back|neck|jaw)|sweat(?:ing)?|short(?:ness)? of breath)\b/i;
    const severeChest = /\b(?:severe (?:chest pain|pain in (?:my |the )?chest)|chest pain (?:is |was |feels |feeling )?severe)\b/i;
    const coveredSymptoms = new Set();
    for (const symptom of recentSymptoms) {
      if (symptomMatches(symptom, severeBreath) || symptomMatches(symptom, swelling)) {
        coveredSymptoms.add(symptom);
        add({ type: 'urgent-symptom', severity: 'urgent', title: 'A recent entry includes an emergency warning sign', message: 'The wording in this entry needs immediate attention if the symptom is present now. A record match is not a diagnosis.', triggers: [symptomTrigger(symptom, [severeBreath, swelling])], nextAction: emergencyAction, ruleId: 'severe-breathing-or-swelling', sources: [sources.breath, sources.allergy], currentness: 'current-or-last-7-days' });
      } else if (symptomMatches(symptom, chestPain) && symptomMatches(symptom, chestEmergency)) {
        coveredSymptoms.add(symptom);
        add({ type: 'urgent-symptom', severity: 'urgent', title: 'Chest symptoms need immediate attention if current', message: 'This recent entry mentions chest symptoms with warning-sign wording. DoctorAI cannot determine the cause.', triggers: [symptomTrigger(symptom, [chestPain, chestEmergency])], nextAction: emergencyAction, ruleId: 'chest-warning-context', sources: [sources.chest], currentness: 'current-or-last-7-days' });
      } else if (symptomMatches(symptom, severeChest)) {
        coveredSymptoms.add(symptom);
        add({ type: 'urgent-symptom', severity: 'urgent', title: 'Severe chest pain needs urgent advice if current', message: 'Severe chest pain is recorded. A saved text match cannot determine its cause or provide an urgency clearance.', triggers: [symptomTrigger(symptom, [severeChest])], nextAction: 'If severe chest pain is happening now, seek immediate medical advice. Call your local emergency service for sudden or persistent chest pain, spreading pain, or chest pain with breathlessness, sweating, sickness or faintness. If the episode has resolved and was not assessed, contact a clinician promptly.', ruleId: 'severe-chest-pain-context', sources: [sources.chest], currentness: 'current-or-last-7-days' });
      }
      const asthmaCondition = conditions.find(item => affirmativeMatches(item.value, /\basthma\b/i, true).length);
      const hasNsaid = resolved.some(item => item.ingredients.some(ingredient => list(ingredient.classes).includes('nsaid')));
      if (asthmaCondition && !hasNsaid && symptomMatches(symptom, breathingPattern)) {
        coveredSymptoms.add(symptom);
        add({ type: 'condition-symptom', severity: 'urgent', title: 'Breathing entry with recorded asthma needs review', message: 'This recent breathing entry and saved asthma record need clinical advice. DoctorAI cannot establish the cause or whether an asthma attack is occurring.', triggers: [symptomTrigger(symptom, [breathingPattern]), asthmaCondition], nextAction: urgentAction, ruleId: 'asthma-breathing-context', sources: [sources.breath], currentness: 'current-or-last-7-days' });
      }
      for (let index = 0; index < resolved.length; index += 1) {
        if (resolved[index].ingredients.some(item => item.id === 'warfarin') && symptomMatches(symptom, bleedingPattern)) {
          coveredSymptoms.add(symptom);
          add({ type: 'symptom-medication', severity: 'urgent', title: 'Bleeding or injury wording with saved warfarin', message: 'The recent symptom wording and saved warfarin need urgent clinical review. The medicine is not established as the cause.', triggers: [symptomTrigger(symptom, [bleedingPattern]), medicineTriggers[index]], nextAction: urgentAction, ruleId: 'warfarin-bleeding-symptom', sources: [sources.warfarin], currentness: 'current-or-last-7-days' });
        }
        if (resolved[index].ingredients.some(item => item.id === 'ibuprofen') && symptomMatches(symptom, ibuprofenBleedingPattern)) {
          coveredSymptoms.add(symptom);
          add({ type: 'symptom-medication', severity: 'urgent', title: 'Bleeding wording with saved ibuprofen', message: 'A recent bleeding-related entry and this ibuprofen product need clinical review. This match does not prove a side effect.', triggers: [symptomTrigger(symptom, [ibuprofenBleedingPattern]), medicineTriggers[index]], nextAction: urgentAction, ruleId: 'ibuprofen-bleeding-symptom', sources: [sources.ibuprofen], currentness: 'current-or-last-7-days' });
        }
        if (resolved[index].ingredients.some(item => list(item.classes).includes('nsaid')) && symptomMatches(symptom, breathingPattern)) {
          const asthma = conditions.find(item => affirmativeMatches(item.value, /\basthma\b/i, true).length);
          if (asthma) {
            coveredSymptoms.add(symptom);
            add({ type: 'symptom-medication-condition', severity: 'urgent', title: 'Breathing entry, asthma and NSAID need review', message: 'These saved records need prompt clinical review. The match does not establish a medicine reaction or the cause of breathing symptoms.', triggers: [symptomTrigger(symptom, [breathingPattern]), medicineTriggers[index], asthma], nextAction: urgentAction, ruleId: 'asthma-nsaid-breathing-context', sources: [sources.asthma, sources.breath], currentness: 'current-or-last-7-days' });
          }
        }
      }
    }

    const bloodFacts = [];
    const bloodType = value => {
      const match = text(value).toUpperCase().replace(/\b(?:POSITIVE|POS)\b/g, '+').replace(/\b(?:NEGATIVE|NEG)\b/g, '-').replace(/\s/g, '').match(/^(A|B|AB|O)[+-]$/);
      return match ? match[0] : '';
    };
    const bloodFact = (value, id, label) => { const type = bloodType(value); if (type) bloodFacts.push({ kind: 'health-detail', id, label, value: type }); };
    bloodFact(profile.bloodType, 'profile-blood-type', 'Profile blood type');
    bloodFact(record(state.emergency).bloodType || profile.emergencyBloodType, 'emergency-blood-type', 'Emergency blood type');
    bloodFact(record(state.healthDetails).bloodType, 'other-blood-type', 'Other saved blood type');
    list(state.memoryDetails).slice(0, MAX_DETAILS).forEach((item, index) => {
      const value = text(item);
      if (/\b(?:no|not|unknown|unconfirmed|history of|mother|father)\b/i.test(value)) return;
      const match = value.match(/^\s*(?:my )?blood (?:type|group)\s*[:=-]?\s*(A|B|AB|O)\s*([+-]|positive|negative)\s*$/i);
      if (match) bloodFact(`${match[1]} ${match[2]}`, `memory-blood-type-${index}`, 'Saved Memory blood type');
    });
    if (unique(bloodFacts.map(item => item.value)).length > 1) add({ type: 'health-detail-conflict', severity: 'review', title: 'Saved blood types disagree', message: 'Different blood types are recorded. DoctorAI cannot tell which value is correct; these records must not be used to make transfusion decisions.', triggers: bloodFacts, nextAction: 'Compare the records with an official laboratory result or clinician, then correct the saved entries. Do not guess the correct blood type.', ruleId: 'blood-type-record-conflict', sources: [internal] });
    const noAllergyItem = allergyItems.find(item => !item.excluded && /^(?:none|none known|no known allergies|no allergies|nkda|nka)$/i.test(item.value));
    if ((profile.noKnownAllergies === true || noAllergyItem) && allergies.length) add({ type: 'health-detail-conflict', severity: 'review', title: 'Saved allergy records disagree', message: 'A no-known-allergies entry and a named allergy are both saved. Neither is verified by this check.', triggers: [...allergies, noAllergyItem || { kind: 'health-detail', id: 'no-known-allergies', label: 'Profile allergy status', value: 'No known allergies' }], nextAction: 'Confirm your allergy history with a pharmacist or clinician, then correct the conflicting saved records.', ruleId: 'allergy-record-conflict', sources: [internal] });

    const rank = { urgent: 0, critical: 0, high: 1, moderate: 2, medium: 2, caution: 2, review: 2, unknown: 3 };
    const deduplicated = [...new Map(alerts.map(alert => [alert.id, alert])).values()].sort((left, right) => (rank[left.severity] ?? 3) - (rank[right.severity] ?? 3) || left.id.localeCompare(right.id));
    const missing = [];
    if (!allMedicines.length) missing.push('medications');
    if (!allergyItems.length && profile.noKnownAllergies !== true) missing.push('allergies');
    if (!conditionItems.length) missing.push('conditions');
    if (!symptoms.length) missing.push('symptoms');
    const unknownMedicines = resolved.filter(item => item.status !== 'resolved').map(item => ({ name: item.name || 'Medicine name missing', reason: item.reason || 'Not resolved', matchState: item.matchState }));
    return {
      schemaVersion: 1,
      checkedAt: now.toISOString(),
      alerts: deduplicated,
      coverage: {
        complete: false, localOnly: true, networkRequests: 0, missing,
        medications: { status: 'limited', requested: allMedicines.length, active: activeMedicines.length, checked: medicines.length, excludedInactiveOrOutOfDate: excludedMedicines.length, omittedByLimit: Math.max(0, activeMedicines.length - medicines.length), resolved: resolved.length - unknownMedicines.length, unknown: unknownMedicines },
        medicationMedication: { status: 'limited', coverageLevel: 'very-limited', ruleCount: medicationReview.coverage.interactionRuleCount, multiMedicineRuleCount: medicationReview.coverage.combinationRuleCount, requestedPairs: pairCoverage.requestedPairs, assessedPairs: pairCoverage.assessedPairs, unassessedPairs: pairCoverage.unassessedPairs, unassessed: pairCoverage.unassessed, omittedUnassessedPairs: Math.max(0, pairCoverage.unassessedPairs - pairCoverage.unassessed.length), doseRouteTimingAssessed: false, limitation: 'Only positively licensed retained pairwise rules are reported. Other medicine pairs are unassessed; absence of an alert is not a safety finding.' },
        symptomMedication: { status: 'limited', ruleCount: 3, limitation: 'Warfarin bleeding/injury, ibuprofen bleeding and NSAID/asthma breathing context prompts only; no adverse-effect or causation assessment.' },
        conditionSymptoms: { status: 'limited', ruleCount: 1, limitation: 'Only asthma with a recent affirmative breathing entry is checked; no diagnosis or urgency clearance.' },
        allergyMedication: { status: 'limited', recorded: allergyItems.length, affirmative: allergies.length, excludedOrUncertain: allergyItems.length - allergies.length, omittedByLimit: Math.max(0, detailCount(profile.allergies) - MAX_DETAILS) + Math.max(0, detailCount(state.allergies) - MAX_DETAILS), classRuleCount: medicationReview.ruleset?.allergyRuleCount || 0, limitation: 'Ingredient and curated class prompts only; excipients, cross-reactivity and allergy diagnosis are not assessed.' },
        conditionMedication: { status: 'limited', ruleCount: medicationReview.coverage.conditionRuleCount, recorded: conditionItems.length, affirmative: conditions.length, unmatched: conditions.filter(item => !matchedConditions.has(item)).map(item => item.value), omittedByLimit: Math.max(0, detailCount(profile.conditions) - MAX_DETAILS) + Math.max(0, detailCount(state.conditions) - MAX_DETAILS), limitation: `${medicationReview.coverage.conditionRuleCount} limited medicine-condition prompts are checked from the local database. Other conditions, pregnancy timing, dose, route, severity and suitability may be unassessed.` },
        symptoms: { status: 'limited', ruleCount: 7, recorded: symptoms.length, recent: recentSymptoms.length, matched: coveredSymptoms.size, excludedHistoricalOrInactive: historicalSymptoms, undated: undatedSymptoms, omittedByLimit: Math.max(0, symptomRecords.size - symptoms.length), recentWindowDays: RECENT_DAYS, unmatched: recentSymptoms.filter(item => !coveredSymptoms.has(item)).map(item => text(item.name || item.title) || 'Unnamed symptom'), limitation: 'Only a small set of affirmative warning-sign phrases is checked. Negation/history parsing can miss meaning; no urgency clearance or cause is determined.' },
        healthDetails: { status: 'limited', checks: ['blood-type-record-conflict', 'allergy-record-conflict'], bloodTypeRecords: bloodFacts.length, limitation: 'Only conflicting labelled records are compared. Contact information, general notes and uploaded documents are not interpreted.' },
        results: { status: 'not_assessed', recorded: list(state.results).length + list(state.measurements).length, limitation: 'Test results and measurements need their units, reference ranges and clinical context; this engine does not interpret them.' },
        existingCheck: { used: false, supplied: Boolean(state.existingCheck), reason: 'Current saved inputs are recalculated locally. A previous server result is not reused or presented as current.' },
        datasetVersion: medicationReview.datasetVersion,
        rulesetVersion: medicationReview.ruleset.version,
        catalogue: { publisher: 'Pharmac Pharmaceutical Schedule', sourceUrl: medicationReview.catalogue.sourceUrl, effectiveDate: medicationReview.catalogue.effectiveDate, attribution: medicationReview.catalogue.attribution, licence: medicationReview.catalogue.licence, disclaimer: medicationReview.catalogue.disclaimer },
        contextRulesetVersion: '2026.10.14-context-v4',
        contextEvidenceCheckedOn: checkedOn,
        limitation: 'No alert does not mean safe. Missing, unrecognised, historical or unassessed details are not cleared.'
      },
      disclaimer: 'DoctorAI provides limited local review prompts, not a diagnosis or a complete medicine-safety check. No alert does not mean safe. Verify records and medicine decisions with a pharmacist or clinician. Do not change prescribed treatment based on DoctorAI; for immediate danger, contact your local emergency service.'
    };
  }

  return Object.freeze({ evaluate, schemaVersion: 1, sources: Object.freeze(sources) });
}

module.exports = { createHealthAlertsEngine };
