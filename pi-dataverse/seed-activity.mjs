// Project Infinity demo activity (phase 2, after seed.mjs): leave, 6 weeks of timesheets, invoices, talent
// requests and a project closure — all through the plug-in rules. Staffing is read from the real memberships.
// Usage: az login && node pi-dataverse/seed-activity.mjs
import { api, log } from './lib.mjs';

const O = (i) => 543200000 + i;
const get = async (path) => (await api('GET', path, undefined, { solution: null })).value;
const sets = {};
async function setOf(logical) {
  sets[logical] ??= (await api('GET', `EntityDefinitions(LogicalName='${logical}')?$select=EntitySetName`, undefined, { solution: null })).EntitySetName;
  return sets[logical];
}
async function create(logical, body) {
  const r = await api('POST', `${await setOf(logical)}?$select=${logical}id`, body, { headers: { Prefer: 'return=representation' } });
  return r[`${logical}id`];
}
const update = async (logical, id, body) => api('PATCH', `${await setOf(logical)}(${id})`, body);
const bind = async (logical, id) => `/${await setOf(logical)}(${id})`;
const day = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
const monday = (d) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); return addDays(x, -((x.getUTCDay() + 6) % 7)); };
const TODAY = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
const THIS_WEEK = monday(TODAY);
const weeksAgo = (n) => day(addDays(THIS_WEEK, -7 * n));

// ---------- load what seed.mjs created ----------
const me = await api('GET', 'WhoAmI', undefined, { solution: null });
const people = await get('pin_resources?$select=pin_resourceid,pin_name,_pin_systemuser_value');
const person = {};
for (const p of people) person[p._pin_systemuser_value === me.UserId ? 'me' : p.pin_name.split(' ')[0].toLowerCase()] = p.pin_resourceid;
const leaveType = Object.fromEntries((await get('pin_leavetypes?$select=pin_leavetypeid,pin_code')).map((t) => [t.pin_code, t.pin_leavetypeid]));
const projects = await get('pin_projects?$select=pin_projectid,pin_name,pin_status');
const project = Object.fromEntries(projects.map((p) => [p.pin_name, p.pin_projectid]));
const role = Object.fromEntries((await get('pin_roles?$select=pin_roleid,pin_name')).map((r) => [r.pin_name, r.pin_roleid]));
const activeIds = new Set(projects.filter((p) => p.pin_status === O(4)).map((p) => p.pin_projectid));
log(`loaded ${people.length} people, ${projects.length} projects (${activeIds.size} active)`);

// The head of delivery's timesheets are approved by the principal architect
await update('pin_resource', person.me, { 'pin_manager@odata.bind': await bind('pin_resource', person.kavya) });

// ---------- leave (before timesheets, so weeks pre-fill with it) ----------
if (!(await get('pin_leaverequests?$select=pin_leaverequestid&$top=1')).length) {
  const leaveReq = async (who, code, from, to, reason, decide) => {
    const id = await create('pin_leaverequest', {
      pin_fromdate: from, pin_todate: to, pin_reason: reason, 'pin_resource@odata.bind': await bind('pin_resource', person[who]),
      'pin_leavetype@odata.bind': await bind('pin_leavetype', leaveType[code]),
    });
    if (decide) {
      const [a] = await get(`pin_approvals?$select=pin_approvalid&$filter=_pin_leaverequest_value eq ${id} and pin_status eq ${O(0)}`);
      if (a) await update('pin_approval', a.pin_approvalid, { pin_status: O(1), pin_comments: 'Approved — enjoy!' });
    }
  };
  await leaveReq('ishita', 'ML', weeksAgo(5), day(addDays(addDays(THIS_WEEK, -35), 181)), 'Maternity leave', true);
  await leaveReq('sneha', 'PL', day(addDays(THIS_WEEK, -14 + 3)), day(addDays(THIS_WEEK, -14 + 4)), 'Family function', true);
  await leaveReq('aisha', 'SL', day(addDays(THIS_WEEK, -21 + 1)), day(addDays(THIS_WEEK, -21 + 1)), 'Fever', true);
  await leaveReq('rohan', 'CL', day(addDays(THIS_WEEK, 7 + 4)), day(addDays(THIS_WEEK, 7 + 4)), 'Bank work');
  await leaveReq('vikram', 'PL', day(addDays(THIS_WEEK, 14)), day(addDays(THIS_WEEK, 18)), 'Trip home');
  log('leave requests: 5 (3 approved, 2 pending)');
}

// ---------- timesheets: 5 approved weeks, last week submitted ----------
const members = await get('pin_members?$select=_pin_resource_value,_pin_project_value,pin_allocation&$filter=pin_isactive eq true');
const staffing = {};
for (const m of members) {
  if (!activeIds.has(m._pin_project_value)) continue;
  (staffing[m._pin_resource_value] ??= []).push([m._pin_project_value, Number(m.pin_allocation) || 25]);
}
const tasks = await get('pin_tasks?$select=pin_taskid,_pin_project_value,_pin_assignee_value');
const myTasks = (who, pid) => tasks.filter((t) => t._pin_assignee_value === who && t._pin_project_value === pid).map((t) => t.pin_taskid);

let sheets = 0;
for (const [who, alloc] of Object.entries(staffing)) {
  if (who === person.ishita) continue; // maternity leave: weeks are auto-filled and auto-approved
  for (let w = 6; w >= 1; w--) {
    const week = addDays(THIS_WEEK, -7 * w);
    const key = `${who.replace(/-/g, '')}|${day(week)}`;
    let [sheet] = await get(`pin_timesheets?$select=pin_timesheetid,pin_status&$filter=pin_weekkey eq '${key}'`);
    if (!sheet) sheet = { pin_timesheetid: await create('pin_timesheet', { pin_weekstart: day(week), 'pin_resource@odata.bind': await bind('pin_resource', who) }), pin_status: O(0) };
    if (sheet.pin_status !== O(0)) continue;
    const entries = await get(`pin_timeentries?$select=pin_workdate,pin_entrytype&$filter=_pin_timesheet_value eq ${sheet.pin_timesheetid}`);
    const taken = new Set(entries.map((e) => e.pin_workdate?.slice(0, 10)));
    const hasWork = entries.some((e) => e.pin_entrytype === O(0)); // resumed run: hours already logged, just submit
    const total = alloc.reduce((s, [, a]) => s + a, 0);
    for (let d = 0; d < 5 && !hasWork; d++) {
      const date = day(addDays(week, d));
      if (taken.has(date)) continue; // holiday or leave on this day
      let left = 8;
      for (const [i, [pid, a]] of alloc.entries()) {
        const hours = i === alloc.length - 1 ? left : Math.round(((8 * a) / total) * 2) / 2;
        left -= hours;
        if (hours <= 0) continue;
        const mine = myTasks(who, pid);
        await create('pin_timeentry', {
          pin_workdate: date, pin_hours: hours, pin_billable: true, pin_notes: mine.length ? '' : 'Planning, stand-ups and client calls',
          'pin_timesheet@odata.bind': await bind('pin_timesheet', sheet.pin_timesheetid), 'pin_project@odata.bind': await bind('pin_project', pid),
          ...(mine.length ? { 'pin_task@odata.bind': await bind('pin_task', mine[(d + w) % mine.length]) } : {}),
        });
      }
    }
    await update('pin_timesheet', sheet.pin_timesheetid, { pin_status: O(1) }); // submit: validate + snapshot rates
    if (w > 1) {
      const [a] = await get(`pin_approvals?$select=pin_approvalid&$filter=_pin_timesheet_value eq ${sheet.pin_timesheetid} and pin_status eq ${O(0)}`);
      await update('pin_approval', a.pin_approvalid, { pin_status: O(1) });
    }
    sheets++;
  }
  log(`  timesheets for ${people.find((p) => p.pin_resourceid === who)?.pin_name}`);
}
log(`timesheets: ${sheets}`);

// ---------- invoices (through the invoice engine) ----------
const firstOfMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const lastMonthEnd = addDays(firstOfMonth(TODAY), -1);
const twoMonthsAgo = firstOfMonth(addDays(firstOfMonth(lastMonthEnd), -1));
const invoice = async (name, from, to, statuses) => {
  try {
    const id = await create('pin_invoice', { pin_periodfrom: day(from), pin_periodto: day(to), 'pin_project@odata.bind': await bind('pin_project', project[name]) });
    for (const s of statuses) await update('pin_invoice', id, { pin_status: O(s) });
    log(`  invoice ${name}: ${day(from)} … ${day(to)}`);
  } catch (e) {
    log(`  (no invoice for ${name}: ${String(e.message).slice(0, 160)})`);
  }
};
await invoice('Northwind Commerce Replatform', twoMonthsAgo, lastMonthEnd, [1, 2, 3]); // approved → sent → paid
await invoice('Fabrikam Patient Portal', twoMonthsAgo, lastMonthEnd, [1, 2]); // sent
await invoice('Contoso Store Analytics', addDays(twoMonthsAgo, -31), lastMonthEnd, [1, 2]); // accepted milestones
await invoice('Tailspin Fleet Support', twoMonthsAgo, lastMonthEnd, [1, 2, 3]); // retainer months

// ---------- talent requests ----------
const sponsor = await bind('pin_resource', person.me);
const rr1 = await create('pin_resourcerequest', {
  pin_title: 'Senior React Developer', pin_skills: 'React, TypeScript, Next.js, Commerce', pin_minexperience: 5, pin_allocation: 100, pin_headcount: 1, pin_priority: O(2),
  pin_startdate: weeksAgo(-2), pin_enddate: weeksAgo(-14), pin_location: 'Bengaluru', pin_justification: 'Checkout scope grew after UAT; need another senior FE developer for 3 months.',
  'pin_project@odata.bind': await bind('pin_project', project['Northwind Commerce Replatform']), 'pin_role@odata.bind': await bind('pin_role', role['Senior Developer']),
});
await update('pin_resourcerequest', rr1, { pin_status: O(1), 'pin_rmgowner@odata.bind': sponsor, pin_decisionnotes: 'No senior React capacity on the bench until December — likely a hire.' });
await create('pin_resourcerequest', {
  pin_title: 'QA Automation Engineer', pin_skills: 'Playwright, Accessibility testing, API testing', pin_minexperience: 3, pin_allocation: 50, pin_headcount: 1, pin_priority: O(1),
  pin_startdate: weeksAgo(-1), pin_enddate: weeksAgo(-16), pin_location: 'Any', pin_justification: 'Regression load grows with each portal release.',
  'pin_project@odata.bind': await bind('pin_project', project['Fabrikam Patient Portal']), 'pin_role@odata.bind': await bind('pin_role', role['QA Engineer']),
});
log('talent requests: 2');

// ---------- close the audit project (closure approval) ----------
try {
  const fa = project['Fabrikam Compliance Audit'];
  await update('pin_project', fa, { pin_status: O(6), pin_closurenotes: 'All deliverables accepted by the client.', pin_lessonslearned: 'Start evidence collection in week 1.' });
  const [c] = await get(`pin_approvals?$select=pin_approvalid&$filter=_pin_project_value eq ${fa} and pin_type eq ${O(2)} and pin_status eq ${O(0)}`);
  await update('pin_approval', c.pin_approvalid, { pin_status: O(1), pin_comments: 'Great work — closing.' });
  log('closed: Fabrikam Compliance Audit');
} catch (e) {
  log(`(closure skipped: ${String(e.message).slice(0, 200)})`);
}
log('seed activity complete');
