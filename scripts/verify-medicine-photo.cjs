'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {gateReference,validateFile,limits}=require('../medicine-photo-review.js');
const identity={status:'resolved',method:'exact-product-catalogue',productKey:'synthetic-test-only',evidence:'Synthetic contract fixture, never a real product'};
const reference={productKey:identity.productKey,brand:'Synthetic fixture',ingredients:['Synthetic ingredient'],strength:'Synthetic strength',form:'Synthetic form',route:'Synthetic route',region:'Synthetic region',rights:{status:'approved',basis:'written-permission',holder:'Test fixture author',sourceUrl:'https://example.invalid/test-only',documentationPath:'docs/medicine-reference-rights/synthetic-test-only.md',attribution:'Synthetic test image only',approvedBy:'Test reviewer',reviewedAt:'2026-10-15T00:00:00Z'},asset:{path:'/assets/medicine-references/synthetic-test-only.png',sha256:'a'.repeat(64),alt:'Synthetic test image'}};
const now=Date.parse('2026-10-16T00:00:00Z');
assert.equal(gateReference(null,[reference],now).state,'unresolved');
assert.equal(gateReference({...identity,method:'photo-confirmation'},[reference],now).state,'unresolved');
assert.equal(gateReference(identity,[],now).state,'no-reference');
assert.equal(gateReference(identity,[reference,reference],now).state,'no-reference');
assert.equal(gateReference(identity,[reference],now).state,'available');
for(const field of ['brand','ingredients','strength','form','route','region']) { const r=structuredClone(reference);delete r[field];assert.equal(gateReference(identity,[r],now).state,'metadata-incomplete',field); }
for(const field of ['holder','sourceUrl','documentationPath','attribution','approvedBy','reviewedAt']) { const r=structuredClone(reference);delete r.rights[field];assert.equal(gateReference(identity,[r],now).state,'rights-unconfirmed',field); }
for(const change of [{status:'pending'},{basis:'web-search'},{expiresAt:'2026-10-15T00:00:00Z'},{expiresAt:'invalid'},{reviewedAt:'2027-01-01T00:00:00Z'}]){const r=structuredClone(reference);Object.assign(r.rights,change);assert.equal(gateReference(identity,[r],now).state,'rights-unconfirmed');}
for(const url of ['https://example.invalid/image.png','//example.invalid/image.png','/assets/medicine-references/../unapproved.png','/assets/medicine-references/file.svg','/api/documents/image.png']){const r=structuredClone(reference);r.asset.path=url;assert.equal(gateReference(identity,[r],now).state,'asset-unapproved',url);}
const jpg=Uint8Array.from([255,216,255]);validateFile({type:'image/jpeg',size:100},jpg);
validateFile({type:'image/png',size:100},Uint8Array.from([137,80,78,71,13,10,26,10]));
validateFile({type:'image/webp',size:100},Uint8Array.from(Buffer.from('RIFF0000WEBP')));
assert.throws(()=>validateFile({type:'image/jpeg',size:0},jpg),/empty/);
assert.throws(()=>validateFile({type:'image/jpeg',size:limits.maxBytes+1},jpg),/8 MB/);
assert.throws(()=>validateFile({type:'image/svg+xml',size:100},jpg),/file type/);
assert.throws(()=>validateFile({type:'image/jpeg',size:100},[]),/file type/);
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'medicine-photo-review.js'),'utf8');
assert.doesNotMatch(source,/\bfetch\s*\(|localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest/,'Photo module has no transport or persistent store');
assert.match(source,/APPROVED_REFERENCES = Object\.freeze\(\[\]\)/,'Production reference catalogue remains empty pending rights and exact identity');
console.log('Medicine photo contract passed: exact identity, complete metadata, rights/expiry/local asset gates and file limits.');
