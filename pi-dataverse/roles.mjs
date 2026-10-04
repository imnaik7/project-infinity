// Project Infinity security roles (solution-aware). Idempotent: creates missing roles and (re)applies privileges.
//   Team Member / Project Manager read projects at *user* level, so they only see projects they own or that are
//   shared with them through the project's access team (members, PM, sponsor). PMO, RMG and Finance see across.
// Usage: az login && node pi-dataverse/roles.mjs
import { api, log } from './lib.mjs';

const get = async (path) => (await api('GET', path, undefined, { solution: null })).value;
const B = 'Basic', L = 'Local', G = 'Global';
const ALL = ['Create', 'Read', 'Write', 'Delete', 'Append', 'AppendTo', 'Assign', 'Share'];

// table → { verb: depth }
const crud = (depth, verbs = ALL) => Object.fromEntries(verbs.map((v) => [v, depth]));
const read = (depth) => ({ Read: depth });
const REF = { pin_client: read(G), pin_role: read(G), pin_holiday: read(G), pin_leavetype: read(G), pin_resource: { Read: G, AppendTo: G } };

const TEAM_MEMBER = {
  ...REF,
  pin_project: { Read: B, AppendTo: B, Append: B },
  pin_member: read(B), pin_milestone: { Read: B, AppendTo: B }, pin_activity: read(B), pin_projectrate: read(B),
  pin_task: { Create: B, Read: B, Write: B, Append: B, AppendTo: B },
  pin_timesheet: crud(B, ['Create', 'Read', 'Write', 'Append', 'AppendTo']),
  pin_timeentry: crud(B, ['Create', 'Read', 'Write', 'Delete', 'Append', 'AppendTo']),
  pin_leaverequest: crud(B, ['Create', 'Read', 'Write', 'Append', 'AppendTo']),
  pin_leavebalance: read(B),
  pin_approval: { Read: B, Write: B },
};

const PROJECT_MANAGER = {
  ...TEAM_MEMBER,
  pin_project: crud(B),
  pin_member: crud(B), pin_milestone: crud(B), pin_projectrate: crud(B), pin_activity: { Create: B, Read: B, Append: B },
  pin_task: crud(B), pin_resourcerequest: crud(B, ['Create', 'Read', 'Write', 'Append', 'AppendTo']),
  pin_invoice: crud(B, ['Create', 'Read', 'Write', 'Append', 'AppendTo']), pin_invoiceline: read(B), pin_revenue: read(B),
  // Team time for project views and approving direct reports
  pin_timesheet: { ...crud(B, ['Create', 'Write', 'Append', 'AppendTo']), Read: L },
  pin_timeentry: { ...crud(B, ['Create', 'Write', 'Delete', 'Append', 'AppendTo']), Read: L },
  pin_leaverequest: { ...crud(B, ['Create', 'Write', 'Append', 'AppendTo']), Read: L },
  pin_approval: { Read: L, Write: B },
};

const RESOURCE_MANAGER = {
  ...TEAM_MEMBER,
  pin_project: { Read: G, AppendTo: G },
  pin_resource: crud(G, ['Create', 'Read', 'Write', 'Append', 'AppendTo']),
  pin_member: crud(G, ['Create', 'Read', 'Write', 'Append', 'AppendTo']),
  pin_resourcerequest: crud(G, ['Create', 'Read', 'Write', 'Append', 'AppendTo', 'Assign']),
  pin_role: read(G), pin_leaverequest: { ...crud(B, ['Create', 'Write']), Read: G }, pin_activity: read(G),
};

const FINANCE = {
  ...TEAM_MEMBER,
  pin_project: { Read: G, AppendTo: G },
  pin_client: crud(G, ['Create', 'Read', 'Write', 'Append', 'AppendTo']), pin_role: crud(G, ['Create', 'Read', 'Write']),
  pin_invoice: crud(G), pin_invoiceline: crud(G), pin_revenue: crud(G, ['Create', 'Read', 'Write', 'Append', 'AppendTo']),
  pin_milestone: { Read: G, Write: G, AppendTo: G }, pin_timeentry: { ...TEAM_MEMBER.pin_timeentry, Read: G }, pin_projectrate: crud(G, ['Create', 'Read', 'Write']),
};

const TABLES = ['pin_client', 'pin_role', 'pin_resource', 'pin_project', 'pin_projectrate', 'pin_member', 'pin_milestone', 'pin_task', 'pin_timesheet', 'pin_timeentry',
  'pin_approval', 'pin_invoice', 'pin_invoiceline', 'pin_revenue', 'pin_activity', 'pin_resourcerequest', 'pin_holiday', 'pin_leavetype', 'pin_leavebalance', 'pin_leaverequest'];
const PMO = Object.fromEntries(TABLES.map((t) => [t, crud(G)]));

const ROLES = {
  'Project Infinity PMO Admin': PMO,
  'Project Infinity Project Manager': PROJECT_MANAGER,
  'Project Infinity Team Member': TEAM_MEMBER,
  'Project Infinity Resource Manager': RESOURCE_MANAGER,
  'Project Infinity Finance': FINANCE,
};

// Privilege ids: prv<Verb><table>
const privs = new Map();
for (const p of await get(`privileges?$select=privilegeid,name&$filter=contains(name,'pin_')`)) privs.set(p.name.toLowerCase(), p.privilegeid);
const rootBu = (await get('businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null'))[0].businessunitid;

for (const [name, spec] of Object.entries(ROLES)) {
  let role = (await get(`roles?$select=roleid&$filter=name eq '${name}' and _businessunitid_value eq ${rootBu}`))[0];
  if (!role) {
    const r = await api('POST', 'roles', { name, 'businessunitid@odata.bind': `/businessunits(${rootBu})` }, { headers: { Prefer: 'return=representation' } });
    role = { roleid: r.roleid };
    log(`+ role ${name}`);
  } else log(`= role ${name}`);
  const Privileges = [];
  for (const [table, verbs] of Object.entries(spec))
    for (const [verb, depth] of Object.entries(verbs)) {
      const id = privs.get(`prv${verb}${table}`.toLowerCase());
      if (id) Privileges.push({ PrivilegeId: id, Depth: depth });
    }
  await api('POST', `roles(${role.roleid})/Microsoft.Dynamics.CRM.AddPrivilegesRole`, { Privileges });
  log(`  ${Privileges.length} privileges`);
}
log('roles ready');
