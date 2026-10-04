import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button, Dropdown, MessageBar, MessageBarBody, Option, Spinner, Switch, Tooltip } from '@fluentui/react-components';
import {
  Add20Regular, ArrowUndo20Regular, ChevronLeft20Regular, ChevronRight20Regular, Copy20Regular, Delete20Regular, LockClosed16Regular, Send20Regular,
} from '@fluentui/react-icons';
import { useData } from '../state/dataContext';
import { useToast, errorText } from '../hooks/useToast';
import { GlassCard } from '../ui/GlassCard';
import { Bar, Empty, Status } from '../ui/bits';
import { Confetti } from '../ui/Confetti';
import { addDays, fmtShort, isoDay, mondayOf, parseDay, weekDays } from '../lib/format';
import { loadEntries, loadTasks, openWeek, saveEntry, setSheetStatus, type Task, type TimeEntry, type Timesheet as Sheet } from '../services/pi';

interface Row {
  key: string;
  projectId: string;
  taskId: string;
  billable: boolean;
  cells: Record<string, { id?: string; hours: number }>;
}

const rowKey = (p: string, t: string, b: boolean) => `${p}|${t}|${b ? 1 : 0}`;
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function Timesheet() {
  const { myself, projects, members, byId, leaveTypes, now } = useData();
  const notify = useToast();
  const [week, setWeek] = useState(() => isoDay(mondayOf(new Date())));
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadedWeek, setLoadedWeek] = useState('');
  const [saving, setSaving] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [party, setParty] = useState(false);
  const days = weekDays(week);
  const loading = loadedWeek !== week;
  const editable = !loading && (sheet?.status === 'Draft' || sheet?.status === 'Rejected');

  const load = useCallback(() => {
    if (!myself) return Promise.resolve();
    return openWeek(myself.id, week)
      .then(async (s) => {
        const [e, t] = await Promise.all([loadEntries({ timesheetId: s.id }), loadTasks(undefined, undefined)]);
        setSheet(s);
        setEntries(e);
        setTasks(t);
        const map = new Map<string, Row>();
        for (const x of e.filter((y) => y.type === 'Work' && y.projectId)) {
          const k = rowKey(x.projectId!, x.taskId ?? '', x.billable);
          const r = map.get(k) ?? { key: k, projectId: x.projectId!, taskId: x.taskId ?? '', billable: x.billable, cells: {} };
          r.cells[x.date] = { id: x.id, hours: (r.cells[x.date]?.hours ?? 0) + x.hours };
          map.set(k, r);
        }
        setRows([...map.values()]);
        setError('');
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setLoadedWeek(week));
  }, [myself, week]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  // Projects I can log to this week: active, and I'm a non-viewer member on any day of the week
  const myProjects = useMemo(() => {
    if (!myself) return [];
    const ids = new Set(
      members
        .filter((m) => m.resourceId === myself.id && m.active && m.access !== 'Viewer' && (m.from ?? '0000') <= days[6]! && (m.to ?? '9999') >= days[0]!)
        .map((m) => m.projectId),
    );
    for (const p of projects ?? []) if (p.pmId === myself.id) ids.add(p.id);
    return (projects ?? []).filter((p) => ids.has(p.id) && (p.status === 'Active' || p.status === 'Closing'));
  }, [members, myself, projects, days]);

  const locked = entries.filter((e) => e.type !== 'Work');
  const lockedByDay = (d: string) => locked.filter((e) => e.date === d).reduce((s, e) => s + e.hours, 0);
  const workByDay = (d: string) => rows.reduce((s, r) => s + (r.cells[d]?.hours ?? 0), 0);
  const total = days.reduce((s, d) => s + workByDay(d) + lockedByDay(d), 0);
  const expected = myself?.capacity ?? 40;

  const setCell = async (row: Row, day: string, value: string) => {
    if (!sheet) return;
    const hours = Math.max(0, Math.min(24, Number(value) || 0));
    const prev = row.cells[day];
    if ((prev?.hours ?? 0) === hours) return;
    setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, cells: { ...r.cells, [day]: { id: prev?.id, hours } } } : r)));
    setSaving((n) => n + 1);
    try {
      const p = byId.project.get(row.projectId);
      const id = await saveEntry({ id: prev?.id, timesheetId: sheet.id, projectId: row.projectId, taskId: row.taskId || undefined, date: day, hours, billable: row.billable, name: `${p?.name ?? 'Work'} · ${fmtShort(day)}` });
      setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, cells: { ...r.cells, [day]: { id: id || undefined, hours } } } : r)));
    } catch (e) {
      notify('Hours not saved', errorText(e), 'error');
      setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, cells: { ...r.cells, [day]: prev ?? { hours: 0 } } } : r)));
    } finally {
      setSaving((n) => n - 1);
    }
  };

  const addRow = () => {
    const p = myProjects[0];
    if (!p) return;
    setRows((rs) => [...rs, { key: `new-${Date.now()}`, projectId: p.id, taskId: '', billable: p.billing !== 'Non-billable', cells: {} }]);
  };

  const changeRow = (row: Row, patch: Partial<Row>) => {
    if (Object.values(row.cells).some((c) => c.id)) return notify('Clear the hours first', 'Changing project or task applies to new rows only.', 'warning');
    setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, ...patch } : r)));
  };

  const removeRow = async (row: Row) => {
    for (const d of days) if (row.cells[d]?.id) await setCell(row, d, '0');
    setRows((rs) => rs.filter((r) => r.key !== row.key));
  };

  const copyLastWeek = async () => {
    if (!myself || !sheet) return;
    setBusy('copy');
    try {
      const prev = isoDay(addDays(parseDay(week), -7));
      const prevSheet = await openWeek(myself.id, prev);
      const prevEntries = (await loadEntries({ timesheetId: prevSheet.id })).filter((e) => e.type === 'Work' && e.projectId);
      const lockedDays = new Set(locked.map((e) => e.date));
      for (const e of prevEntries) {
        const date = isoDay(addDays(parseDay(e.date), 7));
        if (lockedDays.has(date)) continue;
        await saveEntry({ timesheetId: sheet.id, projectId: e.projectId!, taskId: e.taskId, date, hours: e.hours, billable: e.billable, name: `${byId.project.get(e.projectId!)?.name ?? 'Work'} · ${fmtShort(date)}` });
      }
      await load();
      notify('Copied last week', `${prevEntries.length} entries — adjust anything that changed.`);
    } catch (e) {
      notify('Copy failed', errorText(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const submit = async (to: 'Submitted' | 'Draft') => {
    if (!sheet) return;
    setBusy(to);
    setError('');
    try {
      await setSheetStatus(sheet.id, to);
      await load();
      if (to === 'Submitted') {
        setParty(true);
        notify('Timesheet submitted', `${byId.resource.get(sheet.approverId ?? '')?.name ?? 'Your manager'} will approve it.`);
      } else notify('Timesheet recalled', 'You can edit it again.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };

  if (!myself) return <Empty title="Your user isn’t linked to a person yet">Ask a PMO admin to link your account in People.</Empty>;
  const today = isoDay(new Date(now));

  return (
    <div className="page">
      <Confetti fire={party} onDone={() => setParty(false)} />
      <div className="page-head">
        <div>
          <h1>Timesheet</h1>
          <p className="muted">
            Week of {fmtShort(days[0])} – {fmtShort(days[6])} {sheet && <Status value={sheet.status} />}
          </p>
        </div>
        <div className="row">
          <Button icon={<ChevronLeft20Regular />} aria-label="Previous week" onClick={() => setWeek(isoDay(addDays(parseDay(week), -7)))} />
          <Button onClick={() => setWeek(isoDay(mondayOf(new Date())))}>This week</Button>
          <Button icon={<ChevronRight20Regular />} aria-label="Next week" onClick={() => setWeek(isoDay(addDays(parseDay(week), 7)))} />
        </div>
      </div>

      <GlassCard className="ts-summary">
        <div className="ts-total">
          <strong className="tabular">{total.toFixed(1)}</strong>
          <span className="muted">of {expected} h</span>
        </div>
        <Bar value={total} max={expected} tone={total >= expected ? 'ok' : 'brand'} label="Hours logged this week" />
        <span className="muted small">
          {saving > 0 ? (
            <>
              <Spinner size="extra-tiny" /> Saving…
            </>
          ) : (
            'All changes saved'
          )}
        </span>
        <span className="grow" />
        {editable && (
          <>
            <Button icon={busy === 'copy' ? <Spinner size="tiny" /> : <Copy20Regular />} onClick={copyLastWeek} disabled={!!busy || rows.some((r) => Object.keys(r.cells).length)}>
              Copy last week
            </Button>
            <Button appearance="primary" icon={busy === 'Submitted' ? <Spinner size="tiny" /> : <Send20Regular />} onClick={() => submit('Submitted')} disabled={!!busy || saving > 0}>
              Submit
            </Button>
          </>
        )}
        {sheet?.status === 'Submitted' && (
          <Button icon={busy === 'Draft' ? <Spinner size="tiny" /> : <ArrowUndo20Regular />} onClick={() => submit('Draft')} disabled={!!busy}>
            Recall
          </Button>
        )}
      </GlassCard>

      {sheet?.status === 'Rejected' && sheet.comments && (
        <MessageBar intent="warning">
          <MessageBarBody>Sent back by {byId.resource.get(sheet.approverId ?? '')?.name}: “{sheet.comments}”. Fix and resubmit.</MessageBarBody>
        </MessageBar>
      )}
      {sheet?.status === 'Approved' && (
        <MessageBar intent="success">
          <MessageBarBody>{sheet.comments || 'Approved'} — this week is locked.</MessageBarBody>
        </MessageBar>
      )}
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {loading ? (
        <GlassCard>
          <Spinner label="Opening your week…" />
        </GlassCard>
      ) : (
        <GlassCard padded={false} className="ts-grid-wrap">
          <table className="ts-grid">
            <thead>
              <tr>
                <th className="ts-row-head">Project / task</th>
                {days.map((d, i) => (
                  <th key={d} className={`ts-day ${d === today ? 'today' : ''} ${i >= 5 ? 'weekend' : ''}`}>
                    <span>{DAY[i]}</span>
                    <span className="muted small">{parseDay(d).getDate()}</span>
                  </th>
                ))}
                <th className="n">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {/* Holidays and leave come from the calendar / approved leave and are locked */}
              {['Holiday', 'Leave'].map((type) => {
                const rowsOf = locked.filter((e) => e.type === type);
                if (!rowsOf.length) return null;
                const groups = new Map<string, TimeEntry[]>();
                for (const e of rowsOf) groups.set(e.leaveTypeId ?? e.notes, [...(groups.get(e.leaveTypeId ?? e.notes) ?? []), e]);
                return [...groups.entries()].map(([k, list]) => {
                  const lt = leaveTypes.find((t) => t.id === k);
                  return (
                    <tr key={`${type}-${k}`} className={`ts-locked ${type.toLowerCase()}`}>
                      <td className="ts-row-head">
                        <span className="locked-chip" style={{ ['--c' as string]: type === 'Holiday' ? '#22d3ee' : (lt?.color ?? '#a855f7') }}>
                          <LockClosed16Regular /> {type === 'Holiday' ? `Holiday · ${list[0]!.notes}` : `${lt?.name ?? 'Leave'}`}
                        </span>
                      </td>
                      {days.map((d) => (
                        <td key={d} className="ts-cell locked">
                          {list.filter((e) => e.date === d).reduce((s, e) => s + e.hours, 0) || ''}
                        </td>
                      ))}
                      <td className="n">{list.reduce((s, e) => s + e.hours, 0)}</td>
                      <td />
                    </tr>
                  );
                });
              })}
              <AnimatePresence initial={false}>
                {rows.map((r) => {
                  const p = byId.project.get(r.projectId);
                  const projectTasks = tasks.filter((t) => t.projectId === r.projectId && t.status !== 'Done' && (!t.assigneeId || t.assigneeId === myself.id));
                  return (
                    <motion.tr key={r.key} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ ['--accent' as string]: p?.color }}>
                      <td className="ts-row-head">
                        <div className="ts-pickers">
                          <Dropdown
                            size="small"
                            aria-label="Project"
                            disabled={!editable}
                            value={p?.name ?? ''}
                            selectedOptions={[r.projectId]}
                            onOptionSelect={(_, v) => v.optionValue && changeRow(r, { projectId: v.optionValue, taskId: '', key: rowKey(v.optionValue, '', r.billable) })}
                          >
                            {myProjects.map((x) => (
                              <Option key={x.id} value={x.id} text={x.name}>
                                <span className="dot" style={{ background: x.color }} /> {x.name}
                              </Option>
                            ))}
                          </Dropdown>
                          <Dropdown
                            size="small"
                            aria-label="Task"
                            disabled={!editable}
                            placeholder="General"
                            value={tasks.find((t) => t.id === r.taskId)?.title ?? ''}
                            selectedOptions={r.taskId ? [r.taskId] : []}
                            onOptionSelect={(_, v) => changeRow(r, { taskId: v.optionValue ?? '', key: rowKey(r.projectId, v.optionValue ?? '', r.billable) })}
                          >
                            <Option value="">General</Option>
                            {projectTasks.map((t) => (
                              <Option key={t.id} value={t.id}>
                                {t.title}
                              </Option>
                            ))}
                          </Dropdown>
                          {p?.billing !== 'Non-billable' && (
                            <Tooltip content="Billable to the client" relationship="label">
                              <Switch disabled={!editable} checked={r.billable} onChange={(_, v) => changeRow(r, { billable: v.checked, key: rowKey(r.projectId, r.taskId, v.checked) })} label="$" />
                            </Tooltip>
                          )}
                        </div>
                      </td>
                      {days.map((d, i) => (
                        <td key={d} className={`ts-cell ${i >= 5 ? 'weekend' : ''}`}>
                          <input
                            className="ts-input"
                            inputMode="decimal"
                            aria-label={`${p?.name} ${DAY[i]}`}
                            disabled={!editable}
                            defaultValue={r.cells[d]?.hours || ''}
                            key={`${r.key}-${d}-${r.cells[d]?.hours ?? 0}`}
                            onBlur={(e) => setCell(r, d, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          />
                        </td>
                      ))}
                      <td className="n">
                        <strong>{days.reduce((s, d) => s + (r.cells[d]?.hours ?? 0), 0) || ''}</strong>
                      </td>
                      <td>
                        {editable && <Button size="small" appearance="subtle" icon={<Delete20Regular />} aria-label="Remove row" onClick={() => removeRow(r)} />}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
            <tfoot>
              <tr>
                <td className="ts-row-head">
                  {editable && (
                    <Button appearance="subtle" icon={<Add20Regular />} onClick={addRow} disabled={!myProjects.length}>
                      Add row
                    </Button>
                  )}
                  {!myProjects.length && <span className="muted small"> You aren’t assigned to an active project this week.</span>}
                </td>
                {days.map((d, i) => {
                  const v = workByDay(d) + lockedByDay(d);
                  return (
                    <td key={d} className={`n ts-daytotal ${i < 5 && v < (expected / 5) - 0.01 && d <= today ? 'short' : ''} ${v > 12 ? 'long' : ''}`}>
                      {v || ''}
                    </td>
                  );
                })}
                <td className="n">
                  <strong>{total.toFixed(1)}</strong>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </GlassCard>
      )}
      <p className="muted small">
        Holidays and approved leave are filled in for you. A full week of leave (like maternity leave) is approved automatically — no timesheet needed.
      </p>
    </div>
  );
}
