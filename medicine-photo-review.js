(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DoctorAIMedicinePhotoReview = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const MAX_BYTES = 8 * 1024 * 1024;
  const MAX_PIXELS = 24_000_000;
  // Deliberately empty: no exact-product photos have documented reuse permission.
  const APPROVED_REFERENCES = Object.freeze([]);
  let active = null;
  const text = value => typeof value === 'string' ? value.trim() : '';
  const present = value => Boolean(text(value));

  function gateReference(identity, catalogue = APPROVED_REFERENCES, now = Date.now()) {
    if (identity?.status !== 'resolved' || identity?.method !== 'exact-product-catalogue' || !present(identity.productKey) || !present(identity.evidence)) return { state: 'unresolved' };
    const matches = catalogue.filter(item => item.productKey === identity.productKey);
    if (matches.length !== 1) return { state: 'no-reference' };
    const product = matches[0];
    if (![product.brand, product.strength, product.form, product.route, product.region].every(present) || !Array.isArray(product.ingredients) || !product.ingredients.length || !product.ingredients.every(present)) return { state: 'metadata-incomplete' };
    const rights = product.rights || {};
    const approvedAt = Date.parse(rights.reviewedAt);
    const expiresAt = rights.expiresAt ? Date.parse(rights.expiresAt) : Infinity;
    if (rights.status !== 'approved' || !['licence', 'written-permission', 'public-domain'].includes(rights.basis) || ![rights.holder, rights.attribution, rights.approvedBy].every(present) || !/^https:\/\//.test(rights.sourceUrl || '') || !/^docs\/medicine-reference-rights\/[a-z0-9-]+\.md$/.test(rights.documentationPath || '') || !Number.isFinite(approvedAt) || approvedAt > now || !(expiresAt > now)) return { state: 'rights-unconfirmed' };
    const asset = product.asset || {};
    if (!/^\/assets\/medicine-references\/[a-z0-9-]+\.(png|jpe?g|webp)$/.test(asset.path || '') || !/^[a-f0-9]{64}$/.test(asset.sha256 || '') || !present(asset.alt)) return { state: 'asset-unapproved' };
    return { state: 'available', product };
  }

  function validateFile(file, header) {
    if (!file || !file.size) throw new Error('Choose a photo that is not empty.');
    if (file.size > MAX_BYTES) throw new Error('Choose a photo smaller than 8 MB.');
    const bytes = Array.from(header || []);
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const png = [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v);
    const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
    if (!(jpeg && file.type === 'image/jpeg' || png && file.type === 'image/png' || webp && file.type === 'image/webp')) throw new Error('Choose a JPG, PNG or WebP photo. This file type cannot be previewed here.');
  }

  function clear() { active?.dispose(); active = null; }

  function mount(form, options = {}) {
    clear();
    if (!form?.isConnected) return;
    const doc = form.ownerDocument;
    const view = doc.defaultView;
    const panel = doc.createElement('details');
    panel.className = 'medicine-photo-review';
    panel.innerHTML = '<summary>Compare packaging photo <span>Optional · stays in this open form</span></summary>' +
      '<div class="medicine-photo-content"><p>Compare your package with the text you entered. A similar-looking pack does not establish product identity, authenticity or medicine safety. Do not use this to identify loose tablets.</p>' +
      '<p class="medicine-photo-privacy" id="medicine-photo-privacy"><b>Private preview:</b> this photo stays in memory in this open form. It is not uploaded, saved with your medicine, or sent to AI. Closing, saving, refreshing or changing accounts clears it. The preview is re-encoded to remove the original file metadata. Cover your name and address before choosing a photo.</p>' +
      '<div class="medicine-photo-columns"><section class="medicine-photo-card" aria-labelledby="medicine-own-photo-title"><h3 id="medicine-own-photo-title">Your packaging photo</h3><label class="medicine-photo-file" for="medicine-own-photo">Choose a packaging photo</label><input id="medicine-own-photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="medicine-photo-privacy medicine-photo-limits"><p id="medicine-photo-limits">JPG, PNG or WebP · up to 8 MB and 24 megapixels</p><div class="medicine-photo-stage"><p data-own-empty>No photo selected.</p><img data-own-photo hidden alt="Your selected packaging photo, for your own visual comparison"></div><div class="medicine-photo-actions"><button type="button" class="secondary-button" data-photo-rotate="-1" disabled aria-label="Rotate packaging photo left">Rotate left</button><button type="button" class="secondary-button" data-photo-rotate="1" disabled aria-label="Rotate packaging photo right">Rotate right</button><button type="button" class="text-button" data-photo-remove disabled>Remove photo</button></div></section>' +
      '<section class="medicine-photo-card" aria-labelledby="medicine-reference-title"><h3 id="medicine-reference-title">Exact-product reference</h3><p class="medicine-reference-state" data-reference-state></p><div class="medicine-photo-stage" data-reference-stage><p>No licensed reference image available.</p></div><p data-reference-attribution hidden></p><p class="medicine-photo-note">Reference images require an exact product, strength, form, route and region, plus documented image reuse rights.</p></section></div>' +
      '<section class="medicine-photo-identity" aria-labelledby="medicine-photo-details-title"><h3 id="medicine-photo-details-title">Details to compare</h3><p data-photo-identity-note></p><dl data-photo-metadata></dl></section>' +
      '<fieldset class="medicine-photo-verdict" disabled><legend>Your visual comparison</legend><p>Compare the visible label with the text above. This choice stays in this open form and does not confirm ingredients or affect health alerts.</p><label><input type="radio" name="photoVisualResult" value="consistent">The visible text looks consistent</label><label><input type="radio" name="photoVisualResult" value="mismatch">I see a mismatch</label><label><input type="radio" name="photoVisualResult" value="unsure">I’m unsure</label></fieldset>' +
      '<p class="medicine-photo-status" role="status" aria-live="polite" data-photo-status>Choose a photo to begin a visual comparison.</p><button type="button" class="text-button" data-photo-reset>Reset comparison</button></div>';
    form.querySelector('.modal-actions')?.before(panel);
    if (!panel.isConnected) form.append(panel);
    const $ = selector => panel.querySelector(selector);
    const input = $('#medicine-own-photo');
    const image = $('[data-own-photo]');
    const status = $('[data-photo-status]');
    const verdict = $('.medicine-photo-verdict');
    const abort = new view.AbortController();
    const signal = abort.signal;
    let revision = 0, sanitized = null, ownUrl = '', disposed = false;
    const reference = gateReference(options.identity, options.catalogue);
    const note = $('[data-reference-state]');
    note.textContent = reference.state === 'available' ? 'Exact-product reference available' : reference.state === 'unresolved' ? 'Exact product identity unresolved' : 'Reference image not available for this exact product';
    if (reference.state === 'available') {
      const ref = doc.createElement('img');
      ref.alt = reference.product.asset.alt;
      ref.src = reference.product.asset.path;
      ref.addEventListener('error', () => { ref.remove(); $('[data-reference-stage]').textContent = 'The reference image could not be loaded. Do not assume a visual match.'; note.textContent = 'Reference image unavailable'; resetVerdict(); }, { signal });
      $('[data-reference-stage]').replaceChildren(ref);
      $('[data-reference-attribution]').hidden = false;
      $('[data-reference-attribution]').textContent = reference.product.rights.attribution;
    }
    function resetVerdict() { panel.querySelectorAll('[name="photoVisualResult"]').forEach(radio => { radio.checked = false; }); }
    function metadata() {
      const value = name => text(form.elements[name]?.value);
      const p = reference.product;
      const fields = p ? [['Brand',p.brand],['Active ingredients',p.ingredients.join('; ')],['Strength',p.strength],['Form / route',p.form + ' / ' + p.route],['Region',p.region]] : [['Saved medicine name',value('name') || 'Not entered'],['Brand / exact product','Not resolved'],['Ingredients you entered',value('activeIngredients') || 'Not entered'],['Strength / dose you entered',value('dose') || 'Not entered'],['Form / route','Not resolved'],['Region','Not resolved']];
      $('[data-photo-identity-note]').textContent = p ? 'Reference metadata belongs to the separately resolved product. Check your saved text against it.' : 'Your entered text is shown below. A name suggestion, scan or photo does not resolve an exact product.';
      const dl = $('[data-photo-metadata]'); dl.replaceChildren();
      fields.forEach(([label, value]) => { const dt = doc.createElement('dt'), dd = doc.createElement('dd');dt.textContent = label;dd.textContent = value;dl.append(dt,dd); });
    }
    function reset(message = 'Photo and visual comparison cleared from this form.') {
      revision++; input.value = ''; sanitized = null;
      ownUrl = ''; image.removeAttribute('src'); image.hidden = true; $('[data-own-empty]').hidden = false;
      panel.querySelectorAll('[data-photo-rotate], [data-photo-remove]').forEach(button => { button.disabled = true; });
      verdict.disabled = true;resetVerdict();status.textContent = message;
    }
    async function display(canvas, token) {
      // data: is already permitted by the site's image policy; no CSP expansion is needed.
      const encoded = canvas.toDataURL('image/jpeg', .86);
      if (!encoded.startsWith('data:image/jpeg;base64,')) throw new Error('This browser could not prepare a private preview. Try another photo.');
      if (disposed || token !== revision) return;
      ownUrl = encoded;image.src = ownUrl;image.hidden = false;$('[data-own-empty]').hidden = true;
      panel.querySelectorAll('[data-photo-rotate], [data-photo-remove]').forEach(button => { button.disabled = false; });verdict.disabled = false;
      status.textContent = 'Private photo preview ready. Check the visible label against the details you entered. Exact identity and safety are not confirmed.';
    }
    async function choose(file) {
      reset('Preparing a private preview…');const token = revision;
      try {
        if (!file || !file.size || file.size > MAX_BYTES) validateFile(file, []);
        validateFile(file, new Uint8Array(await file.slice(0,16).arrayBuffer()));
        if (disposed || token !== revision) return;
        const bitmap = await view.createImageBitmap(file, { imageOrientation: 'from-image' });
        let canvas;
        try {
          if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS) throw new Error('Choose a photo with no more than 24 megapixels.');
          if (disposed || token !== revision) return;
          const scale = Math.min(1,1600 / Math.max(bitmap.width,bitmap.height));canvas = doc.createElement('canvas');canvas.width = Math.max(1,Math.round(bitmap.width*scale));canvas.height = Math.max(1,Math.round(bitmap.height*scale));
          const ctx = canvas.getContext('2d',{alpha:false});if(!ctx) throw new Error('This browser cannot prepare the photo preview.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        } finally { bitmap.close(); }
        if (disposed || token !== revision) return;
        sanitized = canvas;await display(canvas,token);
      } catch (error) { if (!disposed && token === revision) { reset();status.textContent = error instanceof Error && /^(Choose|This browser)/.test(error.message) ? error.message : 'This photo could not be opened. Choose another JPG, PNG or WebP image.'; } }
      finally { input.value = ''; }
    }
    input.addEventListener('change', () => { const file = input.files?.[0];if(file) choose(file); }, { signal });
    image.addEventListener('error', () => reset('This photo preview could not be displayed. Choose another photo.'), { signal });
    panel.addEventListener('click', async event => {
      if (event.target.closest('[data-photo-remove], [data-photo-reset]')) { reset();input.focus();return; }
      const button = event.target.closest('[data-photo-rotate]');if(!button || !sanitized) return;
      const token = ++revision;resetVerdict();const canvas=doc.createElement('canvas');canvas.width=sanitized.height;canvas.height=sanitized.width;const ctx=canvas.getContext('2d',{alpha:false});
      if (!ctx) { reset('This browser could not rotate the preview. Choose the photo again.');return; }
      ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(Number(button.dataset.photoRotate)*Math.PI/2);ctx.drawImage(sanitized,-sanitized.width/2,-sanitized.height/2);sanitized=canvas;
      try { await display(canvas,token); } catch { if(token===revision) reset('The rotated preview could not be prepared. Choose the photo again.'); }
    }, { signal });
    verdict.addEventListener('change', event => {
      const messages = { consistent:'Visual text comparison only. Product identity, authenticity, ingredients and safety remain unconfirmed.', mismatch:'Mismatch noted for this open form. Check and correct the saved details against the original label, or ask a pharmacist if you cannot reconcile them.', unsure:'Comparison is unsure. Ask a pharmacist to help check the original package and prescription.' };
      status.textContent=messages[event.target.value] || 'No visual comparison selected.';
    }, { signal });
    form.addEventListener('input', event => { if(['name','dose','activeIngredients'].includes(event.target.name)) { metadata();resetVerdict();if(sanitized)status.textContent='Details changed. Compare the photo again; the previous visual choice was cleared.'; } }, { signal });
    metadata();
    active = { dispose() { if(disposed)return;reset();disposed=true;abort.abort();panel.remove(); } };
    view.addEventListener('pagehide', clear, { signal });
    return active;
  }
  return Object.freeze({ mount, clear, gateReference, validateFile, limits: Object.freeze({ maxBytes:MAX_BYTES,maxPixels:MAX_PIXELS }) });
});
