// Project Infinity engine checks against Dev_USA. Uses a throw-away project (deleted at the end) plus
// read-only checks on the seeded data. Usage: az login && node pi-dataverse/test-engine.mjs
import { api, log } from './lib.mjs';

const O = (i) => 543200000 + i;
const get = async (p) => (await api('GET', p, undefined, { solution: null })).value;
const post = async (set, body, key) => (await api('POST', `${set}?$select=${key}`, body, { headers: { Prefer: 'return=representation' } }))[key];
const patch = (set, id, body) => api('PATCH', `${set}(${id})`, body);
let failed = 0;
const ok = (cond, msg) => { if (cond) log(`✓ ${msg}`); else { failed++; console.error(`✗ ${msg}`); } };
const refuses = async (fn, pattern, msg) => {
  try {
    await fn();
    ok(false, `${msg} (was allowed)`);
  } catch (e) {
    ok(pattern.test(String(e.message)), `${msg} — “${String(e.message).match(/"message":"([^"]{0,110})/)?.[1] ?? ''}”`);
  }
};

const [client] = await get(`pin_clients?$select=pin_clientid&$filter=pin_name eq 'Contoso Retail India'`);
const me = await api('GET', 'WhoAmI', undefined, { solution: null });
const [sponsor] = await get(`pin_resources?$select=pin_resourceid&$filter=_pin_systemuser_value eq ${me.UserId}`);
const [pm] = await get(`pin_resources?$select=pin_resourceid&$filter=pin_name eq 'Arjun Mehta'`);

// ---------- lifecycle ----------
const id = await post('pin_projects', { pin_name: 'ZZ Engine test', pin_billingmodel: O(0), 'pin_client@odata.bind': `/pin_clients(${client.pin_clientid})` }, 'pin_projectid');
try {
  await refuses(() => patch('pin_projects', id, { pin_status: O(1) }), /sponsor|start date/i, 'submit without sponsor/start is refused');
  await patch('pin_projects', id, { 'pin_sponsor@odata.bind': `/pin_resources(${sponsor.pin_resourceid})`, pin_startdate: new Date().toISOString().slice(0, 10) });
  await patch('pin_projects', id, { pin_status: O(1) });
  const [appr] = await get(`pin_approvals?$select=pin_approvalid,_pin_approver_value&$filter=_pin_project_value eq ${id} and pin_status eq ${O(0)}`);
  ok(appr && appr._pin_approver_value === sponsor.pin_resourceid, 'submitting creates a pending approval for the sponsor');
  await patch('pin_approvals', appr.pin_approvalid, { pin_status: O(1) });
  const p1 = await api('GET', `pin_projects(${id})?$select=pin_status`, undefined, { solution: null });
  ok(p1.pin_status === O(2), 'approval moves the project to Approved');
  await refuses(() => patch('pin_projects', id, { pin_status: O(4) }), /project manager/i, 'starting without a PM is refused');
  await patch('pin_projects', id, { 'pin_projectmanager@odata.bind': `/pin_resources(${pm.pin_resourceid})` });
  await patch('pin_projects', id, { pin_status: O(4) });
  const members = await get(`pin_members?$select=pin_accesslevel&$filter=_pin_project_value eq ${id} and _pin_resource_value eq ${pm.pin_resourceid}`);
  ok(members.some((m) => m.pin_accesslevel === O(0)), 'assigning a PM creates a Project Manager membership');

  // ---------- closure rules ----------
  await post('pin_tasks', { pin_name: 'Open task', pin_status: O(1), 'pin_project@odata.bind': `/pin_projects(${id})` }, 'pin_taskid');
  await refuses(() => patch('pin_projects', id, { pin_status: O(6) }), /can't close yet|not done/i, 'closing with open tasks is refused');
} finally {
  await api('DELETE', `pin_projects(${id})`);
  log('  (test project deleted)');
}

// ---------- seeded data invariants ----------
const approved = await get(`pin_timeentries?$select=pin_hours,pin_billrate,pin_amount,pin_billable,_pin_role_value&$filter=pin_status eq ${O(2)} and pin_entrytype eq ${O(0)} and pin_billable eq true&$top=200`);
ok(approved.length > 0 && approved.every((e) => e._pin_role_value && Number(e.pin_billrate) > 0), `approved billable entries carry a role + rate snapshot (${approved.length} checked)`);
ok(approved.every((e) => Math.abs(Number(e.pin_amount) - Number(e.pin_hours) * Number(e.pin_billrate)) < 0.02), 'amount = hours × snapshotted rate');

const [nw] = await get(`pin_projects?$select=pin_projectid&$filter=pin_name eq 'Northwind Commerce Replatform'`);
const [inv] = await get(`pin_invoices?$select=pin_periodfrom,pin_periodto&$filter=_pin_project_value eq ${nw.pin_projectid} and pin_status ne ${O(4)}`);
await refuses(
  () => post('pin_invoices', { pin_periodfrom: inv.pin_periodfrom, pin_periodto: inv.pin_periodto, 'pin_project@odata.bind': `/pin_projects(${nw.pin_projectid})` }, 'pin_invoiceid'),
  /nothing to bill/i,
  'invoicing the same period twice bills nothing',
);
const revenue = await get(`pin_revenues?$select=pin_amount&$filter=_pin_project_value eq ${nw.pin_projectid}`);
ok(revenue.length > 0, `timesheet approval recognised revenue (${revenue.length} entries)`);

const [rohan] = await get(`pin_resources?$select=pin_resourceid&$filter=pin_name eq 'Rohan Gupta'`);
const [m] = await get(`pin_members?$select=pin_memberid&$filter=_pin_resource_value eq ${rohan.pin_resourceid} and _pin_project_value eq ${nw.pin_projectid}`);
const [dev] = await get(`pin_roles?$select=pin_roleid&$filter=pin_name eq 'Developer'`);
await refuses(() => patch('pin_members', m.pin_memberid, { 'pin_role@odata.bind': `/pin_roles(${dev.pin_roleid})` }), /effective-dated/i, 'rewriting a past role is refused (effective-dated)');

const [ishita] = await get(`pin_resources?$select=pin_resourceid&$filter=pin_name eq 'Ishita Bose'`);
const leaveSheets = await get(`pin_timesheets?$select=pin_status,pin_comments&$filter=_pin_resource_value eq ${ishita.pin_resourceid}`);
ok(leaveSheets.some((s) => s.pin_status === O(2) && /Auto-approved/.test(s.pin_comments ?? '')), `maternity weeks auto-approved (${leaveSheets.length} sheets)`);
const [bal] = await get(`pin_leavebalances?$select=pin_used,pin_entitled&$filter=_pin_resource_value eq ${ishita.pin_resourceid}`);
ok(bal && Number(bal.pin_used) > 0, `leave balance used ${bal?.pin_used} of ${bal?.pin_entitled}`);

log(failed ? `\n${failed} check(s) failed` : '\nall engine checks passed');
process.exitCode = failed ? 1 : 0;
