import { useState } from 'react';
import { Button, Field, Input, Spinner, Tab, TabList } from '@fluentui/react-components';
import { Add20Regular, Save20Regular } from '@fluentui/react-icons';
import { useData } from '../state/dataContext';
import { useToast, errorText } from '../hooks/useToast';
import { GlassCard, SectionTitle } from '../ui/GlassCard';
import { fmtDate, money } from '../lib/format';
import { saveHoliday, saveRole } from '../services/pi';

export function Settings() {
  const { roles, clients, holidays, leaveTypes, byId, refresh } = useData();
  const notify = useToast();
  const [tab, setTab] = useState<'rates' | 'clients' | 'holidays' | 'leave'>('rates');
  const [edit, setEdit] = useState<Record<string, { bill: string; cost: string }>>({});
  const [busy, setBusy] = useState('');
  const [hol, setHol] = useState({ name: '', date: '', location: '' });
  const inr = byId.currency.get([...byId.currency.values()].find((c) => c.code === 'INR')?.id ?? '');

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      await refresh('all');
      notify(ok);
    } catch (e) {
      notify('Not saved', errorText(e), 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Company-wide rate card, clients, holiday calendar and leave policy</p>
        </div>
        <TabList selectedValue={tab} onTabSelect={(_, v) => setTab(v.value as typeof tab)}>
          <Tab value="rates">Rate card</Tab>
          <Tab value="clients">Clients</Tab>
          <Tab value="holidays">Holidays</Tab>
          <Tab value="leave">Leave policy</Tab>
        </TabList>
      </div>

      {tab === 'rates' && (
        <GlassCard padded={false}>
          <div className="pad">
            <SectionTitle title="Rate card (INR / hour)" hint="Projects in other currencies convert at the current exchange rate unless they set their own rate" />
          </div>
          <table className="grid">
            <thead>
              <tr>
                <th>Role</th>
                <th className="n">Bill rate</th>
                <th className="n">Cost rate</th>
                <th className="n">Margin</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => {
                const e = edit[r.id];
                const bill = e ? Number(e.bill) || 0 : r.billRate;
                const cost = e ? Number(e.cost) || 0 : r.costRate;
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="role-chip" style={{ ['--c' as string]: r.color }}>
                        {r.name}
                      </span>
                    </td>
                    <td className="n">
                      <Input size="small" className="rate-input" type="number" value={e?.bill ?? String(r.billRate)} onChange={(_, v) => setEdit({ ...edit, [r.id]: { bill: v.value, cost: e?.cost ?? String(r.costRate) } })} />
                    </td>
                    <td className="n">
                      <Input size="small" className="rate-input" type="number" value={e?.cost ?? String(r.costRate)} onChange={(_, v) => setEdit({ ...edit, [r.id]: { bill: e?.bill ?? String(r.billRate), cost: v.value } })} />
                    </td>
                    <td className="n">{bill > 0 ? `${Math.round(((bill - cost) / bill) * 100)}%` : '—'}</td>
                    <td>
                      <Button
                        size="small"
                        icon={busy === r.id ? <Spinner size="tiny" /> : <Save20Regular />}
                        disabled={!e || !!busy}
                        onClick={() =>
                          run(r.id, async () => {
                            await saveRole({ id: r.id, name: r.name, billRate: bill, costRate: cost, color: r.color });
                            setEdit((cur) => {
                              const next = { ...cur };
                              delete next[r.id];
                              return next;
                            });
                          }, `${r.name} rates saved`)
                        }
                      >
                        Save
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small pad">New rates apply to timesheets submitted from now on — already-submitted time keeps the rate it was snapshotted with.</p>
        </GlassCard>
      )}

      {tab === 'clients' && (
        <div className="people-grid">
          {clients.map((c) => {
            const cur = byId.currency.get(c.currencyId);
            return (
              <GlassCard key={c.id}>
                <div className="row">
                  <span className="dot big" style={{ background: c.color }} />
                  <div>
                    <strong>{c.name}</strong>
                    <span className="muted small block">{c.legalName}</span>
                  </div>
                </div>
                <dl className="review-grid small">
                  <dt>Currency</dt>
                  <dd>
                    {cur?.code} {cur && cur.code !== 'INR' && <span className="muted">· 1 INR = {cur.rate} {cur.code}</span>}
                  </dd>
                  <dt>Tax</dt>
                  <dd>
                    {c.taxRate}% {c.gstin && `· ${c.gstin}`}
                  </dd>
                  <dt>Terms</dt>
                  <dd>{c.termsDays} days</dd>
                  <dt>Billing</dt>
                  <dd>
                    {c.contact} {c.billingEmail && `· ${c.billingEmail}`}
                  </dd>
                </dl>
              </GlassCard>
            );
          })}
        </div>
      )}

      {tab === 'holidays' && (
        <div className="grid-2">
          <GlassCard>
            <SectionTitle title={`Holiday calendar · ${holidays.length}`} hint="Pre-filled into everyone’s timesheet" />
            <ul className="list">
              {holidays.map((h) => (
                <li key={h.id} className="list-row">
                  <span className="holiday-chip">🎉</span>
                  <span className="grow">
                    {h.name}
                    <span className="muted small block">{h.location ? `${h.location} only` : 'All locations'}</span>
                  </span>
                  <span className="muted">{fmtDate(h.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
          <GlassCard>
            <SectionTitle title="Add a holiday" />
            <div className="stack">
              <Field label="Name">
                <Input value={hol.name} onChange={(_, v) => setHol({ ...hol, name: v.value })} placeholder="e.g. Founders’ Day" />
              </Field>
              <Field label="Date">
                <Input type="date" value={hol.date} onChange={(_, v) => setHol({ ...hol, date: v.value })} />
              </Field>
              <Field label="Location" hint="Leave blank for all offices">
                <Input value={hol.location} onChange={(_, v) => setHol({ ...hol, location: v.value })} />
              </Field>
              <Button
                appearance="primary"
                icon={busy === 'hol' ? <Spinner size="tiny" /> : <Add20Regular />}
                disabled={!hol.name || !hol.date || !!busy}
                onClick={() =>
                  run('hol', async () => {
                    await saveHoliday(hol);
                    setHol({ name: '', date: '', location: '' });
                  }, 'Holiday added')
                }
              >
                Add holiday
              </Button>
            </div>
          </GlassCard>
        </div>
      )}

      {tab === 'leave' && (
        <GlassCard padded={false}>
          <table className="grid">
            <thead>
              <tr>
                <th>Leave type</th>
                <th className="n">Days / year</th>
                <th>Paid</th>
                <th>Counts</th>
                <th className="n">Max at a time</th>
              </tr>
            </thead>
            <tbody>
              {leaveTypes.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className="leave-chip" style={{ ['--c' as string]: t.color }}>
                      {t.code}
                    </span>{' '}
                    {t.name}
                  </td>
                  <td className="n">{t.unlimited ? 'No limit' : t.quota}</td>
                  <td>{t.paid ? 'Paid' : 'Unpaid'}</td>
                  <td>{t.calendarDays ? 'Calendar days' : 'Working days'}</td>
                  <td className="n">{t.maxConsecutive || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {inr && <p className="muted small pad">Example: a role billed at {money(4500, inr)}/h earns {money(4500 * 8, inr)} a day.</p>}
        </GlassCard>
      )}
    </div>
  );
}
