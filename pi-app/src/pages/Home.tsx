import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Button } from '@fluentui/react-components';
import { Add20Regular, CalendarLtr20Regular, Clock20Regular, ArrowRight16Regular } from '@fluentui/react-icons';
import { useData } from '../state/dataContext';
import type { Navigate } from '../state/nav';
import { GlassCard, SectionTitle } from '../ui/GlassCard';
import { Donut, ProgressRing } from '../ui/charts';
import { CountUp } from '../ui/CountUp';
import { ApprovalIcon, Avatar, Bar, Empty, Status } from '../ui/bits';
import { MonthBars } from '../ui/MonthBars';
import { compact, fmtShort, isoDay, mondayOf, addDays, relative, toBase } from '../lib/format';
import { loadEntries, loadLeave, loadMilestones, loadRevenue, loadTasks, loadTimesheets, type LeaveRequest, type Milestone, type Revenue, type Task, type TimeEntry, type Timesheet } from '../services/pi';

const greeting = (h: number) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');

export function Home({ onNavigate }: { onNavigate: Navigate }) {
  const { myself, me, projects, myApprovals, byId, isFinance, isPmo, holidays, now, leaveTypes } = useData();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [sheets, setSheets] = useState<Timesheet[]>([]);
  const [revenue, setRevenue] = useState<Revenue[]>([]);
  const [wip, setWip] = useState<TimeEntry[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);

  const weekStart = isoDay(mondayOf(new Date(now)));
  const weekEnd = isoDay(addDays(mondayOf(new Date(now)), 6));

  useEffect(() => {
    if (!myself) return;
    let alive = true;
    const since = isoDay(addDays(new Date(), -120));
    Promise.all([
      loadTasks(undefined, myself.id).then((t) => alive && setTasks(t)),
      loadTimesheets(myself.id).then((s) => alive && setSheets(s)),
      loadMilestones().then((m) => alive && setMilestones(m)),
      loadLeave().then((l) => alive && setLeave(l)),
      isFinance || isPmo ? loadRevenue().then((r) => alive && setRevenue(r)) : Promise.resolve(),
      isFinance || isPmo ? loadEntries({ since }).then((e) => alive && setWip(e.filter((x) => x.status === 'Approved' && x.amount > 0 && !x.invoiceLineId))) : Promise.resolve(),
    ]).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [myself, isFinance, isPmo]);

  const active = (projects ?? []).filter((p) => p.status === 'Active' || p.status === 'Closing');
  const health = useMemo(
    () =>
      [
        { label: 'On track', value: active.filter((p) => p.health === 'On track').length, color: '#22c55e' },
        { label: 'At risk', value: active.filter((p) => p.health === 'At risk').length, color: '#f59e0b' },
        { label: 'Off track', value: active.filter((p) => p.health === 'Off track').length, color: '#ef4444' },
      ].filter((s) => s.value > 0),
    [active],
  );

  const thisSheet = sheets.find((s) => s.weekStart === weekStart);
  const myOpen = (tasks ?? []).filter((t) => t.status !== 'Done').sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).toISOString().slice(0, 10);
  const mtd = revenue.filter((r) => (r.date ?? '') >= monthStart).reduce((s, r) => s + r.amountBase, 0);
  const wipBase = wip.reduce((s, e) => s + toBase(e.amount, byId.currency.get(e.currencyId ?? '')), 0);

  const months = useMemo(() => {
    const out: { label: string; a: number; b: number }[] = [];
    const d = new Date(now);
    for (let i = 5; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const key = isoDay(m).slice(0, 7);
      const rows = revenue.filter((r) => (r.period ?? r.date ?? '').startsWith(key));
      out.push({ label: m.toLocaleDateString('en-IN', { month: 'short' }), a: rows.reduce((s, r) => s + r.amountBase, 0), b: rows.filter((r) => r.billed).reduce((s, r) => s + r.amountBase, 0) });
    }
    return out;
  }, [revenue, now]);

  const today = isoDay(new Date(now));
  const upcoming = milestones.filter((m) => m.due && m.due >= today && m.status !== 'Invoiced' && m.status !== 'Accepted').slice(0, 5);
  const away = leave.filter((l) => l.status === 'Approved' && l.from <= weekEnd && l.to >= weekStart);
  const weekHolidays = holidays.filter((h) => h.date >= weekStart && h.date <= weekEnd);
  const name = (myself?.name ?? me?.name ?? 'there').split(' ')[0];

  return (
    <div className="page">
      <GlassCard className="hero" padded={false}>
        <div className="hero-inner">
          <div>
            <span className="pill pill-brand">{new Date(now).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <h1>
              {greeting(new Date(now).getHours())}, {name} <span className="wave">👋</span>
            </h1>
            <p className="hero-sub">
              {myApprovals.length ? `${myApprovals.length} approval${myApprovals.length === 1 ? '' : 's'} waiting for you · ` : ''}
              {myOpen.length} open task{myOpen.length === 1 ? '' : 's'} · {active.length} active projects
            </p>
            <div className="hero-actions">
              <Button appearance="primary" size="large" icon={<Clock20Regular />} onClick={() => onNavigate({ page: 'timesheet' })}>
                Log time
              </Button>
              <Button size="large" icon={<Add20Regular />} onClick={() => onNavigate({ page: 'projects', create: true })}>
                New project
              </Button>
              <Button size="large" appearance="subtle" icon={<CalendarLtr20Regular />} onClick={() => onNavigate({ page: 'leave' })}>
                Apply leave
              </Button>
            </div>
          </div>
          <div className="hero-week">
            <ProgressRing value={Math.min(100, ((thisSheet?.total ?? 0) / (myself?.capacity ?? 40)) * 100)} size={128} stroke={12} label={`${thisSheet?.total ?? 0}h`} />
            <div>
              <strong>This week</strong>
              <span className="muted small block">{thisSheet ? <Status value={thisSheet.status} /> : 'Not started'}</span>
              <span className="muted small block">
                {thisSheet?.total ?? 0} of {myself?.capacity ?? 40} h logged
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="kpi-grid">
        <GlassCard className="kpi" index={0}>
          <span className="kpi-label">Active projects</span>
          <span className="kpi-value">
            <CountUp value={active.length} />
          </span>
          <span className="kpi-foot muted">{active.filter((p) => p.health !== 'On track').length} need attention</span>
        </GlassCard>
        <GlassCard className="kpi" index={1}>
          <span className="kpi-label">Open tasks (mine)</span>
          <span className="kpi-value">
            <CountUp value={myOpen.length} />
          </span>
          <span className="kpi-foot muted">{myOpen.filter((t) => t.due && t.due < today).length} overdue</span>
        </GlassCard>
        {isFinance || isPmo ? (
          <>
            <GlassCard className="kpi" index={2}>
              <span className="kpi-label">Revenue this month</span>
              <span className="kpi-value">{compact(mtd)}</span>
              <span className="kpi-foot muted">Recognised, in INR</span>
            </GlassCard>
            <GlassCard className="kpi" index={3}>
              <span className="kpi-label">Unbilled WIP</span>
              <span className="kpi-value">{compact(wipBase)}</span>
              <span className="kpi-foot muted">Approved time not yet invoiced</span>
            </GlassCard>
          </>
        ) : (
          <>
            <GlassCard className="kpi" index={2}>
              <span className="kpi-label">Approvals waiting</span>
              <span className="kpi-value">
                <CountUp value={myApprovals.length} />
              </span>
              <span className="kpi-foot muted">Assigned to you</span>
            </GlassCard>
            <GlassCard className="kpi" index={3}>
              <span className="kpi-label">Hours this week</span>
              <span className="kpi-value">{thisSheet?.total ?? 0}</span>
              <span className="kpi-foot muted">of {myself?.capacity ?? 40} expected</span>
            </GlassCard>
          </>
        )}
      </div>

      <div className="grid-2">
        <GlassCard index={4}>
          <SectionTitle title="My tasks" hint="Sorted by due date" action={<Button appearance="transparent" size="small" icon={<ArrowRight16Regular />} iconPosition="after" onClick={() => onNavigate({ page: 'mywork' })}>All</Button>} />
          {tasks && myOpen.length === 0 && <Empty title="Nothing on your plate" />}
          <ul className="list">
            {myOpen.slice(0, 6).map((t, i) => {
              const p = byId.project.get(t.projectId);
              return (
                <motion.li key={t.id} className="list-row clickable" onClick={() => onNavigate({ page: 'projects', projectId: t.projectId, tab: 'tasks' })} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                  <span className="dot" style={{ background: p?.color }} />
                  <span className="grow">
                    {t.title}
                    <span className="muted small block">{p?.name}</span>
                  </span>
                  <Status value={t.status} />
                  <span className={`small ${t.due && t.due < today ? 'c-bad' : 'muted'}`}>{t.due ? fmtShort(t.due) : ''}</span>
                </motion.li>
              );
            })}
          </ul>
        </GlassCard>

        <GlassCard index={5}>
          <SectionTitle title="Waiting for you" hint="Approvals assigned to you" action={<Button appearance="transparent" size="small" icon={<ArrowRight16Regular />} iconPosition="after" onClick={() => onNavigate({ page: 'approvals' })}>Inbox</Button>} />
          {myApprovals.length === 0 && <Empty title="Inbox zero ✨" />}
          <ul className="list">
            {myApprovals.slice(0, 6).map((a) => (
              <li key={a.id} className="list-row clickable" onClick={() => onNavigate({ page: 'approvals' })}>
                <ApprovalIcon type={a.type} />
                <span className="grow">
                  {a.summary || a.title}
                  <span className="muted small block">{a.type}</span>
                </span>
                <span className="muted small">{relative(a.requestedOn, now)}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>

      <div className="grid-2">
        <GlassCard index={6}>
          <SectionTitle title="Portfolio health" hint={`${active.length} active projects`} />
          <div className="health">
            <Donut slices={health.length ? health : [{ label: 'None', value: 1, color: 'var(--track)' }]} center={<strong>{active.length}</strong>} />
            <ul className="legend">
              {active.slice(0, 6).map((p) => (
                <li key={p.id} className="clickable" onClick={() => onNavigate({ page: 'projects', projectId: p.id })}>
                  <span className="dot" style={{ background: p.health === 'On track' ? '#22c55e' : p.health === 'At risk' ? '#f59e0b' : '#ef4444' }} />
                  <span className="grow">{p.name}</span>
                  <Bar value={p.percent} label={`${p.name} progress`} />
                  <span className="small muted tabular">{Math.round(p.percent)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </GlassCard>
        {isFinance || isPmo ? (
          <GlassCard index={7}>
            <SectionTitle title="Revenue — last 6 months" hint="Recognised vs billed (INR)" />
            <MonthBars data={months} aLabel="Recognised" bLabel="Billed" format={(v) => compact(v)} />
          </GlassCard>
        ) : (
          <GlassCard index={7}>
            <SectionTitle title="Upcoming milestones" />
            <MilestoneList items={upcoming} onNavigate={onNavigate} />
          </GlassCard>
        )}
      </div>

      <div className="grid-2">
        {(isFinance || isPmo) && (
          <GlassCard index={8}>
            <SectionTitle title="Upcoming milestones" hint="Next deliverables across projects" />
            <MilestoneList items={upcoming} onNavigate={onNavigate} />
          </GlassCard>
        )}
        <GlassCard index={9}>
          <SectionTitle title="Who’s away this week" hint={`${weekHolidays.length ? `${weekHolidays.map((h) => h.name).join(', ')} · ` : ''}${away.length} on leave`} />
          {away.length === 0 && weekHolidays.length === 0 && <Empty title="Everyone’s in this week" />}
          <ul className="list">
            {weekHolidays.map((h) => (
              <li key={h.id} className="list-row">
                <span className="holiday-chip">🎉</span>
                <span className="grow">
                  {h.name}
                  <span className="muted small block">Company holiday · {fmtShort(h.date)}</span>
                </span>
              </li>
            ))}
            {away.map((l) => {
              const r = byId.resource.get(l.resourceId);
              const t = leaveTypes.find((x) => x.id === l.typeId);
              return (
                <li key={l.id} className="list-row">
                  <Avatar name={r?.name ?? '?'} color={r?.color} size={28} />
                  <span className="grow">
                    {r?.name}
                    <span className="muted small block">
                      {fmtShort(l.from)} – {fmtShort(l.to)}
                    </span>
                  </span>
                  <span className="pill" style={{ background: `${t?.color ?? '#7c3aed'}22`, color: t?.color }}>
                    {t?.code}
                  </span>
                </li>
              );
            })}
          </ul>
        </GlassCard>
      </div>
    </div>
  );
}

function MilestoneList({ items, onNavigate }: { items: Milestone[]; onNavigate: Navigate }) {
  const { byId } = useData();
  if (!items.length) return <Empty title="No milestones due soon" />;
  return (
    <ul className="list">
      {items.map((m) => {
        const p = byId.project.get(m.projectId);
        return (
          <li key={m.id} className="list-row clickable" onClick={() => onNavigate({ page: 'projects', projectId: m.projectId })}>
            <span className="dot" style={{ background: p?.color }} />
            <span className="grow">
              {m.name}
              <span className="muted small block">{p?.name}</span>
            </span>
            <Status value={m.status} />
            <span className="small muted">{fmtShort(m.due)}</span>
          </li>
        );
      })}
    </ul>
  );
}
