// Demo mode (vite --mode demo): in-memory stand-ins for the generated Dataverse services, backed by a
// sanitised snapshot of the fictional seed data. Used only for the product video — never in the live app.
import snapshot from './snapshot.json';

type Row = Record<string, unknown>;
type Opts = { filter?: string; orderBy?: string[]; top?: number; select?: string[]; maxPageSize?: number };
const db = snapshot as unknown as Record<string, Row[]>;
const ok = <T>(data: T) => ({ success: true, data });
const delay = () => new Promise((r) => setTimeout(r, 60 + Math.random() * 90));

function parseValue(raw: string): unknown {
  const v = raw.trim();
  if (v === 'true' || v === 'false') return v === 'true';
  if (v === 'null') return null;
  if (/^'.*'$/.test(v)) return v.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v; // guid or date
}

function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const as = String(a ?? '');
  const bs = String(b ?? '');
  // date-only comparisons against datetime values
  if (/^\d{4}-\d{2}-\d{2}$/.test(bs) && /^\d{4}-\d{2}-\d{2}T/.test(as)) return as.slice(0, 10).localeCompare(bs);
  return as.localeCompare(bs);
}

function matches(row: Row, filter?: string): boolean {
  if (!filter) return true;
  return filter.split(/\s+and\s+/i).every((clause) => {
    const anyOf = clause.replace(/^\(|\)$/g, '').split(/\s+or\s+/i);
    return anyOf.some((c) => {
      const m = /^(\S+)\s+(eq|ne|ge|le|gt|lt)\s+(.+)$/i.exec(c.trim());
      if (!m) return true;
      const [, field, op, raw] = m;
      const left = row[field!];
      const right = parseValue(raw!);
      const r = left === null || left === undefined ? (right === null ? 0 : -1) : cmp(left, right);
      const eq = typeof left === 'string' && typeof right === 'string' ? left.toLowerCase() === right.toLowerCase() : left === right || r === 0;
      switch (op!.toLowerCase()) {
        case 'eq': return eq;
        case 'ne': return !eq;
        case 'ge': return r >= 0;
        case 'le': return r <= 0;
        case 'gt': return r > 0;
        default: return r < 0;
      }
    });
  });
}

/** "pin_project@odata.bind": "/pin_projects(id)" → _pin_project_value */
function normalise(record: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(record)) {
    const bindMatch = /^(.+)@odata\.bind$/.exec(k);
    if (bindMatch) out[`_${bindMatch[1]}_value`] = v ? String(v).match(/\(([^)]+)\)/)?.[1] ?? null : null;
    else out[k] = v;
  }
  return out;
}

function makeService(table: string, key: string) {
  const rows = () => (db[table] ??= []);
  return class {
    static async getAll(o: Opts = {}) {
      await delay();
      let list = rows().filter((r) => matches(r, o.filter));
      for (const ob of [...(o.orderBy ?? [])].reverse()) {
        const [f, dir] = ob.split(' ');
        list = [...list].sort((a, b) => (dir === 'desc' ? -1 : 1) * cmp(a[f!], b[f!]));
      }
      if (o.top) list = list.slice(0, o.top);
      return ok(list.map((r) => ({ ...r })));
    }
    static async get(id: string) {
      await delay();
      return ok({ ...(rows().find((r) => r[key] === id) ?? {}) });
    }
    static async create(record: Row) {
      await delay();
      const row = { ...normalise(record), [key]: crypto.randomUUID(), createdon: new Date().toISOString(), statecode: 0 };
      rows().unshift(row);
      return ok({ ...row });
    }
    static async update(id: string, fields: Row) {
      await delay();
      const row = rows().find((r) => r[key] === id);
      if (row) Object.assign(row, normalise(fields));
      return ok({ ...(row ?? {}) });
    }
    static async delete(id: string) {
      await delay();
      db[table] = rows().filter((r) => r[key] !== id);
    }
  };
}

export const Pin_clientsService = makeService('pin_client', 'pin_clientid');
export const Pin_rolesService = makeService('pin_role', 'pin_roleid');
export const Pin_resourcesService = makeService('pin_resource', 'pin_resourceid');
export const Pin_projectsService = makeService('pin_project', 'pin_projectid');
export const Pin_projectratesService = makeService('pin_projectrate', 'pin_projectrateid');
export const Pin_membersService = makeService('pin_member', 'pin_memberid');
export const Pin_milestonesService = makeService('pin_milestone', 'pin_milestoneid');
export const Pin_tasksService = makeService('pin_task', 'pin_taskid');
export const Pin_timesheetsService = makeService('pin_timesheet', 'pin_timesheetid');
export const Pin_timeentriesService = makeService('pin_timeentry', 'pin_timeentryid');
export const Pin_approvalsService = makeService('pin_approval', 'pin_approvalid');
export const Pin_invoicesService = makeService('pin_invoice', 'pin_invoiceid');
export const Pin_invoicelinesService = makeService('pin_invoiceline', 'pin_invoicelineid');
export const Pin_revenuesService = makeService('pin_revenue', 'pin_revenueid');
export const Pin_activitiesService = makeService('pin_activity', 'pin_activityid');
export const Pin_resourcerequestsService = makeService('pin_resourcerequest', 'pin_resourcerequestid');
export const Pin_holidaiesService = makeService('pin_holiday', 'pin_holidayid');
export const Pin_leavetypesService = makeService('pin_leavetype', 'pin_leavetypeid');
export const Pin_leavebalancesService = makeService('pin_leavebalance', 'pin_leavebalanceid');
export const Pin_leaverequestsService = makeService('pin_leaverequest', 'pin_leaverequestid');
export const TransactioncurrenciesService = makeService('transactioncurrency', 'transactioncurrencyid');
