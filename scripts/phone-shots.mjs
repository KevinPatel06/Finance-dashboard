// Screenshots of the phone UI at iPhone size, for checking the design without a phone.
//
//   node node_modules/vite/bin/vite.js build --config vite.config.ios.ts
//   node node_modules/vite/bin/vite.js preview --config vite.config.ios.ts --port 4173 --strictPort
//   node scripts/phone-shots.mjs <outDir> [light|dark] [fresh]
//
// Drives headless Microsoft Edge over the DevTools protocol with Node's built-in
// WebSocket (no puppeteer). The iOS bundle runs in the browser because the
// Capacitor plugins it uses all have web implementations (Filesystem → IndexedDB).
// Seeds a realistic month through window.api, then visits each screen.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [outDir = 'shots', theme = 'light', fresh] = process.argv.slice(2);
const URL = 'http://localhost:4173/';
const PORT = 9333;
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!EDGE) throw new Error('Microsoft Edge not found');
fs.mkdirSync(outDir, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-shots-'));
const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--hide-scrollbars',
  'about:blank',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('Edge did not start');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const go = async (hash, wait = 1200) => {
  // A query string forces a full load — a hash-only change would keep the
  // already-mounted app (and its settings) instead of re-reading them.
  await send('Page.navigate', { url: `${URL}?r=${Date.now()}${hash}` });
  await sleep(wait);
};
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, `${theme}-${name}.png`), Buffer.from(data, 'base64'));
  console.log('shot', name);
};
const click = (selectorOrText) =>
  evaluate(`(() => {
    const q = ${JSON.stringify(selectorOrText)};
    let el = q.startsWith('[') || q.startsWith('.') ? document.querySelector(q) : null;
    const all = [...document.querySelectorAll('button, a')];
    if (!el) el = all.find((b) => b.textContent.trim().startsWith(q)) ?? all.find((b) => b.textContent.includes(q));
    if (!el) throw new Error('no element for ' + q);
    el.click();
    return true;
  })()`);
const type = (selector, text) =>
  evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(text)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await go('#/', 2500);
for (let i = 0; i < 50 && !(await evaluate('!!window.api')); i++) await sleep(200);

if (fresh) {
  await evaluate(`window.api.settings.update({ theme: '${theme}' })`);
  await go('#/', 1500);
  await shot('onboard-1-intro');
  await click('Tap to continue');
  await sleep(1800);
  await click('Tap to continue');
  await sleep(500);
  await shot('onboard-2-name');
  await type('input', 'Kevin');
  await click('Continue');
  await sleep(600);
  await shot('onboard-3-period');
  await click('Continue');
  await sleep(600);
  await type('input[aria-label="Take-home per paycheck"]', '1200');
  await sleep(300);
  await shot('onboard-4-pay');
} else {
  // ---- seed a realistic month ----
  await evaluate(`(async () => {
    const api = window.api;
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
    const month = y + '-' + pad(m);
    const day = (n) => month + '-' + pad(Math.min(n, d));
    await api.settings.update({ onboarded: true, user_name: 'Kevin', theme: '${theme}', pay_amount: 1200,
      pay_frequency: 'biweekly', next_paycheck_date: day(Math.max(1, d - 13)) });
    const cats = await api.expenseCategories.list();
    const cat = (n) => cats.find((c) => c.name === n).id;
    await api.recurringExpenses.create({ description: 'Rent', amount: 1450, category_id: null, frequency: 'monthly', anchor_date: month + '-01' });
    await api.recurringExpenses.create({ description: 'Spotify', amount: 11.99, category_id: cat('Entertainment'), frequency: 'monthly', anchor_date: month + '-02' });
    await api.recurringExpenses.create({ description: 'Phone', amount: 55, category_id: null, frequency: 'monthly', anchor_date: month + '-28' });
    await api.recurringExpenses.create({ description: 'Car insurance', amount: 412, category_id: cat('Transport'), frequency: 'monthly', interval_count: 6, anchor_date: (y + 1) + '-02-15' });
    const visa = await api.debts.create({ name: 'Visa', type: 'credit_card', original_amount: 0, current_balance: 1240, interest_rate: 19.99, payment_amount: 100, payment_frequency: 'monthly', split_count: 1, interest_day: 15 });
    const efund = await api.goals.create({ name: 'Emergency fund', target_amount: 10000, color: '#ef4444' });
    const japan = await api.goals.create({ name: 'Japan trip', target_amount: 3500, target_date: (y + 1) + '-04-20', color: '#06b6d4' });
    const laptop = await api.goals.create({ name: 'New laptop', target_amount: 1800, target_date: (y + 1) + '-01-15', color: '#8b5cf6' });
    await api.funds.addTransaction({ goal_id: efund.id, kind: 'deposit', amount: 2400, date: day(1), note: 'Starting balance' });
    await api.funds.addTransaction({ goal_id: japan.id, kind: 'deposit', amount: 1400, date: day(1), note: 'Starting balance' });
    await api.funds.addTransaction({ goal_id: laptop.id, kind: 'deposit', amount: 1300, date: day(1), note: 'Starting balance' });
    const spend = [['No Frills', 41.15, 'Groceries', 1], ['Farm Boy', 29.85, 'Groceries', 4], ['Tim Hortons', 4.29, 'Dining', 2],
      ['Sushi', 41.8, 'Dining', 6], ['Esso', 52, 'Gas', 3], ['Uber', 16.9, 'Transport', 5], ['TTC', 3.3, 'Transport', 7],
      ['Indigo', 34.99, 'Shopping', 8], ['Shoppers', 18.4, 'Health', 9], ['Costco', 88.2, 'Groceries', 10],
      ['Movies', 24, 'Entertainment', 11], ['Brunch', 32.6, 'Dining', 12], ['Amazon', 61.3, 'Shopping', 13],
      ['No Frills', 55.3, 'Groceries', 14], ['Pizza', 23.5, 'Dining', 15], ['Petro-Canada', 47.1, 'Gas', 16],
      ['Coffee', 5.25, 'Dining', 17], ['Dollarama', 26.8, 'Groceries', 18], ['Uber', 18.4, 'Transport', 19], ['Lunch', 14.75, 'Dining', 20]];
    for (const [desc, amt, c, dd] of spend) await api.expenses.create({ description: desc, amount: amt, date: day(dd), category_id: cat(c) });
    await api.expenses.create({ description: 'Hotel deposit', amount: 220, date: day(9), category_id: null, fund_id: japan.id });
    await api.budget.savePlan(month, [
      { kind: 'spend', ref_id: cat('Groceries'), amount: 350 }, { kind: 'spend', ref_id: cat('Gas'), amount: 120 },
      { kind: 'spend', ref_id: cat('Transport'), amount: 80 }, { kind: 'spend', ref_id: cat('Health'), amount: 60 },
      { kind: 'spend', ref_id: cat('Dining'), amount: 150 }, { kind: 'spend', ref_id: cat('Shopping'), amount: 120 },
      { kind: 'spend', ref_id: cat('Entertainment'), amount: 60 },
      { kind: 'fund', ref_id: efund.id, amount: 200 }, { kind: 'fund', ref_id: japan.id, amount: 150 },
      { kind: 'fund', ref_id: laptop.id, amount: 100 }, { kind: 'debt', ref_id: visa.id, amount: 150 },
    ], true);
    window.__ids = { groceries: cat('Groceries'), japan: japan.id };
    return true;
  })()`);
  const ids = await evaluate(`window.__ids`);
  await go('#/', 1800);
  await shot('01-budget');
  await click('Saving');
  await sleep(500);
  await shot('02-saving');
  await click('Edit plan');
  await sleep(700);
  await shot('03-plan-editor');
  await go(`#/category/${ids.groceries}`);
  await shot('04-category');
  await go(`#/fund/${ids.japan}`);
  await shot('05-fund');
  await go('#/expenses', 1500);
  await shot('06-expenses');
  await click('Categories');
  await sleep(600);
  await shot('07-expenses-categories');
  await go('#/expenses/week');
  await shot('08-weekly');
  await go('#/recurring');
  await shot('09-recurring');
  await go('#/more');
  await shot('10-more');
  await click('[aria-label="Log an expense"]');
  await sleep(500);
  await type('textarea', 'coffee 5, gas 50 yesterday');
  await sleep(400);
  await shot('11-quick-add');
  await go('#/settings');
  await shot('12-settings');
}

ws.close();
edge.kill();
