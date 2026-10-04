// Project Infinity data access. Pages never touch generated services directly: everything goes through these
// mappers so Dataverse naming (pin_*, option values, lookups, currencies) stays in one place.
// Business rules are enforced server-side by the ProjectInfinity plug-ins; errors surface as friendly messages.
import { getContext } from '@microsoft/power-apps/app';
import { Pin_clientsService } from '../generated/services/Pin_clientsService';
import { Pin_rolesService } from '../generated/services/Pin_rolesService';
import { Pin_resourcesService } from '../generated/services/Pin_resourcesService';
import { Pin_projectsService } from '../generated/services/Pin_projectsService';
import { Pin_projectratesService } from '../generated/services/Pin_projectratesService';
import { Pin_membersService } from '../generated/services/Pin_membersService';
import { Pin_milestonesService } from '../generated/services/Pin_milestonesService';
import { Pin_tasksService } from '../generated/services/Pin_tasksService';
import { Pin_timesheetsService } from '../generated/services/Pin_timesheetsService';
import { Pin_timeentriesService } from '../generated/services/Pin_timeentriesService';
import { Pin_approvalsService } from '../generated/services/Pin_approvalsService';
import { Pin_invoicesService } from '../generated/services/Pin_invoicesService';
import { Pin_invoicelinesService } from '../generated/services/Pin_invoicelinesService';
import { Pin_revenuesService } from '../generated/services/Pin_revenuesService';
import { Pin_activitiesService } from '../generated/services/Pin_activitiesService';
import { Pin_resourcerequestsService } from '../generated/services/Pin_resourcerequestsService';
import { Pin_holidaiesService } from '../generated/services/Pin_holidaiesService';
import { Pin_leavetypesService } from '../generated/services/Pin_leavetypesService';
import { Pin_leavebalancesService } from '../generated/services/Pin_leavebalancesService';
import { Pin_leaverequestsService } from '../generated/services/Pin_leaverequestsService';
import { TransactioncurrenciesService } from '../generated/services/TransactioncurrenciesService';

// ---------- option sets (prefix 54320 → 543200000 + index) ----------
const B = 543200000;
const opt = (i: number) => B + i;
const pick = <T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] =>
  typeof v === 'number' && v >= B ? (list[v - B] ?? fallback) : fallback;
const index = <T extends readonly string[]>(list: T, v: T[number]) => opt(list.indexOf(v));

export const PROJECT_STATUS = ['Draft', 'Pending approval', 'Approved', 'Rejected', 'Active', 'On hold', 'Closing', 'Closed', 'Cancelled'] as const;
export const BILLING = ['Time & materials', 'Fixed price', 'Retainer', 'Non-billable'] as const;
export const PRIORITY = ['Low', 'Medium', 'High', 'Critical'] as const;
export const HEALTH = ['On track', 'At risk', 'Off track'] as const;
export const ACCESS = ['Project Manager', 'Contributor', 'Viewer'] as const;
export const MILESTONE_STATUS = ['Planned', 'In progress', 'Completed', 'Accepted', 'Invoiced'] as const;
export const TASK_STATUS = ['Backlog', 'To do', 'In progress', 'In review', 'Blocked', 'Done'] as const;
export const SHEET_STATUS = ['Draft', 'Submitted', 'Approved', 'Rejected'] as const;
export const ENTRY_TYPE = ['Work', 'Leave', 'Holiday'] as const;
export const APPROVAL_TYPE = ['Project', 'Timesheet', 'Closure', 'Invoice', 'Leave'] as const;
export const APPROVAL_STATUS = ['Pending', 'Approved', 'Rejected', 'Cancelled'] as const;
export const INVOICE_STATUS = ['Draft', 'Approved', 'Sent', 'Paid', 'Cancelled'] as const;
export const LINE_TYPE = ['Time', 'Milestone', 'Retainer', 'Adjustment'] as const;
export const REVENUE_SOURCE = ['Time approved', 'Milestone accepted', 'Retainer month', 'Adjustment'] as const;
export const ACTIVITY_KIND = ['Status', 'Approval', 'Team', 'Task', 'Time', 'Billing', 'Talent', 'Note'] as const;
export const REQUEST_STATUS = ['Submitted', 'In review', 'Matched internally', 'Hiring', 'Candidate selected', 'Fulfilled', 'Cancelled'] as const;
export const LEAVE_STATUS = ['Submitted', 'Approved', 'Rejected', 'Cancelled'] as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[number];
export type BillingModel = (typeof BILLING)[number];
export type Priority = (typeof PRIORITY)[number];
export type Health = (typeof HEALTH)[number];
export type AccessLevel = (typeof ACCESS)[number];
export type TaskStatus = (typeof TASK_STATUS)[number];
export type SheetStatus = (typeof SHEET_STATUS)[number];
export type EntryType = (typeof ENTRY_TYPE)[number];
export type ApprovalType = (typeof APPROVAL_TYPE)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUS)[number];
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];
export type RequestStatus = (typeof REQUEST_STATUS)[number];
export type MilestoneStatus = (typeof MILESTONE_STATUS)[number];
export type LeaveStatus = (typeof LEAVE_STATUS)[number];

// ---------- helpers ----------
type Res<T> = { success: boolean; data: T; error?: { message?: string } };
/** Plug-in messages arrive wrapped ("OrganizationServiceFault: …"); keep only the human part. */
export function cleanError(message?: string): string {
  return (message ?? 'Request failed').replace(/^.*?(OrganizationServiceFault|InvalidPluginExecutionException)[:\s]*/i, '').replace(/^Exception[:\s]*/i, '').trim();
}
function must<T>(r: Res<T>, what: string): T {
  if (!r.success) throw new Error(cleanError(r.error?.message) || `${what} failed`);
  return r.data;
}
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const bind = (set: string, id?: string | null) => (id ? `/${set}(${id})` : undefined);
type Row = Record<string, unknown>;
const rows = <T>(r: Res<T[]>, what: string) => must(r, what) as unknown as Row[];

// ---------- types ----------
export interface Currency { id: string; code: string; symbol: string; rate: number }
export interface Client { id: string; name: string; legalName: string; currencyId: string; taxRate: number; termsDays: number; billingEmail: string; contact: string; industry: string; gstin: string; color: string }
export interface Role { id: string; name: string; billRate: number; costRate: number; color: string }
export interface Resource {
  id: string; name: string; email: string; userId?: string; roleId?: string; managerId?: string; designation: string; capacity: number; skills: string[];
  experience: number; location: string; source: string; color: string; active: boolean; capabilities: string[];
}
export interface Project {
  id: string; code: string; name: string; clientId?: string; description: string; billing: BillingModel; status: ProjectStatus; sponsorId?: string; pmId?: string;
  start?: string; end?: string; budgetHours: number; budgetAmount: number; retainerFee: number; priority: Priority; health: Health; percent: number;
  actualHours: number; actualCost: number; recognised: number; billed: number; currencyId?: string; color: string; tags: string[];
  submittedOn?: string; approvedOn?: string; approvalComments: string; closedOn?: string; closureNotes: string; lessons: string; closureOverride: string; createdOn?: string;
}
export interface Member { id: string; projectId: string; resourceId: string; roleId?: string; access: AccessLevel; allocation: number; from?: string; to?: string; billRate: number; active: boolean; reason: string }
export interface Milestone { id: string; projectId: string; name: string; due?: string; amount: number; status: MilestoneStatus; acceptedOn?: string; order: number }
export interface Task {
  id: string; projectId: string; milestoneId?: string; parentId?: string; title: string; description: string; assigneeId?: string; status: TaskStatus; priority: Priority;
  estimate: number; actual: number; percent: number; start?: string; due?: string; completedOn?: string; order: number; tags: string[];
}
export interface Timesheet { id: string; number: string; resourceId: string; weekStart: string; status: SheetStatus; total: number; billable: number; approverId?: string; submittedOn?: string; decidedOn?: string; comments: string }
export interface TimeEntry {
  id: string; timesheetId: string; projectId?: string; taskId?: string; resourceId?: string; date: string; hours: number; billable: boolean; notes: string; type: EntryType;
  status: SheetStatus; roleId?: string; billRate: number; amount: number; cost: number; invoiceLineId?: string; leaveTypeId?: string; currencyId?: string;
}
export interface Approval {
  id: string; title: string; type: ApprovalType; status: ApprovalStatus; projectId?: string; timesheetId?: string; invoiceId?: string; leaveId?: string;
  approverId?: string; requestedById?: string; summary: string; comments: string; requestedOn?: string; decidedOn?: string; via: string;
}
export interface Invoice {
  id: string; number: string; projectId: string; clientId?: string; from?: string; to?: string; status: InvoiceStatus; subtotal: number; taxRate: number; tax: number;
  total: number; issuedOn?: string; dueOn?: string; paidOn?: string; notes: string; currencyId?: string; lines: number; createdOn?: string;
}
export interface InvoiceLine { id: string; invoiceId: string; name: string; type: string; roleId?: string; hours: number; rate: number; amount: number; order: number }
export interface Revenue { id: string; projectId: string; date?: string; period?: string; source: string; amount: number; amountBase: number; cost: number; billed: boolean }
export interface ActivityItem { id: string; projectId: string; text: string; kind: string; actorId?: string; details: string; on: string }
export interface TalentRequest {
  id: string; number: string; projectId: string; title: string; requestedById?: string; roleId?: string; skills: string[]; minExperience: number; allocation: number;
  start?: string; end?: string; headcount: number; priority: Priority; location: string; justification: string; status: RequestStatus; rmgOwnerId?: string;
  fulfilledById?: string; candidateId?: number; onboardingUrl: string; candidateName: string; notes: string; createdOn?: string;
}
export interface Holiday { id: string; name: string; date: string; type: string; location: string }
export interface LeaveType { id: string; name: string; code: string; quota: number; paid: boolean; calendarDays: boolean; maxConsecutive: number; unlimited: boolean; color: string }
export interface LeaveBalance { id: string; resourceId: string; typeId: string; year: number; entitled: number; used: number; pending: number; balance: number }
export interface LeaveRequest {
  id: string; number: string; resourceId: string; typeId: string; from: string; to: string; halfStart: boolean; halfEnd: boolean; days: number; reason: string;
  status: LeaveStatus; approverId?: string; decidedOn?: string; comments: string; createdOn?: string;
}
export interface Me { userId: string; name: string; email: string }

const tags = (s: unknown) => str(s).split(',').map((t) => t.trim()).filter(Boolean);
const dateOnly = (v: unknown) => (str(v) ? str(v).slice(0, 10) : undefined);

// ---------- me ----------
let meCache: Promise<Me> | null = null;
export function getMe(): Promise<Me> {
  meCache ??= getContext()
    .then((c) => ({ userId: c.user.systemUserId ?? '', name: c.user.fullName ?? c.user.userPrincipalName ?? 'You', email: (c.user.userPrincipalName ?? '').toLowerCase() }))
    .catch(() => ({ userId: '', name: 'You', email: '' }));
  return meCache;
}

// ---------- reference data ----------
export async function loadCurrencies(): Promise<Currency[]> {
  return rows(await TransactioncurrenciesService.getAll({ select: ['transactioncurrencyid', 'isocurrencycode', 'currencysymbol', 'exchangerate'] }), 'Currencies').map((r) => ({
    id: str(r.transactioncurrencyid), code: str(r.isocurrencycode), symbol: str(r.currencysymbol), rate: num(r.exchangerate) || 1,
  }));
}

export async function loadClients(): Promise<Client[]> {
  return rows(await Pin_clientsService.getAll({ orderBy: ['pin_name asc'] }), 'Clients').map((r) => ({
    id: str(r.pin_clientid), name: str(r.pin_name), legalName: str(r.pin_legalname), currencyId: str(r._transactioncurrencyid_value), taxRate: num(r.pin_taxrate),
    termsDays: num(r.pin_paymenttermsdays), billingEmail: str(r.pin_billingemail), contact: str(r.pin_contactname), industry: str(r.pin_industry), gstin: str(r.pin_gstin), color: str(r.pin_color) || '#7c3aed',
  }));
}

export async function loadRoles(): Promise<Role[]> {
  return rows(await Pin_rolesService.getAll({ orderBy: ['pin_sortorder asc'] }), 'Roles').map((r) => ({
    id: str(r.pin_roleid), name: str(r.pin_name), billRate: num(r.pin_billrate), costRate: num(r.pin_costrate), color: str(r.pin_color) || '#7c3aed',
  }));
}

export async function loadResources(): Promise<Resource[]> {
  return rows(await Pin_resourcesService.getAll({ orderBy: ['pin_name asc'] }), 'People').map((r) => ({
    id: str(r.pin_resourceid), name: str(r.pin_name), email: str(r.pin_email).toLowerCase(), userId: str(r._pin_systemuser_value) || undefined, roleId: str(r._pin_defaultrole_value) || undefined,
    managerId: str(r._pin_manager_value) || undefined, designation: str(r.pin_designation), capacity: num(r.pin_weeklycapacity) || 40, skills: tags(r.pin_skills),
    experience: num(r.pin_experienceyears), location: str(r.pin_location), source: pick(['Internal', 'New hire', 'Contractor'] as const, r.pin_source, 'Internal'),
    color: str(r.pin_avatarcolor) || '#7c3aed', active: r.pin_isactive !== false, capabilities: tags(r.pin_capabilities).map((c) => c.toUpperCase()),
  }));
}

export async function loadHolidays(): Promise<Holiday[]> {
  return rows(await Pin_holidaiesService.getAll({ orderBy: ['pin_date asc'] }), 'Holidays').map((r) => ({
    id: str(r.pin_holidayid), name: str(r.pin_name), date: dateOnly(r.pin_date) ?? '', type: pick(['Public holiday', 'Company holiday', 'Optional holiday'] as const, r.pin_type, 'Public holiday'), location: str(r.pin_location),
  }));
}

export async function loadLeaveTypes(): Promise<LeaveType[]> {
  return rows(await Pin_leavetypesService.getAll({ filter: 'pin_isactive eq true', orderBy: ['pin_sortorder asc'] }), 'Leave types').map((r) => ({
    id: str(r.pin_leavetypeid), name: str(r.pin_name), code: str(r.pin_code), quota: num(r.pin_annualquota), paid: r.pin_paid !== false, calendarDays: !!r.pin_countweekends,
    maxConsecutive: num(r.pin_maxconsecutive), unlimited: !!r.pin_unlimited, color: str(r.pin_color) || '#7c3aed',
  }));
}

// ---------- projects ----------
const mapProject = (r: Row): Project => ({
  id: str(r.pin_projectid), code: str(r.pin_code), name: str(r.pin_name), clientId: str(r._pin_client_value) || undefined, description: str(r.pin_description),
  billing: pick(BILLING, r.pin_billingmodel, 'Time & materials'), status: pick(PROJECT_STATUS, r.pin_status, 'Draft'), sponsorId: str(r._pin_sponsor_value) || undefined,
  pmId: str(r._pin_projectmanager_value) || undefined, start: dateOnly(r.pin_startdate), end: dateOnly(r.pin_enddate), budgetHours: num(r.pin_budgethours),
  budgetAmount: num(r.pin_budgetamount), retainerFee: num(r.pin_retainerfee), priority: pick(PRIORITY, r.pin_priority, 'Medium'), health: pick(HEALTH, r.pin_health, 'On track'),
  percent: num(r.pin_percentcomplete), actualHours: num(r.pin_actualhours), actualCost: num(r.pin_actualcost), recognised: num(r.pin_recognisedrevenue), billed: num(r.pin_billedamount),
  currencyId: str(r._transactioncurrencyid_value) || undefined, color: str(r.pin_color) || '#7c3aed', tags: tags(r.pin_tags), submittedOn: str(r.pin_submittedon) || undefined,
  approvedOn: str(r.pin_approvedon) || undefined, approvalComments: str(r.pin_approvalcomments), closedOn: str(r.pin_closedon) || undefined, closureNotes: str(r.pin_closurenotes),
  lessons: str(r.pin_lessonslearned), closureOverride: str(r.pin_closureoverride), createdOn: str(r.createdon) || undefined,
});

export async function loadProjects(): Promise<Project[]> {
  return rows(await Pin_projectsService.getAll({ orderBy: ['modifiedon desc'] }), 'Projects').map(mapProject);
}

export interface ProjectInput {
  name: string; clientId: string; description: string; billing: BillingModel; sponsorId?: string; pmId?: string; start?: string; end?: string; budgetHours: number;
  budgetAmount: number; retainerFee: number; priority: Priority; health?: Health; color: string; tags: string;
}

function projectRecord(p: Partial<ProjectInput>): Row {
  const rec: Row = {};
  if (p.name !== undefined) rec.pin_name = p.name;
  if (p.description !== undefined) rec.pin_description = p.description;
  if (p.billing) rec.pin_billingmodel = index(BILLING, p.billing);
  if (p.priority) rec.pin_priority = index(PRIORITY, p.priority);
  if (p.health) rec.pin_health = index(HEALTH, p.health);
  if (p.start !== undefined) rec.pin_startdate = p.start || null;
  if (p.end !== undefined) rec.pin_enddate = p.end || null;
  if (p.budgetHours !== undefined) rec.pin_budgethours = p.budgetHours;
  if (p.budgetAmount !== undefined) rec.pin_budgetamount = p.budgetAmount;
  if (p.retainerFee !== undefined) rec.pin_retainerfee = p.retainerFee;
  if (p.color !== undefined) rec.pin_color = p.color;
  if (p.tags !== undefined) rec.pin_tags = p.tags;
  if (p.clientId) rec['pin_client@odata.bind'] = bind('pin_clients', p.clientId);
  if (p.sponsorId) rec['pin_sponsor@odata.bind'] = bind('pin_resources', p.sponsorId);
  if (p.pmId) rec['pin_projectmanager@odata.bind'] = bind('pin_resources', p.pmId);
  return rec;
}

export async function createProject(p: ProjectInput, currencyId?: string): Promise<Project> {
  const rec = projectRecord(p);
  if (currencyId) rec['transactioncurrencyid@odata.bind'] = `/transactioncurrencies(${currencyId})`;
  const r = must(await Pin_projectsService.create(rec as never), 'Create project') as unknown as Row;
  return getProject(str(r.pin_projectid));
}

export async function getProject(id: string): Promise<Project> {
  return mapProject(must(await Pin_projectsService.get(id), 'Project') as unknown as Row);
}

export async function updateProject(id: string, p: Partial<ProjectInput>): Promise<void> {
  must(await Pin_projectsService.update(id, projectRecord(p) as never), 'Update project');
}

export async function setProjectStatus(id: string, status: ProjectStatus, extra: Row = {}): Promise<void> {
  must(await Pin_projectsService.update(id, { pin_status: index(PROJECT_STATUS, status), ...extra } as never), `Move project to ${status}`);
}

export async function saveClosure(id: string, c: { notes: string; lessons: string; override: string }): Promise<void> {
  must(await Pin_projectsService.update(id, { pin_closurenotes: c.notes, pin_lessonslearned: c.lessons, pin_closureoverride: c.override || null } as never), 'Save closure');
}

// ---------- project detail ----------
const mapMember = (r: Row): Member => ({
  id: str(r.pin_memberid), projectId: str(r._pin_project_value), resourceId: str(r._pin_resource_value), roleId: str(r._pin_role_value) || undefined,
  access: pick(ACCESS, r.pin_accesslevel, 'Contributor'), allocation: num(r.pin_allocation), from: dateOnly(r.pin_effectivefrom), to: dateOnly(r.pin_effectiveto),
  billRate: num(r.pin_billrate), active: r.pin_isactive !== false, reason: str(r.pin_changereason),
});
const mapTask = (r: Row): Task => ({
  id: str(r.pin_taskid), projectId: str(r._pin_project_value), milestoneId: str(r._pin_milestone_value) || undefined, parentId: str(r._pin_parenttask_value) || undefined,
  title: str(r.pin_name), description: str(r.pin_description), assigneeId: str(r._pin_assignee_value) || undefined, status: pick(TASK_STATUS, r.pin_status, 'To do'),
  priority: pick(PRIORITY, r.pin_priority, 'Medium'), estimate: num(r.pin_estimatehours), actual: num(r.pin_actualhours), percent: num(r.pin_percentcomplete),
  start: dateOnly(r.pin_startdate), due: dateOnly(r.pin_duedate), completedOn: str(r.pin_completedon) || undefined, order: num(r.pin_boardorder), tags: tags(r.pin_tags),
});
const mapMilestone = (r: Row): Milestone => ({
  id: str(r.pin_milestoneid), projectId: str(r._pin_project_value), name: str(r.pin_name), due: dateOnly(r.pin_duedate), amount: num(r.pin_amount),
  status: pick(MILESTONE_STATUS, r.pin_status, 'Planned'), acceptedOn: dateOnly(r.pin_acceptedon), order: num(r.pin_sortorder),
});
const mapInvoice = (r: Row): Invoice => ({
  id: str(r.pin_invoiceid), number: str(r.pin_name), projectId: str(r._pin_project_value), clientId: str(r._pin_client_value) || undefined, from: dateOnly(r.pin_periodfrom),
  to: dateOnly(r.pin_periodto), status: pick(INVOICE_STATUS, r.pin_status, 'Draft'), subtotal: num(r.pin_subtotal), taxRate: num(r.pin_taxrate), tax: num(r.pin_tax),
  total: num(r.pin_total), issuedOn: dateOnly(r.pin_issuedon), dueOn: dateOnly(r.pin_duedate), paidOn: dateOnly(r.pin_paidon), notes: str(r.pin_notes),
  currencyId: str(r._transactioncurrencyid_value) || undefined, lines: num(r.pin_linecount), createdOn: str(r.createdon) || undefined,
});
const mapRequest = (r: Row): TalentRequest => ({
  id: str(r.pin_resourcerequestid), number: str(r.pin_name), projectId: str(r._pin_project_value), title: str(r.pin_title), requestedById: str(r._pin_requestedby_value) || undefined,
  roleId: str(r._pin_role_value) || undefined, skills: tags(r.pin_skills), minExperience: num(r.pin_minexperience), allocation: num(r.pin_allocation), start: dateOnly(r.pin_startdate),
  end: dateOnly(r.pin_enddate), headcount: num(r.pin_headcount) || 1, priority: pick(PRIORITY, r.pin_priority, 'Medium'), location: str(r.pin_location), justification: str(r.pin_justification),
  status: pick(REQUEST_STATUS, r.pin_status, 'Submitted'), rmgOwnerId: str(r._pin_rmgowner_value) || undefined, fulfilledById: str(r._pin_fulfilledby_value) || undefined,
  candidateId: num(r.pin_onboardingcandidateid) || undefined, onboardingUrl: str(r.pin_onboardingurl), candidateName: str(r.pin_candidatename), notes: str(r.pin_decisionnotes),
  createdOn: str(r.createdon) || undefined,
});

export async function loadMembers(projectId?: string): Promise<Member[]> {
  return rows(await Pin_membersService.getAll({ filter: projectId ? `_pin_project_value eq ${projectId}` : undefined, orderBy: ['pin_effectivefrom asc'] }), 'Team').map(mapMember);
}
export async function loadTasks(projectId?: string, assigneeId?: string): Promise<Task[]> {
  const f = [projectId && `_pin_project_value eq ${projectId}`, assigneeId && `_pin_assignee_value eq ${assigneeId}`].filter(Boolean).join(' and ');
  return rows(await Pin_tasksService.getAll({ filter: f || undefined, orderBy: ['pin_boardorder asc'] }), 'Tasks').map(mapTask);
}
export async function loadMilestones(projectId?: string): Promise<Milestone[]> {
  return rows(await Pin_milestonesService.getAll({ filter: projectId ? `_pin_project_value eq ${projectId}` : undefined, orderBy: ['pin_duedate asc'] }), 'Milestones').map(mapMilestone);
}
export async function loadActivity(projectId: string): Promise<ActivityItem[]> {
  return rows(await Pin_activitiesService.getAll({ filter: `_pin_project_value eq ${projectId}`, orderBy: ['createdon desc'], top: 200 }), 'Activity').map((r) => ({
    id: str(r.pin_activityid), projectId, text: str(r.pin_name), kind: pick(ACTIVITY_KIND, r.pin_kind, 'Note'), actorId: str(r._pin_actor_value) || undefined,
    details: str(r.pin_details), on: str(r.createdon),
  }));
}
export async function loadInvoices(projectId?: string): Promise<Invoice[]> {
  return rows(await Pin_invoicesService.getAll({ filter: projectId ? `_pin_project_value eq ${projectId}` : undefined, orderBy: ['createdon desc'] }), 'Invoices').map(mapInvoice);
}
export async function loadInvoiceLines(invoiceId: string): Promise<InvoiceLine[]> {
  return rows(await Pin_invoicelinesService.getAll({ filter: `_pin_invoice_value eq ${invoiceId}`, orderBy: ['pin_sortorder asc'] }), 'Invoice lines').map((r) => ({
    id: str(r.pin_invoicelineid), invoiceId, name: str(r.pin_name), type: pick(LINE_TYPE, r.pin_linetype, 'Time'), roleId: str(r._pin_role_value) || undefined,
    hours: num(r.pin_hours), rate: num(r.pin_rate), amount: num(r.pin_amount), order: num(r.pin_sortorder),
  }));
}
export async function loadRevenue(projectId?: string): Promise<Revenue[]> {
  return rows(await Pin_revenuesService.getAll({ filter: projectId ? `_pin_project_value eq ${projectId}` : undefined, orderBy: ['pin_revenuedate asc'] }), 'Revenue').map((r) => ({
    id: str(r.pin_revenueid), projectId: str(r._pin_project_value), date: dateOnly(r.pin_revenuedate), period: dateOnly(r.pin_period), source: pick(REVENUE_SOURCE, r.pin_source, 'Time approved'),
    amount: num(r.pin_amount), amountBase: num(r.pin_amount_base) || num(r.pin_amount), cost: num(r.pin_cost), billed: !!r.pin_billed,
  }));
}
export async function loadRequests(projectId?: string): Promise<TalentRequest[]> {
  return rows(await Pin_resourcerequestsService.getAll({ filter: projectId ? `_pin_project_value eq ${projectId}` : undefined, orderBy: ['createdon desc'] }), 'Talent requests').map(mapRequest);
}
export async function loadProjectRates(projectId: string): Promise<{ id: string; roleId: string; billRate: number; costRate: number }[]> {
  return rows(await Pin_projectratesService.getAll({ filter: `_pin_project_value eq ${projectId}` }), 'Rates').map((r) => ({
    id: str(r.pin_projectrateid), roleId: str(r._pin_role_value), billRate: num(r.pin_billrate), costRate: num(r.pin_costrate),
  }));
}

// ---------- team ----------
export interface MemberInput { projectId: string; resourceId: string; roleId: string; access: AccessLevel; allocation: number; from: string; to?: string; billRate?: number; reason?: string; name: string }
export async function addMember(m: MemberInput): Promise<void> {
  must(await Pin_membersService.create({
    pin_name: m.name, pin_accesslevel: index(ACCESS, m.access), pin_allocation: m.allocation, pin_effectivefrom: m.from, pin_effectiveto: m.to || null,
    pin_billrate: m.billRate || null, pin_isactive: true, pin_changereason: m.reason || null,
    'pin_project@odata.bind': bind('pin_projects', m.projectId), 'pin_resource@odata.bind': bind('pin_resources', m.resourceId), 'pin_role@odata.bind': bind('pin_roles', m.roleId),
  } as never), 'Add team member');
}
export async function updateMember(id: string, f: { access?: AccessLevel; allocation?: number; to?: string | null; active?: boolean }): Promise<void> {
  const rec: Row = {};
  if (f.access) rec.pin_accesslevel = index(ACCESS, f.access);
  if (f.allocation !== undefined) rec.pin_allocation = f.allocation;
  if (f.to !== undefined) rec.pin_effectiveto = f.to;
  if (f.active !== undefined) rec.pin_isactive = f.active;
  must(await Pin_membersService.update(id, rec as never), 'Update assignment');
}
/** Effective-dated role change: end the current assignment the day before, start a new one on the change date. */
export async function changeRole(member: Member, newRoleId: string, effective: string, reason: string, name: string): Promise<void> {
  const dayBefore = new Date(new Date(`${effective}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  await updateMember(member.id, { to: dayBefore });
  await addMember({ projectId: member.projectId, resourceId: member.resourceId, roleId: newRoleId, access: member.access, allocation: member.allocation, from: effective, to: member.to, reason, name });
}
export async function setProjectRate(projectId: string, roleId: string, billRate: number, costRate: number, existingId?: string, name = 'Rate'): Promise<void> {
  if (existingId) must(await Pin_projectratesService.update(existingId, { pin_billrate: billRate, pin_costrate: costRate } as never), 'Update rate');
  else must(await Pin_projectratesService.create({ pin_name: name, pin_billrate: billRate, pin_costrate: costRate, 'pin_project@odata.bind': bind('pin_projects', projectId), 'pin_role@odata.bind': bind('pin_roles', roleId) } as never), 'Add rate');
}

// ---------- tasks & milestones ----------
export interface TaskInput { projectId: string; title: string; description?: string; assigneeId?: string; status?: TaskStatus; priority?: Priority; estimate?: number; start?: string; due?: string; milestoneId?: string; order?: number }
export async function createTask(t: TaskInput): Promise<Task> {
  const r = must(await Pin_tasksService.create({
    pin_name: t.title, pin_description: t.description ?? '', pin_status: index(TASK_STATUS, t.status ?? 'To do'), pin_priority: index(PRIORITY, t.priority ?? 'Medium'),
    pin_estimatehours: t.estimate ?? 0, pin_startdate: t.start || null, pin_duedate: t.due || null, pin_boardorder: t.order ?? Date.now() / 1e10,
    'pin_project@odata.bind': bind('pin_projects', t.projectId), 'pin_assignee@odata.bind': bind('pin_resources', t.assigneeId), 'pin_milestone@odata.bind': bind('pin_milestones', t.milestoneId),
  } as never), 'Create task') as unknown as Row;
  return mapTask(r);
}
export async function updateTask(id: string, f: Partial<TaskInput> & { percent?: number }): Promise<void> {
  const rec: Row = {};
  if (f.title !== undefined) rec.pin_name = f.title;
  if (f.description !== undefined) rec.pin_description = f.description;
  if (f.status) rec.pin_status = index(TASK_STATUS, f.status);
  if (f.priority) rec.pin_priority = index(PRIORITY, f.priority);
  if (f.estimate !== undefined) rec.pin_estimatehours = f.estimate;
  if (f.percent !== undefined) rec.pin_percentcomplete = f.percent;
  if (f.start !== undefined) rec.pin_startdate = f.start || null;
  if (f.due !== undefined) rec.pin_duedate = f.due || null;
  if (f.order !== undefined) rec.pin_boardorder = f.order;
  if (f.assigneeId !== undefined) rec['pin_assignee@odata.bind'] = f.assigneeId ? bind('pin_resources', f.assigneeId) : null;
  must(await Pin_tasksService.update(id, rec as never), 'Update task');
}
export async function createMilestone(projectId: string, m: { name: string; due?: string; amount: number; order: number }): Promise<void> {
  must(await Pin_milestonesService.create({ pin_name: m.name, pin_duedate: m.due || null, pin_amount: m.amount, pin_sortorder: m.order, pin_status: index(MILESTONE_STATUS, 'Planned'), 'pin_project@odata.bind': bind('pin_projects', projectId) } as never), 'Add milestone');
}
export async function setMilestoneStatus(id: string, status: MilestoneStatus): Promise<void> {
  must(await Pin_milestonesService.update(id, { pin_status: index(MILESTONE_STATUS, status) } as never), 'Update milestone');
}

// ---------- timesheets ----------
const mapSheet = (r: Row): Timesheet => ({
  id: str(r.pin_timesheetid), number: str(r.pin_name), resourceId: str(r._pin_resource_value), weekStart: dateOnly(r.pin_weekstart) ?? '', status: pick(SHEET_STATUS, r.pin_status, 'Draft'),
  total: num(r.pin_totalhours), billable: num(r.pin_billablehours), approverId: str(r._pin_approver_value) || undefined, submittedOn: str(r.pin_submittedon) || undefined,
  decidedOn: str(r.pin_decidedon) || undefined, comments: str(r.pin_comments),
});
const mapEntry = (r: Row): TimeEntry => ({
  id: str(r.pin_timeentryid), timesheetId: str(r._pin_timesheet_value), projectId: str(r._pin_project_value) || undefined, taskId: str(r._pin_task_value) || undefined,
  resourceId: str(r._pin_resource_value) || undefined, date: dateOnly(r.pin_workdate) ?? '', hours: num(r.pin_hours), billable: !!r.pin_billable, notes: str(r.pin_notes),
  type: pick(ENTRY_TYPE, r.pin_entrytype, 'Work'), status: pick(SHEET_STATUS, r.pin_status, 'Draft'), roleId: str(r._pin_role_value) || undefined, billRate: num(r.pin_billrate),
  amount: num(r.pin_amount), cost: num(r.pin_costamount), invoiceLineId: str(r._pin_invoiceline_value) || undefined, leaveTypeId: str(r._pin_leavetype_value) || undefined,
  currencyId: str(r._transactioncurrencyid_value) || undefined,
});

export async function loadTimesheets(resourceId?: string): Promise<Timesheet[]> {
  return rows(await Pin_timesheetsService.getAll({ filter: resourceId ? `_pin_resource_value eq ${resourceId}` : undefined, orderBy: ['pin_weekstart desc'] }), 'Timesheets').map(mapSheet);
}
export async function getTimesheet(id: string): Promise<Timesheet> {
  return mapSheet(must(await Pin_timesheetsService.get(id), 'Timesheet') as unknown as Row);
}
/** Finds the week's sheet or creates it (the server pre-fills holidays and approved leave). */
export async function openWeek(resourceId: string, weekStart: string): Promise<Timesheet> {
  const found = rows(await Pin_timesheetsService.getAll({ filter: `_pin_resource_value eq ${resourceId} and pin_weekstart eq ${weekStart}` }), 'Timesheet');
  if (found.length) return mapSheet(found[0]!);
  const r = must(await Pin_timesheetsService.create({ pin_weekstart: weekStart, pin_weekkey: `${resourceId.replace(/-/g, '')}|${weekStart}`, 'pin_resource@odata.bind': bind('pin_resources', resourceId) } as never), 'Create timesheet') as unknown as Row;
  return getTimesheet(str(r.pin_timesheetid));
}
export async function loadEntries(filter: { timesheetId?: string; projectId?: string; since?: string }): Promise<TimeEntry[]> {
  const f = [filter.timesheetId && `_pin_timesheet_value eq ${filter.timesheetId}`, filter.projectId && `_pin_project_value eq ${filter.projectId}`, filter.since && `pin_workdate ge ${filter.since}`]
    .filter(Boolean).join(' and ');
  return rows(await Pin_timeentriesService.getAll({ filter: f || undefined, orderBy: ['pin_workdate asc'], maxPageSize: 5000 }), 'Time entries').map(mapEntry);
}
export async function saveEntry(e: { id?: string; timesheetId: string; projectId: string; taskId?: string; date: string; hours: number; billable: boolean; notes?: string; name: string }): Promise<string> {
  if (e.id) {
    if (e.hours <= 0) {
      await Pin_timeentriesService.delete(e.id);
      return '';
    }
    must(await Pin_timeentriesService.update(e.id, { pin_hours: e.hours, pin_billable: e.billable, pin_notes: e.notes ?? '' } as never), 'Save hours');
    return e.id;
  }
  if (e.hours <= 0) return '';
  const r = must(await Pin_timeentriesService.create({
    pin_name: e.name, pin_workdate: e.date, pin_hours: e.hours, pin_billable: e.billable, pin_notes: e.notes ?? '',
    'pin_timesheet@odata.bind': bind('pin_timesheets', e.timesheetId), 'pin_project@odata.bind': bind('pin_projects', e.projectId), 'pin_task@odata.bind': bind('pin_tasks', e.taskId),
  } as never), 'Save hours') as unknown as Row;
  return str(r.pin_timeentryid);
}
export async function setSheetStatus(id: string, status: 'Submitted' | 'Draft'): Promise<void> {
  must(await Pin_timesheetsService.update(id, { pin_status: index(SHEET_STATUS, status) } as never), status === 'Submitted' ? 'Submit timesheet' : 'Recall timesheet');
}

// ---------- approvals ----------
const mapApproval = (r: Row): Approval => ({
  id: str(r.pin_approvalid), title: str(r.pin_name), type: pick(APPROVAL_TYPE, r.pin_type, 'Project'), status: pick(APPROVAL_STATUS, r.pin_status, 'Pending'),
  projectId: str(r._pin_project_value) || undefined, timesheetId: str(r._pin_timesheet_value) || undefined, invoiceId: str(r._pin_invoice_value) || undefined,
  leaveId: str(r._pin_leaverequest_value) || undefined, approverId: str(r._pin_approver_value) || undefined, requestedById: str(r._pin_requestedby_value) || undefined,
  summary: str(r.pin_summary), comments: str(r.pin_comments), requestedOn: str(r.pin_requestedon) || undefined, decidedOn: str(r.pin_decidedon) || undefined,
  via: pick(['App', 'Teams / Outlook'] as const, r.pin_decidedvia, 'App'),
});
export async function loadApprovals(f: { approverId?: string; status?: ApprovalStatus }): Promise<Approval[]> {
  const filter = [f.approverId && `_pin_approver_value eq ${f.approverId}`, f.status && `pin_status eq ${index(APPROVAL_STATUS, f.status)}`].filter(Boolean).join(' and ');
  return rows(await Pin_approvalsService.getAll({ filter: filter || undefined, orderBy: ['pin_requestedon desc'], top: 300 }), 'Approvals').map(mapApproval);
}
export async function decide(id: string, approve: boolean, comments: string): Promise<void> {
  must(await Pin_approvalsService.update(id, { pin_status: index(APPROVAL_STATUS, approve ? 'Approved' : 'Rejected'), pin_comments: comments, pin_decidedvia: opt(0) } as never), approve ? 'Approve' : 'Reject');
}

// ---------- billing ----------
export async function createInvoice(projectId: string, from: string, to: string, include: { time: boolean; milestones: boolean; retainer: boolean }, notes: string): Promise<Invoice> {
  const r = must(await Pin_invoicesService.create({
    pin_periodfrom: from, pin_periodto: to, pin_includetime: include.time, pin_includemilestones: include.milestones, pin_includeretainer: include.retainer, pin_notes: notes,
    'pin_project@odata.bind': bind('pin_projects', projectId),
  } as never), 'Generate invoice') as unknown as Row;
  return mapInvoice(must(await Pin_invoicesService.get(str(r.pin_invoiceid)), 'Invoice') as unknown as Row);
}
export async function setInvoiceStatus(id: string, status: InvoiceStatus): Promise<void> {
  must(await Pin_invoicesService.update(id, { pin_status: index(INVOICE_STATUS, status) } as never), `Mark invoice ${status.toLowerCase()}`);
}

// ---------- talent (RMG) ----------
export interface RequestInput { projectId: string; title: string; roleId: string; skills: string; minExperience: number; allocation: number; start: string; end?: string; headcount: number; priority: Priority; location: string; justification: string }
export async function createRequest(r: RequestInput): Promise<void> {
  must(await Pin_resourcerequestsService.create({
    pin_title: r.title, pin_skills: r.skills, pin_minexperience: r.minExperience, pin_allocation: r.allocation, pin_startdate: r.start, pin_enddate: r.end || null,
    pin_headcount: r.headcount, pin_priority: index(PRIORITY, r.priority), pin_location: r.location, pin_justification: r.justification,
    'pin_project@odata.bind': bind('pin_projects', r.projectId), 'pin_role@odata.bind': bind('pin_roles', r.roleId),
  } as never), 'Request talent');
}
export async function updateRequest(id: string, f: { status?: RequestStatus; notes?: string; rmgOwnerId?: string; fulfilledById?: string; candidateName?: string }): Promise<void> {
  const rec: Row = {};
  if (f.status) rec.pin_status = index(REQUEST_STATUS, f.status);
  if (f.notes !== undefined) rec.pin_decisionnotes = f.notes;
  if (f.candidateName !== undefined) rec.pin_candidatename = f.candidateName;
  if (f.rmgOwnerId) rec['pin_rmgowner@odata.bind'] = bind('pin_resources', f.rmgOwnerId);
  if (f.fulfilledById) rec['pin_fulfilledby@odata.bind'] = bind('pin_resources', f.fulfilledById);
  must(await Pin_resourcerequestsService.update(id, rec as never), 'Update talent request');
}

// ---------- leave ----------
const mapLeave = (r: Row): LeaveRequest => ({
  id: str(r.pin_leaverequestid), number: str(r.pin_name), resourceId: str(r._pin_resource_value), typeId: str(r._pin_leavetype_value), from: dateOnly(r.pin_fromdate) ?? '',
  to: dateOnly(r.pin_todate) ?? '', halfStart: !!r.pin_halfdaystart, halfEnd: !!r.pin_halfdayend, days: num(r.pin_days), reason: str(r.pin_reason),
  status: pick(LEAVE_STATUS, r.pin_status, 'Submitted'), approverId: str(r._pin_approver_value) || undefined, decidedOn: str(r.pin_decidedon) || undefined,
  comments: str(r.pin_comments), createdOn: str(r.createdon) || undefined,
});
export async function loadLeave(resourceId?: string): Promise<LeaveRequest[]> {
  return rows(await Pin_leaverequestsService.getAll({ filter: resourceId ? `_pin_resource_value eq ${resourceId}` : undefined, orderBy: ['pin_fromdate desc'] }), 'Leave').map(mapLeave);
}
export async function loadBalances(resourceId: string, year: number): Promise<LeaveBalance[]> {
  return rows(await Pin_leavebalancesService.getAll({ filter: `_pin_resource_value eq ${resourceId} and pin_year eq ${year}` }), 'Leave balances').map((r) => ({
    id: str(r.pin_leavebalanceid), resourceId, typeId: str(r._pin_leavetype_value), year, entitled: num(r.pin_entitled), used: num(r.pin_used), pending: num(r.pin_pending), balance: num(r.pin_balance),
  }));
}
export async function applyLeave(l: { resourceId: string; typeId: string; from: string; to: string; halfStart: boolean; halfEnd: boolean; reason: string }): Promise<void> {
  must(await Pin_leaverequestsService.create({
    pin_fromdate: l.from, pin_todate: l.to, pin_halfdaystart: l.halfStart, pin_halfdayend: l.halfEnd, pin_reason: l.reason,
    'pin_resource@odata.bind': bind('pin_resources', l.resourceId), 'pin_leavetype@odata.bind': bind('pin_leavetypes', l.typeId),
  } as never), 'Apply for leave');
}
export async function cancelLeave(id: string): Promise<void> {
  must(await Pin_leaverequestsService.update(id, { pin_status: index(LEAVE_STATUS, 'Cancelled') } as never), 'Cancel leave');
}

// ---------- settings ----------
export async function saveRole(r: { id?: string; name: string; billRate: number; costRate: number; color: string }): Promise<void> {
  const rec = { pin_name: r.name, pin_billrate: r.billRate, pin_costrate: r.costRate, pin_color: r.color, pin_isactive: true };
  if (r.id) must(await Pin_rolesService.update(r.id, rec as never), 'Save role');
  else must(await Pin_rolesService.create(rec as never), 'Add role');
}
export async function saveHoliday(h: { name: string; date: string; location: string }): Promise<void> {
  must(await Pin_holidaiesService.create({ pin_name: h.name, pin_date: h.date, pin_location: h.location || null, pin_type: opt(0) } as never), 'Add holiday');
}
