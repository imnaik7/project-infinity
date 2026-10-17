// Renders the YouTube channel watermark as a transparent PNG.
import { chromium } from 'playwright';

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:transparent}
  .wm{display:inline-flex;align-items:center;gap:12px;padding:8px 18px 8px 8px;border-radius:999px;
    background:rgba(10,10,24,.62);border:1px solid rgba(196,181,253,.35);
    box-shadow:0 6px 24px rgba(0,0,0,.35);font-family:'Segoe UI Variable Display','Segoe UI',sans-serif}
  .shield{width:46px;height:46px}
  .t{display:flex;flex-direction:column;line-height:1.1}
  .t b{font-size:21px;font-weight:800;letter-spacing:.02em;color:#fff}
  .t span{font-size:13px;color:#d8ccff;letter-spacing:.02em}
</style></head><body>
<div class="wm" id="wm">
  <svg class="shield" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a855f7"/><stop offset=".55" stop-color="#7c3aed"/><stop offset="1" stop-color="#db2777"/></linearGradient>
    </defs>
    <circle cx="32" cy="32" r="31" fill="#120a2a"/>
    <path d="M32 9 L50 16 V31 C50 43 42 51 32 55 C22 51 14 43 14 31 V16 Z" fill="none" stroke="url(#g)" stroke-width="3.2"/>
    <path d="M32 14 L45.5 19.5 V31 C45.5 40.5 39.5 46.8 32 50 C24.5 46.8 18.5 40.5 18.5 31 V19.5 Z" fill="url(#g)" opacity=".28"/>
    <text x="32" y="38.5" text-anchor="middle" font-family="Consolas,'Segoe UI',monospace" font-weight="800" font-size="16" fill="#fff" letter-spacing="1">PP</text>
  </svg>
  <div class="t"><b>Navaneet Naik</b><span>Power Platform Developer</span></div>
</div></body></html>`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent(html);
await page.locator('#wm').screenshot({ path: 'watermark.png', omitBackground: true });
await browser.close();
console.log('watermark.png');
