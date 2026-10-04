import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Button, Checkbox, Dropdown, Field, Input, MessageBar, MessageBarBody, Option, Spinner, Tab, TabList, Textarea } from '@fluentui/react-components';
import { CalendarAdd20Regular } from '@fluentui/react-icons';
import { useData } from '../state/dataContext';
import { useToast, errorText } from '../hooks/useToast';
import { GlassCard, SectionTitle } from '../ui/GlassCard';
import { ProgressRing } from '../ui/charts';
import { Avatar, Empty, Status } from '../ui/bits';
import { addDays, fmtShort, isoDay, parseDay } from '../lib/format';
import { applyLeave, cancelLeave, loadBalances, loadLeave, type LeaveBalance, type LeaveRequest } from '../services/pi';

export function Leave() {
  const { myself, leaveTypes, holidays, resources, byId, isPmo, now } = useData();
  const notify = useToast();
  const [tab, setTab] = useState<'mine' | 'team'>('mine');
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [mine, setMine] = useState<LeaveRequest[]>([]);
  const [all, setAll] = useState<LeaveRequest[]>([]);
  const year = new Date(now).getFullYear();
  const [f, setF] = useState({ typeId: '', from: isoDay(new Date(now + 7 * 86_400_000)), to: isoDay(new Date(now + 7 * 86_400_000)), halfStart: false, halfEnd: false, reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!myself) return Promise.resolve();
    return Promise.all([loadBalances(myself.id, year).then(setBalances), loadLeave(myself.id).then(setMine), loadLeave().then(setAll)]).then(() => undefined);
  }, [myself, year]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const type = leaveTypes.find((t) => t.id === f.typeId);
  // Client-side preview of the server's day count (weekends & holidays skipped unless calendar-day leave)
  const days = useMemo(() => {
    if (!f.from || !f.to || f.to < f.from) return 0;
    let n = 0;
    for (let d = parseDay(f.from); isoDay(d) <= f.to; d = addDays(d, 1)) {
      const iso = isoDay(d);
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      const holiday = holidays.some((h) => h.date === iso && (!h.location || h.location === myself?.location));
      if (!type?.calendarDays && (weekend || holiday)) continue;
      let frac = 1;
      if (iso === f.from && f.halfStart) frac = 0.5;
      if (iso === f.to && f.halfEnd) frac = Math.min(frac, 0.5);
      n += frac;
    }
    return n;
  }, [f, holidays, type, myself]);

  const bal = (typeId: string) => balances.find((b) => b.typeId === typeId);
  const available = (typeId: string) => {
    const t = leaveTypes.find((x) => x.id === typeId);
    const b = bal(typeId);
    return t?.unlimited ? Infinity : b ? b.entitled - b.used - b.pending : (t?.quota ?? 0);
  };

  const apply = async () => {
    if (!myself || !f.typeId) return;
    setBusy(true);
    setError('');
    try {
      await applyLeave({ resourceId: myself.id, ...f });
      await load();
      notify('Leave requested', `${byId.resource.get(myself.managerId ?? '')?.name ?? 'Your manager'} will approve it. Your timesheets update automatically.`);
      setF({ ...f, reason: '' });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (l: LeaveRequest) => {
    try {
      await cancelLeave(l.id);
      await load();
      notify('Leave cancelled', l.status === 'Approved' ? 'Days returned to your balance and timesheets updated.' : undefined);
    } catch (e) {
      notify('Could not cancel', errorText(e), 'error');
    }
  };

  // Team calendar: my reports (or everyone for PMO)
  const team = resources.filter((r) => r.active && (isPmo || r.managerId === myself?.id || r.id === myself?.id));
  const month = new Date(now);
  const monthDays = Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, i) => isoDay(new Date(month.getFullYear(), month.getMonth(), i + 1)));

  if (!myself) return <Empty title="Your user isn’t linked to a person yet" />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Leave</h1>
          <p className="muted">Balances for {year} · approved leave fills your timesheets automatically</p>
        </div>
        <TabList selectedValue={tab} onTabSelect={(_, v) => setTab(v.value as 'mine' | 'team')}>
          <Tab value="mine">My leave</Tab>
          <Tab value="team">Team calendar</Tab>
        </TabList>
      </div>

      {tab === 'mine' ? (
        <>
          <div className="balance-grid">
            {leaveTypes.map((t, i) => {
              const b = bal(t.id);
              const entitled = b?.entitled ?? t.quota;
              const used = b?.used ?? 0;
              const pending = b?.pending ?? 0;
              return (
                <motion.div key={t.id} className="balance glass" style={{ ['--c' as string]: t.color }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  {t.unlimited ? (
                    <span className="balance-ring-alt">∞</span>
                  ) : (
                    <ProgressRing value={entitled ? ((entitled - used - pending) / entitled) * 100 : 0} size={64} stroke={7} label={`${Math.max(0, entitled - used - pending)}`} />
                  )}
                  <div>
                    <strong>{t.name}</strong>
                    <span className="muted small block">{t.unlimited ? 'No balance limit' : `${used} used · ${pending} pending · ${entitled} / yr`}</span>
                    {t.calendarDays && <span className="pill pill-neutral small">calendar days</span>}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="grid-2">
            <GlassCard>
              <SectionTitle title="Apply for leave" />
              <div className="form-grid">
                <Field label="Type" required className="span2">
                  <Dropdown placeholder="Choose leave type" value={type?.name ?? ''} selectedOptions={f.typeId ? [f.typeId] : []} onOptionSelect={(_, v) => v.optionValue && setF({ ...f, typeId: v.optionValue })}>
                    {leaveTypes.map((t) => (
                      <Option key={t.id} value={t.id} text={t.name}>
                        <span className="dot" style={{ background: t.color }} /> {t.name}{' '}
                        <span className="muted small">· {t.unlimited ? 'no limit' : `${available(t.id)} left`}</span>
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
                <Field label="From">
                  <Input type="date" value={f.from} onChange={(_, v) => setF({ ...f, from: v.value, to: v.value > f.to ? v.value : f.to })} />
                </Field>
                <Field label="To">
                  <Input type="date" value={f.to} onChange={(_, v) => setF({ ...f, to: v.value })} />
                </Field>
                <Checkbox label="Half day on the first day" checked={f.halfStart} onChange={(_, v) => setF({ ...f, halfStart: !!v.checked })} />
                <Checkbox label="Half day on the last day" checked={f.halfEnd} onChange={(_, v) => setF({ ...f, halfEnd: !!v.checked })} />
                <Field label="Reason" className="span2">
                  <Textarea value={f.reason} onChange={(_, v) => setF({ ...f, reason: v.value })} rows={2} />
                </Field>
              </div>
              <div className="leave-preview">
                <strong className="tabular">{days}</strong>
                <span className="muted">
                  day{days === 1 ? '' : 's'} {type?.calendarDays ? '(calendar days)' : '(working days, holidays excluded)'}
                  {type && !type.unlimited && days > available(type.id) && <span className="c-bad"> · more than your balance</span>}
                </span>
                <span className="grow" />
                <Button appearance="primary" icon={busy ? <Spinner size="tiny" /> : <CalendarAdd20Regular />} disabled={!f.typeId || days <= 0 || busy} onClick={apply}>
                  Request leave
                </Button>
              </div>
              {error && (
                <MessageBar intent="error">
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}
            </GlassCard>

            <GlassCard>
              <SectionTitle title="My requests" />
              {mine.length === 0 && <Empty title="No leave yet this year" />}
              <ul className="list">
                {mine.map((l) => {
                  const t = leaveTypes.find((x) => x.id === l.typeId);
                  return (
                    <li key={l.id} className="list-row">
                      <span className="leave-chip" style={{ ['--c' as string]: t?.color }}>
                        {t?.code}
                      </span>
                      <span className="grow">
                        {fmtShort(l.from)}
                        {l.to !== l.from && ` – ${fmtShort(l.to)}`} · {l.days} day{l.days === 1 ? '' : 's'}
                        <span className="muted small block">{l.comments ? `“${l.comments}”` : l.reason}</span>
                      </span>
                      <Status value={l.status === 'Submitted' ? 'Pending' : l.status} />
                      {(l.status === 'Submitted' || (l.status === 'Approved' && l.to >= isoDay(new Date(now)))) && (
                        <Button size="small" appearance="subtle" onClick={() => cancel(l)}>
                          Cancel
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </GlassCard>
          </div>
        </>
      ) : (
        <GlassCard padded={false} className="cal-wrap">
          <table className="cal">
            <thead>
              <tr>
                <th className="cal-person">{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</th>
                {monthDays.map((d) => {
                  const dt = parseDay(d);
                  const wk = dt.getDay() === 0 || dt.getDay() === 6;
                  return (
                    <th key={d} className={`${wk ? 'weekend' : ''} ${d === isoDay(new Date(now)) ? 'today' : ''}`}>
                      {dt.getDate()}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {team.map((r) => (
                <tr key={r.id}>
                  <td className="cal-person">
                    <Avatar name={r.name} color={r.color} size={22} /> {r.name}
                  </td>
                  {monthDays.map((d) => {
                    const dt = parseDay(d);
                    const wk = dt.getDay() === 0 || dt.getDay() === 6;
                    const hol = holidays.find((h) => h.date === d && (!h.location || h.location === r.location));
                    const l = all.find((x) => x.resourceId === r.id && (x.status === 'Approved' || x.status === 'Submitted') && x.from <= d && x.to >= d);
                    const t = l && leaveTypes.find((x) => x.id === l.typeId);
                    return (
                      <td
                        key={d}
                        className={`${wk ? 'weekend' : ''} ${hol ? 'holiday' : ''} ${l ? `leave ${l.status === 'Submitted' ? 'pending' : ''}` : ''}`}
                        style={t ? { ['--c' as string]: t.color } : undefined}
                        title={hol ? hol.name : l ? `${t?.name} (${l.status === 'Submitted' ? 'pending' : 'approved'})` : undefined}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cal-legend small muted">
            <span><i className="holiday" /> Holiday</span>
            {leaveTypes.slice(0, 5).map((t) => (
              <span key={t.id}>
                <i style={{ background: t.color }} /> {t.code}
              </span>
            ))}
            <span><i className="pending" /> Pending</span>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
