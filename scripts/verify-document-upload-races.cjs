'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'health-hub.js'), 'utf8');
const start = source.indexOf('  async function addDocument(');
const end = source.indexOf('  async function deleteDocument(', start);
assert.ok(start > 0 && end > start);
const defer = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const file = { name: 'synthetic.pdf', size: 42 };
function fixture({ read, response, pro = true } = {}) {
  const calls = [], toasts = [], dialogs = [];
  const context = vm.createContext({
    healthOwnerRevision: 1, accountSessionRevision: 1, authUser: { email: 'a@example.invalid' }, documentUploadBusy: false,
    currentSessionOwnerVerified: () => true, hasProAccess: () => pro,
    documentCaptureAllowed(value) { return !!value && value.owner === context.healthOwnerRevision && value.session === context.accountSessionRevision && context.currentSessionOwnerVerified() && !!context.authUser && context.hasProAccess(); },
    documentDetails: () => ({ category: 'other', type: 'Medical document' }),
    fileAsDataUrl: () => read ? read.promise : Promise.resolve('data:application/pdf;base64,QQ=='),
    fetch: async () => { calls.push('POST'); return response ? response.promise : { ok: true, json: async () => ({ document: { id: 'synthetic-id' } }) }; },
    showToast: value => toasts.push(value), setModal: (title, eyebrow, body) => dialogs.push({ title, eyebrow, body }), escapeHTML: String, openGoogleSignIn() {}, window: { location: {} },
    state: { documents: [], timeline: [] }, formatFileSize: () => '1 KB', saveState() {},
    renderResults() {}, renderDocuments() {}, renderTimeline() {}, renderActivity() {}, Date, JSON
  });
  vm.runInContext(source.slice(start, end), context);
  return { context, calls, toasts, dialogs, upload: () => context.addDocument(file, { owner: context.healthOwnerRevision, session: context.accountSessionRevision }) };
}
(async () => {
  const read = defer(), pendingRead = fixture({ read });
  const first = pendingRead.upload();
  pendingRead.context.healthOwnerRevision++; pendingRead.context.accountSessionRevision++;
  read.resolve('data:application/pdf;base64,QQ=='); await first;
  assert.equal(pendingRead.calls.length, 0, 'account switch during file read must prevent a new upload');

  const response = defer(), pendingResponse = fixture({ response });
  const second = pendingResponse.upload(); await Promise.resolve();
  pendingResponse.context.healthOwnerRevision++; pendingResponse.context.accountSessionRevision++;
  response.resolve({ ok: true, json: async () => ({ document: { id: 'synthetic-id' } }) }); await second;
  assert.equal(pendingResponse.context.state.documents.length, 0, 'old response must not populate the new account');
  assert.ok(!pendingResponse.toasts.some(text => text.includes('added to your private library')));

  const free = fixture({ pro: false }); await free.upload();
  assert.equal(free.calls.length, 0, 'Free tier must not send an upload');

  const slow = defer(), duplicate = fixture({ read: slow });
  const ongoing = duplicate.upload(); await duplicate.upload();
  assert.ok(duplicate.toasts.some(text => text.includes('already in progress')));
  slow.resolve('data:application/pdf;base64,QQ=='); await ongoing;
  assert.equal(duplicate.calls.length, 1, 'concurrent selection must send only one upload');
  assert.equal(duplicate.context.state.documents.length, 1);

  const failed = fixture(); let attempt = 0;
  failed.context.fetch = async () => { attempt++; if (attempt === 1) throw new Error('synthetic network error'); return { ok: true, json: async () => ({ document: { id: 'retry-id' } }) }; };
  await failed.upload();
  assert.ok(failed.toasts.some(text => text.includes('could not be confirmed') && text.includes('before trying again')));
  assert.equal(failed.context.state.documents.length, 0);
  await failed.upload();
  assert.equal(failed.context.state.documents.length, 1, 'retry is available after an error');

  const serverError = fixture();
  serverError.context.fetch = async () => ({ ok: false, json: async () => ({ error: 'Secure document storage is unavailable right now.' }) });
  await serverError.upload();
  assert.equal(serverError.context.state.documents.length, 0);
  assert.ok(serverError.toasts.includes('Secure document storage is unavailable right now.'));

  const cleanupError = fixture();
  cleanupError.context.fetch = async () => ({ ok: false, json: async () => ({ code: 'document_cleanup_incomplete', reference: 'doc-12345678-1234-1234-1234-123456789abc', error: 'The upload did not finish and cleanup could not be confirmed.' }) });
  await cleanupError.upload();
  assert.equal(cleanupError.context.state.documents.length, 0);
  assert.equal(cleanupError.dialogs.length, 1, 'cleanup reference must remain visible in a dialog');
  assert.match(cleanupError.dialogs[0].body, /doc-12345678-1234-1234-1234-123456789abc/);
  assert.match(cleanupError.dialogs[0].body, /support@doctoraiworld\.com/);

  const malformed = fixture();
  malformed.context.fetch = async () => ({ ok: true, json: async () => ({}) });
  await malformed.upload();
  assert.equal(malformed.context.state.documents.length, 0, 'a malformed success response is not shown as a saved document');
  assert.ok(malformed.toasts.some(text => text.includes('could not be confirmed')));

  const pickerStart = source.indexOf('  const documentPickerContexts =');
  const pickerEnd = source.indexOf('  let documentCaptureContext =', pickerStart);
  assert.ok(pickerStart > 0 && pickerEnd > pickerStart);
  let uploads = 0, clicks = 0;
  const input = { value: '', files: [file], click() { clicks++; } };
  const picker = vm.createContext({ Map, healthOwnerRevision: 1, accountSessionRevision: 1,
    entitlementReady: true, authUser: { email: 'a@example.invalid' }, hasProAccess: () => true,
    currentSessionOwnerVerified: () => true, document: { getElementById: () => input },
    window: { location: {} }, showToast() {}, openGoogleSignIn() {}, addDocument() { uploads++; },
    documentCaptureAllowed(value) { return value && value.owner === picker.healthOwnerRevision && value.session === picker.accountSessionRevision; }
  });
  vm.runInContext(source.slice(pickerStart, pickerEnd), picker);
  await picker.openDocumentFilePicker('document-upload'); assert.equal(clicks, 1);
  picker.healthOwnerRevision++; picker.accountSessionRevision++;
  picker.documentFileChosen({ target: input });
  assert.equal(uploads, 0, 'account switch while picker is open prevents upload');
  console.log('Document upload synthetic picker, owner-switch, duplicate, retry and Free-tier checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
