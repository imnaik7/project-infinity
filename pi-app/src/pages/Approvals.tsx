import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button, Checkbox, Spinner, Tab, TabList, Textarea } from '@fluentui/react-components';
import { Checkmark20Regular, Dismiss20Regular, CheckmarkCircle48Regular } from '@fluentui/react-icons';
import { useData } from '../state/dataContext';
import { useToast, errorText } from '../hooks/useToast';
import type { Navigate } from '../state/nav';
import { GlassCard } from '../ui/GlassCard';
import { ApprovalIcon, Avatar, Status } from '../ui/bits';
import { fmtDate, fmtShort, money, relative, weekDays } from '../lib/format';
import { decide, getTimesheet, loadApprovals, loadBalances, loadEntries, loadLeave, type Approval, type ApprovalType, type LeaveBalance, type LeaveRequest, type TimeEntry, type Timesheet } from '../services/pi';

type TabId = 'all' | ApprovalType | 'history';

export function Approvals({ onNavigate }: { onNavigate: Navigate }) {
  const { myself, myApprovals, refresh, byId, now } = useData();
  const notify = useToast();
  const [tab, setTab] = useState<TabId>('all');
  const [sel, setSel] = useState<Approval | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState('');
  const [history, setHistory] = useState<Approval[]>([]);

  useEffect(() => {
    if (!myself || tab !== 'history') return;
    loadApprovals({ approverId: myself.id }).then((a) => setHistory(a.filter((x) => x.status !== 'Pending'))).catch(() => undefined);
  }, [myself, tab]);

  const list = tab === 'history' ? history : myApprovals.filter((a) => tab === 'all' || a.type === tab);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: myApprovals.length };
    for (const a of myApprovals) c[a.type] = (c[a.type] ?? 0) + 1;
    return c;
  }, [myApprovals]);
  const current = sel && list.some((a) => a.id === sel.id) ? sel : (list[0] ?? null);

  const act = async (ids: string[], approve: boolean) => {
    setBusy(approve ? 'approve' : 'reject');
    let ok = 0;
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await decide(id, approve, comment);
        ok++;
      } catch (e) {
        failures.push(errorText(e));
      }
    }
    await refresh('approvals');
    await refresh('projects');
    setChecked(new Set());
    setComment('');
    setSel(null);
    setBusy('');
    if (ok) notify(approve ? `Approved ${ok}` : `Sent back ${ok}`, approve ? 'Revenue, balances and statuses updated.' : 'The requester has been told why.');
    if (failures.length) notify('Some items weren’t decided', failures[0], 'error');
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'Timesheet', label: 'Timesheets' },
    { id: 'Leave', label: 'Leave' },
    { id: 'Project', label: 'Projects' },
    { id: 'Closure', label: 'Closures' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <h1>Approvals</h1>
          <p className="muted">Decide here or on the Teams / Outlook card — both stay in sync.</p>
        </div>
        {tab === 'Timesheet' && checked.size > 0 && (
          <Button appearance="primary" icon={busy === 'approve' ? <Spinner size="tiny" /> : <Checkmark20Regular />} onClick={() => act([...checked], true)} disabled={!!busy}>
            Approve {checked.size} timesheet{checked.size === 1 ? '' : 's'}
          </Button>
        )}
      </div>
      <TabList selectedValue={tab} onTabSelect={(_, v) => { setTab(v.value as TabId); setChecked(new Set()); }}>
        {tabs.map((t) => (
          <Tab key={t.id} value={t.id}>
            {t.label} {counts[t.id] ? <span className="tab-count">{counts[t.id]}</span> : null}
          </Tab>
        ))}
      </TabList>

      {list.length === 0 ? (
        <GlassCard className="inbox-zero">
          <CheckmarkCircle48Regular className="c-ok" />
          <h2>{tab === 'history' ? 'No decisions yet' : 'Inbox zero'}</h2>
          <p className="muted">{tab === 'history' ? 'Approvals you decide will show here.' : 'Nothing is waiting for you. Enjoy the calm ✨'}</p>
        </GlassCard>
      ) : (
        <div className="inbox">
          <GlassCard padded={false} className="inbox-list">
            <AnimatePresence initial={false}>
              {list.map((a) => {
                const who = byId.resource.get(a.requestedById ?? '');
                return (
                  <motion.button key={a.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 40 }} className={`inbox-item ${current?.id === a.id ? 'on' : ''}`} onClick={() => setSel(a)}>
                    {tab === 'Timesheet' && (
                      <Checkbox
                        checked={checked.has(a.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(_, v) =>
                          setChecked((s) => {
                            const n = new Set(s);
                            if (v.checked) n.add(a.id);
                            else n.delete(a.id);
                            return n;
                          })
                        }
                        aria-label={`Select ${a.summary}`}
                      />
                    )}
                    <ApprovalIcon type={a.type} />
                    <span className="grow">
                      <strong>{a.summary || a.title}</strong>
                      <span className="muted small block">
                        {a.type} · {who?.name ?? '—'} · {relative(a.requestedOn, now)}
                      </span>
                    </span>
                    {tab === 'history' && <Status value={a.status} />}
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </GlassCard>

          {current && (
            <GlassCard className="inbox-detail" key={current.id}>
              <Detail a={current} onNavigate={onNavigate} />
              {current.status === 'Pending' ? (
                <div className="decide">
                  <Textarea value={comment} onChange={(_, v) => setComment(v.value)} placeholder="Comment (required when sending back)" rows={2} />
                  <div className="row">
                    <Button appearance="primary" icon={busy === 'approve' ? <Spinner size="tiny" /> : <Checkmark20Regular />} onClick={() => act([current.id], true)} disabled={!!busy}>
                      Approve
                    </Button>
                    <Button icon={busy === 'reject' ? <Spinner size="tiny" /> : <Dismiss20Regular />} onClick={() => act([current.id], false)} disabled={!!busy || !comment.trim()}>
                      Send back
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="muted small">
                  {current.status} {fmtDate(current.decidedOn)} via {current.via}
                  {current.comments && ` — “${current.comments}”`}
                </p>
              )}
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ a, onNavigate }: { a: Approval; onNavigate: Navigate }) {
  const { byId } = useData();
  const who = byId.resource.get(a.requestedById ?? '');
  return (
    <div className="stack">
      <div className="row">
        {who && <Avatar name={who.name} color={who.color} size={40} />}
        <div>
          <h2 className="h2-sm">{a.summary || a.title}</h2>
          <span className="muted small">
            Requested by {who?.name ?? '—'} · {fmtDate(a.requestedOn)}
          </span>
        </div>
      </div>
      {a.type === 'Timesheet' && a.timesheetId && <SheetDetail id={a.timesheetId} />}
      {(a.type === 'Project' || a.type === 'Closure') && a.projectId && <ProjectDetail id={a.projectId} closure={a.type === 'Closure'} onNavigate={onNavigate} />}
      {a.type === 'Leave' && a.leaveId && <LeaveDetail id={a.leaveId} />}
    </div>
  );
}

function SheetDetail({ id }: { id: string }) {
  const { byId } = useData();
  const [sheet, setSheet] = useState<Timesheet | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const load = useCallback(() => Promise.all([getTimesheet(id).then(setSheet), loadEntries({ timesheetId: id }).then(setEntries)]), [id]);
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);
  if (!sheet) return <Spinner size="small" />;
  const days = weekDays(sheet.weekStart);
  const groups = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const k = e.type === 'Work' ? `${e.projectId}|${e.taskId ?? ''}` : `${e.type}|${e.notes}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const billableValue = entries.reduce((s, e) => s + e.amount, 0);
  const cur = byId.currency.get(entries.find((e) => e.currencyId)?.currencyId ?? '');
  return (
    <>
      <div className="mini-kpis">
        <span><strong>{sheet.total}</strong> h total</span>
        <span><strong>{sheet.billable}</strong> h billable</span>
        <span><strong>{money(billableValue, cur)}</strong> value</span>
      </div>
      <div className="table-wrap">
        <table className="grid compact">
          <thead>
            <tr>
              <th>Work</th>
              {days.map((d) => (
                <th key={d} className="n">
                  {fmtShort(d)}
                </th>
              ))}
              <th className="n">Σ</th>
            </tr>
          </thead>
          <tbody>
            {[...groups.entries()].map(([k, list]) => {
              const e = list[0]!;
              const label = e.type === 'Work' ? `${byId.project.get(e.projectId ?? '')?.name ?? ''}${e.taskId ? '' : ' · general'}` : `${e.type} · ${e.notes}`;
              return (
                <tr key={k} className={e.type !== 'Work' ? 'muted' : ''}>
                  <td>
                    {label}
                    {e.billable && <span className="pill pill-ok small">$</span>}
                  </td>
                  {days.map((d) => (
                    <td key={d} className="n">
                      {list.filter((x) => x.date === d).reduce((s, x) => s + x.hours, 0) || ''}
                    </td>
                  ))}
                  <td className="n">
                    <strong>{list.reduce((s, x) => s + x.hours, 0)}</strong>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProjectDetail({ id, closure, onNavigate }: { id: string; closure: boolean; onNavigate: Navigate }) {
  const { byId } = useData();
  const p = byId.project.get(id);
  if (!p) return null;
  const cur = byId.currency.get(p.currencyId ?? '');
  return (
    <div className="stack">
      <dl className="review-grid">
        <dt>Client</dt>
        <dd>{byId.client.get(p.clientId ?? '')?.name}</dd>
        <dt>Billing</dt>
        <dd>{p.billing}</dd>
        <dt>Budget</dt>
        <dd>
          {p.budgetHours} h{p.billing !== 'Non-billable' && ` · ${money(p.budgetAmount, cur)}`}
        </dd>
        <dt>Dates</dt>
        <dd>
          {fmtDate(p.start)} → {fmtDate(p.end)}
        </dd>
        <dt>Project manager</dt>
        <dd>{byId.resource.get(p.pmId ?? '')?.name ?? 'Not assigned'}</dd>
        {closure && (
          <>
            <dt>Delivered</dt>
            <dd>
              {Math.round(p.actualHours)} h · {money(p.billed, cur)} invoiced · {Math.round(p.percent)}% complete
            </dd>
          </>
        )}
      </dl>
      {closure && p.closureNotes && <p className="pre">{p.closureNotes}</p>}
      {closure && p.closureOverride && <p className="c-warn small">Override: {p.closureOverride}</p>}
      {!closure && p.description && <p className="pre">{p.description}</p>}
      <Button appearance="transparent" onClick={() => onNavigate({ page: 'projects', projectId: p.id, tab: closure ? 'closure' : 'overview' })}>
        Open project →
      </Button>
    </div>
  );
}

function LeaveDetail({ id }: { id: string }) {
  const { leaveTypes, now } = useData();
  const [leave, setLeave] = useState<LeaveRequest | null>(null);
  const [bal, setBal] = useState<LeaveBalance[]>([]);
  useEffect(() => {
    loadLeave()
      .then(async (all) => {
        const l = all.find((x) => x.id === id) ?? null;
        setLeave(l);
        if (l) setBal(await loadBalances(l.resourceId, new Date(now).getFullYear()));
      })
      .catch(() => undefined);
  }, [id, now]);
  if (!leave) return <Spinner size="small" />;
  const t = leaveTypes.find((x) => x.id === leave.typeId);
  const b = bal.find((x) => x.typeId === leave.typeId);
  return (
    <dl className="review-grid">
      <dt>Type</dt>
      <dd>
        <span className="leave-chip" style={{ ['--c' as string]: t?.color }}>
          {t?.code}
        </span>{' '}
        {t?.name}
      </dd>
      <dt>Dates</dt>
      <dd>
        {fmtDate(leave.from)} – {fmtDate(leave.to)} · {leave.days} day(s)
      </dd>
      <dt>Reason</dt>
      <dd>{leave.reason || '—'}</dd>
      {b && (
        <>
          <dt>Balance</dt>
          <dd>
            {b.entitled - b.used} available before this request ({b.used} used of {b.entitled})
          </dd>
        </>
      )}
    </dl>
  );
}
