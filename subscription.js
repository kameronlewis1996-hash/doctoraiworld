(() => {
  'use strict';

  const toggleButtons = [...document.querySelectorAll('[data-plan]')];
  const price = document.querySelector('[data-price]');
  const period = document.querySelector('[data-period]');
  const equivalent = document.querySelector('[data-equivalent]');
  const monthlyValueBadge = document.querySelector('[data-monthly-value]');
  const planValueNote = document.querySelector('[data-plan-value]');
  const pricingStatus = document.querySelector('#pricing-status');
  const selectedPlan = document.querySelector('#selected-plan-price');
  const dialog = document.querySelector('#checkout-dialog');
  const checkoutStatus = document.querySelector('#checkout-status');
  const checkoutCodeForm = document.querySelector('#checkout-code-form');
  const checkoutCodeStatus = document.querySelector('#checkout-code-status');
  const checkoutCodeBox = document.querySelector('.checkout-code-box');
  const subscribeButton = document.querySelector('[data-subscribe]');
  const manageBillingButtons = [...document.querySelectorAll('[data-manage-billing]')];
  const confirmCheckoutButton = document.querySelector('[data-confirm-checkout]');
  const termsConfirm = document.querySelector('#checkout-terms-confirm');
  const renewalNote = document.querySelector('#checkout-renewal-note');
  const originalSubscribeLabel = subscribeButton?.innerHTML || 'Start Pro subscription <span>→</span>';
  let currentCheckoutSessionId = null;
  let selectedBillingPlan = 'monthly';
  let planPricing = null;
  const initialQuery = new URLSearchParams(window.location.search);
  const accessCodeFromLink = initialQuery.get('access_code') || '';
  const requestedPlan = initialQuery.get('plan');
  const requestedBillingPlan = ['weekly', 'annual'].includes(requestedPlan) ? requestedPlan : 'monthly';

  const accessPanel = document.createElement('section');
  accessPanel.className = 'pro-access-panel';
  accessPanel.innerHTML = '<b>Have a DoctorAI Pro access code?</b><p>Sign in with Google first, then enter your complimentary access code. It will be linked to your DoctorAI account.</p><form><input required autocomplete="one-time-code" placeholder="Access code" aria-label="DoctorAI Pro access code"><button>Activate Pro</button></form><small aria-live="polite"></small>';
  const planSection = document.querySelector('#plans');
  if (planSection) planSection.parentNode.insertBefore(accessPanel, planSection);
  accessPanel.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault(); const note = accessPanel.querySelector('small'); const code = accessPanel.querySelector('input').value.trim() || accessCodeFromLink; note.textContent = 'Checking code…';
    try { const response = await fetch('/api/staff/redeem-pro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Code could not be accepted.'); note.textContent = 'DoctorAI Pro is active for 30 days. Return to the Health Hub to use Pro features.'; } catch (error) { note.textContent = error instanceof Error ? error.message : 'Code could not be accepted.'; }
  });
  if (accessCodeFromLink) {
    accessPanel.querySelector('input').value = accessCodeFromLink;
    accessPanel.querySelector('input').defaultValue = accessCodeFromLink;
    if (checkoutCodeForm) {
      checkoutCodeForm.querySelector('input').value = accessCodeFromLink;
      checkoutCodeForm.querySelector('input').defaultValue = accessCodeFromLink;
    }
    if (checkoutCodeBox) checkoutCodeBox.open = true;
    accessPanel.querySelector('small').textContent = 'Your personal access code is ready. Sign in with Google in the Health Hub, then return here and select Activate Pro.';
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash || '#plans'}`);
  }

  const planIsAvailable = plan => Boolean(planPricing?.[plan]?.available);
  const syncPlanControls = () => {
    const available = planIsAvailable(selectedBillingPlan);
    if (subscribeButton) subscribeButton.disabled = !available;
    if (confirmCheckoutButton) confirmCheckoutButton.disabled = !(available && termsConfirm?.checked);
  };
  const formatPrice = (amount, currency = 'USD') => {
    const value = (Number(amount) / 100).toFixed(2);
    if (currency === 'NZD') return `NZ$${value}`;
    if (currency === 'USD') return `US$${value}`;
    return 'Unavailable';
  };
  const setPlan = plan => {
    const selected = ['weekly', 'monthly', 'annual'].includes(plan) ? plan : 'monthly';
    if (!planIsAvailable(selected)) return false;
    const annual = selected === 'annual';
    if (selected !== selectedBillingPlan && termsConfirm) termsConfirm.checked = false;
    selectedBillingPlan = selected;
    toggleButtons.forEach(button => {
      const active = button.dataset.plan === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const current = planPricing[selected];
    const weekly = planPricing.weekly;
    const monthly = planPricing.monthly;
    const yearly = planPricing.annual;
    const monthlyBeatsWeekly = weekly?.available && monthly?.available
      && weekly.currency === monthly.currency && monthly.amount * 12 < weekly.amount * 52;
    if (monthlyValueBadge) monthlyValueBadge.hidden = !(selected === 'monthly' && monthlyBeatsWeekly);
    if (planValueNote) {
      planValueNote.hidden = !monthlyBeatsWeekly;
      planValueNote.textContent = monthlyBeatsWeekly
        ? `Monthly is better value than weekly: 12 monthly payments total ${formatPrice(monthly.amount * 12, monthly.currency)}; 52 weekly payments total ${formatPrice(weekly.amount * 52, weekly.currency)}.`
        : '';
    }
    const annualEquivalent = yearly?.available ? yearly.amount / 12 : 0;
    const sameCurrency = monthly?.available && yearly?.available && monthly.currency === yearly.currency;
    const savings = sameCurrency && annualEquivalent > 0 && annualEquivalent < monthly.amount
      ? Math.round((1 - annualEquivalent / monthly.amount) * 100)
      : 0;
    const savingsBadge = document.querySelector('[data-annual-savings]');
    if (savingsBadge) savingsBadge.textContent = savings ? `Save ${savings}%` : '';
    if (price) price.textContent = formatPrice(current.amount, current.currency);
    if (period) period.textContent = `/ ${current.interval}`;
    if (equivalent) {
      if (selected === 'weekly') {
        equivalent.textContent = 'Billed weekly. Renews every week until cancelled.';
      } else if (annual) {
        equivalent.textContent = sameCurrency
          ? `Equivalent to ${formatPrice(annualEquivalent, yearly.currency)} a month${savings ? ` · save ${savings}%` : ''}`
          : 'Billed yearly';
      } else {
        equivalent.textContent = savings ? `Billed monthly · save ${savings}% with annual billing` : 'Billed monthly';
      }
    }
    const planSummary = `${formatPrice(current.amount, current.currency)} / ${current.interval}`;
    if (selectedPlan) selectedPlan.textContent = planSummary;
    const renewalFrequency = { week: 'weekly', month: 'monthly', year: 'yearly' }[current.interval];
    if (renewalNote) renewalNote.textContent = `You will be charged ${formatPrice(current.amount, current.currency)} ${renewalFrequency}. This plan renews automatically at that frequency until cancelled. You can cancel in Stripe billing management.`;
    syncPlanControls();
    return true;
  };

  const setPricingUnavailable = (message = 'DoctorAI Pro pricing could not be loaded. Checkout is disabled for now. The Free plan is still available.') => {
    planPricing = {};
    toggleButtons.forEach(button => { button.disabled = true; button.setAttribute('aria-disabled', 'true'); });
    if (price) price.textContent = 'Unavailable';
    if (period) period.textContent = 'for now';
    if (equivalent) equivalent.textContent = message;
    if (monthlyValueBadge) monthlyValueBadge.hidden = true;
    if (planValueNote) { planValueNote.hidden = true; planValueNote.textContent = ''; }
    if (selectedPlan) selectedPlan.textContent = 'Subscription pricing unavailable';
    if (renewalNote) renewalNote.textContent = 'Checkout cannot start until a valid Stripe subscription price is available.';
    if (pricingStatus) {
      pricingStatus.textContent = message;
    }
    setCheckoutStatus(message, 'error');
    syncPlanControls();
  };

  const loadPlanPricing = async () => {
    try {
      const response = await fetch('/api/stripe/plans', { headers: { accept: 'application/json' }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof payload.error === 'string' && payload.error.trim()
          ? ` ${payload.error.trim()}`
          : '';
        setPricingUnavailable(`DoctorAI Pro pricing could not be loaded.${detail} Checkout is disabled for now. The Free plan is still available.`);
        return;
      }
      const raw = payload.plans || {};
      planPricing = {};
      for (const [name, interval] of [['weekly', 'week'], ['monthly', 'month'], ['annual', 'year']]) {
        const item = raw[name];
        planPricing[name] = item?.available === true
          && Number.isSafeInteger(item.amount) && item.amount > 0
          && ['USD', 'NZD'].includes(item.currency) && item.interval === interval
          && (name !== 'weekly' || (item.amount === 699 && item.currency === 'NZD'))
          && (name !== 'monthly' || (item.amount === 2900 && item.currency === 'NZD'))
          ? { available: true, amount: item.amount, currency: item.currency, interval }
          : { available: false, interval };
      }
      if (!planIsAvailable('monthly')) {
        setPricingUnavailable('DoctorAI Pro pricing could not be verified. Monthly billing is available only when Stripe confirms NZ$29.00 per month. Pro checkout is disabled until that price is configured; the Free plan is still available.');
        return;
      }
      toggleButtons.forEach(button => {
        const available = planIsAvailable(button.dataset.plan);
        button.disabled = !available;
        button.setAttribute('aria-disabled', String(!available));
      });
      const chosen = planIsAvailable(requestedBillingPlan)
        ? requestedBillingPlan
        : planIsAvailable('monthly') ? 'monthly' : 'annual';
      if (!planIsAvailable(chosen)) {
        setPricingUnavailable('DoctorAI Pro pricing could not be loaded. Checkout is disabled for now. The Free plan is still available.');
        return;
      }
      setPlan(chosen);
    } catch {
      setPricingUnavailable('DoctorAI Pro pricing could not be loaded. Checkout is disabled for now. The Free plan is still available.');
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

  const focusNavigationDestination = () => {
    const hash = window.location.hash.slice(1);
    const destination = hash ? document.getElementById(hash) : document.querySelector('main h1, h1');
    const target = destination?.matches?.('h1, h2, h3') ? destination : destination?.querySelector?.('h1, h2, h3') || destination;
    if (!target) return;
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };

  const dismissCheckoutOnHistoryNavigation = () => {
    if (!dialog?.open) return;
    dialog.close();
    window.requestAnimationFrame(focusNavigationDestination);
  };
  window.addEventListener('popstate', dismissCheckoutOnHistoryNavigation);
  window.addEventListener('hashchange', dismissCheckoutOnHistoryNavigation);

  const activateCode = async (form, status) => {
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
    if (!subscribeButton || !planIsAvailable(selectedBillingPlan) || !termsConfirm?.checked) return;
    subscribeButton.disabled = true;
    subscribeButton.innerHTML = 'Connecting to Stripe…';
    setCheckoutStatus('Preparing your secure Stripe checkout…');
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: selectedBillingPlan })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error || 'Stripe checkout is not available yet.');
      window.location.assign(payload.url);
    } catch (error) {
      setCheckoutStatus(error.message || 'Stripe checkout is not available yet.', 'error');
      openCheckoutDialog();
    } finally {
      subscribeButton.innerHTML = originalSubscribeLabel;
      syncPlanControls();
    }
  };

  const openBillingPortal = async button => {
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

  toggleButtons.forEach(button => button.addEventListener('click', () => setPlan(button.dataset.plan)));
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
  loadPlanPricing();
  verifySuccessfulCheckout();
})();
