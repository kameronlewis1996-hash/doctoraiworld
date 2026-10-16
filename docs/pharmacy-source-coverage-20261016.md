# Pharmac pack source coverage — 2026-10-01

Rebuild: `node scripts/measure-pharmacy-coverage.cjs --write`. Check: `node scripts/measure-pharmacy-coverage.cjs --check`. These counts come solely from the 2026-10-01 [community Pharmaceutical Schedule](https://schedule.pharmac.govt.nz/pub/schedule/archive/2026/2026-10-01/Schedule_2026-10-01.xml) and [Hospital Medicines List](https://schedule.pharmac.govt.nz/pub/HML/archive/2026/2026-10-01/HML_2026-10-01.xml) XML. The [Pharmac archive notice](https://schedule.pharmac.govt.nz/pub/schedule/archive/README.html) licenses this source under CC BY 4.0. DoctorAI normalises the names and does not claim Pharmac endorsement.

The existing medicine catalogue contains **3,419 formulations**. The new pack catalogue preserves **3,590 distinct source pack-to-formulation rows**, including **2,202 community Schedule rows** and **2,994 HML rows**; 1,606 rows occur in both. The importer excludes 534 device/special-food pack occurrences already outside the medicine catalogue. Rows are source listings, not independently verified products on sale. 868 HML rows have source quantity `0`, so that number must never be shown as a pack size.

| Source-based group | Community pack rows | Distinct formulations | Brands |
| --- | ---: | ---: | ---: |
| Pain-related source categories | 105 | 99 | 60 |
| Allergy-related source categories | 33 | 32 | 20 |
| Digestive-health source categories | 73 | 67 | 54 |
| Skin/topical source category | 110 | 95 | 76 |
| Nasal, throat and mucolytic categories | 24 | 24 | 14 |
| Funded vitamin/mineral categories | 37 | 37 | 32 |

Groups are defined by the exact Pharmac category/subcategory labels in the measurement script and may overlap. They do not measure the number of products in New Zealand pharmacies. The nasal/throat/mucolytic row is **not** a measure of branded multi-ingredient cold/flu products. Funded vitamin/mineral formulations are medicines in this source, **not** a retail supplements catalogue.

## Identity and safety boundary

The pack file records Pharmacode, NZMT CTPP ID when present, source quantity and formulation unit, and the linked formulation ID. **191 Pharmacodes** point to more than one formulation row across the two source schedules. A Pharmacode alone must not silently choose one formulation; schedule and formulation need reconciliation before product-level matching. No pack row has been added as an active interaction rule or used to declare a medicine safe. The browser safety bundle still uses the existing formulation catalogue.

Neither Pharmac schedule is an exhaustive retail catalogue. The [NZULM data-access page](https://info.nzulm.org.nz/data-access) offers a broader monthly dataset on request, with its actual licence supplied with the files; [NZULM FHIR access](https://build.fhir.org/ig/HL7NZ/nzf/howtouse.html) requires onboarding. This project has neither that dataset nor permission/accreditation for production API use. [Medsafe product search](https://www.medsafe.govt.nz/DBSearch/) can be checked individually; [Medsafe product information](https://www.medsafe.govt.nz/DbSearch/InfoSearch) says commercial reuse of sponsor data sheets/consumer information requires sponsor permission. No bulk Medsafe or retailer content was copied.

Outstanding coverage: non-funded shelf medicines, branded variants that differ from Schedule names, and retail vitamins/supplements have no verified complete source or denominator here. Their identity and interactions must remain unknown/unassessed until a licensed dataset is obtained and checked. The separate [eight-listing shelf sample](pharmacy-shelf-coverage-20261016.md) records observed mismatches, not market coverage.
