# Optional packaging-photo comparison — draft

Baseline: PR83 production commit `7bec9131662b72d74e45efbf1aaaea0eda220dbe`. This feature is not deployed.

## Implemented

Compare photo is available beside each current medicine in Today and the medicine library. It opens the existing Edit form and its optional comparison panel. Add medicine also includes that panel. The user's own JPEG/PNG/WebP packaging photo is decoded locally, honours image orientation, is bounded to 8 MB / 24 megapixels and resized to 1600px maximum. Canvas JPEG re-encoding removes original EXIF/location metadata from the displayed preview. Rotation, removal, reset and repeated selection are supported. A corrupt, empty, unsupported or oversized file produces an explicit error.

The preview and visual choice exist only in the open form's memory. They never enter medication state, local/session storage, IndexedDB, account sync, a document attachment, analytics or the paid scan endpoint. Closing, saving, replacement of the form, account verification/change/sign-out, refresh and page exit clear the preview. A revision guard discards late image decoding after reset or account change. Original local files are not modified. The site's existing CSP remains unchanged; the re-encoded in-memory data URL uses the already permitted image policy.

The reference panel and metadata are adjacent on desktop and stack on narrow screens. The form shows the entered medicine name, strength/dose and ingredients, explicitly labelled as entered text. Brand/exact product, form/route and region remain unresolved. User choices are text looks consistent, mismatch or unsure. A visual choice never confirms active ingredients, resolves identity, establishes authenticity/safety, changes health-alert severity or modifies the independent scan-review gate. Loose tablets must not be identified by appearance.

## Reference-image blocker and gate

No approved exact-product reference images are available in this repository. The shipped catalogue is deliberately empty. The UI displays **Exact product identity unresolved** and **No licensed reference image available**. No retailer/manufacturer image was scraped, no AI medicine image was created and no remote product-image request is made.

Before a real reference can be added, a separate trusted exact-product resolver must supply status `resolved`, method `exact-product-catalogue`, productKey and evidence. User-entered names, Pharmac name suggestions, OCR output and visual choices do not satisfy this contract. Integration currently supplies no resolved identity.

A unique catalogue record must include brand, all active ingredients, strength, form, route and region. Rights metadata must include approved status, a licence/written-permission/public-domain basis, rights holder, source URL, attribution, approving reviewer, review date, optional unexpired permission end date and a `docs/medicine-reference-rights/<id>.md` record. The image must be an approved local JPEG/PNG/WebP under `/assets/medicine-references/`, with SHA-256 and meaningful alt text. Remote URLs, SVGs, ambiguous mappings, missing metadata, pending/expired rights and missing references fail closed. Before enabling references, review and verify the actual permission document, asset bytes/hash and packaging currentness; metadata strings alone do not grant legal permission. The general catalogue's text-data licence does not establish image rights.

## Future upload/persistence requirements

This draft does not add an upload or private attachment service. Any future upload needs a separate explicit consent step describing recipients/processors, purpose, retention, deletion, account boundaries and access grants. Re-encode and inspect metadata before transmission, never send the original EXIF/location fields or original filename by default, apply authenticated object-level storage access and revocable sharing, and document deletion/backups. Neither device-storage consent nor scanner consent authorises a new photo store. Resolve these details before enabling persistence; do not create services or grants from this draft.

## Verification

`verify:medicine-photo` covers exact identity, completeness, rights/expiry/local-asset gates and file limits. `verify:medicine-photo-browser` uses abstract synthetic test images with no medicine/personal labels, at 320/390/1440px. It covers keyboard entry, EXIF orientation/removal, rotation, formats/repeated selection, corrupt/spoofed/empty/size/pixel errors, reset during delayed decoding, removal, save/reopen/refresh, anonymous/A/B/sign-out boundaries, independence from ingredient confirmation and six axe states. Screenshots are under `docs/design/medicine-photo-20261016/`. Existing medication recognition, alerts and privacy regression checks are run separately.

Reference-photo clinical usefulness, rights/currentness approval and pharmacist adjudication remain open. This draft is a visual aid, not clinical approval.
