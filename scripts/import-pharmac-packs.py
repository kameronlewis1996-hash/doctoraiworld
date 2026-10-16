#!/usr/bin/env python3
"""Import source pack IDs without rebuilding curated medicine safety metadata.

Usage: python scripts/import-pharmac-packs.py Schedule_DATE.xml HML_DATE.xml
The XML checksums must match data/medication/nz-pharmac-medicines.json.
Only packs linked to that existing formulation catalogue are retained.
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


def name(element):
    child = element.find(NS + 'Name')
    return child.text.strip() if child is not None and child.text else ''


def norm(value):
    return re.sub(r'[^a-z0-9]+', ' ', value.lower()).strip()


def current(element, published):
    return all(not element.get(attr) or element.get(attr) > published for attr in ('Delisted', 'ToBeDelisted'))


def main(filenames):
    if len(filenames) != 2:
        raise ValueError('Supply community Schedule and HML XML files for the same date')
    catalogue = json.loads((ROOT / 'data/medication/nz-pharmac-medicines.json').read_text(encoding='utf-8'))
    products = {(norm(p['brand']), norm(p['chemical']), norm(p['formulation'])): p for p in catalogue['products']}
    if len(products) != len(catalogue['products']):
        raise ValueError('Existing formulation catalogue has duplicate identity keys')
    source_by_title = {source['title']: source for source in catalogue['sources']}
    packs = {}
    parsed_sources = set()
    unmatched = []
    excluded_packs = 0
    for filename in filenames:
        raw = Path(filename).read_bytes()
        if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:
            raise ValueError('External entities/DOCTYPE are not accepted')
        root = ET.fromstring(raw)
        front = root.find(NS + 'Front')
        title_node = front.find(NS + 'Title') if front is not None else None
        date_node = front.find(NS + 'Published') if front is not None else None
        title = title_node.text.strip() if title_node is not None and title_node.text else ''
        date = date_node.text.strip() if date_node is not None and date_node.text else ''
        if root.tag != NS + 'Schedule' or title not in source_by_title or date != source_by_title[title]['effectiveDate']:
            raise ValueError(f'Unexpected source title/date in {filename}')
        if hashlib.sha256(raw).hexdigest() != source_by_title[title]['sha256']:
            raise ValueError(f'XML checksum does not match existing catalogue: {filename}')
        if title in parsed_sources:
            raise ValueError(f'Duplicate XML source: {title}')
        parsed_sources.add(title)
        schedule = 'HML' if title == 'Hospital Medicines List' else 'Schedule'
        for section in root.findall(NS + 'Section'):
            for category in section.findall(NS + 'ATC1'):
                subcategory_by_chemical = {
                    id(chemical): name(group)
                    for group in category.findall(NS + 'ATC2')
                    for chemical in group.iter(NS + 'Chemical')
                }
                for chemical in category.iter(NS + 'Chemical'):
                    for form in chemical.findall(NS + 'Formulation'):
                        for brand in form.findall(NS + 'Brand'):
                            source_packs = brand.findall(NS + 'Pack')
                            if not all(current(item, date) for item in (chemical, form, brand)):
                                excluded_packs += len(source_packs)
                                continue
                            brand_name = re.sub(r'^e\.g\.\s*', '', name(brand), flags=re.I)
                            if norm(brand_name) in ('any', 'any brand', 'various', 'unbranded'):
                                brand_name = ''
                            key = (norm(brand_name), norm(name(chemical)), norm(name(form)))
                            product = products.get(key)
                            for pack in source_packs:
                                if not current(pack, date):
                                    excluded_packs += 1
                                    continue
                                if product is None:
                                    # Devices and special foods were deliberately excluded by
                                    # the established formulation importer. Record the count.
                                    unmatched.append((name(category), name(chemical), name(form), brand_name))
                                    continue
                                pharmacode = pack.get('ID', '').removeprefix('P')
                                nzmt_id = pack.get(NZMT + 'ctpp_id', '')
                                quantity_node = pack.find(NS + 'Quantity')
                                quantity = quantity_node.text.strip() if quantity_node is not None and quantity_node.text else ''
                                unit = form.get('Units', '')
                                if not pharmacode or not re.fullmatch(r'\d+(?:\.\d+)?', quantity) or not unit:
                                    raise ValueError(f'Pack identifier, quantity or source unit missing for {product["name"]}')
                                pack_key = (product['id'], pharmacode, nzmt_id, quantity, unit)
                                row = packs.setdefault(pack_key, {
                                    'productId': product['id'], 'pharmacode': pharmacode,
                                    'nzmtId': nzmt_id, 'sourceQuantity': quantity,
                                    'sourceUnit': unit, 'sourceCategory': name(category),
                                    'sourceSubcategory': subcategory_by_chemical.get(id(chemical), ''),
                                    'schedules': [],
                                })
                                if schedule not in row['schedules']:
                                    row['schedules'].append(schedule)
    if parsed_sources != source_by_title.keys():
        raise ValueError('Both catalogue XML sources must be supplied')
    # These exclusions are source-format exclusions, not evidence of market absence.
    if any(category != 'Special Foods' and not re.search(
        r'\b(device|meter|monitor|sensor|lancets?|needles?|syringes?|pump|diagnostic test|test strips?|condoms?|dressings?|bandages?|catheter)\b',
        chemical, re.I) for category, chemical, _form, _brand in unmatched):
        raise ValueError(f'Unmatched source pack outside established exclusions: {unmatched[:3]}')
    rows = sorted(packs.values(), key=lambda p: (p['productId'], p['pharmacode'], p['nzmtId']))
    result = {
        'schemaVersion': 1, 'datasetVersion': catalogue['datasetVersion'],
        'sources': catalogue['sources'], 'licence': catalogue['licence'],
        'attribution': catalogue['attribution'],
        'disclaimer': 'Pharmac source pack identifiers and quantities are not a retail inventory, stock check, approval list, dosage guide or clinical rule set. Source quantity zero is not a pack size.',
        'packs': rows,
        'stats': {
            'packRecords': len(rows),
            'communityPackRecords': sum('Schedule' in row['schedules'] for row in rows),
            'hospitalPackRecords': sum('HML' in row['schedules'] for row in rows),
            'bothSchedules': sum(len(row['schedules']) == 2 for row in rows),
            'zeroSourceQuantity': sum(row['sourceQuantity'] == '0' for row in rows),
            'excludedNonMedicinePackRows': len(unmatched),
            'excludedInactivePackRows': excluded_packs,
        },
    }
    path = ROOT / 'data/medication/nz-pharmac-packs.json'
    path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps(result['stats'], indent=2))


if __name__ == '__main__':
    main(sys.argv[1:])
