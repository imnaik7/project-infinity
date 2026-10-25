// Project Infinity foundation: publisher (prefix pin), solution ProjectInfinity, and the extra transaction
// currencies (org base currency is INR). Idempotent.
// Usage: az login && node pi-dataverse/foundation.mjs
import { api, log } from './lib.mjs';

const get = async (path) => (await api('GET', path, undefined, { solution: null })).value;

// ---------- publisher ----------
let pub = (await get(`publishers?$select=publisherid&$filter=uniquename eq 'ProjectInfinity'`))[0];
if (!pub) {
  const r = await api('POST', 'publishers', {
    uniquename: 'ProjectInfinity', friendlyname: 'Project Infinity', customizationprefix: 'pin', customizationoptionvalueprefix: 54320,
    description: 'Project Infinity — projects, time, billing and talent',
  }, { solution: null, headers: { Prefer: 'return=representation' } });
  pub = { publisherid: r.publisherid };
  log(`+ publisher pin (${pub.publisherid})`);
} else log('= publisher exists');

// ---------- solution ----------
const sol = (await get(`solutions?$select=solutionid&$filter=uniquename eq 'ProjectInfinity'`))[0];
if (!sol) {
  const r = await api('POST', 'solutions', {
    uniquename: 'ProjectInfinity', friendlyname: 'Project Infinity', version: '1.0.0.0',
    description: 'Project Infinity: project lifecycle, approvals, timesheets, billing, revenue, RMG and closure',
    'publisherid@odata.bind': `/publishers(${pub.publisherid})`,
  }, { solution: null, headers: { Prefer: 'return=representation' } });
  log(`+ solution ProjectInfinity (${r.solutionid})`);
} else log(`= solution exists (${sol.solutionid})`);

// ---------- currencies (base INR exists; exchange rate = units of currency per 1 INR) ----------
const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$', rate: 0.012 },
  { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.011 },
];
for (const c of CURRENCIES) {
  const found = (await get(`transactioncurrencies?$select=transactioncurrencyid&$filter=isocurrencycode eq '${c.code}'`))[0];
  if (found) {
    log(`= currency ${c.code}`);
    continue;
  }
  await api('POST', 'transactioncurrencies', {
    isocurrencycode: c.code, currencyname: c.name, currencysymbol: c.symbol, exchangerate: c.rate, currencyprecision: 2,
  }, { solution: null });
  log(`+ currency ${c.code}`);
}
// ---------- access team template for projects (needs pin_project; run after schema.mjs) ----------
const projectMeta = await api('GET', `EntityDefinitions(LogicalName='pin_project')?$select=ObjectTypeCode,AutoCreateAccessTeams`, undefined, { solution: null, allow404: true });
if (projectMeta) {
  const tpl = (await get(`teamtemplates?$select=teamtemplateid&$filter=teamtemplatename eq 'Project Infinity Team'`))[0];
  if (!tpl) {
    // Read | Write | Append | AppendTo — what each project member may do is refined by plug-ins (PM / Contributor / Viewer)
    await api('POST', 'teamtemplates', {
      teamtemplatename: 'Project Infinity Team', objecttypecode: projectMeta.ObjectTypeCode, defaultaccessrightsmask: 1 | 2 | 4 | 16,
      description: 'Everyone on a project (members, PM, sponsor) — maintained by the MemberPlugin',
    }, { solution: null });
    log(`+ access team template (pin_project, otc ${projectMeta.ObjectTypeCode})`);
  } else log('= access team template');
} else log('… pin_project not created yet — re-run after schema.mjs for the access team template');
log('foundation ready');
