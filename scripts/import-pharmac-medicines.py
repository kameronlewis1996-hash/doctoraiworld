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
catalogue = {'schemaVersion': 1, 'datasetVersion': date + '-pharmac', 'sources': sources, 'licence': {'name': 'CC BY 4.0', 'url': 'https://creativecommons.org/licenses/by/4.0/', 'source': 'https://schedule.pharmac.govt.nz/pub/schedule/archive/README.html'}, 'attribution': 'Medicine terminology adapted from Pharmac community and hospital XML schedules. Names are normalised and ingredients conservatively mapped by DoctorAI. Pharmac does not endorse DoctorAI.', 'disclaimer': 'Pharmac takes no responsibility for errors or omissions in the source files. A Schedule listing does not establish Medsafe approval, current supply, suitability, funding eligibility or complete interaction coverage.', 'ingredients': list(atoms.values()), 'products': rows, 'stats': {'productFormulations': len(rows), 'brandNames': len({norm(p['brand']) for p in rows if p['brand']}), 'chemicalNames': len({norm(p['chemical']) for p in rows}), 'ingredientTerms': len(atoms), 'completeIngredientProducts': sum(p['ingredientsComplete'] for p in rows), 'incompleteIngredientProducts': sum(not p['ingredientsComplete'] for p in rows), 'skipped': skipped}}
(ROOT / 'data/medication/nz-pharmac-medicines.json').write_text(json.dumps(catalogue, ensure_ascii=False, separators=(',', ':')) + '\n')
names = sorted({n for p in rows for n in [p['brand'], p['chemical'], p['name']] if 1 < len(n) <= 120}, key=lambda n: (n.lower(), n))
(ROOT / 'data/medication/nz-medicine-names.json').write_text(json.dumps({'datasetVersion': catalogue['datasetVersion'], 'names': names}, ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps(catalogue['stats'], indent=2))
