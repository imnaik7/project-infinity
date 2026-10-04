// Project Infinity Dataverse schema — declarative and idempotent (publisher prefix `pin`, choices 54320…).
// Child tables are *parental* to their project (cascade share/assign), so the project's access team
// grants row-level access to everything underneath it.
//
// Usage:  az login   then   node pi-dataverse/schema.mjs [--only pin_project,pin_task]
import { api, label, publishAll, log } from './lib.mjs';

// ---------- column helpers ----------
const text = (name, display, max = 100, extra = {}) => ({ kind: 'String', name, display, max, ...extra });
const memo = (name, display, max = 4000) => ({ kind: 'Memo', name, display, max });
const dec = (name, display, { min = -1e10, max = 1e10, precision = 2 } = {}) => ({ kind: 'Decimal', name, display, min, max, precision });
const money = (name, display) => ({ kind: 'Money', name, display });
const int = (name, display, { min = -2147483648, max = 2147483647 } = {}) => ({ kind: 'Integer', name, display, min, max });
const bool = (name, display, dflt = false) => ({ kind: 'Boolean', name, display, dflt });
const date = (name, display) => ({ kind: 'DateTime', name, display, format: 'DateOnly' });
const datetime = (name, display) => ({ kind: 'DateTime', name, display, format: 'DateAndTime' });
const choice = (name, display, options, dflt) => ({ kind: 'Picklist', name, display, options, dflt });
/** cascadeDelete 'Cascade' = parental relationship (assign/share/unshare/reparent cascade too) */
const lookup = (name, display, target, { cascadeDelete = 'Restrict', required = false } = {}) => ({ kind: 'Lookup', name, display, target, cascadeDelete, required });
const parent = (name, display, target) => lookup(name, display, target, { cascadeDelete: 'Cascade', required: true });

const opts = (...labels) => labels.map((l, i) => ({ value: 543200000 + i, label: l }));
const PRIORITY = opts('Low', 'Medium', 'High', 'Critical');

// ---------- tables ----------
export const TABLES = [
  // ----- reference data (organization-owned: everyone can read) -----
  {
    name: 'pin_client', display: 'Client', plural: 'Clients', ownership: 'OrganizationOwned',
    primary: text('pin_name', 'Client name', 200),
    columns: [
      text('pin_legalname', 'Legal name', 200), text('pin_gstin', 'GSTIN / Tax ID', 30), dec('pin_taxrate', 'Tax %', { min: 0, max: 100 }),
      text('pin_billingemail', 'Billing email', 100), text('pin_contactname', 'Billing contact', 100), memo('pin_billingaddress', 'Billing address', 1000),
      int('pin_paymenttermsdays', 'Payment terms (days)', { min: 0, max: 365 }), text('pin_industry', 'Industry', 80),
      money('pin_creditlimit', 'Credit limit'), bool('pin_isactive', 'Active', true), text('pin_color', 'Brand colour', 9),
    ],
  },
  {
    name: 'pin_role', display: 'Role', plural: 'Roles', ownership: 'OrganizationOwned',
    primary: text('pin_name', 'Role', 100),
    columns: [
      money('pin_billrate', 'Bill rate / hour'), money('pin_costrate', 'Cost rate / hour'), memo('pin_description', 'Description', 1000),
      text('pin_color', 'Colour', 9), int('pin_sortorder', 'Sort order'), bool('pin_isactive', 'Active', true),
    ],
  },
  // ----- people -----
  {
    name: 'pin_resource', display: 'Resource', plural: 'Resources', ownership: 'UserOwned',
    primary: text('pin_name', 'Full name', 150),
    columns: [
      text('pin_email', 'Email', 120), lookup('pin_systemuser', 'User account', 'systemuser', { cascadeDelete: 'RemoveLink' }),
      lookup('pin_defaultrole', 'Default role', 'pin_role'), lookup('pin_manager', 'Manager (timesheet approver)', 'pin_resource', { cascadeDelete: 'RemoveLink' }),
      text('pin_designation', 'Designation', 100), dec('pin_weeklycapacity', 'Weekly capacity (h)', { min: 0, max: 80 }),
      memo('pin_skills', 'Skills', 2000), dec('pin_experienceyears', 'Experience (years)', { min: 0, max: 60 }), text('pin_location', 'Location', 100),
      choice('pin_source', 'Source', opts('Internal', 'New hire', 'Contractor'), 0), int('pin_onboardingcandidateid', 'Onboarding candidate ID'),
      date('pin_joinedon', 'Joined on'), bool('pin_isactive', 'Active', true), text('pin_avatarcolor', 'Avatar colour', 9),
      text('pin_capabilities', 'App capabilities (UI only: PMO, RMG, Finance)', 100),
    ],
  },
  // ----- projects -----
  {
    name: 'pin_project', display: 'Project', plural: 'Projects', ownership: 'UserOwned', accessTeams: true,
    primary: text('pin_name', 'Project name', 200),
    columns: [
      text('pin_code', 'Project code', 20, { autoNumber: 'PRJ-{SEQNUM:5}' }), lookup('pin_client', 'Client', 'pin_client'), memo('pin_description', 'Description', 4000),
      choice('pin_billingmodel', 'Billing model', opts('Time & materials', 'Fixed price', 'Retainer', 'Non-billable'), 0),
      choice('pin_status', 'Status', opts('Draft', 'Pending approval', 'Approved', 'Rejected', 'Active', 'On hold', 'Closing', 'Closed', 'Cancelled'), 0),
      lookup('pin_sponsor', 'Sponsor (approver)', 'pin_resource', { cascadeDelete: 'RemoveLink' }),
      lookup('pin_projectmanager', 'Project manager', 'pin_resource', { cascadeDelete: 'RemoveLink' }),
      date('pin_startdate', 'Start date'), date('pin_enddate', 'End date'), dec('pin_budgethours', 'Budget hours', { min: 0 }),
      money('pin_budgetamount', 'Budget amount'), money('pin_retainerfee', 'Monthly retainer'),
      choice('pin_priority', 'Priority', PRIORITY, 1), choice('pin_health', 'Health', opts('On track', 'At risk', 'Off track'), 0),
      dec('pin_percentcomplete', '% complete', { min: 0, max: 100 }), dec('pin_actualhours', 'Actual hours', { min: 0 }),
      money('pin_actualcost', 'Actual cost'), money('pin_recognisedrevenue', 'Recognised revenue'), money('pin_billedamount', 'Billed amount'),
      datetime('pin_submittedon', 'Submitted on'), datetime('pin_approvedon', 'Approved on'), memo('pin_approvalcomments', 'Approval comments', 2000),
      datetime('pin_closedon', 'Closed on'), memo('pin_closurenotes', 'Closure notes', 4000), memo('pin_lessonslearned', 'Lessons learned', 4000),
      memo('pin_closureoverride', 'Closure override reason', 2000), text('pin_color', 'Colour', 9), text('pin_tags', 'Tags', 300),
    ],
  },
  {
    name: 'pin_projectrate', display: 'Project rate', plural: 'Project rates', ownership: 'UserOwned',
    primary: text('pin_name', 'Rate', 150),
    columns: [parent('pin_project', 'Project', 'pin_project'), lookup('pin_role', 'Role', 'pin_role'), money('pin_billrate', 'Bill rate / hour'), money('pin_costrate', 'Cost rate / hour')],
  },
  {
    name: 'pin_member', display: 'Project member', plural: 'Project members', ownership: 'UserOwned',
    primary: text('pin_name', 'Assignment', 200),
    columns: [
      parent('pin_project', 'Project', 'pin_project'), lookup('pin_resource', 'Resource', 'pin_resource'), lookup('pin_role', 'Role', 'pin_role'),
      choice('pin_accesslevel', 'Project access', opts('Project Manager', 'Contributor', 'Viewer'), 1),
      dec('pin_allocation', 'Allocation %', { min: 0, max: 100 }), date('pin_effectivefrom', 'Effective from'), date('pin_effectiveto', 'Effective to'),
      money('pin_billrate', 'Bill rate override'), bool('pin_isactive', 'Active', true), text('pin_changereason', 'Change reason', 300),
    ],
  },
  {
    name: 'pin_milestone', display: 'Milestone', plural: 'Milestones', ownership: 'UserOwned',
    primary: text('pin_name', 'Milestone', 200),
    columns: [
      parent('pin_project', 'Project', 'pin_project'), date('pin_duedate', 'Due date'), money('pin_amount', 'Amount'),
      choice('pin_status', 'Status', opts('Planned', 'In progress', 'Completed', 'Accepted', 'Invoiced'), 0),
      date('pin_acceptedon', 'Accepted on'), memo('pin_description', 'Description', 2000), int('pin_sortorder', 'Order'),
    ],
  },
  {
    name: 'pin_task', display: 'Task', plural: 'Tasks', ownership: 'UserOwned',
    primary: text('pin_name', 'Title', 300),
    columns: [
      parent('pin_project', 'Project', 'pin_project'), lookup('pin_milestone', 'Milestone', 'pin_milestone', { cascadeDelete: 'RemoveLink' }),
      lookup('pin_parenttask', 'Parent task', 'pin_task', { cascadeDelete: 'RemoveLink' }),
      lookup('pin_assignee', 'Assignee', 'pin_resource', { cascadeDelete: 'RemoveLink' }), memo('pin_description', 'Description', 8000),
      choice('pin_status', 'Status', opts('Backlog', 'To do', 'In progress', 'In review', 'Blocked', 'Done'), 1), choice('pin_priority', 'Priority', PRIORITY, 1),
      dec('pin_estimatehours', 'Estimate (h)', { min: 0 }), dec('pin_actualhours', 'Actual (h)', { min: 0 }), dec('pin_percentcomplete', '% complete', { min: 0, max: 100 }),
      date('pin_startdate', 'Start'), date('pin_duedate', 'Due'), datetime('pin_completedon', 'Completed on'), dec('pin_boardorder', 'Board order', { precision: 4 }),
      text('pin_tags', 'Tags', 300),
    ],
  },
  // ----- time -----
  {
    name: 'pin_timesheet', display: 'Timesheet', plural: 'Timesheets', ownership: 'UserOwned',
    primary: text('pin_name', 'Timesheet', 40, { autoNumber: 'TS-{SEQNUM:6}' }),
    columns: [
      lookup('pin_resource', 'Resource', 'pin_resource'), date('pin_weekstart', 'Week starting (Mon)'), text('pin_weekkey', 'Week key', 60, { required: true }),
      choice('pin_status', 'Status', opts('Draft', 'Submitted', 'Approved', 'Rejected'), 0), dec('pin_totalhours', 'Total hours', { min: 0 }),
      dec('pin_billablehours', 'Billable hours', { min: 0 }), lookup('pin_approver', 'Approver', 'pin_resource', { cascadeDelete: 'RemoveLink' }),
      datetime('pin_submittedon', 'Submitted on'), datetime('pin_decidedon', 'Decided on'), memo('pin_comments', 'Comments', 2000),
    ],
    keys: [{ name: 'pin_timesheet_weekkey', display: 'Resource + week', columns: ['pin_weekkey'] }],
  },
  {
    name: 'pin_timeentry', display: 'Time entry', plural: 'Time entries', ownership: 'UserOwned',
    primary: text('pin_name', 'Entry', 200),
    columns: [
      parent('pin_timesheet', 'Timesheet', 'pin_timesheet'), lookup('pin_project', 'Project', 'pin_project'),
      lookup('pin_task', 'Task', 'pin_task', { cascadeDelete: 'RemoveLink' }), lookup('pin_resource', 'Resource', 'pin_resource'),
      date('pin_workdate', 'Date'), dec('pin_hours', 'Hours', { min: 0, max: 24 }), bool('pin_billable', 'Billable', true), memo('pin_notes', 'Notes', 2000),
      choice('pin_status', 'Status', opts('Draft', 'Submitted', 'Approved', 'Rejected'), 0),
      lookup('pin_role', 'Role (at submission)', 'pin_role', { cascadeDelete: 'RemoveLink' }), money('pin_billrate', 'Bill rate'), money('pin_costrate', 'Cost rate'),
      money('pin_amount', 'Billable amount'), money('pin_costamount', 'Cost amount'),
      lookup('pin_invoiceline', 'Invoice line', 'pin_invoiceline', { cascadeDelete: 'RemoveLink' }),
      choice('pin_entrytype', 'Entry type', opts('Work', 'Leave', 'Holiday'), 0),
      lookup('pin_leavetype', 'Leave type', 'pin_leavetype', { cascadeDelete: 'RemoveLink' }),
      lookup('pin_leaverequest', 'Leave request', 'pin_leaverequest', { cascadeDelete: 'RemoveLink' }),
    ],
  },
  // ----- leave & holidays -----
  {
    name: 'pin_holiday', display: 'Holiday', plural: 'Holidays', ownership: 'OrganizationOwned',
    primary: text('pin_name', 'Holiday', 150),
    columns: [date('pin_date', 'Date'), choice('pin_type', 'Type', opts('Public holiday', 'Company holiday', 'Optional holiday'), 0), text('pin_location', 'Location (blank = all)', 100)],
  },
  {
    name: 'pin_leavetype', display: 'Leave type', plural: 'Leave types', ownership: 'OrganizationOwned',
    primary: text('pin_name', 'Leave type', 100),
    columns: [
      text('pin_code', 'Code', 10), dec('pin_annualquota', 'Annual quota (days)', { min: 0, max: 400 }), bool('pin_paid', 'Paid', true),
      bool('pin_countweekends', 'Counts calendar days', false), dec('pin_maxconsecutive', 'Max consecutive days', { min: 0, max: 400 }),
      bool('pin_needsapproval', 'Needs approval', true), bool('pin_unlimited', 'No balance check (e.g. LOP)', false), text('pin_color', 'Colour', 9),
      int('pin_sortorder', 'Order'), bool('pin_isactive', 'Active', true),
    ],
  },
  {
    name: 'pin_leavebalance', display: 'Leave balance', plural: 'Leave balances', ownership: 'UserOwned',
    primary: text('pin_name', 'Balance', 200),
    columns: [
      lookup('pin_resource', 'Resource', 'pin_resource', { cascadeDelete: 'Cascade', required: true }), lookup('pin_leavetype', 'Leave type', 'pin_leavetype'),
      int('pin_year', 'Year', { min: 2000, max: 2100 }), dec('pin_entitled', 'Entitled', { min: 0 }), dec('pin_used', 'Used', { min: 0 }),
      dec('pin_pending', 'Pending', { min: 0 }), dec('pin_balance', 'Balance'), text('pin_balancekey', 'Balance key', 100, { required: true }),
    ],
    keys: [{ name: 'pin_leavebalance_key', display: 'Resource + type + year', columns: ['pin_balancekey'] }],
  },
  {
    name: 'pin_leaverequest', display: 'Leave request', plural: 'Leave requests', ownership: 'UserOwned',
    primary: text('pin_name', 'Leave request', 40, { autoNumber: 'LV-{SEQNUM:5}' }),
    columns: [
      lookup('pin_resource', 'Resource', 'pin_resource', { cascadeDelete: 'Cascade', required: true }), lookup('pin_leavetype', 'Leave type', 'pin_leavetype'),
      date('pin_fromdate', 'From'), date('pin_todate', 'To'), bool('pin_halfdaystart', 'Half day (first day)', false), bool('pin_halfdayend', 'Half day (last day)', false),
      dec('pin_days', 'Days', { min: 0 }), memo('pin_reason', 'Reason', 2000),
      choice('pin_status', 'Status', opts('Submitted', 'Approved', 'Rejected', 'Cancelled'), 0),
      lookup('pin_approver', 'Approver', 'pin_resource', { cascadeDelete: 'RemoveLink' }), datetime('pin_decidedon', 'Decided on'), memo('pin_comments', 'Approver comments', 2000),
    ],
  },
  // ----- approvals -----
  {
    name: 'pin_approval', display: 'Approval', plural: 'Approvals', ownership: 'UserOwned',
    primary: text('pin_name', 'Approval', 300),
    columns: [
      choice('pin_type', 'Type', opts('Project', 'Timesheet', 'Closure', 'Invoice', 'Leave'), 0),
      choice('pin_status', 'Status', opts('Pending', 'Approved', 'Rejected', 'Cancelled'), 0),
      lookup('pin_project', 'Project', 'pin_project', { cascadeDelete: 'RemoveLink' }), lookup('pin_timesheet', 'Timesheet', 'pin_timesheet', { cascadeDelete: 'RemoveLink' }),
      lookup('pin_invoice', 'Invoice', 'pin_invoice', { cascadeDelete: 'RemoveLink' }),
      lookup('pin_leaverequest', 'Leave request', 'pin_leaverequest', { cascadeDelete: 'RemoveLink' }),
      lookup('pin_approver', 'Approver', 'pin_resource', { cascadeDelete: 'RemoveLink' }), lookup('pin_requestedby', 'Requested by', 'pin_resource', { cascadeDelete: 'RemoveLink' }),
      text('pin_summary', 'Summary', 400), memo('pin_comments', 'Comments', 2000), datetime('pin_requestedon', 'Requested on'), datetime('pin_decidedon', 'Decided on'),
      choice('pin_decidedvia', 'Decided via', opts('App', 'Teams / Outlook'), 0), text('pin_flowapprovalid', 'Flow approval ID', 100),
    ],
  },
  // ----- billing & revenue -----
  {
    name: 'pin_invoice', display: 'Invoice', plural: 'Invoices', ownership: 'UserOwned',
    primary: text('pin_name', 'Invoice number', 40, { autoNumber: 'PI-{DATETIMEUTC:yyMM}-{SEQNUM:5}' }),
    columns: [
      parent('pin_project', 'Project', 'pin_project'), lookup('pin_client', 'Client', 'pin_client'),
      date('pin_periodfrom', 'Period from'), date('pin_periodto', 'Period to'),
      choice('pin_status', 'Status', opts('Draft', 'Approved', 'Sent', 'Paid', 'Cancelled'), 0),
      money('pin_subtotal', 'Subtotal'), dec('pin_taxrate', 'Tax %', { min: 0, max: 100 }), money('pin_tax', 'Tax'), money('pin_total', 'Total'),
      date('pin_issuedon', 'Issued on'), date('pin_duedate', 'Due date'), date('pin_paidon', 'Paid on'), memo('pin_notes', 'Notes', 2000),
      bool('pin_includetime', 'Include time', true), bool('pin_includemilestones', 'Include milestones', true), bool('pin_includeretainer', 'Include retainer', true),
      int('pin_linecount', 'Lines'), text('pin_builderror', 'Build message', 400),
    ],
  },
  {
    name: 'pin_invoiceline', display: 'Invoice line', plural: 'Invoice lines', ownership: 'UserOwned',
    primary: text('pin_name', 'Line', 300),
    columns: [
      parent('pin_invoice', 'Invoice', 'pin_invoice'), choice('pin_linetype', 'Type', opts('Time', 'Milestone', 'Retainer', 'Adjustment'), 0),
      lookup('pin_role', 'Role', 'pin_role', { cascadeDelete: 'RemoveLink' }), lookup('pin_milestone', 'Milestone', 'pin_milestone', { cascadeDelete: 'RemoveLink' }),
      dec('pin_hours', 'Hours', { min: 0 }), money('pin_rate', 'Rate'), money('pin_amount', 'Amount'), int('pin_sortorder', 'Order'),
    ],
  },
  {
    name: 'pin_revenue', display: 'Revenue entry', plural: 'Revenue entries', ownership: 'UserOwned',
    primary: text('pin_name', 'Revenue', 300),
    columns: [
      parent('pin_project', 'Project', 'pin_project'), date('pin_revenuedate', 'Date'), date('pin_period', 'Period (month)'),
      choice('pin_source', 'Source', opts('Time approved', 'Milestone accepted', 'Retainer month', 'Adjustment'), 0),
      money('pin_amount', 'Recognised amount'), money('pin_cost', 'Cost'), bool('pin_billed', 'Billed', false),
      lookup('pin_timesheet', 'Timesheet', 'pin_timesheet', { cascadeDelete: 'RemoveLink' }), lookup('pin_milestone', 'Milestone', 'pin_milestone', { cascadeDelete: 'RemoveLink' }),
      lookup('pin_invoice', 'Invoice', 'pin_invoice', { cascadeDelete: 'RemoveLink' }),
    ],
  },
  {
    name: 'pin_activity', display: 'Project activity', plural: 'Project activities', ownership: 'UserOwned',
    primary: text('pin_name', 'Activity', 400),
    columns: [
      parent('pin_project', 'Project', 'pin_project'), choice('pin_kind', 'Kind', opts('Status', 'Approval', 'Team', 'Task', 'Time', 'Billing', 'Talent', 'Note'), 7),
      lookup('pin_actor', 'By', 'pin_resource', { cascadeDelete: 'RemoveLink' }), memo('pin_details', 'Details', 4000),
    ],
  },
  // ----- talent (RMG) -----
  {
    name: 'pin_resourcerequest', display: 'Talent request', plural: 'Talent requests', ownership: 'UserOwned',
    primary: text('pin_name', 'Request number', 40, { autoNumber: 'RR-{SEQNUM:5}' }),
    columns: [
      parent('pin_project', 'Project', 'pin_project'), text('pin_title', 'Position title', 200),
      lookup('pin_requestedby', 'Requested by', 'pin_resource', { cascadeDelete: 'RemoveLink' }), lookup('pin_role', 'Role', 'pin_role'),
      memo('pin_skills', 'Required skills', 2000), dec('pin_minexperience', 'Min. experience (years)', { min: 0, max: 60 }),
      dec('pin_allocation', 'Allocation %', { min: 0, max: 100 }), date('pin_startdate', 'Needed from'), date('pin_enddate', 'Needed until'),
      int('pin_headcount', 'Headcount', { min: 1, max: 100 }), choice('pin_priority', 'Priority', PRIORITY, 1), text('pin_location', 'Location', 100),
      memo('pin_justification', 'Justification', 2000),
      choice('pin_status', 'Status', opts('Submitted', 'In review', 'Matched internally', 'Hiring', 'Candidate selected', 'Fulfilled', 'Cancelled'), 0),
      lookup('pin_rmgowner', 'RMG owner', 'pin_resource', { cascadeDelete: 'RemoveLink' }),
      lookup('pin_fulfilledby', 'Fulfilled by', 'pin_resource', { cascadeDelete: 'RemoveLink' }),
      int('pin_onboardingcandidateid', 'Onboarding candidate ID'), text('pin_onboardingurl', 'Onboarding link', 400), text('pin_candidatename', 'Candidate', 150),
      memo('pin_decisionnotes', 'RMG notes', 2000),
    ],
  },
];

// ---------- metadata builders ----------
function attributeBody(c) {
  const base = { SchemaName: c.name, DisplayName: label(c.display), RequiredLevel: { Value: c.required ? 'ApplicationRequired' : 'None', CanBeChanged: true } };
  switch (c.kind) {
    case 'String':
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', ...base, MaxLength: c.max, FormatName: { Value: 'Text' },
        ...(c.autoNumber ? { AutoNumberFormat: c.autoNumber } : {}),
      };
    case 'Memo':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', ...base, MaxLength: c.max, Format: 'TextArea' };
    case 'Decimal':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata', ...base, MinValue: c.min, MaxValue: c.max, Precision: c.precision };
    case 'Money':
      // PrecisionSource 2 = use the record's currency precision
      return { '@odata.type': 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata', ...base, MinValue: -922337203685477, MaxValue: 922337203685477, PrecisionSource: 2 };
    case 'Integer':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata', ...base, MinValue: c.min, MaxValue: c.max, Format: 'None' };
    case 'Boolean':
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata', ...base, DefaultValue: c.dflt,
        OptionSet: { TrueOption: { Value: 1, Label: label('Yes') }, FalseOption: { Value: 0, Label: label('No') } },
      };
    case 'DateTime':
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', ...base, Format: c.format,
        DateTimeBehavior: { Value: c.format === 'DateOnly' ? 'DateOnly' : 'UserLocal' },
      };
    case 'Picklist':
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata', ...base,
        ...(c.dflt !== undefined ? { DefaultFormValue: c.options[c.dflt].value } : {}),
        OptionSet: {
          '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata', IsGlobal: false, OptionSetType: 'Picklist',
          Options: c.options.map((o) => ({ Value: o.value, Label: label(o.label) })),
        },
      };
    default:
      throw new Error(`Unknown kind ${c.kind}`);
  }
}

const exists = async (path) => (await api('GET', path, undefined, { allow404: true })) !== null;

async function createTable(t) {
  if (await exists(`EntityDefinitions(LogicalName='${t.name}')?$select=LogicalName`)) {
    log(`  = table ${t.name} exists`);
    return;
  }
  await api('POST', 'EntityDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: t.name,
    DisplayName: label(t.display),
    DisplayCollectionName: label(t.plural),
    Description: label(`Project Infinity — ${t.display}`),
    OwnershipType: t.ownership,
    IsActivity: false,
    HasActivities: false,
    HasNotes: t.name === 'pin_project',
    ChangeTrackingEnabled: true,
    ...(t.accessTeams ? { AutoCreateAccessTeams: true } : {}),
    PrimaryNameAttribute: t.primary.name,
    Attributes: [{ ...attributeBody(t.primary), IsPrimaryName: true, RequiredLevel: { Value: t.primary.autoNumber ? 'None' : 'ApplicationRequired', CanBeChanged: true } }],
  });
  log(`  + table ${t.name}`);
}

async function createColumn(table, c) {
  if (await exists(`EntityDefinitions(LogicalName='${table}')/Attributes(LogicalName='${c.name}')?$select=LogicalName`)) return false;
  if (c.kind === 'Lookup') {
    const parental = c.cascadeDelete === 'Cascade';
    const cascade = parental ? 'Cascade' : 'NoCascade';
    await api('POST', 'RelationshipDefinitions', {
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      SchemaName: `${table}_${c.name}_${c.target}`.slice(0, 100),
      ReferencedEntity: c.target,
      ReferencingEntity: table,
      CascadeConfiguration: { Assign: cascade, Delete: c.cascadeDelete, Merge: 'NoCascade', Reparent: cascade, Share: cascade, Unshare: cascade },
      Lookup: {
        '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
        SchemaName: c.name,
        DisplayName: label(c.display),
        RequiredLevel: { Value: c.required ? 'ApplicationRequired' : 'None', CanBeChanged: true },
      },
    });
  } else {
    await api('POST', `EntityDefinitions(LogicalName='${table}')/Attributes`, attributeBody(c));
  }
  return true;
}

async function createKey(table, k) {
  if (await exists(`EntityDefinitions(LogicalName='${table}')/Keys(LogicalName='${k.name}')?$select=LogicalName`)) return;
  await api('POST', `EntityDefinitions(LogicalName='${table}')/Keys`, { SchemaName: k.name, DisplayName: label(k.display), KeyAttributes: k.columns });
  log(`  + key ${k.name}`);
}

// ---------- run ----------
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const tables = TABLES.filter((t) => !only || only.includes(t.name));
log(`Project Infinity schema — ${tables.length} tables`);
for (const t of tables) await createTable(t); // pass 1: every lookup target exists before pass 2
for (const t of tables) {
  let added = 0;
  for (const c of t.columns) if (await createColumn(t.name, c)) added++;
  log(`  ~ ${t.name}: ${added} column(s) added`);
}
for (const t of tables) for (const k of t.keys ?? []) await createKey(t.name, k);
await publishAll();
log('done');
