#!/usr/bin/env python3
"""Offline synthetic checks for the Pharmac catalogue review updater."""
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPDATER = ROOT / 'scripts/prepare-pharmac-catalogue.py'
spec = importlib.util.spec_from_file_location('pharmac_updater', UPDATER)
updater = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = updater
spec.loader.exec_module(updater)


def xml_file(title, chemical, brand, form, pack_code):
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<Schedule xmlns="http://schedule.pharmac.govt.nz/2006/07/Schedule#" xmlns:nzmt="nzmt.org.nz">
  <Front><Published>2026-11-01</Published><Title>{title}</Title></Front>
  <Section><ATC1><Name>Sample section</Name>
    <Chemical><Name>{chemical}</Name><Formulation><Name>{form}</Name>
      <Brand><Name>{brand}</Name><Pack ID="P{pack_code}" nzmt:ctpp_id="50000011000117100" /></Brand>
    </Formulation></Chemical>
  </ATC1></Section>
</Schedule>'''.encode()


def run_updater(source_dir, output_dir, report, retrieved_at):
    return subprocess.run([
        sys.executable, str(UPDATER),
        '--effective-date', '2026-11-01',
        '--source-dir', str(source_dir),
        '--output-dir', str(output_dir),
        '--retrieved-at', retrieved_at,
        '--report-file', str(report)
    ], capture_output=True, text=True)


def check_versioned_sources_and_review_report(root):
    root.mkdir(parents=True, exist_ok=True)
    sources = root / 'inputs'
    output = root / 'output'
    report = root / 'review.md'
    sources.mkdir()
    source_bytes = {
        'Schedule_2026-11-01.xml': xml_file('Pharmaceutical Schedule', 'Ibuprofen', 'Sample brand', 'Tab 200 mg', '12345'),
        'HML_2026-11-01.xml': xml_file('Hospital Medicines List', 'Paracetamol', 'Sample hospital brand', 'Tab 500 mg', '67890')
    }
    for filename, raw in source_bytes.items():
        (sources / filename).write_bytes(raw)
    retrieved_at = '2026-10-04T12:00:00Z'
    result = run_updater(sources, output, report, retrieved_at)
    assert result.returncode == 0, result.stderr
    catalogue = json.loads((output / 'nz-pharmac-medicines.json').read_text())
    names = json.loads((output / 'nz-medicine-names.json').read_text())
    assert catalogue['datasetVersion'] == '2026-11-01-pharmac'
    assert {source['title'] for source in catalogue['sources']} == {'Pharmaceutical Schedule', 'Hospital Medicines List'}
    for source, filename in zip(catalogue['sources'], ['Schedule_2026-11-01.xml', 'HML_2026-11-01.xml']):
        assert source['retrievedAt'] == retrieved_at
        assert source['sha256'] == hashlib.sha256(source_bytes[filename]).hexdigest()
    assert catalogue['licence']['name'] == 'CC BY 4.0'
    assert catalogue['informationLinks'][0]['url'] == 'https://www.medsafe.govt.nz/DbSearch/InfoSearch'
    assert names['datasetVersion'] == catalogue['datasetVersion']
    assert len(catalogue['products']) == 2
    assert '- Added product/formulation rows: 2' in report.read_text()
    assert 'not automatically merged or deployed' in report.read_text()

    before = {name: (output / name).read_bytes() for name in updater.OUTPUT_NAMES}
    repeated = run_updater(sources, output, report, '2026-10-05T12:00:00Z')
    assert repeated.returncode == 0, repeated.stderr
    assert {name: (output / name).read_bytes() for name in updater.OUTPUT_NAMES} == before
    assert 'No catalogue content changed' in report.read_text()


def check_invalid_input_leaves_current_catalogue_untouched(root):
    root.mkdir(parents=True, exist_ok=True)
    sources = root / 'inputs'
    output = root / 'output'
    report = root / 'review.md'
    sources.mkdir()
    output.mkdir()
    (sources / 'Schedule_2026-11-01.xml').write_bytes(xml_file('Pharmaceutical Schedule', 'Ibuprofen', 'Sample', 'Tab 200 mg', '12345'))
    (sources / 'HML_2026-11-01.xml').write_bytes(b'<wrong-root/>')
    for filename in updater.OUTPUT_NAMES:
        (output / filename).write_text('previous-reviewed-release\n')
    before = {name: (output / name).read_bytes() for name in updater.OUTPUT_NAMES}
    result = run_updater(sources, output, report, '2026-10-04T12:00:00Z')
    assert result.returncode != 0
    assert {name: (output / name).read_bytes() for name in updater.OUTPUT_NAMES} == before


def check_pair_rollback_after_replace_failure(root):
    root.mkdir(parents=True, exist_ok=True)
    output = root / 'rollback'
    output.mkdir()
    for filename in updater.OUTPUT_NAMES:
        (output / filename).write_bytes(f'previous:{filename}'.encode())
    before = {filename: (output / filename).read_bytes() for filename in updater.OUTPUT_NAMES}
    replacements = 0

    def fail_second_replace(source, destination):
        nonlocal replacements
        replacements += 1
        if replacements == 2:
            raise OSError('synthetic replace failure')
        os.replace(source, destination)

    try:
        updater.install_outputs(output, {filename: f'candidate:{filename}'.encode() for filename in updater.OUTPUT_NAMES}, replace=fail_second_replace)
    except OSError as error:
        assert 'synthetic replace failure' in str(error)
    else:
        raise AssertionError('injected output replace failure should surface')
    assert {filename: (output / filename).read_bytes() for filename in updater.OUTPUT_NAMES} == before


def check_source_allowlist_and_dates():
    urls = updater.source_urls('2026-11-01')
    assert all(url.startswith('https://schedule.pharmac.govt.nz/') for url in urls.values())
    for bad_date in ['2026-11-02', 'not-a-date', '2026-13-01']:
        try:
            updater.source_urls(bad_date)
        except ValueError:
            pass
        else:
            raise AssertionError(f'invalid effective date accepted: {bad_date}')
    try:
        updater.download_source('https://example.org/medicine.xml', opener=lambda *_args, **_kwargs: None)
    except ValueError as error:
        assert 'official Pharmac archive host' in str(error)
    else:
        raise AssertionError('non-Pharmac URL accepted')


def main():
    check_source_allowlist_and_dates()
    with tempfile.TemporaryDirectory(prefix='doctorai-pharmac-test-') as temporary:
        root = Path(temporary)
        check_versioned_sources_and_review_report(root / 'generated')
        check_invalid_input_leaves_current_catalogue_untouched(root / 'invalid')
        check_pair_rollback_after_replace_failure(root / 'rollback-case')
    print('Pharmac catalogue updater verification passed: fixed official URL allowlist, versioned synthetic source provenance, consistency review, invalid-input fail-closed behavior, idempotent rerun, and output-pair rollback.')


if __name__ == '__main__':
    main()
