// Snapshot of the (fictional) Project Infinity demo data for the app's demo mode / product video.
// Strips OData annotations, real emails and account ids so nothing sensitive can appear on screen.
// Usage: az login && node pi-app/demo-tour/snapshot.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { api } from '../../pi-dataverse/lib.mjs';

const DEMO_USER = '00000000-0000-0000-0000-00000000d3e0';
const get = async (p) => (await api('GET', p, undefined, { solution: null })).value;
const me = await api('GET', 'WhoAmI', undefined, { solution: null });

const TABLES = ['pin_client', 'pin_role', 'pin_resource', 'pin_project', 'pin_projectrate', 'pin_member', 'pin_milestone', 'pin_task', 'pin_timesheet',
  'pin_timeentry', 'pin_approval', 'pin_invoice', 'pin_invoiceline', 'pin_revenue', 'pin_activity', 'pin_resourcerequest', 'pin_holiday', 'pin_leavetype',
  'pin_leavebalance', 'pin_leaverequest'];

const keep = (row) => {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.includes('@')) continue;
    if (/^_(owninguser|owningteam|owningbusinessunit|ownerid|createdby|modifiedby|createdonbehalfby|modifiedonbehalfby|organizationid)_value$/.test(k)) continue;
    out[k] = v;
  }
  return out;
};

const data = {};
for (const t of TABLES) {
  const set = (await api('GET', `EntityDefinitions(LogicalName='${t}')?$select=EntitySetName`, undefined, { solution: null })).EntitySetName;
  data[t] = (await get(`${set}?$top=5000`)).map(keep);
}
data.transactioncurrency = (await get('transactioncurrencies?$select=transactioncurrencyid,isocurrencycode,currencysymbol,exchangerate')).map(keep);

// Only the fictional demo projects (anything users created while trying the app stays out of the video)
const DEMO_PROJECTS = new Set(['Northwind Commerce Replatform', 'Contoso Store Analytics', 'Fabrikam Patient Portal', 'Tailspin Fleet Support',
  'Project Infinity Rollout', 'Contoso Loyalty App', 'Northwind Data Migration', 'Fabrikam Compliance Audit']);
const dropped = new Set(data.pin_project.filter((x) => !DEMO_PROJECTS.has(x.pin_name)).map((x) => x.pin_projectid));
data.pin_project = data.pin_project.filter((x) => !dropped.has(x.pin_projectid));
for (const t of TABLES) data[t] = data[t].filter((row) => !dropped.has(row._pin_project_value));
console.log(`excluded ${dropped.size} non-demo project(s)`);

// People: fictional emails; only "me" keeps a (demo) user link
for (const r of data.pin_resource) {
  const isMe = r._pin_systemuser_value === me.UserId;
  r._pin_systemuser_value = isMe ? DEMO_USER : null;
  r.pin_email = `${r.pin_name.toLowerCase().replace(/[^a-z]+/g, '.')}@infinity.demo`.replace('.@', '@');
}
// The presenter's current week starts empty (only holidays), so the video can fill it live
const meRes = data.pin_resource.find((r) => r._pin_systemuser_value === DEMO_USER);
const monday = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
for (const sheet of data.pin_timesheet.filter((t) => t._pin_resource_value === meRes?.pin_resourceid && String(t.pin_weekstart).startsWith(monday))) {
  data.pin_timeentry = data.pin_timeentry.filter((e) => !(e._pin_timesheet_value === sheet.pin_timesheetid && e.pin_entrytype === 543200000));
  sheet.pin_status = 543200000;
  sheet.pin_totalhours = data.pin_timeentry.filter((e) => e._pin_timesheet_value === sheet.pin_timesheetid).reduce((s, e) => s + Number(e.pin_hours), 0);
  console.log(`reset presenter week ${monday}: ${sheet.pin_totalhours} h of holidays/leave`);
}

// Belt and braces: no real addresses anywhere
const json = JSON.stringify({ demoUser: DEMO_USER, ...data }).replace(/[\w.+-]+@(?!infinity\.demo|[\w-]+\.example)[\w-]+\.[\w.]+/g, 'someone@infinity.demo');
writeFileSync(fileURLToPath(new URL('../src/demo/snapshot.json', import.meta.url)), json);
console.log(Object.entries(data).map(([k, v]) => `${k}:${v.length}`).join(' '));
