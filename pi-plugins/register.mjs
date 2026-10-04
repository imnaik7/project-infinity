// Registers (or updates) ProjectInfinity.Plugins inside the ProjectInfinity solution:
// assembly → plug-in types → synchronous steps (Pre 20 validation, Post 40 side effects) → images.
// Idempotent: re-running uploads the new DLL and adds only missing steps.
// Usage: dotnet build -c Release (in pi-plugins) && node pi-plugins/register.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { api, log } from '../pi-dataverse/lib.mjs';

const DLL = fileURLToPath(new URL('./bin/Release/net462/ProjectInfinity.Plugins.dll', import.meta.url));
const ASSEMBLY = 'ProjectInfinity.Plugins';

const step = (type, entity, message, stage, { filtering, images = [] } = {}) => ({ type, entity, message, stage, filtering, images });
const STEPS = [
  step('ProjectPlugin', 'pin_project', 'Create', 20),
  step('ProjectPlugin', 'pin_project', 'Create', 40),
  step('ProjectPlugin', 'pin_project', 'Update', 20, { images: ['pre'] }),
  step('ProjectPlugin', 'pin_project', 'Update', 40, { filtering: 'pin_status,pin_projectmanager,pin_sponsor', images: ['pre'] }),
  step('MemberPlugin', 'pin_member', 'Create', 20),
  step('MemberPlugin', 'pin_member', 'Update', 20, { images: ['pre'] }),
  step('MemberPlugin', 'pin_member', 'Delete', 20, { images: ['pre'] }),
  step('MemberPlugin', 'pin_member', 'Create', 40),
  step('MemberPlugin', 'pin_member', 'Update', 40, { images: ['pre'] }),
  step('MemberPlugin', 'pin_member', 'Delete', 40, { images: ['pre'] }),
  step('TaskPlugin', 'pin_task', 'Create', 20),
  step('TaskPlugin', 'pin_task', 'Update', 20, { images: ['pre'] }),
  step('TaskPlugin', 'pin_task', 'Create', 40),
  step('TaskPlugin', 'pin_task', 'Update', 40, { filtering: 'pin_status,pin_percentcomplete,pin_estimatehours', images: ['pre'] }),
  step('MilestonePlugin', 'pin_milestone', 'Update', 40, { filtering: 'pin_status', images: ['pre'] }),
  step('ResourceRequestPlugin', 'pin_resourcerequest', 'Create', 20),
  step('ResourceRequestPlugin', 'pin_resourcerequest', 'Update', 20, { filtering: 'pin_status', images: ['pre'] }),
  step('ResourceRequestPlugin', 'pin_resourcerequest', 'Create', 40),
  step('ResourceRequestPlugin', 'pin_resourcerequest', 'Update', 40, { filtering: 'pin_status,pin_fulfilledby', images: ['pre'] }),
  step('CurrencyPlugin', 'pin_projectrate', 'Create', 20),
  step('CurrencyPlugin', 'pin_member', 'Create', 20),
  step('CurrencyPlugin', 'pin_milestone', 'Create', 20),
  step('TimesheetPlugin', 'pin_timesheet', 'Create', 20),
  step('TimesheetPlugin', 'pin_timesheet', 'Create', 40),
  step('TimesheetPlugin', 'pin_timesheet', 'Update', 20, { filtering: 'pin_status', images: ['pre'] }),
  step('TimesheetPlugin', 'pin_timesheet', 'Update', 40, { filtering: 'pin_status', images: ['pre'] }),
  step('TimeEntryPlugin', 'pin_timeentry', 'Create', 20),
  step('TimeEntryPlugin', 'pin_timeentry', 'Update', 20, { images: ['pre'] }),
  step('TimeEntryPlugin', 'pin_timeentry', 'Delete', 20, { images: ['pre'] }),
  step('LeaveRequestPlugin', 'pin_leaverequest', 'Create', 20),
  step('LeaveRequestPlugin', 'pin_leaverequest', 'Create', 40),
  step('LeaveRequestPlugin', 'pin_leaverequest', 'Update', 20, { filtering: 'pin_status', images: ['pre'] }),
  step('LeaveRequestPlugin', 'pin_leaverequest', 'Update', 40, { filtering: 'pin_status', images: ['pre'] }),
  step('ApprovalPlugin', 'pin_approval', 'Update', 40, { filtering: 'pin_status', images: ['pre'] }),
  step('InvoicePlugin', 'pin_invoice', 'Create', 20),
  step('InvoicePlugin', 'pin_invoice', 'Create', 40),
  step('InvoicePlugin', 'pin_invoice', 'Update', 20, { filtering: 'pin_status', images: ['pre'] }),
  step('InvoicePlugin', 'pin_invoice', 'Update', 40, { filtering: 'pin_status', images: ['pre'] }),
];

const one = async (path) => (await api('GET', path, undefined, { solution: null })).value?.[0];

// 1) Assembly
const content = readFileSync(DLL).toString('base64');
let asm = await one(`pluginassemblies?$select=pluginassemblyid&$filter=name eq '${ASSEMBLY}'`);
if (asm) {
  await api('PATCH', `pluginassemblies(${asm.pluginassemblyid})`, { content });
  log('~ assembly updated');
} else {
  const r = await api('POST', 'pluginassemblies', {
    name: ASSEMBLY, content, isolationmode: 2, sourcetype: 0, culture: 'neutral', version: '1.0.0.0',
    description: 'Project Infinity rules: lifecycle, access, timesheets, leave, approvals, invoicing, revenue, talent',
  }, { headers: { Prefer: 'return=representation' } });
  asm = { pluginassemblyid: r.pluginassemblyid };
  log(`+ assembly ${asm.pluginassemblyid}`);
}

// 2) Types
const typeIds = {};
for (const t of [...new Set(STEPS.map((s) => s.type))]) {
  const typename = `ProjectInfinity.Plugins.${t}`;
  let pt = await one(`plugintypes?$select=plugintypeid&$filter=typename eq '${typename}'`);
  if (!pt) {
    const r = await api('POST', 'plugintypes', { typename, name: typename, friendlyname: t, 'pluginassemblyid@odata.bind': `/pluginassemblies(${asm.pluginassemblyid})` },
      { headers: { Prefer: 'return=representation' } });
    pt = { plugintypeid: r.plugintypeid };
    log(`+ type ${t}`);
  }
  typeIds[t] = pt.plugintypeid;
}

// 3) Steps + images
const msgIds = {};
for (const s of STEPS) {
  const stepName = `ProjectInfinity: ${s.type} — ${s.message} of ${s.entity} (${s.stage === 20 ? 'pre' : 'post'})`;
  if (await one(`sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=name eq '${stepName}'`)) continue;
  msgIds[s.message] ??= (await one(`sdkmessages?$select=sdkmessageid&$filter=name eq '${s.message}'`)).sdkmessageid;
  const filter = await one(`sdkmessagefilters?$select=sdkmessagefilterid&$filter=primaryobjecttypecode eq '${s.entity}' and _sdkmessageid_value eq ${msgIds[s.message]}`);
  const created = await api('POST', 'sdkmessageprocessingsteps', {
    name: stepName, stage: s.stage, mode: 0, rank: 1, supporteddeployment: 0, invocationsource: 0,
    ...(s.filtering ? { filteringattributes: s.filtering } : {}),
    'plugintypeid@odata.bind': `/plugintypes(${typeIds[s.type]})`,
    'sdkmessageid@odata.bind': `/sdkmessages(${msgIds[s.message]})`,
    'sdkmessagefilterid@odata.bind': `/sdkmessagefilters(${filter.sdkmessagefilterid})`,
  }, { headers: { Prefer: 'return=representation' } });
  for (const img of s.images) {
    await api('POST', 'sdkmessageprocessingstepimages', {
      name: img, entityalias: img, imagetype: img === 'pre' ? 0 : 1,
      messagepropertyname: s.message === 'Create' ? 'Id' : 'Target',
      'sdkmessageprocessingstepid@odata.bind': `/sdkmessageprocessingsteps(${created.sdkmessageprocessingstepid})`,
    });
  }
  log(`+ ${stepName}`);
}
log(`plug-ins registered (${STEPS.length} steps)`);
