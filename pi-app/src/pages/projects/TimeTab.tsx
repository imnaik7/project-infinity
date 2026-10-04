import { useMemo } from 'react';
import { useData } from '../../state/dataContext';
import { GlassCard, SectionTitle } from '../../ui/GlassCard';
import { MonthBars } from '../../ui/MonthBars';
import { Avatar, Empty } from '../../ui/bits';
import { money, mondayOf, isoDay, addDays, parseDay } from '../../lib/format';
import type { ProjectData } from './Workspace';

export function TimeTab({ d }: { d: ProjectData }) {
  const { byId, now } = useData();
  const cur = byId.currency.get(d.project.currencyId ?? '');
  const work = d.entries.filter((e) => e.type === 'Work');

  const weeks = useMemo(() => {
    const out: { label: string; a: number; b: number }[] = [];
    const thisMonday = mondayOf(new Date(now));
    for (let i = 7; i >= 0; i--) {
      const mon = addDays(thisMonday, -7 * i);
      const from = isoDay(mon);
      const to = isoDay(addDays(mon, 6));
      const rows = work.filter((e) => e.date >= from && e.date <= to);
      out.push({ label: mon.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), a: rows.reduce((s, e) => s + e.hours, 0), b: rows.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0) });
    }
    return out;
  }, [work, now]);

  const people = useMemo(() => {
    const map = new Map<string, { approved: number; pending: number; billable: number; amount: number; cost: number; roles: Set<string> }>();
    for (const e of work) {
      const k = e.resourceId ?? '?';
      const row = map.get(k) ?? { approved: 0, pending: 0, billable: 0, amount: 0, cost: 0, roles: new Set<string>() };
      if (e.status === 'Approved') row.approved += e.hours;
      else if (e.status === 'Submitted') row.pending += e.hours;
      if (e.billable) row.billable += e.hours;
      row.amount += e.status === 'Approved' ? e.amount : 0;
      row.cost += e.status === 'Approved' ? e.cost : 0;
      if (e.roleId) row.roles.add(byId.role.get(e.roleId)?.name ?? '');
      map.set(k, row);
    }
    return [...map.entries()].sort((a, b) => b[1].approved - a[1].approved);
  }, [work, byId]);

  if (!work.length) return <Empty title="No time logged yet">Team members log time from their weekly timesheet once the project is active.</Empty>;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <GlassCard>
        <SectionTitle title="Hours per week" hint="All hours vs billable, last 8 weeks" />
        <MonthBars data={weeks} aLabel="Hours" bLabel="Billable" format={(v) => `${Math.round(v)} h`} />
      </GlassCard>
      <GlassCard padded={false}>
        <table className="grid">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role(s) billed</th>
              <th className="n">Approved h</th>
              <th className="n">Awaiting approval</th>
              <th className="n">Billable h</th>
              <th className="n">Billable value</th>
              <th className="n">Cost</th>
            </tr>
          </thead>
          <tbody>
            {people.map(([id, r]) => {
              const p = byId.resource.get(id);
              return (
                <tr key={id}>
                  <td>
                    <span className="person">
                      <Avatar name={p?.name ?? '?'} color={p?.color} size={26} /> {p?.name}
                    </span>
                  </td>
                  <td className="small">{[...r.roles].filter(Boolean).join(', ') || '—'}</td>
                  <td className="n">{r.approved.toFixed(1)}</td>
                  <td className="n">{r.pending ? <span className="c-warn">{r.pending.toFixed(1)}</span> : '—'}</td>
                  <td className="n">{r.billable.toFixed(1)}</td>
                  <td className="n">{money(r.amount, cur)}</td>
                  <td className="n muted">{money(r.cost, cur)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </GlassCard>
      <p className="muted small">
        Rates are snapshotted when a timesheet is submitted, so role changes and rate updates never rewrite history. Last entry {work.length ? parseDay(work[work.length - 1]!.date).toLocaleDateString('en-IN') : ''}.
      </p>
    </div>
  );
}
