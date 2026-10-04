#!/usr/bin/env python3
"""Prepare a review-only catalogue candidate from licensed Pharmac XML.

The updater reads only the two fixed official XML archive URLs for one
effective date. It stages and validates generated files before replacing the
two public reference-catalogue JSON files. It never reads patient records,
publishes a release, or deploys the app.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
IMPORTER = ROOT / 'scripts/import-pharmac-medicines.py'
OUTPUT_NAMES = ('nz-pharmac-medicines.json', 'nz-medicine-names.json')
ARCHIVE_HOST = 'schedule.pharmac.govt.nz'
LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/'
MAX_XML_BYTES = 40 * 1024 * 1024


def next_effective_date(now=None):
    now = now or datetime.now(timezone.utc)
    year, month = now.year, now.month + 1
    if month == 13:
        year, month = year + 1, 1
    return f'{year:04d}-{month:02d}-01'


def source_urls(effective_date):
    if not re.fullmatch(r'\d{4}-\d{2}-01', effective_date):
        raise ValueError('effective date must be the first day of a month (YYYY-MM-01)')
    try:
        datetime.strptime(effective_date, '%Y-%m-%d')
    except ValueError as error:
        raise ValueError('effective date is invalid') from error
    year = effective_date[:4]
    return {
        'Schedule': f'https://{ARCHIVE_HOST}/pub/schedule/archive/{year}/{effective_date}/Schedule_{effective_date}.xml',
        'Hospital Medicines List': f'https://{ARCHIVE_HOST}/pub/HML/archive/{year}/{effective_date}/HML_{effective_date}.xml'
    }


def download_source(url, opener=urlopen):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != ARCHIVE_HOST or parsed.port or parsed.username or parsed.password:
        raise ValueError('source URL is outside the official Pharmac archive host')
    request = Request(url, headers={'User-Agent': 'DoctorAI Pharmac catalogue review updater/1.0'})
    with opener(request, timeout=30) as response:
        final = urlparse(response.geturl())
        if final.scheme != 'https' or final.hostname != ARCHIVE_HOST or final.port:
            raise ValueError('Pharmac archive redirected outside the approved host')
        raw = response.read(MAX_XML_BYTES + 1)
    if len(raw) > MAX_XML_BYTES:
        raise ValueError('Pharmac XML exceeded the configured size limit')
    if not raw.strip():
        raise ValueError('Pharmac archive returned an empty source file')
    return raw


def load_inputs(effective_date, source_dir=None):
    urls = source_urls(effective_date)
    sources = {}
    for title, url in urls.items():
        prefix = 'HML' if title == 'Hospital Medicines List' else 'Schedule'
        filename = f'{prefix}_{effective_date}.xml'
        if source_dir:
            raw = (Path(source_dir) / filename).read_bytes()
            if len(raw) > MAX_XML_BYTES:
                raise ValueError(f'{filename} exceeded the configured size limit')
        else:
            raw = download_source(url)
        sources[filename] = raw
    return sources


def validate_catalogue(stage_dir, effective_date, retrieved_at, source_bytes):
    stage = Path(stage_dir)
    catalogue = json.loads((stage / OUTPUT_NAMES[0]).read_text())
    suggestions = json.loads((stage / OUTPUT_NAMES[1]).read_text())
    if catalogue.get('schemaVersion') != 1 or catalogue.get('datasetVersion') != f'{effective_date}-pharmac':
        raise ValueError('generated catalogue schema or dataset version is unexpected')
    if catalogue.get('licence', {}).get('name') != 'CC BY 4.0' or catalogue['licence'].get('url') != LICENSE_URL:
        raise ValueError('generated catalogue does not retain the published reuse licence')
    expected_notices = {
        f'https://{ARCHIVE_HOST}/pub/schedule/archive/README.html',
        f'https://{ARCHIVE_HOST}/pub/HML/archive/README.html'
    }
    if set(catalogue['licence'].get('noticeUrls', [])) != expected_notices:
        raise ValueError('generated catalogue is missing a source-specific licence notice')
    if 'Copyright © New Zealand Pharmaceutical Management Agency' not in catalogue.get('attribution', ''):
        raise ValueError('generated catalogue attribution is missing')
    sources = catalogue.get('sources')
    if not isinstance(sources, list) or len(sources) != 2:
        raise ValueError('exactly two Pharmac source records are required')
    by_title = {source.get('title'): source for source in sources}
    if set(by_title) != {'Pharmaceutical Schedule', 'Hospital Medicines List'}:
        raise ValueError('community Schedule and Hospital Medicines List sources are both required')
    expected_urls = source_urls(effective_date)
    for title, url_key, filename in [
        ('Pharmaceutical Schedule', 'Schedule', f'Schedule_{effective_date}.xml'),
        ('Hospital Medicines List', 'Hospital Medicines List', f'HML_{effective_date}.xml')
    ]:
        source = by_title[title]
        if source.get('publisher') != 'Pharmac | Te Pātaka Whaioranga':
            raise ValueError(f'{title} source publisher is missing')
        if source.get('effectiveDate') != effective_date or source.get('retrievedAt') != retrieved_at:
            raise ValueError(f'{title} source date/version metadata is incomplete')
        if source.get('url') != expected_urls[url_key]:
            raise ValueError(f'{title} source URL differs from the fixed official archive URL')
        if source.get('sha256') != hashlib.sha256(source_bytes[filename]).hexdigest():
            raise ValueError(f'{title} checksum does not match the input XML')

    ingredients = catalogue.get('ingredients')
    products = catalogue.get('products')
    if not isinstance(ingredients, list) or not ingredients or not isinstance(products, list) or not products:
        raise ValueError('catalogue must contain ingredient terminology and product/formulation rows')
    ingredient_ids = [item.get('id') for item in ingredients]
    if len(set(ingredient_ids)) != len(ingredient_ids) or any(not item for item in ingredient_ids):
        raise ValueError('ingredient terminology IDs must be present and unique')
    valid_ingredients = set(ingredient_ids)
    product_ids = [product.get('id') for product in products]
    if len(set(product_ids)) != len(product_ids) or any(not item for item in product_ids):
        raise ValueError('product/formulation IDs must be present and unique')
    for product in products:
        if not product.get('name') or not product.get('chemical') or not product.get('formulation'):
            raise ValueError('product name, chemical heading, and formulation are required')
        if not isinstance(product.get('ingredients'), list) or not isinstance(product.get('ingredientsComplete'), bool):
            raise ValueError(f'ingredient mapping fields are malformed for {product.get("id")}')
        if not set(product['ingredients']).issubset(valid_ingredients):
            raise ValueError(f'ingredient reference is missing for {product.get("id")}')
        if product['ingredientsComplete'] and not product['ingredients']:
            raise ValueError(f'empty ingredient mapping cannot be marked complete for {product.get("id")}')
        if not product.get('schedules') or not set(product['schedules']).issubset({'Schedule', 'HML'}):
            raise ValueError(f'product source markers are invalid for {product.get("id")}')

    stats = catalogue.get('stats', {})
    complete = sum(bool(product['ingredientsComplete']) for product in products)
    if stats.get('productFormulations') != len(products):
        raise ValueError('product count does not match generated statistics')
    if stats.get('completeIngredientProducts') != complete or stats.get('incompleteIngredientProducts') != len(products) - complete:
        raise ValueError('ingredient mapping counts do not match generated rows')
    if suggestions.get('datasetVersion') != catalogue['datasetVersion'] or not isinstance(suggestions.get('names'), list) or not suggestions['names']:
        raise ValueError('name suggestions are missing or belong to a different catalogue version')
    return catalogue, suggestions


def release_semantically_equal(old, new, old_suggestions, new_suggestions):
    """Ignore only retrieval timestamp changes when deciding whether content changed."""
    if not isinstance(old, dict) or not isinstance(old_suggestions, dict):
        return False
    old_copy = json.loads(json.dumps(old))
    new_copy = json.loads(json.dumps(new))
    for value in (old_copy, new_copy):
        for source in value.get('sources', []):
            source.pop('retrievedAt', None)
    return old_copy == new_copy and old_suggestions == new_suggestions


def create_review_report(old_catalogue, new_catalogue, retrieved_at):
    old_products = {item['id']: item for item in (old_catalogue or {}).get('products', [])}
    new_products = {item['id']: item for item in new_catalogue['products']}
    added = sorted(new_products.keys() - old_products.keys())
    removed = sorted(old_products.keys() - new_products.keys())
    changed = sorted(key for key in old_products.keys() & new_products.keys() if old_products[key] != new_products[key])
    changed_ingredients = sum(old_products[key].get('ingredients') != new_products[key].get('ingredients') or old_products[key].get('ingredientsComplete') != new_products[key].get('ingredientsComplete') for key in changed)
    lines = [
        f"# Pharmac catalogue candidate: {new_catalogue['datasetVersion']}",
        '',
        'This is a source-data candidate for human review. It is not automatically merged or deployed.',
        '',
        f'- Retrieved at (UTC): `{retrieved_at}`',
        f'- Previous product/formulation rows: {len(old_products)}',
        f'- Candidate product/formulation rows: {len(new_products)}',
        f'- Added product/formulation rows: {len(added)}',
        f'- Removed product/formulation rows: {len(removed)}',
        f'- Changed product/formulation rows: {len(changed)}',
        f'- Changed ingredient mappings among changed rows: {changed_ingredients}',
        f'- Candidate complete ingredient mappings: {new_catalogue["stats"]["completeIngredientProducts"]}',
        f'- Candidate incomplete ingredient mappings retained: {new_catalogue["stats"]["incompleteIngredientProducts"]}',
        '',
        '## Source records',
        ''
    ]
    for source in new_catalogue['sources']:
        lines.append(f'- {source["title"]}, effective {source["effectiveDate"]}, SHA-256 `{source["sha256"]}`: {source["url"]}')
    lines.extend([
        '',
        '## Review notes',
        '',
        '- Confirm the source effective date, attribution, source checksums, and generated JSON validation.',
        '- Review additions, removals, name/form/strength changes, Pharmac/NZMT identifier changes, and every changed ingredient mapping against the source XML.',
        '- Incomplete ingredient mappings remain explicitly incomplete; catalogue matching does not establish approval, availability, funding, suitability, or safety.',
        '- Only the two public reference-catalogue JSON files are prepared. Patient medication records and the existing NZF/DrugBank gates are outside this updater.',
        ''
    ])
    return '\n'.join(lines)


def _write_temp(path, contents):
    fd, name = tempfile.mkstemp(prefix=f'.{path.name}.', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
    except Exception:
        Path(name).unlink(missing_ok=True)
        raise
    return Path(name)


def install_outputs(output_dir, values, replace=os.replace):
    """Replace the validated output pair together, restoring prior bytes on errors."""
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    targets = {output / name: values[name] for name in OUTPUT_NAMES}
    backups = {target: target.read_bytes() if target.exists() else None for target in targets}
    temporary = {}
    replaced = []
    try:
        for target, content in targets.items():
            temporary[target] = _write_temp(target, content)
        for target, temp_path in temporary.items():
            replace(temp_path, target)
            replaced.append(target)
    except Exception:
        rollback_errors = []
        for target in reversed(replaced):
            previous = backups[target]
            try:
                if previous is None:
                    target.unlink(missing_ok=True)
                else:
                    restore = _write_temp(target, previous)
                    replace(restore, target)
            except Exception as rollback_error:  # pragma: no cover - reported as a chained failure
                rollback_errors.append(str(rollback_error))
        if rollback_errors:
            raise RuntimeError('catalogue update failed and rollback also failed: ' + '; '.join(rollback_errors))
        raise
    finally:
        for temp_path in temporary.values():
            temp_path.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--effective-date', help='Effective date YYYY-MM-01 (default: next month in UTC)')
    parser.add_argument('--source-dir', type=Path, help='Use exact named XML files from a local directory; intended for offline review and tests')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'data/medication', help='Reference catalogue output directory')
    parser.add_argument('--retrieved-at', help='Override the UTC retrieval timestamp (for reproducible sample tests)')
    parser.add_argument('--dry-run', action='store_true', help='Validate and report without replacing catalogue files')
    parser.add_argument('--report-file', type=Path, help='Write the human review summary to a file')
    args = parser.parse_args(argv)
    effective_date = args.effective_date or next_effective_date()
    try:
        source_urls(effective_date)
        retrieved = datetime.fromisoformat((args.retrieved_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()).replace('Z', '+00:00'))
        if retrieved.tzinfo is None or retrieved.utcoffset().total_seconds() != 0:
            raise ValueError('retrieved-at timestamp must include UTC offset or Z')
        retrieved_at = retrieved.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
        source_bytes = load_inputs(effective_date, args.source_dir)
        with tempfile.TemporaryDirectory(prefix='pharmac-catalogue-candidate-') as temporary:
            temp_root = Path(temporary)
            source_dir = temp_root / 'source'
            stage_dir = temp_root / 'generated'
            source_dir.mkdir()
            stage_dir.mkdir()
            for filename, raw in source_bytes.items():
                (source_dir / filename).write_bytes(raw)
            subprocess.run([
                sys.executable, str(IMPORTER),
                str(source_dir / f'Schedule_{effective_date}.xml'),
                str(source_dir / f'HML_{effective_date}.xml'),
                '--output-dir', str(stage_dir),
                '--retrieved-at', retrieved_at
            ], check=True, capture_output=True, text=True)
            catalogue, suggestions = validate_catalogue(stage_dir, effective_date, retrieved_at, source_bytes)
            output_dir = args.output_dir.resolve()
            old_path = output_dir / OUTPUT_NAMES[0]
            old_catalogue = json.loads(old_path.read_text()) if old_path.exists() else None
            old_names_path = output_dir / OUTPUT_NAMES[1]
            old_suggestions = json.loads(old_names_path.read_text()) if old_names_path.exists() else None
            if old_catalogue:
                old_date = str(old_catalogue.get('datasetVersion', '')).split('-pharmac')[0]
                if re.fullmatch(r'\d{4}-\d{2}-\d{2}', old_date) and old_date > effective_date:
                    raise ValueError(f'candidate {effective_date} is older than current catalogue {old_date}')
            report = create_review_report(old_catalogue, catalogue, retrieved_at)
            if release_semantically_equal(old_catalogue, catalogue, old_suggestions, suggestions):
                report += '\nNo catalogue content changed; keeping the current retrieval timestamp and generated files.\n'
            elif not args.dry_run:
                values = {
                    OUTPUT_NAMES[0]: (stage_dir / OUTPUT_NAMES[0]).read_bytes(),
                    OUTPUT_NAMES[1]: (stage_dir / OUTPUT_NAMES[1]).read_bytes()
                }
                install_outputs(output_dir, values)
            if args.report_file:
                args.report_file.parent.mkdir(parents=True, exist_ok=True)
                args.report_file.write_text(report)
            print(report)
            return 0
    except Exception as error:
        print(f'Catalogue update stopped before completing: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
