import { useState } from 'react';
import { motion } from 'motion/react';
import { Button, Field, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Spinner } from '@fluentui/react-components';
import { Add16Regular, MoreHorizontal20Regular } from '@fluentui/react-icons';
import { useData } from '../../state/dataContext';
import { useToast, errorText } from '../../hooks/useToast';
import type { Navigate } from '../../state/nav';
import { GlassCard, SectionTitle } from '../../ui/GlassCard';
import { ProgressRing, StackedBar } from '../../ui/charts';
import { Bar, Empty, Status } from '../../ui/bits';
import { compact, fmtDate, fmtShort, money, parseDay, pct } from '../../lib/format';
import { createMilestone, setMilestoneStatus, TASK_STATUS, type MilestoneStatus } from '../../services/pi';
import type { ProjectData } from './Workspace';

const TASK_COLORS: Record<string, string> = { Backlog: '#64748b', 'To do': '#94a3b8', 'In progress': '#6366f1', 'In review': '#a855f7', Blocked: '#ef4444', Done: '#22c55e' };

export function OverviewTab({ d, onNavigate }: { d: ProjectData; onNavigate: Navigate }) {
  const { byId, now } = useData();
  const notify = useToast();
  const p = d.project;
  const cur = byId.currency.get(p.currencyId ?? '');
  const burn = pct(p.actualHours, p.budgetHours);
  const margin = p.recognised > 0 ? Math.round(((p.recognised - p.actualCost) / p.recognised) * 100) : null;
  const [ms, setMs] = useState({ name: '', due: '', amount: '' });
  const [adding, setAdding] = useState(false);

  // Schedule position
  const start = p.start ? parseDay(p.start).getTime() : null;
  const end = p.end ? parseDay(p.end).getTime() : null;
  const elapsed = start && end && end > start ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : null;

  const addMilestone = async () => {
    if (!ms.name.trim()) return;
    setAdding(true);
    try {
      await createMilestone(p.id, { name: ms.name.trim(), due: ms.due, amount: Number(ms.amount) || 0, order: d.milestones.length + 1 });
      setMs({ name: '', due: '', amount: '' });
      await d.reload('tasks');
    } catch (e) {
      notify('Could not add milestone', errorText(e), 'error');
    } finally {
      setAdding(false);
    }
  };

  const moveMilestone = async (id: string, status: MilestoneStatus) => {
    try {
      await setMilestoneStatus(id, status);
      await d.reload('all');
      notify(`Milestone ${status.toLowerCase()}`, status === 'Accepted' && p.billing === 'Fixed price' ? 'Revenue recognised — it can be invoiced now.' : undefined);
    } catch (e) {
      notify('Could not update milestone', errorText(e), 'error');
    }
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="kpi-grid">
        <GlassCard className="kpi kpi-ring" index={0}>
          <ProgressRing value={p.percent} size={74} stroke={8} label={`${Math.round(p.percent)}%`} />
          <div>
            <span className="kpi-label">Progress</span>
            <span className="kpi-foot muted">
              {d.tasks.filter((t) => t.status === 'Done').length} of {d.tasks.length} tasks done
            </span>
          </div>
        </GlassCard>
        <GlassCard className="kpi" index={1}>
          <span className="kpi-label">Hours burn</span>
          <span className={`kpi-value ${burn > 100 ? 'c-bad' : ''}`}>{burn}%</span>
          <Bar value={burn} tone={burn > 100 ? 'bad' : burn > 85 ? 'warn' : 'ok'} label="Hours used of budget" />
          <span className="kpi-foot muted">
            {Math.round(p.actualHours)} of {p.budgetHours} h approved
          </span>
        </GlassCard>
        <GlassCard className="kpi" index={2}>
          <span className="kpi-label">{p.billing === 'Non-billable' ? 'Cost to date' : 'Revenue recognised'}</span>
          <span className="kpi-value">{p.billing === 'Non-billable' ? compact(p.actualCost, cur) : compact(p.recognised, cur)}</span>
          <span className="kpi-foot muted">
            {p.billing === 'Non-billable' ? 'Internal project' : `${compact(p.billed, cur)} billed · ${pct(p.billed, p.recognised)}%`}
          </span>
        </GlassCard>
        <GlassCard className="kpi" index={3}>
          <span className="kpi-label">Margin</span>
          <span className={`kpi-value ${margin !== null && margin < 20 ? 'c-warn' : ''}`}>{margin === null ? '—' : `${margin}%`}</span>
          <span className="kpi-foot muted">Cost {compact(p.actualCost, cur)}</span>
        </GlassCard>
      </div>

      <div className="grid-2">
        <GlassCard index={4}>
          <SectionTitle title="Schedule" hint={`${fmtDate(p.start)} → ${fmtDate(p.end)}`} />
          {elapsed !== null ? (
            <div className="schedule">
              <div className="schedule-track">
                <motion.span className="schedule-done" initial={{ width: 0 }} animate={{ width: `${p.percent}%` }} />
                <span className="schedule-now" style={{ left: `${elapsed}%` }} title="Today" />
              </div>
              <div className="row-between small muted">
                <span>{Math.round(elapsed)}% of time elapsed</span>
                <span className={p.percent + 10 < elapsed ? 'c-warn' : 'c-ok'}>{p.percent + 10 < elapsed ? 'Behind schedule' : 'On pace'}</span>
              </div>
            </div>
          ) : (
            <p className="muted">Add start and end dates to see the schedule.</p>
          )}
          <SectionTitle title="Tasks by status" />
          <StackedBar parts={TASK_STATUS.map((s) => ({ label: s, value: d.tasks.filter((t) => t.status === s).length, color: TASK_COLORS[s]! })).filter((x) => x.value > 0)} />
          <div className="legend-inline small">
            {TASK_STATUS.map((s) => {
              const n = d.tasks.filter((t) => t.status === s).length;
              return n ? (
                <span key={s}>
                  <i style={{ background: TASK_COLORS[s] }} /> {s} {n}
                </span>
              ) : null;
            })}
          </div>
          {p.description && (
            <>
              <SectionTitle title="About" />
              <p className="pre">{p.description}</p>
            </>
          )}
          {p.tags.length > 0 && (
            <div className="row">
              {p.tags.map((t) => (
                <span key={t} className="pill pill-neutral">
                  {t}
                </span>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard index={5}>
          <SectionTitle title="Milestones" hint={p.billing === 'Fixed price' ? 'Accepted milestones are billable' : undefined} />
          {d.milestones.length === 0 && <Empty title="No milestones yet" />}
          <ol className="timeline">
            {d.milestones.map((m) => {
              const late = m.due && m.due < new Date(now).toISOString().slice(0, 10) && !['Accepted', 'Invoiced', 'Completed'].includes(m.status);
              return (
                <li key={m.id} className={`tl-item ${m.status.toLowerCase().replace(' ', '-')}`}>
                  <span className="tl-dot" />
                  <div className="grow">
                    <strong>{m.name}</strong>
                    <span className={`small block ${late ? 'c-bad' : 'muted'}`}>
                      Due {fmtShort(m.due)} {late && '· overdue'}
                      {m.amount > 0 && ` · ${money(m.amount, cur)}`}
                    </span>
                  </div>
                  <Status value={m.status} />
                  {d.canManage && m.status !== 'Invoiced' && (
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <Button appearance="subtle" size="small" icon={<MoreHorizontal20Regular />} aria-label={`Change ${m.name}`} />
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          {(['Planned', 'In progress', 'Completed', 'Accepted'] as MilestoneStatus[])
                            .filter((s) => s !== m.status)
                            .map((s) => (
                              <MenuItem key={s} onClick={() => moveMilestone(m.id, s)}>
                                Mark {s.toLowerCase()}
                              </MenuItem>
                            ))}
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                  )}
                </li>
              );
            })}
          </ol>
          {d.canManage && (
            <div className="inline-form">
              <Field label="New milestone">
                <Input value={ms.name} onChange={(_, v) => setMs({ ...ms, name: v.value })} placeholder="e.g. UAT sign-off" />
              </Field>
              <Field label="Due">
                <Input type="date" value={ms.due} onChange={(_, v) => setMs({ ...ms, due: v.value })} />
              </Field>
              {p.billing === 'Fixed price' && (
                <Field label={`Amount (${cur?.code ?? ''})`}>
                  <Input type="number" value={ms.amount} onChange={(_, v) => setMs({ ...ms, amount: v.value })} />
                </Field>
              )}
              <Button icon={adding ? <Spinner size="tiny" /> : <Add16Regular />} onClick={addMilestone} disabled={!ms.name.trim() || adding}>
                Add
              </Button>
            </div>
          )}
          <Button appearance="transparent" onClick={() => onNavigate({ page: 'projects', projectId: p.id, tab: 'activity' })}>
            See all activity →
          </Button>
        </GlassCard>
      </div>
    </div>
  );
}
