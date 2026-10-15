#!/usr/bin/env python3
"""Import published Pharmac XML terminology, never funding/clinical decisions.

Usage: python3 scripts/import-pharmac-medicines.py Schedule_DATE.xml HML_DATE.xml
Uses only Python standard library. Download the XML (not Excel) from the URLs
recorded in the output. Input checksums make each release traceable.
"""
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NS = '{http://schedule.pharmac.govt.nz/2006/07/Schedule#}'
NZMT = '{nzmt.org.nz}'
seed = json.loads((ROOT / 'data/medication/medication-safety.seed.json').read_text())
atoms = {x['id']: x.copy() for x in seed['ingredients']}
terms = {}

def norm(value):
    return re.sub(r'[^a-z0-9]+', ' ', value.lower()).strip()

ROUTE_SENSITIVE_CLASSES = {
    'nsaid', 'colchicine-cyp3a4-pgp-inhibitor',
    'colchicine-haematologic-bleeding-risk-medicine',
    'colchicine-cytolytic-antineoplastic-medicine', 'antiplatelet',
    'ciclosporin-nephrotoxic-synergy',
    'tacrolimus-nephrotoxic-neurotoxic-medicine',
    'tacrolimus-other-level-increasing-medicine',
    'ciclosporin-other-drug-level-increase',
    'ciclosporin-level-decreasing-medicine',
    'ciclosporin-statin-myotoxicity',
}
ROUTE_SENSITIVE_INGREDIENTS = set()
ROUTE_SENSITIVE_PRODUCT_CLASSES = set()
for rule in seed.get('interactionRules', []):
    for side in (rule.get('left', {}), rule.get('right', {})):
        if side.get('interactionRoute'):
            if side.get('class'):
                ROUTE_SENSITIVE_CLASSES.add(side['class'])
            if side.get('ingredient'):
                ROUTE_SENSITIVE_INGREDIENTS.add(side['ingredient'])
            if side.get('productClass'):
                ROUTE_SENSITIVE_PRODUCT_CLASSES.add(side['productClass'])

def interaction_route(chemical, formulation, brand=''):
    chemical_name = norm(chemical)
    form = norm(formulation)
    brand_name = norm(brand)
    if chemical_name == 'verapamil hydrochloride':
        if re.search(r'\b(tab|tablet|oral|cap|capsule)\b', form):
            return 'oral'
        if re.search(r'\b(inj|injection|ampoule|vial)\b', form):
            return 'systemic'
    if chemical_name == 'clarithromycin':
        return 'systemic'
    if brand_name == 'decozol' and chemical_name == 'miconazole' and re.search(r'\boral gel\b', form):
        return 'oral'
    if brand_name == 'jadelle' and re.search(r'\bsubdermal implant\b', form):
        # Levonorgestrel implants have systemic hormonal activity; retain this
        # route for enzyme-inducer effectiveness alerts.
        return 'systemic'
    if 'fusidate' in chemical_name:
        if re.search(r'\b(tab|tablet|cap|capsule|oral|liq|liquid)\b', form):
            return 'oral'
        if re.search(r'\b(eye|ear|ophthalmic|otic|drop|topical|crm|cream|oint|ointment|gel|lotion)\b', form):
            return 'local'
    if 'daptomycin' in chemical_name and re.search(r'\b(inj|injection|vial|ampoule|infusion)\b', form):
        return 'systemic'
    if 'ciprofloxacin' in chemical_name:
        if re.search(r'\b(eye|ear|ophthalmic|otic)\b', form):
            return 'local'
        if re.search(r'\b(tab|oral)\b', form):
            return 'oral'
        if re.search(r'\b(inj|injection)\b', form):
            return 'systemic'
    if chemical_name == 'ketoconazole':
        if re.search(r'\b(shampoo|topical)\b', form):
            return 'local'
        if re.search(r'\b(tab|oral)\b', form):
            return 'systemic'
    if chemical_name == 'chloramphenicol':
        if re.search(r'\b(eye|ear|ophthalmic|otic)\b', form):
            return 'local'
        if re.search(r'\b(cap|capsule|oral|tab|tablet)\b', form):
            return 'oral'
        if re.search(r'\b(inj|injection|vial|ampoule|infusion)\b', form):
            return 'systemic'
    if chemical_name == 'iloprost' and re.search(r'\b(nebuliser|nebulizer|inhalation)\b', form):
        # Vebulis' NZ sheet documents platelet inhibition and bleeding risk with
        # anticoagulants/antiplatelets for the inhaled formulation. This tag
        # means the interaction is systemically relevant, not the delivery route.
        return 'systemic'
    ids, _ = constituents(chemical, formulation)
    has_opioid = any('opioid' in atoms.get(id, {}).get('classes', []) for id in ids)
    if has_opioid and re.search(r'\bpatch\b', form):
        # Transdermal opioid patches have systemic opioid effects. Do not let
        # the generic local-formulation matcher exclude them from opioid rules.
        return 'systemic'
    if re.search(r'\b(suppository|suppos)\b', form) and any(
        'nsaid' in atoms.get(id, {}).get('classes', []) for id in ids
    ):
        # NSAID suppositories have systemic exposure relevant to interaction
        # rules. Other rectal formulations remain unclassified without evidence.
        return 'systemic'
    if norm(brand) == 'versacloz' and 'clozapine' in chemical_name and re.search(r'\bsuspension\b', form):
        return 'oral'
    # Route-gated interaction classes receive formulation tags. Unknown forms
    # remain untagged so their rules can still request a cautious review.
    if chemical_name == 'clotrimazole':
        if re.search(r'\bvaginal\b', form):
            return 'vaginal'
        # Oral clotrimazole troches can alter tacrolimus exposure despite low
        # systemic absorption; do not treat them as a topical formulation.
        if re.search(r'\b(lozenge|troche)\b', form):
            return 'oral'
        if re.search(r'\b(soln|solution|crm|cream|topical|pessary|oint|ointment|gel)\b', form):
            return 'local'
        if re.search(r'\b(tab|tablet|cap|capsule|oral)\b', form):
            return 'oral'
    if chemical_name == 'tobramycin' and re.search(r'\b(inhalation|nebuliser|nebulizer)\b', form):
        return 'systemic'
    inhaled_form = re.search(r'\b(inhaler|inhalation|inhaled|nebuliser|nebulizer)\b', form)
    local_form = re.search(r'\b(eye|ear|ophthalmic|otic|topical|crm|cream|gel|oint|ointment|patch|shampoo|nasal|dermal|lotion|lotn|foam|vaginal|pessary|lozenges?|troches?|ocular implant)\b', form)
    oral_form = re.search(r'\b(tab|tablet|cap|capsule|oral|liq|liquid|suspension|granules?)\b', form)
    systemic_form = re.search(r'\b(inj|injection|vial|ampoule|infusion)\b', form)
    ids, _ = constituents(chemical, formulation)
    route_sensitive = any(id in ROUTE_SENSITIVE_INGREDIENTS or set(atoms.get(id, {}).get('classes', [])) & ROUTE_SENSITIVE_CLASSES for id in ids)
    if ROUTE_SENSITIVE_PRODUCT_CLASSES:
        route_sensitive = route_sensitive or bool(set(safety_product_classes(brand, chemical, formulation)) & ROUTE_SENSITIVE_PRODUCT_CLASSES)
    if route_sensitive and inhaled_form:
        return 'inhaled'
    if route_sensitive and local_form:
        return 'local'
    if route_sensitive and systemic_form:
        return 'systemic'
    if route_sensitive and oral_form:
        return 'oral'
    return None

def safety_product_classes(brand, chemical, formulation):
    brand_name = norm(brand)
    chemical_name = norm(chemical)
    form = norm(formulation)
    oral_tablet = bool(re.search(r'\b(tab|tablet)\b', form))
    combined_pill = oral_tablet and ('ethinyloestradiol' in chemical_name or 'mestranol' in chemical_name) and ' with ' in f' {chemical_name} '
    progestogen_only_pill = oral_tablet and brand_name in {'cerazette', 'microlut', 'noriday', 'noriday 28'}
    classes = []
    if chemical_name == 'tranexamic acid' and oral_tablet:
        # The contraceptive caution is documented for tranexamic acid tablets;
        # do not match injectable tranexamic acid products.
        classes.append('oral-tranexamic-acid')
    if brand_name == 'decozol' and chemical_name == 'miconazole' and re.search(r'\boral gel\b', form):
        # Miconazole oral gel is systemically absorbed and has a specific
        # warfarin/sulfonylurea warning. Do not extend it to skin or vaginal
        # miconazole products.
        classes.append('miconazole-oral-gel')
    if chemical_name == 'clotrimazole' and re.search(r'\bvaginal\b', form):
        classes.append('clotrimazole-vaginal')
    if brand_name == 'jadelle' and re.search(r'\bsubdermal implant\b', form):
        classes.append('jadelle-levonorgestrel-implant')
    if chemical_name == 'levonorgestrel' and brand_name.startswith('levonorgestrel 1') and re.search(r'\b1\s*5\s*mg\b', form):
        classes.append('levonorgestrel-emergency-contraception')
    if brand_name == 'isentress' and re.search(r'\b400\s*mg\b', form):
        classes.append('raltegravir-isentress-400mg-tablet')
    if brand_name == 'isentress hd' and re.search(r'\b600\s*mg\b', form):
        classes.append('raltegravir-isentress-hd-600mg-tablet')
    # Aciclovir interaction labels differ by formulation. Keep injectable
    # nephrotoxicity/monitoring prompts out of oral and ophthalmic products.
    if chemical_name == 'aciclovir':
        if re.search(r'\b(inj|injection|vial|ampoule|infusion)\b', form):
            classes.extend(['aciclovir-systemic', 'aciclovir-intravenous'])
        elif re.search(r'\b(tab|tablet|oral|dispersible)\b', form):
            classes.extend(['aciclovir-systemic', 'aciclovir-oral'])
    if brand_name.startswith('madopar'):
        classes.append('madopar')
        classes.append('madopar-hbs' if 'hbs' in brand_name else 'madopar-standard')
        if 'hbs' not in brand_name:
            classes.append('levodopa-immediate-release')
    if brand_name == 'sinemet' and 'levodopa' in chemical_name and not re.search(r'\b(long-acting|controlled-release|cr)\b', form):
        classes.append('levodopa-immediate-release')
    # Ondansetron exposure reduction is documented for oral dosing; do not
    # apply this formulation class to injectable ondansetron products.
    if chemical_name == 'ondansetron' and oral_tablet:
        classes.append('ondansetron-oral')
    if combined_pill or progestogen_only_pill:
        classes.append('oral-contraceptive')
    if combined_pill:
        classes.append('combined-hormonal-oral-contraceptive')
    if 'ciprofloxacin' in chemical_name and not re.search(r'\b(eye|ear|ophthalmic|otic)\b', form):
        classes.append('systemic-ciprofloxacin')
    if 'ciprofloxacin' in chemical_name and re.search(r'\b(tab|tablet|cap|capsule|oral|liq|liquid|suspension|granules?)\b', form) and not re.search(r'\b(eye|ear|ophthalmic|otic)\b', form):
        classes.append('oral-ciprofloxacin')
    if 'moxifloxacin' in chemical_name and re.search(r'\b(tab|tablet|cap|capsule|oral)\b', form):
        classes.append('oral-moxifloxacin')
    if 'amoxicillin' in chemical_name and 'clavulanic acid' in chemical_name and re.search(r'\b(tab|tablet|oral|liq|liquid|suspension|granules?)\b', form) and not re.search(r'\b(inj|injection|vial|ampoule|infusion)\b', form):
        classes.append('oral-co-amoxiclav')
    if brand_name == 'ferro-tab' and 'ferrous fumarate' in chemical_name and oral_tablet:
        # The Te Whatu Ora Waitaha iron-supplement guide includes ferrous
        # fumarate; keep the product-specific prompt on oral Ferro-tab tablets.
        classes.append('oral-ferro-tab')
    if brand_name == 'ferro-f-tabs' and 'ferrous fumarate' in chemical_name and oral_tablet:
        # The label's food/antacid timing guidance is product-specific. Keep
        # the selector off other ferrous fumarate products.
        classes.append('oral-ferro-f-tab')
    if brand_name == 'ural' and chemical_name == 'sodium citro tartrate' and re.search(r'\bgrans?\b', form):
        # Ural is a source-named urinary alkaliniser. Keep the mapping on this
        # exact oral product rather than generalising to other citrate salts.
        classes.append('ural-nitrofurantoin-urine-alkaliniser')
    if brand_name == 'arrow roxithromycin' and chemical_name == 'roxithromycin' and oral_tablet:
        # Arrow's NZ data sheet has food instructions and notes that this
        # product may not be interchangeable with other local roxithromycin.
        classes.append('arrow-roxithromycin-tablet')
    if 'sacubitril' in chemical_name and 'valsartan' in chemical_name:
        classes.append('sacubitril-valsartan-combination')
    if chemical_name in {'potassium chloride', 'potassium citrate'} and re.search(r'\b(tab|tablet|oral|liq|liquid|suspension|cap|capsule)\b', form) and not re.search(r'\b(macrogol|bowel|prep)\b', form):
        classes.append('oral-potassium-supplement')
    if 'aspirin' in chemical_name:
        aspirin_strength = re.search(r'(\d+(?:\.\d+)?)\s*mg\b', form, re.I)
        if aspirin_strength and float(aspirin_strength.group(1)) <= 100:
            classes.append('low-dose-aspirin')
    if chemical_name == 'midazolam':
        if re.search(r'\b(tab|tablet|oral|cap|capsule)\b', form):
            classes.append('midazolam-oral')
        elif re.search(r'\b(inj|injection|ampoule|vial)\b', form):
            classes.append('midazolam-parenteral')
        elif re.search(r'\b(buccal|oromucosal)\b', form):
            classes.append('midazolam-mucosal')
    if chemical_name == 'fentanyl' and re.search(r'\bpatch\b', form):
        classes.append('fentanyl-transdermal-patch')
    ids, _ = constituents(chemical, formulation)
    # Flucloxacillin food guidance applies to oral capsules and liquids. Keep
    # this product class off injectable formulations so the food prompt stays
    # formulation-specific.
    if chemical_name == 'flucloxacillin' and re.search(r'\b(cap|capsule|oral|liq|liquid|solution|soln)\b', form) and not re.search(r'\b(inj|injection|vial|ampoule|infusion)\b', form):
        classes.append('oral-flucloxacillin')
    # Preserve a product-level duplicate-paracetamol check even when Pharmac
    # marks a combination's full ingredient mapping incomplete.
    if 'paracetamol' in ids or re.search(r'\bparacetamol\b', chemical_name):
        classes.append('paracetamol-containing-product')
    if 'pharmac-ethinyloestradiol' in ids:
        ee_strength = re.search(r'(\d+(?:\.\d+)?)\s*mcg\b', form, re.I)
        if ee_strength and float(ee_strength.group(1)) > 20:
            classes.append('maviret-ethinyloestradiol-over-20-mcg')
    has_nsaid = any(set(atoms.get(id, {}).get('classes', [])) & {'nsaid'} for id in ids)
    local_form = re.search(r'\b(eye|ear|ophthalmic|otic|topical|cream|gel|ointment|patch|shampoo|nasal|dermal)\b', form)
    systemic_form = re.search(r'\b(tab|tablet|cap|capsule|oral|liq|liquid|inj|injection|suppos|rectal|vial|ampoule|infusion)\b', form)
    injectable_form = re.search(r'\b(inj|injection|vial|ampoule|infusion)\b', form)
    inhaled_form = re.search(r'\b(inhalation|inhaler|nebuliser|nebulizer)\b', form)
    if 'salbutamol' in ids and (injectable_form or re.search(r'\b(nebuliser|nebulizer)\b', form)):
        classes.append('salbutamol-hypokalaemia-risk-presentation')
    if 'fusidate' in chemical_name and re.search(r'\b(tab|tablet|cap|capsule|oral|liq|liquid)\b', form):
        classes.append('systemic-sodium-fusidate')
    if chemical_name == 'hydrocortisone' and re.search(r'\b(tab|tablet|oral|inj|injection|vial|ampoule|infusion)\b', form):
        classes.append('hydrocortisone-systemic')
    if chemical_name == 'ciclosporin' and re.search(r'\b(cap|capsule|oral|liq|liquid)\b', form):
        classes.append('octreotide-oral-ciclosporin')
    live_vaccine_text = f'{brand_name} {chemical_name} {form}'
    live_vaccine = (re.search(r'\blive attenuated\b', live_vaccine_text) and re.search(r'\bvaccine\b', live_vaccine_text)) or brand_name in {'varilrix', 'varivax', 'rotarix', 'priorix'}
    if live_vaccine:
        classes.append('live-attenuated-vaccine')
    oral_mineral_antacid_form = bool(re.search(r'\b(tab|tablet|oral|liq|liquid|suspension|paste)\b', form)) and not local_form
    if oral_mineral_antacid_form and set(ids) & {'pharmac-aluminium-hydroxide', 'pharmac-magnesium-hydroxide'}:
        classes.append('raltegravir-calcium-chelating-antacid')
    if oral_mineral_antacid_form and 'pharmac-calcium-carbonate' in ids and (brand_name == 'acidex' or brand_name.startswith('gaviscon extra strength')):
        classes.append('raltegravir-calcium-carbonate-antacid')
    if {'pharmac-aluminium-hydroxide', 'pharmac-magnesium-hydroxide'}.issubset(set(ids)):
        classes.append('tacrolimus-magnesium-aluminium-hydroxide')
    # Crestor's NZ data sheet reports reduced exposure with an aluminium/
    # magnesium hydroxide antacid suspension. Keep the selected prompt on the
    # local Mylanta Double Strength oral-liquid formulation, not tablet or
    # single-mineral products.
    if brand_name == 'mylanta double strength' and {'pharmac-aluminium-hydroxide', 'pharmac-magnesium-hydroxide'}.issubset(set(ids)) and re.search(r'\b(oral|liq|liquid)\b', form):
        classes.append('mylanta-double-strength-aluminium-magnesium-antacid')
    if brand_name == 'oncotice':
        classes.append('ciclosporin-live-bcg-intravesical')
    if brand_name == 'sii-onco-bcg':
        classes.append('ciclosporin-live-bcg-sii-onco')
    if injectable_form and 'pharmac-lidocaine-hydrochloride' in ids:
        classes.append('lidocaine-injection')
    if injectable_form and any('lidocaine-amide-local-anesthetic' in atoms.get(id, {}).get('classes', []) for id in ids):
        classes.append('systemic-amide-local-anesthetic')
    # Adrenaline interactions from NZ local-anaesthetic product information
    # apply to co-formulated injections, not to emergency adrenaline by itself.
    if injectable_form and 'pharmac-adrenaline' in ids and any('lidocaine-amide-local-anesthetic' in atoms.get(id, {}).get('classes', []) for id in ids):
        classes.append('injectable-local-anesthetic-with-adrenaline')
        if re.search(r'\b(dental|cartridge)\b', form):
            classes.append('dental-local-anesthetic-with-adrenaline')
    if has_nsaid and systemic_form and not local_form:
        classes.append('systemic-nsaid')
    systemic_glucocorticoid_ids = {
        'pharmac-hydrocortisone', 'pharmac-hydrocortisone-acetate',
        'pharmac-dexamethasone', 'pharmac-dexamethasone-phosphate',
        'pharmac-methylprednisolone', 'pharmac-methylprednisolone-acetate',
        'pharmac-methylprednisolone-as-sodium-succinate', 'pharmac-prednisolone',
        'pharmac-prednisolone-hexanoate', 'pharmac-prednisolone-sodium-phosphate',
        'pharmac-prednisone',
    }
    if systemic_form and not local_form and set(ids) & systemic_glucocorticoid_ids:
        classes.append('systemic-glucocorticoid')
        classes.append('levothyroxine-systemic-glucocorticoid')
        if 'pharmac-hydrocortisone' not in ids:
            classes.append('warfarin-systemic-glucocorticoid')
    # Trelegy-specific rules depend on confirmed inhaler formulations. Keep
    # these product classes off oral, nasal, topical and injectable products.
    inhaled_laba_ids = {
        'pharmac-eformoterol', 'pharmac-eformoterol-fumarate',
        'pharmac-eformoterol-fumarate-dihydrate', 'pharmac-salmeterol',
        'pharmac-indacaterol', 'pharmac-olodaterol', 'pharmac-vilanterol',
    }
    inhaled_lama_ids = {
        'pharmac-glycopyrronium', 'pharmac-tiotropium-bromide',
        'pharmac-umeclidinium',
    }
    # Ipratropium is a short-acting muscarinic antagonist. Tag only inhaled
    # and nebulised formulations; nasal ipratropium must not trigger duplicate
    # inhaler therapy prompts.
    inhaled_sama_ids = {'pharmac-ipratropium-bromide'}
    inhaled_ics_ids = {
        'pharmac-budesonide', 'pharmac-fluticasone',
        'pharmac-fluticasone-furoate',
    }
    ingredient_ids = set(ids)
    if inhaled_form:
        if ingredient_ids & inhaled_laba_ids:
            classes.append('inhaled-laba-product')
        if ingredient_ids & inhaled_lama_ids:
            classes.append('inhaled-lama-product')
        if not local_form and ingredient_ids & inhaled_sama_ids:
            classes.append('inhaled-sama-product')
        if ingredient_ids & inhaled_ics_ids:
            classes.append('inhaled-ics-product')
        if {'pharmac-fluticasone-furoate', 'pharmac-umeclidinium', 'pharmac-vilanterol'} <= ingredient_ids:
            classes.extend(['trelegy-triple-inhaler', 'trelegy-milk-protein-containing-inhaler'])
    return classes

for atom in atoms.values():
    for term in [atom['name'], *atom.get('aliases', [])]:
        terms[norm(term)] = atom['id']

def text(element, tag):
    return ' '.join(element.findtext(NS + tag, default='').split())

def substance(name):
    # Keep salts unless an explicit curated equivalence exists. Bracketed
    # synonyms belong to this substance, not to the whole combination.
    aliases = re.findall(r'\[([^\]]+)\]', name)
    clean = re.sub(r'\[[^\]]+\]', '', name).strip()
    clean = ' '.join(clean.split())
    key = norm(clean)
    id = terms.get(key) or next((terms[norm(a)] for a in aliases if norm(a) in terms), None)
    if id is None:
        id = 'pharmac-' + key.replace(' ', '-')
        atoms[id] = {'id': id, 'name': clean, 'aliases': aliases, 'classes': [], 'source': 'Pharmac Pharmaceutical Schedule'}
    for term in [clean, *aliases]:
        terms[norm(term)] = id
    return id

UNSPECIFIED = re.compile(r'oestrogens|compound|multivitamin|electrolytes|mixed salt|ringer|parenteral nutrition|esters|enzyme|vaccine|immunoglobulin|extract|with/without|and/or|solution', re.I)
DEVICE = re.compile(r'\b(device|meter|monitor|sensor|lancets?|needles?|syringes?|pump|diagnostic test|test strips?|condoms?|dressings?|bandages?|catheter)\b', re.I)
ACCESSORY = re.compile(r'with (?:diluent|solvent|applicator|dropper|inhaler device)', re.I)

def constituents(chemical, form):
    chemical_key = norm(chemical)
    form_key = norm(form)
    # Pharmac's chemical heading uses the active-moiety name, while these
    # local formulations spell out its salt. Preserve the heading's ingredient
    # identity and mark the list complete only for these exact pairings.
    if chemical_key == 'budesonide with eformoterol' and 'eformoterol fumarate' in form_key:
        return [substance('Budesonide'), substance('eformoterol')], True
    if chemical_key == 'paracetamol with codeine' and 'codeine phosphate' in form_key:
        return [substance('Paracetamol'), substance('Codeine phosphate')], True
    if chemical_key == 'hydrocortisone with miconazole' and 'miconazole nitrate' in form_key:
        return [substance('Hydrocortisone'), substance('Miconazole')], True
    if chemical_key == 'oestrogens conjugated equine':
        return [substance('Conjugated equine oestrogens')], True
    if chemical_key == 'oestrogens with medroxyprogesterone acetate':
        return [substance('Conjugated equine oestrogens'), substance('Medroxyprogesterone acetate')], True
    if chemical_key == 'oestrogens' and 'conjugated equine' in form_key:
        return [substance('Conjugated equine oestrogens')], True
    if UNSPECIFIED.search(chemical):
        return [], False
    # Do not split bracketed synonym text or parentheses (e.g. vaccine types).
    bare = re.sub(r'\[[^\]]+\]', '', chemical)
    if ',' in bare and ' with ' not in bare.lower():
        return [], False
    chemical = re.sub(r'\[Co-trimoxazole\]', '', chemical, flags=re.I)
    parts = re.split(r'\s+with\s+|\s+and\s+|,\s*', chemical, flags=re.I)
    ids = list(dict.fromkeys(substance(x.strip()) for x in parts if x.strip()))
    # Schedule chemical headings occasionally omit formulation constituents.
    # Explicit exceptions are sourced directly from the formulation text.
    overrides = {
        'alginic acid': ['Sodium alginate', 'Magnesium alginate'],
        'sodium alginate': ['Sodium alginate', 'Sodium bicarbonate', 'Calcium carbonate'],
        'flumetasone pivalate': ['Flumetasone pivalate', 'Clioquinol'],
        'sodium acid phosphate': ['Sodium acid phosphate', 'Sodium phosphate'],
    }
    if norm(chemical) in overrides and re.search(r'\b(?:with|and)\b', form, re.I):
        ids = [substance(n) for n in overrides[norm(chemical)]]
    elif re.search(r'\bwith\b', form, re.I) and not ACCESSORY.search(form):
        # Every additional named constituent must be present in the heading.
        # Unparsed strength-first or complex formulations remain incomplete.
        additions = re.split(r'\bwith\b', form, flags=re.I)[1:]
        for addition in additions:
            for segment in re.split(r',|\band\b', addition, flags=re.I):
                m = re.match(r'\s*([A-Za-z][A-Za-z\- ]*?)\s+\d', segment)
                if m and terms.get(norm(m.group(1))) not in ids:
                    return ids, False
        if len(ids) == 1:
            return ids, False
    if len(ids) > 8 or any('/' in part for part in parts):
        return [], False
    return ids, bool(ids)

def current(element, published):
    return all(not element.get(attr) or element.get(attr) > published for attr in ['Delisted', 'ToBeDelisted'])

products = {}
sources = []
skipped = {'devices': 0, 'specialFoodChemicals': 0, 'inactive': 0}
for filename in sys.argv[1:]:
    raw = Path(filename).read_bytes()
    if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:
        raise ValueError('External entities/DOCTYPE are not accepted')
    root = ET.fromstring(raw)
    date = text(root.find(NS + 'Front'), 'Published')
    if root.tag != NS + 'Schedule' or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
        raise ValueError('Not a dated Pharmac Schedule XML')
    kind = 'HML' if 'Hospital' in text(root.find(NS + 'Front'), 'Title') else 'Schedule'
    folder = 'HML' if kind == 'HML' else 'schedule'
    url = f'https://schedule.pharmac.govt.nz/pub/{folder}/archive/{date[:4]}/{date}/{kind}_{date}.xml'
    sources.append({'publisher': 'Pharmac | Te Pātaka Whaioranga', 'title': text(root.find(NS + 'Front'), 'Title'), 'effectiveDate': date, 'url': url, 'sha256': hashlib.sha256(raw).hexdigest()})
    for section in root.findall(NS + 'Section'):
        for category in section.findall(NS + 'ATC1'):
            for chemical in category.iter(NS + 'Chemical'):
                name = text(chemical, 'Name')
                if text(category, 'Name') == 'Special Foods':
                    skipped['specialFoodChemicals'] += 1
                    continue
                if DEVICE.search(name) and not name.lower().startswith('tuberculin'):
                    skipped['devices'] += 1
                    continue
                if not current(chemical, date):
                    skipped['inactive'] += 1
                    continue
                for form in chemical.findall(NS + 'Formulation'):
                    if not current(form, date):
                        skipped['inactive'] += 1
                        continue
                    formulation = text(form, 'Name')
                    ingredientIds, complete = constituents(name, formulation)
                    for brand in form.findall(NS + 'Brand'):
                        if not current(brand, date):
                            skipped['inactive'] += 1
                            continue
                        brandName = re.sub(r'^e\.g\.\s*', '', text(brand, 'Name'), flags=re.I)
                        if norm(brandName) in ['any', 'any brand', 'various', 'unbranded']:
                            brandName = ''
                        display = ((brandName + ' — ') if brandName else '') + name + ' — ' + formulation
                        key = (norm(brandName), norm(name), norm(formulation))
                        record = products.setdefault(key, {'id': 'pharmac-' + hashlib.sha256('|'.join(key).encode()).hexdigest()[:16], 'name': display, 'brand': brandName, 'chemical': name, 'formulation': formulation, 'ingredients': ingredientIds, 'ingredientsComplete': complete, 'market': 'NZ', 'schedules': [], 'pharmacodes': [], 'nzmtIds': [], 'section29': False})
                        route = interaction_route(name, formulation, brandName)
                        if route:
                            if record.get('interactionRoute') not in (None, route):
                                raise ValueError(f'Conflicting interaction route for {display}')
                            record['interactionRoute'] = route
                        productClasses = safety_product_classes(brandName, name, formulation)
                        if productClasses:
                            record['safetyClasses'] = list(dict.fromkeys([*record.get('safetyClasses', []), *productClasses]))
                        if kind not in record['schedules']:
                            record['schedules'].append(kind)
                        record['ingredientsComplete'] = record['ingredientsComplete'] and complete
                        record['section29'] = record['section29'] or brand.get('S29') == 'true'
                        for pack in brand.findall(NS + 'Pack'):
                            if not current(pack, date):
                                continue
                            for field, value in [('pharmacodes', pack.get('ID', '').removeprefix('P')), ('nzmtIds', pack.get(NZMT + 'ctpp_id', ''))]:
                                if value and value not in record[field]:
                                    record[field].append(value)
if len(sources) != 2 or len({s['effectiveDate'] for s in sources}) != 1 or {s['title'] for s in sources} != {'Pharmaceutical Schedule', 'Hospital Medicines List'}:
    raise ValueError('Supply community and hospital XML from the same effective date')
date = sources[0]['effectiveDate']
rows = sorted(products.values(), key=lambda x: (norm(x['name']), x['id']))
missing_product_ingredients = sorted({ingredient_id for product in rows for ingredient_id in product['ingredients'] if ingredient_id not in atoms})
if missing_product_ingredients:
    raise ValueError('Product ingredients missing from catalogue: ' + ', '.join(missing_product_ingredients))
# Pharmac schedule headings retain salt names. Add a small, explicit set of
# common active-ingredient names that Medsafe product information equates with
# those catalogue substances; keep this reproducible across future imports.
CURATED_INGREDIENT_ALIASES = {
    'pharmac-tamoxifen-citrate': ['Tamoxifen'],
    'pharmac-quinine-dihydrochloride': ['Quinine'],
    'pharmac-enoxaparin-sodium': ['Enoxaparin'],
    'pharmac-fondaparinux-sodium': ['Fondaparinux'],
    'pharmac-propafenone-hydrochloride': ['Propafenone'],
}
for ingredient_id, aliases in CURATED_INGREDIENT_ALIASES.items():
    if ingredient_id not in atoms:
        raise ValueError(f'Curated alias target missing from Pharmac source: {ingredient_id}')
    atom = atoms[ingredient_id]
    atom['aliases'] = list(dict.fromkeys([*atom.get('aliases', []), *aliases]))

# These local medicines are named in current NZ QT-risk warnings. Keep the
# curated interaction class reproducible when the Pharmac catalogue is rebuilt.
CURATED_INGREDIENT_CLASSES = {
    'pharmac-azithromycin': ['qt-prolonging-medicine-selected'],
    'clarithromycin': ['qt-prolonging-medicine-selected'],
    'erythromycin': ['qt-prolonging-medicine-selected'],
    'pharmac-roxithromycin': ['qt-prolonging-medicine-selected'],
    'pharmac-ciprofloxacin': ['qt-prolonging-medicine-selected'],
    'amitriptyline': ['qt-prolonging-medicine-selected'],
    'clomipramine': ['qt-prolonging-medicine-selected'],
    'imipramine': ['qt-prolonging-medicine-selected'],
    'pharmac-nortriptyline-hydrochloride': ['qt-prolonging-medicine-selected'],
    'pharmac-doxepin-hydrochloride': ['qt-prolonging-medicine-selected'],
    'pharmac-glibenclamide': ['clarithromycin-hypoglycaemia-risk-medicine'],
    'pharmac-glipizide': ['clarithromycin-hypoglycaemia-risk-medicine'],
    'pharmac-cimetidine': ['oral-h2-receptor-antagonist'],
    'pharmac-ranitidine': ['oral-h2-receptor-antagonist'],
    'pharmac-insulin-neutral': ['clarithromycin-hypoglycaemia-risk-medicine'],
    'pharmac-insulin-isophane': ['clarithromycin-hypoglycaemia-risk-medicine'],
    'pharmac-insulin-lispro': ['clarithromycin-hypoglycaemia-risk-medicine'],
    'pharmac-insulin-lispro-protamine': ['clarithromycin-hypoglycaemia-risk-medicine'],
    'pharmac-insulin-aspart': ['clarithromycin-hypoglycaemia-risk-medicine'],
    'pharmac-insulin-aspart-protamine': ['clarithromycin-hypoglycaemia-risk-medicine'],
    'pharmac-insulin-degludec': ['clarithromycin-hypoglycaemia-risk-medicine'],
    'pharmac-insulin-glargine': ['clarithromycin-hypoglycaemia-risk-medicine'],
    'pharmac-insulin-glulisine': ['clarithromycin-hypoglycaemia-risk-medicine'],
    'pharmac-methylphenidate-hydrochloride': ['methylphenidate'],
    'pharmac-methylphenidate-hydrochloride-extended-release': ['methylphenidate'],
    'pharmac-oxybutynin': ['urinary-antimuscarinic-selected'],
    'pharmac-solifenacin-succinate': ['urinary-antimuscarinic-selected'],
}
for ingredient_id, classes in CURATED_INGREDIENT_CLASSES.items():
    if ingredient_id not in atoms:
        raise ValueError(f'Curated class target missing from Pharmac source: {ingredient_id}')
    atom = atoms[ingredient_id]
    atom['classes'] = list(dict.fromkeys([*atom.get('classes', []), *classes]))
    if 'qt-prolonging-medicine-selected' in classes:
        qt_source = 'Medsafe New Zealand data sheets: Zithromax (azithromycin), revised 4 November 2025, section 4.4; E-Mycin (erythromycin), revised 13 August 2025, sections 4.3–4.5; Arrow-Roxithromycin, revised 3 November 2025, sections 4.4–4.5; Ipca-Ciprofloxacin, revised 29 May 2025, section 4.4; local tricyclic antidepressants are included from Medsafe QT class guidance and E-Mycin QT warnings. This selected QT-risk class is not exhaustive.'
        atom['classificationSource'] = ' '.join(part for part in [atom.get('classificationSource', ''), qt_source] if part)
    if 'clarithromycin-hypoglycaemia-risk-medicine' in classes:
        glucose_source = 'Medsafe Klacid New Zealand Data Sheet, revised 14 August 2025, sections 4.4–4.5: mapped locally represented oral sulfonylureas and insulin ingredients because the source warns these groups can cause significant hypoglycaemia with clarithromycin; this is not an exhaustive class.'
        atom['classificationSource'] = ' '.join(part for part in [atom.get('classificationSource', ''), glucose_source] if part)
    if 'oral-h2-receptor-antagonist' in classes:
        h2_source = 'DoctorAI limited oral H2-receptor-antagonist mapping from the Glizide New Zealand Data Sheet revised 28 August 2025, Minidiab New Zealand Data Sheet revised 28 May 2019, and Daonil New Zealand Data Sheet revised 20 June 2022, section 4.5. Only locally represented cimetidine and ranitidine are included; effects may vary and product route is checked.'
        if h2_source not in atom.get('classificationSource', ''):
            atom['classificationSource'] = ' '.join(part for part in [atom.get('classificationSource', ''), h2_source] if part)
    if 'methylphenidate' in classes:
        methylphenidate_source = 'DoctorAI limited mapping of locally listed methylphenidate immediate-release and extended-release ingredients from the Pharmac New Zealand catalogue. The interaction selectors are restricted to locally mapped oral products.'
        if methylphenidate_source not in atom.get('classificationSource', ''):
            atom['classificationSource'] = ' '.join(part for part in [atom.get('classificationSource', ''), methylphenidate_source] if part)
    if 'urinary-antimuscarinic-selected' in classes:
        urinary_antimuscarinic_source = 'DoctorAI limited mapping from the Oxybutynin (Alchemy) New Zealand Data Sheet, section 4.5, and Solifenacin Viatris New Zealand Data Sheet, section 4.5. Only locally mapped oral oxybutynin and solifenacin products are included; this class is not exhaustive.'
        if urinary_antimuscarinic_source not in atom.get('classificationSource', ''):
            atom['classificationSource'] = ' '.join(part for part in [atom.get('classificationSource', ''), urinary_antimuscarinic_source] if part)

catalogue = {'schemaVersion': 1, 'datasetVersion': date + '-pharmac', 'sources': sources, 'licence': {'name': 'CC BY 4.0', 'url': 'https://creativecommons.org/licenses/by/4.0/', 'source': 'https://schedule.pharmac.govt.nz/pub/schedule/archive/README.html'}, 'attribution': 'Medicine terminology adapted from Pharmac community and hospital XML schedules. Names are normalised and ingredients conservatively mapped by DoctorAI. Pharmac does not endorse DoctorAI.', 'disclaimer': 'Pharmac takes no responsibility for errors or omissions in the source files. A Schedule listing does not establish Medsafe approval, current supply, suitability, funding eligibility or complete interaction coverage.', 'ingredients': list(atoms.values()), 'products': rows, 'stats': {'productFormulations': len(rows), 'brandNames': len({norm(p['brand']) for p in rows if p['brand']}), 'chemicalNames': len({norm(p['chemical']) for p in rows}), 'ingredientTerms': len(atoms), 'completeIngredientProducts': sum(p['ingredientsComplete'] for p in rows), 'incompleteIngredientProducts': sum(not p['ingredientsComplete'] for p in rows), 'skipped': skipped}}
(ROOT / 'data/medication/nz-pharmac-medicines.json').write_text(json.dumps(catalogue, ensure_ascii=False, separators=(',', ':')) + '\n')
names = sorted({n for p in rows for n in [p['brand'], p['chemical'], p['name']] if 1 < len(n) <= 120}, key=lambda n: (n.lower(), n))
(ROOT / 'data/medication/nz-medicine-names.json').write_text(json.dumps({'datasetVersion': catalogue['datasetVersion'], 'names': names}, ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps(catalogue['stats'], indent=2))
