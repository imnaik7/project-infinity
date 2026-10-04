import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tab, TabList } from '@fluentui/react-components';
import { useData } from '../state/dataContext';
import type { Navigate } from '../state/nav';
import { GlassCard, SectionTitle } from '../ui/GlassCard';
import { MonthBars } from '../ui/MonthBars';
import { Empty, Status } from '../ui/bits';
import { compact, fmtShort, isoDay, money, toBase } from '../lib/format';
import { loadEntries, loadInvoices, loadRevenue, type Invoice, type InvoiceStatus, type Revenue, type TimeEntry } from '../services/pi';
import { InvoiceView } from '../components/InvoiceView';

export function Billing({ onNavigate }: { onNavigate: Navigate }) {
  const { byId, clients, now } = useData();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [revenue, setRevenue] = useState<Revenue[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [filter, setFilter] = useState<'all' | InvoiceStatus>('all');
  const [view, setView] = useState<Invoice | null>(null);
  const today = isoDay(new Date(now));

  const load = useCallback(
    () =>
      Promise.all([
        loadInvoices().then(setInvoices),
        loadRevenue().then(setRevenue),
        loadEntries({ since: isoDay(new Date(now - 200 * 86_400_000)) }).then((e) => setEntries(e.filter((x) => x.status === 'Approved' && x.amount > 0 && !x.invoiceLineId))),
      ]),
    [now],
  );
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const curOf = (id?: string) => byId.currency.get(id ?? '');
  const base = (amount: number, curId?: string) => toBase(amount, curOf(curId));
  const live = invoices.filter((i) => i.status !== 'Cancelled');
  const invoicedMonth = live.filter((i) => (i.issuedOn ?? '') >= today.slice(0, 7)).reduce((s, i) => s + base(i.total, i.currencyId), 0);
  const overdue = live.filter((i) => i.status === 'Sent' && (i.dueOn ?? '9999') < today);
  const outstanding = live.filter((i) => i.status === 'Sent' || i.status === 'Approved').reduce((s, i) => s + base(i.total, i.currencyId), 0);
  const ytd = revenue.filter((r) => (r.date ?? '') >= `${today.slice(0, 4)}-01-01`).reduce((s, r) => s + r.amountBase, 0);

  const wip = useMemo(() => {
    const m = new Map<string, { amount: number; hours: number; cur?: string }>();
    for (const e of entries) {
      const r = m.get(e.projectId ?? '') ?? { amount: 0, hours: 0, cur: e.currencyId };
      r.amount += e.amount;
      r.hours += e.hours;
      m.set(e.projectId ?? '', r);
    }
    return [...m.entries()].sort((a, b) => base(b[1].amount, b[1].cur) - base(a[1].amount, a[1].cur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const months = useMemo(() => {
    const out: { label: string; a: number; b: number }[] = [];
    const d = new Date(now);
    for (let i = 5; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const key = isoDay(m).slice(0, 7);
      out.push({
        label: m.toLocaleDateString('en-IN', { month: 'short' }),
        a: revenue.filter((r) => (r.period ?? r.date ?? '').startsWith(key)).reduce((s, r) => s + r.amountBase, 0),
        b: live.filter((i) => (i.issuedOn ?? '').startsWith(key)).reduce((s, i) => s + base(i.subtotal, i.currencyId), 0),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenue, live, now]);

  const byClient = useMemo(
    () =>
      clients
        .map((c) => ({
          c,
          rev: revenue.filter((r) => byId.project.get(r.projectId)?.clientId === c.id).reduce((s, r) => s + r.amountBase, 0),
        }))
        .filter((x) => x.rev > 0)
        .sort((a, b) => b.rev - a.rev),
    [clients, revenue, byId],
  );
  const maxClient = Math.max(1, ...byClient.map((x) => x.rev));
  const shown = invoices.filter((i) => filter === 'all' || i.status === filter);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Billing &amp; revenue</h1>
          <p className="muted">Every amount converted to INR for totals · invoices stay in the client’s currency</p>
        </div>
      </div>
      <div className="kpi-grid">
        <GlassCard className="kpi" index={0}>
          <span className="kpi-label">Unbilled WIP</span>
          <span className="kpi-value">{compact(wip.reduce((s, [, r]) => s + base(r.amount, r.cur), 0))}</span>
          <span className="kpi-foot muted">{wip.length} project(s) with approved time to bill</span>
        </GlassCard>
        <GlassCard className="kpi" index={1}>
          <span className="kpi-label">Invoiced this month</span>
          <span className="kpi-value">{compact(invoicedMonth)}</span>
          <span className="kpi-foot muted">incl. tax</span>
        </GlassCard>
        <GlassCard className="kpi" index={2}>
          <span className="kpi-label">Outstanding</span>
          <span className="kpi-value">{compact(outstanding)}</span>
          <span className="kpi-foot">{overdue.length ? <span className="c-bad">{overdue.length} overdue</span> : <span className="muted">Nothing overdue</span>}</span>
        </GlassCard>
        <GlassCard className="kpi" index={3}>
          <span className="kpi-label">Revenue YTD</span>
          <span className="kpi-value">{compact(ytd)}</span>
          <span className="kpi-foot muted">Recognised</span>
        </GlassCard>
      </div>

      <div className="grid-2">
        <GlassCard>
          <SectionTitle title="Recognised vs invoiced" hint="Last 6 months · INR" />
          <MonthBars data={months} aLabel="Recognised" bLabel="Invoiced" format={(v) => compact(v)} />
        </GlassCard>
        <GlassCard>
          <SectionTitle title="Revenue by client" hint="Recognised · INR" />
          {byClient.length === 0 && <Empty title="No revenue yet" />}
          <ul className="list">
            {byClient.map(({ c, rev }) => (
              <li key={c.id} className="list-row">
                <span className="dot" style={{ background: c.color }} />
                <span className="grow">{c.name}</span>
                <span className="hbar">
                  <span style={{ width: `${(rev / maxClient) * 100}%`, background: c.color }} />
                </span>
                <strong className="tabular">{compact(rev)}</strong>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>

      <GlassCard>
        <SectionTitle title="Ready to bill" hint="Approved billable time not yet on an invoice" />
        {wip.length === 0 && <Empty title="Everything approved is invoiced" />}
        <ul className="list">
          {wip.map(([pid, r]) => {
            const p = byId.project.get(pid);
            return (
              <li key={pid} className="list-row clickable" onClick={() => onNavigate({ page: 'projects', projectId: pid, tab: 'billing' })}>
                <span className="dot" style={{ background: p?.color }} />
                <span className="grow">
                  {p?.name}
                  <span className="muted small block">
                    {byId.client.get(p?.clientId ?? '')?.name} · {r.hours.toFixed(1)} h
                  </span>
                </span>
                <strong>{money(r.amount, curOf(r.cur))}</strong>
                <span className="small c-info">Generate →</span>
              </li>
            );
          })}
        </ul>
      </GlassCard>

      <GlassCard padded={false}>
        <div className="pad row-between">
          <SectionTitle title="Invoices" />
          <TabList size="small" selectedValue={filter} onTabSelect={(_, v) => setFilter(v.value as 'all' | InvoiceStatus)}>
            {(['all', 'Draft', 'Approved', 'Sent', 'Paid', 'Cancelled'] as const).map((s) => (
              <Tab key={s} value={s}>
                {s === 'all' ? 'All' : s}
              </Tab>
            ))}
          </TabList>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Client · project</th>
              <th>Status</th>
              <th>Issued</th>
              <th>Due</th>
              <th className="n">Total</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => {
              const p = byId.project.get(i.projectId);
              return (
                <tr key={i.id} className="clickable" onClick={() => setView(i)}>
                  <td className="mono">{i.number}</td>
                  <td>
                    {byId.client.get(i.clientId ?? '')?.name} <span className="muted small">· {p?.name}</span>
                  </td>
                  <td><Status value={i.status} /></td>
                  <td>{fmtShort(i.issuedOn)}</td>
                  <td className={i.status === 'Sent' && (i.dueOn ?? '9999') < today ? 'c-bad' : ''}>{fmtShort(i.dueOn)}</td>
                  <td className="n">
                    <strong>{money(i.total, curOf(i.currencyId), 2)}</strong>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && <Empty title="No invoices here" />}
      </GlassCard>
      {view && <InvoiceView invoice={view} onClose={() => setView(null)} onChanged={() => load()} />}
    </div>
  );
}
