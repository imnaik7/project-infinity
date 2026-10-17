// Scripted product tour of Project Infinity (demo mode, fictional data), timed to the voice-over.
// Records 1920x1080 video with an on-screen cursor, captions and title/end cards; writes timeline.json
// (scene start offsets) so assemble.mjs can lay each voice clip exactly where its scene begins.
// Usage: (app) npx vite --mode demo --port 5185   then   node tour.mjs
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const APP = 'http://localhost:5185/';
const OUT = join(tmpdir(), 'pi-tour'); // outside OneDrive and the Vite root, so sync/watchers don't slow the recording
const W = 1920;
const H = 1080;
const GAP = 0.7;
const DRY = !!process.env.DRY; // seconds of breathing room after each voice clip
const narration = JSON.parse(readFileSync(new URL('./narration.json', import.meta.url), 'utf8'));
const durations = JSON.parse(readFileSync(new URL('./durations.json', import.meta.url), 'utf8'));

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.webm')) rmSync(join(OUT, f));

const LOGO = `<svg viewBox="0 0 100 60" width="150" height="90"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a855f7"/><stop offset=".5" stop-color="#6366f1"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><path d="M30 30 C30 15 47 15 50 30 C53 45 70 45 70 30 C70 15 53 15 50 30 C47 45 30 45 30 30 Z" fill="none" stroke="url(#lg)" stroke-width="7" stroke-linecap="round"/></svg>`;

const OVERLAY = `
(() => {
  const css = \`
  #tour-cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 3px 6px rgba(0,0,0,.55))}
  .tour-ripple{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;z-index:2147483646;pointer-events:none;border:3px solid rgba(165,243,252,.95);box-shadow:0 0 24px rgba(124,58,237,.9);animation:tourRipple .55s ease-out forwards}
  @keyframes tourRipple{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}
  #tour-caption{position:fixed;left:50%;bottom:52px;transform:translate(-50%,20px);opacity:0;z-index:2147483645;pointer-events:none;display:flex;align-items:center;gap:16px;padding:14px 30px 14px 16px;border-radius:999px;
    background:rgba(10,10,30,.84);backdrop-filter:blur(18px);border:1px solid rgba(167,139,250,.45);box-shadow:0 20px 60px rgba(0,0,0,.5),0 0 40px rgba(99,102,241,.35);
    font:600 27px 'Segoe UI Variable Display','Segoe UI',sans-serif;color:#fff;white-space:nowrap;transition:all .45s cubic-bezier(.22,1,.36,1)}
  #tour-caption.on{opacity:1;transform:translate(-50%,0)}
  #tour-caption .n{display:grid;place-items:center;min-width:44px;height:44px;border-radius:50%;font-size:18px;background:linear-gradient(135deg,#a855f7,#6366f1 55%,#22d3ee)}
  #tour-card{position:fixed;inset:0;z-index:2147483644;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;
    background:radial-gradient(1200px 620px at 18% 12%,rgba(124,58,237,.55),transparent 60%),radial-gradient(900px 520px at 85% 90%,rgba(34,211,238,.32),transparent 60%),#07071a;
    color:#fff;font-family:'Segoe UI Variable Display','Segoe UI',sans-serif;opacity:0;pointer-events:none;transition:opacity .7s}
  #tour-card.on{opacity:1}
  #tour-card .logo{filter:drop-shadow(0 18px 50px rgba(124,58,237,.8));animation:float 6s ease-in-out infinite}
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
  #tour-card .eyebrow{font-size:20px;letter-spacing:.32em;text-transform:uppercase;color:#a5f3fc;font-weight:700}
  #tour-card h1{margin:0;font-size:92px;font-weight:800;letter-spacing:-.03em;background:linear-gradient(90deg,#fff,#c4b5fd 55%,#a5f3fc);-webkit-background-clip:text;color:transparent}
  #tour-card p{margin:0;font-size:31px;color:#cbd5f5}
  #tour-card .chips{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;max-width:1500px;margin-top:14px}
  #tour-card .chips span{padding:10px 22px;border-radius:999px;font-size:22px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16)}
  #tour-card .sub{font-size:22px;color:#94a3b8;margin-top:18px}
  \`;
  const add = () => {
    if (document.getElementById('tour-cursor')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const c = document.createElement('div'); c.id = 'tour-cursor';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 11.2-6.6.9 3.8 7.4-2.9 1.5-3.8-7.5L4 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const cap = document.createElement('div'); cap.id = 'tour-caption'; document.body.appendChild(cap);
    const card = document.createElement('div'); card.id = 'tour-card'; document.body.appendChild(card);
    addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div'); r.className = 'tour-ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r); setTimeout(() => r.remove(), 600);
    }, true);
  };
  window.__tour = {
    caption(n, text) {
      const cap = document.getElementById('tour-caption');
      if (!text) { cap.classList.remove('on'); return; }
      cap.innerHTML = (n ? '<span class="n">' + n + '</span>' : '') + '<span>' + text + '</span>';
      cap.classList.add('on');
    },
    card(html) {
      const card = document.getElementById('tour-card');
      if (!html) { card.classList.remove('on'); return; }
      card.innerHTML = html; card.classList.add('on');
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'msedge', headless: true });

// Warm-up so Vite's dependency optimisation doesn't land in the recording
{
  const warm = await browser.newContext({ viewport: { width: W, height: H } });
  const wp = await warm.newPage();
  await wp.goto(APP);
  await wp.waitForSelector('.kpi', { timeout: 90000 });
  await sleep(1250);
  await warm.close();
}

const t0 = Date.now();
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  ...(DRY ? {} : { recordVideo: { dir: OUT, size: { width: W, height: H } } }),
  reducedMotion: 'no-preference',
  colorScheme: 'dark',
});
await context.addInitScript(() => {
  try {
    localStorage.setItem('pin-theme', 'dark');
    localStorage.setItem('pin-sidebar', 'open');
  } catch {}
});
await context.addInitScript(OVERLAY);
const page = await context.newPage();
page.setDefaultTimeout(6000);

const caption = (n, text) => page.evaluate(([a, b]) => window.__tour.caption(a, b), [n, text]);
const card = (html) => page.evaluate((h) => window.__tour.card(h), html);

async function moveTo(locator, { steps = 12, dx = 0.5, dy = 0.5 } = {}) {
  const t = Date.now();
  await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
  const b = await locator.boundingBox();
  if (Date.now() - t > 500) console.log(`  slow ${Date.now() - t}ms: ${locator}`);
  if (!b) throw new Error('No box for locator');
  const x = b.x + b.width * dx;
  const y = b.y + b.height * dy;
  await page.mouse.move(x, y, { steps });
  return { x, y };
}
async function click(locator, opts) {
  const p = await moveTo(locator, opts);
  await sleep(140);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  await sleep(160);
  return p;
}
async function typeSlow(text, delay = 65) {
  for (const ch of text) await page.keyboard.type(ch, { delay });
}
async function smoothScroll(selector, to, ms = 1400) {
  await page.evaluate(
    ([sel, target, dur]) =>
      new Promise((res) => {
        const el = document.querySelector(sel);
        if (!el) return res();
        const start = el.scrollTop;
        const end = target === 'bottom' ? el.scrollHeight - el.clientHeight : target;
        const s = performance.now();
        const step = (t) => {
          const p = Math.min(1, (t - s) / dur);
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          el.scrollTop = start + (end - start) * e;
          p < 1 ? requestAnimationFrame(step) : res();
        };
        requestAnimationFrame(step);
      }),
    [selector, to, ms],
  );
}
const nav = (label) => click(page.locator('.nav-item', { hasText: label }));

// ---------- scenes ----------
const timeline = [];
let trimStart = 0;
let n = 0;
async function scene(id, actions) {
  const meta = narration.scenes.find((s) => s.id === id);
  const start = Date.now();
  timeline.push({ id, at: (start - t0) / 1000 - trimStart });
  if (meta.caption) await caption(++n, meta.caption);
  try {
    await actions();
  } catch (e) {
    console.warn(`scene ${id}: ${e.message.split('\n')[0]}`);
  }
  const target = start + (durations[id] + GAP) * 1000;
  if (DRY) console.log(`${id}: ${((Date.now() - start) / 1000).toFixed(1)}s of ${(durations[id] + GAP).toFixed(1)}s`);
  if (Date.now() < target) await sleep(DRY ? 0 : target - Date.now());
  else console.warn(`scene ${id} ran ${((Date.now() - target) / 1000).toFixed(1)}s over its voice`);
}

await page.goto(APP);
await page.waitForSelector('.kpi', { timeout: 60000 });
await card(
  `<div class="logo">${LOGO}</div><div class="eyebrow">Welcome to my channel</div><p style="font-size:26px;color:#e9d5ff;font-weight:600;margin-bottom:18px">Navaneet Naik Power Platform Developer</p><h1>Project Infinity</h1><p>Projects · People · Time · Revenue — end to end</p>` +
    '<div class="chips"><span>Approvals</span><span>Kanban</span><span>Timesheets</span><span>Leave</span><span>Billing</span><span>RMG talent</span></div>',
);
await page.mouse.move(W / 2, H / 2);
await sleep(300);
trimStart = (Date.now() - t0) / 1000;

await scene('intro', async () => {});
await card('');

await scene('home', async () => {
  await sleep(500);
  await moveTo(page.locator('.hero-week'));
  await sleep(650);
  await moveTo(page.locator('.kpi').nth(2));
  await sleep(550);
  await moveTo(page.locator('.kpi').nth(3));
  await sleep(450);
  await smoothScroll('.main', 640, 1600);
  await moveTo(page.locator('.month-bars'));
  await sleep(750);
  await smoothScroll('.main', 0, 1100);
});

await scene('projects', async () => {
  await nav('Projects');
  await page.waitForSelector('.project-card');
  await sleep(350);
  await moveTo(page.locator('.project-card').nth(0));
  await sleep(600);
  await moveTo(page.locator('.project-card').nth(2));
  await sleep(500);
  await click(page.getByRole('button', { name: 'Board' }));
  await sleep(1100);
  await click(page.getByRole('button', { name: 'Cards' }));
});

await scene('wizard', async () => {
  await click(page.locator('.page-head button', { hasText: 'New project' }));
  await page.waitForSelector('.wizard');
  await sleep(400);
  await typeSlow('Contoso Rewards App', 55);
  await click(page.getByRole('combobox', { name: 'Client' }));
  await click(page.getByRole('option', { name: /Contoso Retail India/ }));
  await click(page.getByRole('button', { name: 'Next' }));
  await sleep(500);
  await click(page.getByRole('radio', { name: /Fixed price/ }));
  await click(page.locator('.wizard .form-grid input[type=number]').nth(0));
  await typeSlow('1200', 60);
  await click(page.locator('.wizard .form-grid input[type=number]').nth(1));
  await typeSlow('3500000', 45);
  await click(page.getByRole('button', { name: 'Next' }));
  await sleep(400);
  await click(page.getByRole('combobox', { name: /Sponsor/ }));
  await click(page.getByRole('option', { name: /Navaneet Naik/ }));
  await page.locator('.wizard input[type=date]').first().fill('2026-10-19');
  await click(page.getByRole('button', { name: 'Next' }));
  await sleep(450);
  await click(page.getByRole('button', { name: 'Submit for approval' }));
  await page.waitForSelector('.ws-head', { timeout: 8000 });
});

await scene('overview', async () => {
  await nav('Projects');
  await page.waitForSelector('.project-card');
  await click(page.locator('.project-card', { hasText: 'Northwind Commerce Replatform' }));
  await page.waitForSelector('.ws-head');
  await sleep(450);
  await moveTo(page.locator('.schedule-track'));
  await sleep(600);
  await moveTo(page.locator('.kpi').nth(1));
  await sleep(450);
  await moveTo(page.locator('.kpi').nth(3));
  await sleep(400);
  await moveTo(page.locator('.timeline'));
});

await scene('team', async () => {
  await click(page.getByRole('tab', { name: /^Team/ }));
  await sleep(650);
  await moveTo(page.locator('table.grid tbody tr').nth(1));
  await sleep(450);
  await click(page.getByRole('button', { name: 'Add member' }));
  await page.waitForSelector('.pick-people');
  await sleep(400);
  await typeSlow('React, TypeScript', 60);
  await sleep(800);
  await moveTo(page.locator('.pick-person').first());
  await sleep(700);
  await page.keyboard.press('Escape');
  await sleep(500);
  await moveTo(page.getByRole('button', { name: 'Request talent' }));
});

await scene('tasks', async () => {
  await click(page.getByRole('tab', { name: /^Tasks/ }));
  await page.waitForSelector('.kanban');
  await sleep(400);
  const from = await moveTo(page.locator('section[aria-label="To do"] .task-card').first(), { dy: 0.35 });
  await sleep(250);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 8, { steps: 5 });
  const tb = await page.locator('section[aria-label="In progress"]').boundingBox();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 170, { steps: 30 });
  await sleep(500);
  await page.mouse.up();
});

await scene('timesheet', async () => {
  await nav('Timesheet');
  await page.waitForSelector('.ts-grid', { timeout: 10000 });
  await sleep(400);
  await moveTo(page.locator('.ts-locked').first());
  await sleep(550);
  await click(page.getByRole('button', { name: 'Copy last week' }));
  await page.waitForFunction(() => document.querySelectorAll('.ts-grid tbody tr').length > 2, null, { timeout: 15000 });
  await sleep(750);
  await click(page.getByRole('button', { name: 'Submit' }));
});

await scene('leave', async () => {
  await nav('Leave');
  await page.waitForSelector('.balance');
  await sleep(500);
  await moveTo(page.locator('.balance').nth(0));
  await sleep(400);
  await moveTo(page.locator('.balance').nth(3));
  await sleep(450);
  await click(page.getByRole('tab', { name: 'Team calendar' }));
  await page.waitForSelector('.cal');
  await sleep(300);
  await moveTo(page.locator('.cal td.leave').first());
});

await scene('approvals', async () => {
  await nav('Approvals');
  await page.waitForSelector('.inbox-item');
  await sleep(400);
  await click(page.locator('.inbox-item').first());
  await sleep(750);
  await moveTo(page.locator('.inbox-detail table'));
  await sleep(450);
  await click(page.locator('.decide').getByRole('button', { name: 'Approve' }));
});

await scene('billing', async () => {
  await nav('Billing & revenue');
  await page.waitForSelector('.kpi');
  await sleep(450);
  await moveTo(page.locator('.kpi').nth(0));
  await sleep(350);
  await smoothScroll('.main', 'bottom', 1500);
  await click(page.locator('tr.clickable').last());
  await page.waitForSelector('.invoice-doc');
  await sleep(850);
  await moveTo(page.locator('.inv-lines').first());
  await sleep(600);
  await page.keyboard.press('Escape');
});

await scene('talent', async () => {
  await nav('Talent (RMG)');
  await page.waitForSelector('.pipe-card');
  await sleep(500);
  await click(page.locator('.pipe-card', { hasText: 'Senior React Developer' }));
  await sleep(800);
  await moveTo(page.locator('.fui-DrawerBody .list-row').first());
  await sleep(650);
  await page.keyboard.press('Escape');
});

await scene('people', async () => {
  await nav('People');
  await sleep(500);
  await click(page.getByRole('tab', { name: 'Capacity' }));
  await page.waitForSelector('.heat');
  await sleep(300);
  await moveTo(page.locator('.heat-cell.h3').first());
});

await caption(0, '');
await card(
  `<div class="logo">${LOGO}</div><h1>Project Infinity</h1><p>Projects, people, time and revenue — in one place</p>` +
    '<div class="chips"><span>Power Apps</span><span>Dataverse</span><span>Power Automate</span><span>Copilot-ready</span></div>' +
    '<div class="sub">Subscribe to my channel · Navaneet Naik Power Platform Developer</div>',
);
await scene('outro', async () => {});
await sleep(400);

await context.close();
await browser.close();
if (DRY) process.exit(0);
const vid = readdirSync(OUT).find((f) => f.endsWith('.webm'));
renameSync(join(OUT, vid), join(OUT, 'tour.webm'));
writeFileSync(join(OUT, 'timeline.json'), JSON.stringify({ trimStart, scenes: timeline }, null, 1));
console.log(`recorded ${join(OUT, 'tour.webm')} · trim ${trimStart.toFixed(2)}s · ${timeline.length} scenes`);
