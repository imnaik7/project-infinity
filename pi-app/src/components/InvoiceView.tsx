import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Spinner } from '@fluentui/react-components';
import { Checkmark20Regular, Money20Regular, Print20Regular, Send20Regular, Delete20Regular } from '@fluentui/react-icons';
import { useData } from '../state/dataContext';
import { useToast, errorText } from '../hooks/useToast';
import { InfinityMark } from '../shell/Logo';
import { Status } from '../ui/bits';
import { fmtDate, money } from '../lib/format';
import { loadInvoiceLines, setInvoiceStatus, type Invoice, type InvoiceLine, type InvoiceStatus } from '../services/pi';

/** Invoice preview + lifecycle actions. Print renders a clean A4 document via a body-level print area. */
export function InvoiceView({ invoice, onClose, onChanged }: { invoice: Invoice; onClose: () => void; onChanged: () => void }) {
  const { byId, isFinance, refresh } = useData();
  const notify = useToast();
  const [lines, setLines] = useState<InvoiceLine[] | null>(null);
  const [status, setStatus] = useState<InvoiceStatus>(invoice.status);
  const [busy, setBusy] = useState('');
  const project = byId.project.get(invoice.projectId);
  const client = byId.client.get(invoice.clientId ?? project?.clientId ?? '');
  const cur = byId.currency.get(invoice.currencyId ?? project?.currencyId ?? '');

  useEffect(() => {
    let alive = true;
    loadInvoiceLines(invoice.id)
      .then((l) => alive && setLines(l))
      .catch(() => alive && setLines([]));
    return () => {
      alive = false;
    };
  }, [invoice.id]);

  const move = async (to: InvoiceStatus) => {
    setBusy(to);
    try {
      await setInvoiceStatus(invoice.id, to);
      setStatus(to);
      onChanged();
      await refresh('projects');
      notify(`Invoice ${to.toLowerCase()}`, to === 'Sent' ? `Emailed to ${client?.billingEmail || 'the client'} by the invoice flow.` : to === 'Cancelled' ? 'Everything on it is billable again.' : undefined);
    } catch (e) {
      notify('Not possible', errorText(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const doc = (
    <div className="invoice-doc">
      <header className="inv-head">
        <div className="inv-brand">
          <InfinityMark size={52} animated={false} />
          <div>
            <strong>Power Platform AI Solution</strong>
            <span>Delivered with Project Infinity</span>
          </div>
        </div>
        <div className="inv-title">
          <h2>Tax invoice</h2>
          <span className="mono">{invoice.number}</span>
        </div>
      </header>
      <div className="inv-parties">
        <div>
          <span className="inv-label">Bill to</span>
          <strong>{client?.legalName || client?.name}</strong>
          {client?.contact && <span>Attn: {client.contact}</span>}
          {client?.gstin && <span>GSTIN / Tax ID: {client.gstin}</span>}
          {client?.billingEmail && <span>{client.billingEmail}</span>}
        </div>
        <div>
          <span className="inv-label">Project</span>
          <strong>{project?.name}</strong>
          <span>
            {project?.code} · {project?.billing}
          </span>
          <span>
            Period {fmtDate(invoice.from)} – {fmtDate(invoice.to)}
          </span>
        </div>
        <div>
          <span className="inv-label">Dates</span>
          <span>Issued {fmtDate(invoice.issuedOn)}</span>
          <span>Due {fmtDate(invoice.dueOn)}</span>
          {invoice.paidOn && <span>Paid {fmtDate(invoice.paidOn)}</span>}
        </div>
      </div>
      <table className="inv-lines">
        <thead>
          <tr>
            <th>Description</th>
            <th className="n">Hours</th>
            <th className="n">Rate</th>
            <th className="n">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(lines ?? []).map((l) => (
            <tr key={l.id}>
              <td>
                {l.name}
                <span className="inv-type">{l.type}</span>
              </td>
              <td className="n">{l.hours ? l.hours.toFixed(2) : ''}</td>
              <td className="n">{l.rate ? money(l.rate, cur, 2) : ''}</td>
              <td className="n">{money(l.amount, cur, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="inv-totals">
        <div>
          <span>Subtotal</span>
          <span>{money(invoice.subtotal, cur, 2)}</span>
        </div>
        <div>
          <span>Tax ({invoice.taxRate}%)</span>
          <span>{money(invoice.tax, cur, 2)}</span>
        </div>
        <div className="inv-grand">
          <span>Total due ({cur?.code})</span>
          <span>{money(invoice.total, cur, 2)}</span>
        </div>
      </div>
      {invoice.notes && <p className="inv-notes">{invoice.notes}</p>}
      <footer className="inv-foot">Payment terms: {client?.termsDays ?? 30} days. Thank you for your business.</footer>
    </div>
  );

  const canAct = isFinance;
  return (
    <>
      <Dialog open onOpenChange={(_, v) => !v.open && onClose()}>
        <DialogSurface className="invoice-surface">
          <DialogBody>
            <DialogTitle>
              {invoice.number} <Status value={status} />
            </DialogTitle>
            <DialogContent>{lines === null ? <Spinner label="Loading lines…" /> : doc}</DialogContent>
            <DialogActions>
              <Button icon={<Print20Regular />} onClick={() => window.print()}>
                Print / PDF
              </Button>
              {canAct && status === 'Draft' && (
                <Button icon={busy === 'Cancelled' ? <Spinner size="tiny" /> : <Delete20Regular />} onClick={() => move('Cancelled')} disabled={!!busy}>
                  Cancel invoice
                </Button>
              )}
              {canAct && status === 'Draft' && (
                <Button appearance="primary" icon={busy === 'Approved' ? <Spinner size="tiny" /> : <Checkmark20Regular />} onClick={() => move('Approved')} disabled={!!busy}>
                  Approve
                </Button>
              )}
              {canAct && status === 'Approved' && (
                <Button appearance="primary" icon={busy === 'Sent' ? <Spinner size="tiny" /> : <Send20Regular />} onClick={() => move('Sent')} disabled={!!busy}>
                  Mark sent
                </Button>
              )}
              {canAct && status === 'Sent' && (
                <Button appearance="primary" icon={busy === 'Paid' ? <Spinner size="tiny" /> : <Money20Regular />} onClick={() => move('Paid')} disabled={!!busy}>
                  Mark paid
                </Button>
              )}
              <Button onClick={onClose}>Close</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      {createPortal(<div className="print-area">{doc}</div>, document.body)}
    </>
  );
}
