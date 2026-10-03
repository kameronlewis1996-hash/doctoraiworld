(() => {
  'use strict';

  const toggleButtons = [...document.querySelectorAll('[data-plan]')];
  const price = document.querySelector('[data-price]');
  const period = document.querySelector('[data-period]');
  const equivalent = document.querySelector('[data-equivalent]');
  const selectedPlan = document.querySelector('#selected-plan-price');
  const dialog = document.querySelector('#checkout-dialog');
  const checkoutStatus = document.querySelector('#checkout-status');
  const checkoutCodeForm = document.querySelector('#checkout-code-form');
  const checkoutCodeStatus = document.querySelector('#checkout-code-status');
  const subscribeButton = document.querySelector('[data-subscribe]');
  const manageBillingButtons = [...document.querySelectorAll('[data-manage-billing]')];
  const confirmCheckoutButton = document.querySelector('[data-confirm-checkout]');
  const termsConfirm = document.querySelector('#checkout-terms-confirm');
  const renewalNote = document.querySelector('#checkout-renewal-note');
  const originalSubscribeLabel = subscribeButton?.innerHTML || 'Start Pro subscription <span>→</span>';
  const previewPricingOnly = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.endsWith('.vercel.app');
  let currentCheckoutSessionId = null;
  let selectedBillingPlan = 'monthly';
  let planPricing = null;
  const initialQuery = new URLSearchParams(window.location.search);
  const marketSelect = document.querySelector('#pricing-market');
  let selectedMarket = ['NZ', 'INTL'].includes(initialQuery.get('region')) ? initialQuery.get('region') : previewPricingOnly ? 'NZ' : '';
  let pricingLoadTicket = 0;
  let checkoutBusy = false;
  let checkoutAttemptId = crypto.randomUUID();
  if (marketSelect) marketSelect.value = selectedMarket;
  const accessCodeFromLink = initialQuery.get('access_code') || '';
  const requestedBillingPlan = initialQuery.get('plan') === 'annual' ? 'annual' : 'monthly';

  const accessPanel = document.createElement('section');
  accessPanel.className = 'pro-access-panel';
  accessPanel.innerHTML = '<b>Have a DoctorAI Pro access code?</b><p>Sign in with Google first, then enter your complimentary access code. It will be linked to your DoctorAI account.</p><form><input required autocomplete="one-time-code" placeholder="Access code" aria-label="DoctorAI Pro access code"><button>Activate Pro</button></form><small aria-live="polite"></small>';
  const planSection = document.querySelector('#plans');
  if (planSection) planSection.parentNode.insertBefore(accessPanel, planSection);
  if (previewPricingOnly) accessPanel.hidden = true;
  accessPanel.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault(); if (previewPricingOnly) return; const note = accessPanel.querySelector('small'); const code = accessPanel.querySelector('input').value.trim() || accessCodeFromLink; note.textContent = 'Checking code…';
    try { const response = await fetch('/api/staff/redeem-pro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Code could not be accepted.'); note.textContent = 'DoctorAI Pro is active for 30 days. Return to the Health Hub to use Pro features.'; } catch (error) { note.textContent = error instanceof Error ? error.message : 'Code could not be accepted.'; }
  });
  if (accessCodeFromLink && !previewPricingOnly) {
    accessPanel.querySelector('input').value = accessCodeFromLink;
    accessPanel.querySelector('input').defaultValue = accessCodeFromLink;
    if (checkoutCodeForm) {
      checkoutCodeForm.querySelector('input').value = accessCodeFromLink;
      checkoutCodeForm.querySelector('input').defaultValue = accessCodeFromLink;
    }
    accessPanel.querySelector('small').textContent = 'Your personal access code is ready. Sign in with Google in the Health Hub, then return here and select Activate Pro.';
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash || '#plans'}`);
  }

  const planIsAvailable = plan => Boolean(planPricing?.[plan]?.available);
  const syncPlanControls = () => {
    if (previewPricingOnly) {
      if (subscribeButton) subscribeButton.disabled = true;
      if (confirmCheckoutButton) confirmCheckoutButton.disabled = true;
      return;
    }
    const available = planIsAvailable(selectedBillingPlan);
    if (subscribeButton) subscribeButton.disabled = !available;
    if (confirmCheckoutButton) confirmCheckoutButton.disabled = !(available && termsConfirm?.checked);
  };
  const formatUsd = amount => `${selectedMarket === 'NZ' ? 'NZ$' : 'US$'}${(Number(amount) / 100).toFixed(2)}`;
  const setPlan = plan => {
    const selected = plan === 'annual' ? 'annual' : 'monthly';
    if (!planIsAvailable(selected)) return false;
    const annual = selected === 'annual';
    selectedBillingPlan = selected;
    toggleButtons.forEach(button => {
      const active = button.dataset.plan === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const current = planPricing[selected];
    const monthly = planPricing.monthly;
    const yearly = planPricing.annual;
    const annualEquivalent = yearly?.available ? yearly.amount / 12 : 0;
    const savings = monthly?.available && annualEquivalent > 0 && annualEquivalent < monthly.amount
      ? Math.round((1 - annualEquivalent / monthly.amount) * 100)
      : 0;
    const savingsBadge = document.querySelector('[data-annual-savings]');
    if (savingsBadge) savingsBadge.textContent = savings ? `Save ${savings}%` : '';
    if (price) price.textContent = formatUsd(current.amount);
    if (period) period.textContent = current.interval === 'year' ? '/ year' : '/ month';
    if (equivalent) equivalent.textContent = annual
      ? `Equivalent to ${formatUsd(annualEquivalent)} a month${savings ? ` · save ${savings}%` : ''}`
      : savings ? `Billed monthly · save ${savings}% with annual billing` : 'Billed monthly';
    const planSummary = `${formatUsd(current.amount)} / ${current.interval}`;
    if (selectedPlan) selectedPlan.textContent = planSummary;
    if (renewalNote) renewalNote.textContent = `You will be charged ${formatUsd(current.amount)} ${current.interval === 'year' ? 'yearly' : 'monthly'}. This plan renews automatically at that frequency until cancelled. You can cancel in Stripe billing management.`;
    syncPlanControls();
    return true;
  };

  const setPricingUnavailable = () => {
    planPricing = {};
    toggleButtons.forEach(button => { button.disabled = true; button.setAttribute('aria-disabled', 'true'); });
    if (price) price.textContent = selectedMarket === 'NZ' ? 'NZ$6.99' : 'Unavailable';
    if (period) period.textContent = 'for now';
    if (equivalent) equivalent.textContent = selectedMarket === 'NZ' ? 'Intended monthly price. New NZ checkout is unavailable until its Stripe price is verified. Annual pricing is undecided.' : 'Subscription pricing is temporarily unavailable. The Free plan is still available.';
    if (selectedPlan) selectedPlan.textContent = 'Subscription pricing unavailable';
    if (renewalNote) renewalNote.textContent = 'Checkout cannot start until a valid Stripe subscription price is available.';
    setCheckoutStatus('Subscription pricing is temporarily unavailable. Please try again later.', 'error');
    syncPlanControls();
  };

  const setPreviewUnavailable = () => {
    planPricing = {};
    const annualToggle = toggleButtons.find(button => button.dataset.plan === 'annual');
    const monthlyToggle = toggleButtons.find(button => button.dataset.plan === 'monthly');
    if (annualToggle) annualToggle.hidden = true;
    if (monthlyToggle) {
      monthlyToggle.textContent = 'Monthly';
      monthlyToggle.classList.add('active');
      monthlyToggle.setAttribute('aria-pressed', 'true');
      monthlyToggle.disabled = true;
      monthlyToggle.setAttribute('aria-disabled', 'true');
    }
    if (price) price.textContent = selectedMarket === 'NZ' ? 'NZ$6.99' : 'Preview';
    if (period) period.textContent = 'billing disabled';
    if (equivalent) equivalent.textContent = selectedMarket === 'NZ' ? 'Intended New Zealand monthly price. Annual pricing is undecided. Checkout is disabled in this preview.' : 'Other-region prices are unchanged and must be verified against Stripe. Checkout is disabled in this preview.';
    const previewNote = document.querySelector('[data-preview-pricing-note]');
    if (previewNote) previewNote.hidden = false;
    const liveBillingNote = document.querySelector('[data-live-billing-note]');
    const previewBillingNote = document.querySelector('[data-preview-billing-note]');
    if (liveBillingNote) liveBillingNote.hidden = true;
    if (previewBillingNote) previewBillingNote.hidden = false;
    if (selectedPlan) selectedPlan.textContent = selectedMarket === 'NZ' ? 'Intended NZ$6.99 / month; checkout disabled' : 'Preview · billing disabled';
    if (renewalNote) renewalNote.textContent = 'This is an integrated preview. No charge will be made; checkout and billing management are disabled.';
    if (subscribeButton) {
      subscribeButton.disabled = true;
      subscribeButton.setAttribute('aria-disabled', 'true');
      subscribeButton.classList.add('preview-disabled');
      subscribeButton.textContent = 'Checkout unavailable in preview';
    }
    if (confirmCheckoutButton) {
      confirmCheckoutButton.disabled = true;
      confirmCheckoutButton.setAttribute('aria-disabled', 'true');
    }
    if (termsConfirm) termsConfirm.disabled = true;
    manageBillingButtons.forEach(button => {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      button.hidden = true;
    });
    checkoutCodeForm?.closest('.checkout-code-box')?.setAttribute('hidden', '');
    setCheckoutStatus('This preview does not connect to checkout, billing management or account activation.');
  };

  const loadPlanPricing = async () => {
    const ticket = ++pricingLoadTicket; planPricing = {}; syncPlanControls();
    try {
      const response = await fetch('/api/stripe/plans' + (selectedMarket ? '?region=' + selectedMarket : ''), { headers: { accept: 'application/json' }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (ticket !== pricingLoadTicket) return;
      if (!response.ok) throw new Error('Pricing service unavailable.');
      if (!['NZ', 'INTL'].includes(payload.market)) throw new Error('Pricing market unavailable.');
      selectedMarket = payload.market; if (marketSelect) marketSelect.value = selectedMarket;
      const raw = payload.plans || {};
      planPricing = {};
      for (const [name, interval] of [['monthly', 'month'], ['annual', 'year']]) {
        const item = raw[name];
        planPricing[name] = item?.available === true
          && Number.isSafeInteger(item.amount) && item.amount > 0
          && item.currency === (selectedMarket === 'NZ' ? 'NZD' : 'USD') && item.interval === interval
          && (selectedMarket !== 'NZ' || name !== 'monthly' || item.amount === 699)
          ? { available: true, amount: item.amount, currency: item.currency, interval }
          : { available: false, interval };
      }
      toggleButtons.forEach(button => {
        const available = planIsAvailable(button.dataset.plan);
        button.disabled = !available;
        button.setAttribute('aria-disabled', String(!available));
      });
      const chosen = planIsAvailable(requestedBillingPlan)
        ? requestedBillingPlan
        : planIsAvailable('monthly') ? 'monthly' : 'annual';
      if (!planIsAvailable(chosen)) { setPricingUnavailable(); return; }
      setPlan(chosen);
    } catch {
      setPricingUnavailable();
    }
  };

  const setCheckoutStatus = (message, tone = 'default') => {
    if (!checkoutStatus) return;
    checkoutStatus.textContent = message;
    checkoutStatus.dataset.tone = tone;
  };

  const openCheckoutDialog = () => {
    if (dialog && !dialog.open) dialog.showModal();
  };

  const activateCode = async (form, status) => {
    if (previewPricingOnly) return false;
    const inputs = [...form.querySelectorAll('input')];
    const code = (form.querySelector('[placeholder="Complimentary access code"]') || inputs.at(-1))?.value.trim() || accessCodeFromLink;
    if (status) { status.textContent = 'Checking code…'; status.dataset.tone = ''; }
    try {
      const response = await fetch('/api/staff/redeem-pro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Code could not be accepted.');
      if (status) status.textContent = 'Pro is active for one month. Open the Health Hub to use your benefits.';
      return true;
    } catch (error) {
      if (status) { status.textContent = error instanceof Error ? error.message : 'Code could not be accepted.'; status.dataset.tone = 'error'; }
      return false;
    }
  };

  const startCheckout = async () => {
    if (previewPricingOnly || checkoutBusy) return;
    if (!subscribeButton || !planIsAvailable(selectedBillingPlan)) return;
    checkoutBusy = true; if (marketSelect) marketSelect.disabled = true;
    subscribeButton.disabled = true;
    subscribeButton.innerHTML = 'Connecting to Stripe…';
    setCheckoutStatus('Preparing your secure Stripe checkout…');
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: selectedBillingPlan, region: selectedMarket, checkoutAttemptId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error || 'Stripe checkout is not available yet.');
      window.location.assign(payload.url);
    } catch (error) {
      setCheckoutStatus(error.message || 'Stripe checkout is not available yet.', 'error');
      openCheckoutDialog();
    } finally {
      checkoutBusy = false; if (marketSelect) marketSelect.disabled = false;
      subscribeButton.innerHTML = originalSubscribeLabel;
      syncPlanControls();
    }
  };

  const openBillingPortal = async button => {
    if (previewPricingOnly) return;
    if (!button) return;
    button.disabled = true;
    const originalLabel = button.innerHTML;
    button.innerHTML = 'Opening billing…';
    setCheckoutStatus('Opening secure Stripe billing management…');
    try {
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(currentCheckoutSessionId ? { session_id: currentCheckoutSessionId } : {})
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error || 'Billing management is not available yet.');
      window.location.assign(payload.url);
    } catch (error) {
      setCheckoutStatus(error.message || 'Billing management is not available yet.', 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = originalLabel;
    }
  };

  const verifySuccessfulCheckout = async () => {
    if (previewPricingOnly) return;
    const query = new URLSearchParams(window.location.search);
    const outcome = query.get('checkout');
    const sessionId = query.get('session_id');
    if (outcome === 'cancelled') {
      setCheckoutStatus('Checkout was cancelled. Your Free plan is unchanged.');
      openCheckoutDialog();
      query.delete('checkout'); query.delete('plan');
      history.replaceState(null, '', `${location.pathname}${query.size ? `?${query}` : ''}${location.hash || '#plans'}`);
      return;
    }
    if (outcome !== 'success' || !sessionId) return;
    currentCheckoutSessionId = sessionId;
    setCheckoutStatus('Confirming your Stripe subscription…');
    openCheckoutDialog();
    try {
      const response = await fetch('/api/stripe/verify-checkout-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.active) throw new Error(payload.error || 'Your payment is still being confirmed.');
      setCheckoutStatus('Your DoctorAI Pro subscription is active. Account access will update after entitlement sync.', 'success');
    } catch (error) {
      setCheckoutStatus(error.message || 'Your payment is still being confirmed.', 'error');
    } finally {
      query.delete('checkout'); query.delete('session_id'); query.delete('plan');
      history.replaceState(null, '', `${location.pathname}${query.size ? `?${query}` : ''}${location.hash || '#plans'}`);
    }
  };

  toggleButtons.forEach(button => button.addEventListener('click', () => { checkoutAttemptId = crypto.randomUUID(); setPlan(button.dataset.plan); }));
  document.querySelector('[data-review-checkout]')?.addEventListener('click', openCheckoutDialog);
  marketSelect?.addEventListener('change', () => { if (checkoutBusy) return; selectedMarket = marketSelect.value; checkoutAttemptId = crypto.randomUUID(); if (previewPricingOnly) setPreviewUnavailable(); else loadPlanPricing(); });
  subscribeButton?.addEventListener('click', () => {
    if (!planIsAvailable(selectedBillingPlan)) return;
    setCheckoutStatus('Review the plan details, then continue to secure checkout.');
    openCheckoutDialog();
  });
  termsConfirm?.addEventListener('change', () => {
    syncPlanControls();
  });
  confirmCheckoutButton?.addEventListener('click', startCheckout);
  manageBillingButtons.forEach(button => button.addEventListener('click', () => {
    openCheckoutDialog();
    void openBillingPortal(button);
  }));
  checkoutCodeForm?.addEventListener('submit', async event => { event.preventDefault(); await activateCode(checkoutCodeForm, checkoutCodeStatus); });
  document.querySelector('[data-close-dialog]')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  if (previewPricingOnly) setPreviewUnavailable();
  else {
    loadPlanPricing();
    verifySuccessfulCheckout();
  }
})();
