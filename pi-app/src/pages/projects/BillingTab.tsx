import { useState } from 'react';
import { Button, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, Spinner, Textarea } from '@fluentui/react-components';
import { DocumentAdd20Regular } from '@fluentui/react-icons';
import { useData } from '../../state/dataContext';
import { useToast, errorText } from '../../hooks/useToast';
import { GlassCard, SectionTitle } from '../../ui/GlassCard';
import { Empty, Status } from '../../ui/bits';
import { compact, fmtShort, isoDay, money } from '../../lib/format';
import { createInvoice, type Invoice } from '../../services/pi';
import { InvoiceView } from '../../components/InvoiceView';
import type { ProjectData } from './Workspace';

export function BillingTab({ d }: { d: ProjectData }) {
  const { byId, isFinance, now } = useData();
  const p = d.project;
  const cur = byId.currency.get(p.currencyId ?? '');
  const [gen, setGen] = useState(false);
  const [view, setView] = useState<Invoice | null>(null);
  const canBill = (isFinance || d.canManage) && p.billing !== 'Non-billable';

  const wip = d.entries.filter((e) => e.type === 'Work' && e.status === 'Approved' && e.amount > 0 && !e.invoiceLineId);
  const wipValue = wip.reduce((s, e) => s + e.amount, 0);
  const accepted = d.milestones.filter((m) => m.status === 'Accepted');
  const outstanding = d.invoices.filter((i) => i.status === 'Sent' && (i.dueOn ?? '9999') < isoDay(new Date(now)));

  if (p.billing === 'Non-billable') return <Empty title="Internal project">Non-billable projects don’t raise invoices. Cost is tracked from approved time.</Empty>;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="kpi-grid">
        <GlassCard className="kpi">
          <span className="kpi-label">Ready to bill</span>
          <span className="kpi-value">{p.billing === 'Fixed price' ? compact(accepted.reduce((s, m) => s + m.amount, 0), cur) : p.billing === 'Retainer' ? compact(p.retainerFee, cur) : compact(wipValue, cur)}</span>
          <span className="kpi-foot muted">
            {p.billing === 'Fixed price' ? `${accepted.length} accepted milestone(s)` : p.billing === 'Retainer' ? 'per month' : `${wip.reduce((s, e) => s + e.hours, 0).toFixed(1)} approved hours`}
          </span>
        </GlassCard>
        <GlassCard className="kpi">
          <span className="kpi-label">Invoiced</span>
          <span className="kpi-value">{compact(p.billed, cur)}</span>
          <span className="kpi-foot muted">{d.invoices.filter((i) => i.status !== 'Cancelled').length} invoice(s)</span>
        </GlassCard>
        <GlassCard className="kpi">
          <span className="kpi-label">Paid</span>
          <span className="kpi-value">{compact(d.invoices.filter((i) => i.status === 'Paid').reduce((s, i) => s + i.total, 0), cur)}</span>
          <span className="kpi-foot muted">{outstanding.length ? <span className="c-bad">{outstanding.length} overdue</span> : 'Nothing overdue'}</span>
        </GlassCard>
        <GlassCard className="kpi">
          <span className="kpi-label">Recognised revenue</span>
          <span className="kpi-value">{compact(p.recognised, cur)}</span>
          <span className="kpi-foot muted">{cur?.code} · {byId.client.get(p.clientId ?? '')?.taxRate ?? 0}% tax on invoices</span>
        </GlassCard>
      </div>

      <GlassCard padded={false}>
        <div className="pad">
          <SectionTitle
            title="Invoices"
            action={
              canBill && (
                <Button appearance="primary" icon={<DocumentAdd20Regular />} onClick={() => setGen(true)}>
                  Generate invoice
                </Button>
              )
            }
          />
        </div>
        {d.invoices.length === 0 ? (
          <Empty title="No invoices yet" />
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Period</th>
                <th>Status</th>
                <th className="n">Lines</th>
                <th className="n">Subtotal</th>
                <th className="n">Tax</th>
                <th className="n">Total</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {d.invoices.map((i) => (
                <tr key={i.id} className="clickable" onClick={() => setView(i)}>
                  <td className="mono">{i.number}</td>
                  <td>
                    {fmtShort(i.from)} – {fmtShort(i.to)}
                  </td>
                  <td><Status value={i.status} /></td>
                  <td className="n">{i.lines}</td>
                  <td className="n">{money(i.subtotal, cur)}</td>
                  <td className="n muted">{money(i.tax, cur)}</td>
                  <td className="n">
                    <strong>{money(i.total, cur)}</strong>
                  </td>
                  <td className={i.status === 'Sent' && (i.dueOn ?? '9999') < isoDay(new Date(now)) ? 'c-bad' : ''}>{fmtShort(i.dueOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>

      {gen && <GenerateDialog d={d} onClose={() => setGen(false)} onCreated={(inv) => { setGen(false); setView(inv); }} />}
      {view && <InvoiceView invoice={view} onClose={() => setView(null)} onChanged={() => d.reload('billing')} />}
    </div>
  );
}

function GenerateDialog({ d, onClose, onCreated }: { d: ProjectData; onClose: () => void; onCreated: (i: Invoice) => void }) {
  const { now, refresh } = useData();
  const notify = useToast();
  const n = new Date(now);
  const [from, setFrom] = useState(isoDay(new Date(n.getFullYear(), n.getMonth() - 1, 1)));
  const [to, setTo] = useState(isoDay(new Date(n.getFullYear(), n.getMonth(), 0)));
  const [inc, setInc] = useState({ time: true, milestones: true, retainer: true });
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      const inv = await createInvoice(d.project.id, from, to, inc, notes);
      await Promise.all([d.reload('billing'), refresh('projects')]);
      notify(`Invoice ${inv.number} drafted`, `${inv.lines} line(s) — review and approve it.`);
      onCreated(inv);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(_, v) => !v.open && !busy && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Generate invoice</DialogTitle>
          <DialogContent className="stack">
            <p className="muted small">
              The engine collects everything billable in the period and never bills anything twice: approved time (grouped by role and rate), accepted milestones and retainer
              months. Client tax and currency are applied automatically.
            </p>
            <div className="form-grid">
              <Field label="From">
                <Input type="date" value={from} onChange={(_, v) => setFrom(v.value)} />
              </Field>
              <Field label="To">
                <Input type="date" value={to} onChange={(_, v) => setTo(v.value)} />
              </Field>
            </div>
            <div className="row">
              {d.project.billing === 'Time & materials' && <Checkbox label="Approved time" checked={inc.time} onChange={(_, v) => setInc({ ...inc, time: !!v.checked })} />}
              {d.project.billing === 'Fixed price' && <Checkbox label="Accepted milestones" checked={inc.milestones} onChange={(_, v) => setInc({ ...inc, milestones: !!v.checked })} />}
              {d.project.billing === 'Retainer' && <Checkbox label="Retainer months" checked={inc.retainer} onChange={(_, v) => setInc({ ...inc, retainer: !!v.checked })} />}
            </div>
            <Field label="Notes on the invoice">
              <Textarea value={notes} onChange={(_, v) => setNotes(v.value)} rows={2} placeholder="e.g. PO 4500012345" />
            </Field>
            {error && (
              <MessageBar intent="warning">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button appearance="primary" onClick={go} disabled={busy} icon={busy ? <Spinner size="tiny" /> : <DocumentAdd20Regular />}>
              Generate
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
