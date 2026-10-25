'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'subscription.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'subscription.html'), 'utf8');

// Exercise the production subscription controller with a fictional DOM and fetch.
// No browser sign-in, legal acceptance, Stripe call, customer, or payment is involved.
class Element {
  constructor(properties = {}) {
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.open = false;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = {};
    this.classes = new Set();
    this.classList = { toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name) };
    Object.assign(this, properties);
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }
  async emit(name, properties = {}) {
    for (const listener of this.listeners.get(name) || []) {
      await listener({ target: this, preventDefault() {}, ...properties });
    }
  }
  querySelector(selector) { return this.children[selector] || null; }
  querySelectorAll(selector) { return Object.entries(this.children).filter(([key]) => key === selector).map(([, child]) => child); }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

const verifiedPlans = {
  weekly: { available: true, amount: 699, currency: 'NZD', interval: 'week' },
  monthly: { available: true, amount: 2900, currency: 'NZD', interval: 'month' },
  annual: { available: true, amount: 7900, currency: 'USD', interval: 'year' }
};

async function boot({ plans = verifiedPlans, search = '', responseOk = true } = {}) {
  const nodes = {
    weekly: new Element({ dataset: { plan: 'weekly' }, disabled: true }),
    monthly: new Element({ dataset: { plan: 'monthly' }, disabled: true }),
    annual: new Element({ dataset: { plan: 'annual' }, disabled: true }),
    price: new Element(), period: new Element(), equivalent: new Element(),
    monthlyValue: new Element({ hidden: true }), planValue: new Element({ hidden: true }),
    pricingStatus: new Element(), selectedPlan: new Element(), dialog: new Element(),
    checkoutStatus: new Element(), terms: new Element(), renewal: new Element(),
    subscribe: new Element({ disabled: true, innerHTML: 'Start Pro subscription' }),
    confirm: new Element({ disabled: true }), close: new Element(), savings: new Element()
  };
  const accessForm = new Element();
  const accessInput = new Element();
  const accessNote = new Element();
  const accessPanel = new Element({ children: { form: accessForm, input: accessInput, small: accessNote } });
  const planSection = new Element({ parentNode: { insertBefore() {} } });
  const selectors = {
    '[data-price]': nodes.price, '[data-period]': nodes.period, '[data-equivalent]': nodes.equivalent,
    '[data-monthly-value]': nodes.monthlyValue, '[data-plan-value]': nodes.planValue,
    '#pricing-status': nodes.pricingStatus, '#selected-plan-price': nodes.selectedPlan,
    '#checkout-dialog': nodes.dialog, '#checkout-status': nodes.checkoutStatus,
    '#checkout-code-form': null, '#checkout-code-status': null,
    '[data-subscribe]': nodes.subscribe, '[data-confirm-checkout]': nodes.confirm,
    '#checkout-terms-confirm': nodes.terms, '#checkout-renewal-note': nodes.renewal,
    '#plans': planSection, '[data-annual-savings]': nodes.savings, '[data-close-dialog]': nodes.close
  };
  const requests = [];
  const destinations = [];
  const location = { search, pathname: '/subscription', hash: '#plans', assign: url => destinations.push(url) };
  const history = { replaceState() {} };
  const context = {
    URLSearchParams, console, history, location,
    window: { location, history },
    document: {
      querySelector: selector => selectors[selector] || null,
      querySelectorAll: selector => selector === '[data-plan]' ? [nodes.weekly, nodes.monthly, nodes.annual] : [],
      createElement: () => accessPanel
    },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === '/api/stripe/plans') return { ok: responseOk, json: async () => ({ plans: structuredClone(plans) }) };
      if (url === '/api/stripe/create-checkout-session') return { ok: true, json: async () => ({ url: 'https://checkout.example.test/fictional-session' }) };
      throw new Error(`Unexpected synthetic request: ${url}`);
    }
  };
  vm.runInNewContext(source, context, { filename: 'subscription.js' });
  await new Promise(resolve => setImmediate(resolve));
  const checkoutRequests = () => requests.filter(request => request.url === '/api/stripe/create-checkout-session');
  return { ...nodes, requests, destinations, checkoutRequests };
}

async function run() {
  assert.match(html, /data-plan="weekly" disabled aria-pressed="false">Weekly<\/button>/);
  assert.match(html, /data-monthly-value hidden>MONTHLY VALUE<\/span>/);
  assert.doesNotMatch(html, />BEST VALUE<\/span>/, 'The Pro card must not claim the weekly selection is the best value.');

  const ui = await boot();
  assert.equal(ui.price.textContent, 'NZ$29.00', 'Monthly remains the default choice.');
  assert.equal(ui.period.textContent, '/ month');
  assert.equal(ui.monthly.attributes.get('aria-pressed'), 'true');
  assert.equal(ui.weekly.disabled, false);
  assert.equal(ui.annual.disabled, false);
  assert.equal(ui.monthlyValue.hidden, false);
  assert.equal(ui.planValue.hidden, false);
  assert.equal(ui.planValue.textContent, 'Monthly is better value than weekly: 12 monthly payments total NZ$348.00; 52 weekly payments total NZ$363.48.');
  assert.equal(ui.savings.textContent, '', 'NZD monthly and USD annual must not produce a currency-mixing discount.');

  await ui.weekly.emit('click');
  assert.equal(ui.weekly.attributes.get('aria-pressed'), 'true');
  assert.equal(ui.price.textContent, 'NZ$6.99');
  assert.equal(ui.period.textContent, '/ week');
  assert.equal(ui.selectedPlan.textContent, 'NZ$6.99 / week');
  assert.match(ui.equivalent.textContent, /Renews every week until cancelled/);
  assert.match(ui.renewal.textContent, /charged NZ\$6\.99 weekly/);
  assert.match(ui.renewal.textContent, /renews automatically.*until cancelled/);
  assert.equal(ui.monthlyValue.hidden, true);
  await ui.subscribe.emit('click');
  assert.equal(ui.dialog.open, true);
  assert.equal(ui.checkoutRequests().length, 0, 'Reviewing a plan must not create a Checkout Session.');
  assert.equal(ui.confirm.disabled, true);
  await ui.confirm.emit('click');
  assert.equal(ui.checkoutRequests().length, 0, 'A synthetic click must not bypass the unchecked review confirmation.');
  ui.terms.checked = true;
  await ui.terms.emit('change');
  assert.equal(ui.confirm.disabled, false);
  await ui.confirm.emit('click');
  assert.deepEqual(JSON.parse(ui.checkoutRequests()[0].options.body), { plan: 'weekly' });
  assert.equal(ui.destinations[0], 'https://checkout.example.test/fictional-session');

  for (const [plan, amount, period] of [['monthly', 'NZ$29.00', '/ month'], ['annual', 'US$79.00', '/ year']]) {
    await ui[plan].emit('click');
    assert.equal(ui.price.textContent, amount);
    assert.equal(ui.period.textContent, period);
    assert.equal(ui.terms.checked, false, 'Changing renewal frequency requires a fresh customer confirmation.');
    assert.equal(ui.confirm.disabled, true);
    assert.equal(ui.savings.textContent, '', 'The unchanged USD annual choice must retain explicit currency without an NZD comparison.');
    ui.terms.checked = true;
    await ui.terms.emit('change');
    await ui.confirm.emit('click');
    assert.equal(JSON.parse(ui.checkoutRequests().at(-1).options.body).plan, plan);
  }
  assert.match(ui.renewal.textContent, /charged US\$79\.00 yearly/);

  const deepLinked = await boot({ search: '?plan=weekly' });
  assert.equal(deepLinked.weekly.attributes.get('aria-pressed'), 'true');
  assert.equal(deepLinked.selectedPlan.textContent, 'NZ$6.99 / week');
  const invalidLink = await boot({ search: '?plan=daily' });
  assert.equal(invalidLink.monthly.attributes.get('aria-pressed'), 'true', 'An unsupported plan cannot select an unapproved billing period.');

  for (const invalidWeekly of [
    undefined,
    { ...verifiedPlans.weekly, available: false },
    { ...verifiedPlans.weekly, amount: 698 },
    { ...verifiedPlans.weekly, amount: 700 },
    { ...verifiedPlans.weekly, amount: '699' },
    { ...verifiedPlans.weekly, currency: 'USD' },
    { ...verifiedPlans.weekly, interval: 'month' },
    { ...verifiedPlans.weekly, interval: 'day' }
  ]) {
    const invalid = await boot({ plans: { ...verifiedPlans, weekly: invalidWeekly }, search: '?plan=weekly' });
    assert.equal(invalid.weekly.disabled, true, 'Missing or malformed weekly pricing must fail closed.');
    assert.equal(invalid.monthly.disabled, false, 'Optional weekly pricing must not disable valid monthly billing.');
    assert.equal(invalid.annual.disabled, false, 'Optional weekly pricing must not disable the existing annual choice.');
    assert.equal(invalid.price.textContent, 'NZ$29.00');
    assert.equal(invalid.planValue.hidden, true, 'Unavailable weekly pricing cannot support a value comparison.');
    await invalid.weekly.emit('click');
    assert.equal(invalid.selectedPlan.textContent, 'NZ$29.00 / month');
    assert.equal(invalid.checkoutRequests().length, 0);
    await invalid.annual.emit('click');
    assert.equal(invalid.price.textContent, 'US$79.00');
  }

  const missingAnnual = await boot({ plans: { ...verifiedPlans, annual: { available: false, interval: 'year' } } });
  assert.equal(missingAnnual.annual.disabled, true);
  await missingAnnual.weekly.emit('click');
  assert.equal(missingAnnual.price.textContent, 'NZ$6.99', 'Unavailable annual billing must not prevent verified weekly billing.');

  const invalidMonthly = await boot({ plans: { ...verifiedPlans, monthly: { ...verifiedPlans.monthly, amount: 2901 } } });
  assert.equal(invalidMonthly.weekly.disabled, true, 'The existing monthly verification prerequisite remains in force.');
  assert.equal(invalidMonthly.subscribe.disabled, true);
  assert.equal(invalidMonthly.price.textContent, 'Unavailable');
  assert.equal(invalidMonthly.planValue.hidden, true);
  const failedPricing = await boot({ responseOk: false });
  assert.equal(failedPricing.subscribe.disabled, true);
  assert.equal(failedPricing.confirm.disabled, true);
  assert.equal(failedPricing.weekly.disabled, true);

  console.log('Subscription UI verification passed: verified weekly selection and renewal, monthly/annual regression, strict unavailable states, truthful payment-count comparison, and review confirmation gating (synthetic only).');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
