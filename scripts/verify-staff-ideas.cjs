'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'staff-ideas.js'), 'utf8');
const prefix = 'doctorai-staff-ideas-v1:';
const memory = new Map();
const storageCalls = { reads: 0, writes: 0, removals: 0 };

async function storageKey(email) {
  const digest = await crypto.webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
  return `${prefix}${Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')}`;
}

class Element {
  constructor(name) {
    this.name = name;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.dataset = {};
    this.value = name === 'filter' ? 'all' : '';
    this.hidden = false;
    this.disabled = false;
    this.fields = { category: 'Product', title: '', details: '' };
  }
  set textContent(value) { this._textContent = String(value); this.children = []; }
  get textContent() { return `${this._textContent || ''}${this.children.map(child => child.textContent || '').join('')}`; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  dispatch(name, event = {}) { for (const listener of this.listeners[name] || []) listener({ preventDefault() {}, ...event }); }
  dispatchEvent(event) { this.dispatch(event.type, event); }
  querySelector(selector) { return selector === '[name="title"]' ? this.titleInput : null; }
  querySelectorAll(selector) {
    const found = [];
    const visit = element => {
      if (selector === 'button' && element.name === 'button') found.push(element);
      for (const child of element.children || []) visit(child);
    };
    visit(this);
    return found;
  }
  focus() { this.focused = true; }
  reset() { this.fields = { category: 'Product', title: '', details: '' }; }
}

function setup({ email = '', authorized = false, noCrypto = false } = {}) {
  const elements = {
    panel: new Element('panel'), staff: new Element('staff'), form: new Element('form'),
    list: new Element('list'), status: new Element('status'), filter: new Element('filter'),
    clear: new Element('clear'), title: new Element('title')
  };
  elements.staff.hidden = !authorized;
  elements.staff.dataset.staffAdminEmail = email;
  elements.form.titleInput = elements.title;
  const storage = {
    getItem(key) { storageCalls.reads += 1; return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { storageCalls.writes += 1; memory.set(key, String(value)); },
    removeItem(key) { storageCalls.removals += 1; memory.delete(key); }
  };
  const document = {
    querySelector(selector) {
      return ({
        '#staff-ideas-panel': elements.panel,
        '#staff-content': elements.staff,
        '#staff-idea-form': elements.form,
        '#staff-idea-list': elements.list,
        '#staff-idea-status': elements.status,
        '#staff-idea-filter': elements.filter,
        '#staff-idea-clear': elements.clear
      })[selector] || null;
    },
    createElement: name => new Element(name)
  };
  const context = vm.createContext({
    document,
    window: { crypto: noCrypto ? undefined : crypto.webcrypto, confirm: () => true },
    localStorage: storage,
    TextEncoder,
    FormData: class { constructor(form) { this.form = form; } get(name) { return this.form.fields[name] ?? null; } },
    Date,
    Set,
    String,
    Array,
    JSON
  });
  vm.runInContext(source, context, { filename: 'staff-ideas.js' });
  return elements;
}

async function waitForDigest(element) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!element || element.status.textContent) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for the verified-admin storage key to load.');
}

async function verify() {
  memory.clear();
  Object.assign(storageCalls, { reads: 0, writes: 0, removals: 0 });

  const locked = setup();
  locked.form.fields = { category: 'Product', title: 'Blocked', details: 'Before admin access' };
  locked.form.dispatch('submit');
  await waitForDigest(locked);
  assert.equal(storageCalls.reads, 0, 'The ideas store is not read before staff access is verified.');
  assert.equal(storageCalls.writes, 0, 'The ideas store is not written before staff access is verified.');
  assert.match(locked.status.textContent, /only be opened after staff access is verified/i);

  const emailA = 'admin-a@example.test';
  const keyA = await storageKey(emailA);
  memory.set(keyA, JSON.stringify({ version: 1, ideas: [{ id: 'seed-1', category: 'Clarity', title: 'Saved idea', details: 'Persisted fixture.' }] }));
  const adminA = setup({ email: emailA, authorized: true });
  await waitForDigest(adminA);
  assert.equal(adminA.list.children.length, 1, 'The verified admin sees their saved browser ideas.');
  assert.match(adminA.status.textContent, /1 idea loaded from this browser/i);
  assert.ok(!keyA.includes(emailA), 'The browser storage key does not contain the staff email.');

  adminA.form.fields = { category: 'Product', title: 'New fixture', details: 'Saved after submit.' };
  adminA.form.dispatch('submit');
  assert.equal(storageCalls.writes, 1, 'Adding an idea persists the versioned list.');
  let saved = JSON.parse(memory.get(keyA));
  assert.equal(saved.version, 1);
  assert.equal(saved.ideas.length, 2);
  assert.equal(saved.ideas[1].title, 'New fixture');
  assert.doesNotMatch(JSON.stringify(saved), /admin-a@example\.test/);

  adminA.filter.value = 'Clarity';
  adminA.filter.dispatch('change');
  assert.equal(adminA.list.children.length, 1, 'Category filtering shows matching ideas only.');
  assert.match(adminA.list.textContent, /Saved idea/);
  assert.doesNotMatch(adminA.list.textContent, /New fixture/);

  adminA.clear.dispatch('click');
  assert.equal(memory.has(keyA), false, 'Clear saved ideas removes only this account’s browser entry.');
  assert.equal(storageCalls.removals, 1);
  assert.match(adminA.status.textContent, /cleared from this browser/i);

  const keyB = await storageKey('admin-b@example.test');
  memory.set(keyA, JSON.stringify({ version: 1, ideas: [{ id: 'private-a', category: 'Other', title: 'Account A idea', details: 'Must not cross accounts.' }] }));
  const adminB = setup({ email: 'admin-b@example.test', authorized: true });
  await waitForDigest(adminB);
  assert.equal(adminB.list.children.length, 1, 'A different verified admin sees only the empty-state note.');
  assert.doesNotMatch(adminB.list.textContent, /Account A idea/);
  assert.equal(keyA === keyB, false, 'Different staff accounts have distinct storage namespaces.');
  assert.equal(memory.has(keyA), true, 'Clearing one staff account does not clear another account’s saved data.');
  const localOnly = setup({ email: 'admin-c@example.test', authorized: true, noCrypto: true });
  await waitForDigest(localOnly);
  assert.match(localOnly.status.textContent, /saving is unavailable.*remain in this tab only/i);
  localOnly.form.fields = { category: 'Other', title: 'Session note', details: 'Browser crypto fixture unavailable.' };
  localOnly.form.dispatch('submit');
  assert.match(localOnly.list.textContent, /Session note/);
  assert.match(localOnly.status.textContent, /will not survive reload/i);
  localOnly.clear.dispatch('click');
  assert.doesNotMatch(localOnly.list.textContent, /Session note/);
  assert.match(localOnly.status.textContent, /Ideas cleared for this page/i);
}

if (require.main === module) {
  verify().then(() => console.log('Staff Ideas persistence checks passed: pre-auth isolation, per-admin browser scope, reload data, category filter, and clear.'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = verify;
