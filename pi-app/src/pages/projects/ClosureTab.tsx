import { useState } from 'react';
import { motion } from 'motion/react';
import { Button, Field, MessageBar, MessageBarBody, Spinner, Textarea } from '@fluentui/react-components';
import { CheckmarkCircle24Filled, DismissCircle24Filled, Flag20Regular } from '@fluentui/react-icons';
import { useData } from '../../state/dataContext';
import { useToast, errorText } from '../../hooks/useToast';
import { GlassCard, SectionTitle } from '../../ui/GlassCard';
import { Confetti } from '../../ui/Confetti';
import { fmtDate, money } from '../../lib/format';
import { saveClosure, setProjectStatus } from '../../services/pi';
import type { ProjectData } from './Workspace';

/** Closure checklist mirrors the server's closure rules, so the PM sees blockers before asking. */
export function ClosureTab({ d }: { d: ProjectData }) {
  const { byId, refresh } = useData();
  const notify = useToast();
  const p = d.project;
  const cur = byId.currency.get(p.currencyId ?? '');
  const [notes, setNotes] = useState(p.closureNotes);
  const [lessons, setLessons] = useState(p.lessons);
  const [override, setOverride] = useState(p.closureOverride);
  const [busy, setBusy] = useState(false);
  const [party, setParty] = useState(false);

  const work = d.entries.filter((e) => e.type === 'Work');
  const openTasks = d.tasks.filter((t) => t.status !== 'Done');
  const unapproved = work.filter((e) => e.status === 'Draft' || e.status === 'Submitted');
  const unbilled = p.billing === 'Time & materials' ? work.filter((e) => e.status === 'Approved' && e.amount > 0 && !e.invoiceLineId) : [];
  const msNotBilled = p.billing === 'Fixed price' ? d.milestones.filter((m) => m.status !== 'Invoiced') : [];
  const unpaid = d.invoices.filter((i) => i.status === 'Sent');

  const checks = [
    { ok: openTasks.length === 0, label: 'All tasks are done', detail: openTasks.length ? `${openTasks.length} open — e.g. “${openTasks[0]!.title}”` : 'Nothing left on the board', blocking: true },
    { ok: unapproved.length === 0, label: 'All time is approved', detail: unapproved.length ? `${unapproved.length} entries waiting for approval` : 'No pending timesheets', blocking: true },
    ...(p.billing === 'Time & materials' ? [{ ok: unbilled.length === 0, label: 'All approved time is invoiced', detail: unbilled.length ? `${money(unbilled.reduce((s, e) => s + e.amount, 0), cur)} unbilled` : 'Nothing left to bill', blocking: true }] : []),
    ...(p.billing === 'Fixed price' ? [{ ok: msNotBilled.length === 0, label: 'All milestones invoiced', detail: msNotBilled.length ? `${msNotBilled.length} milestone(s) not invoiced` : 'Every milestone billed', blocking: true }] : []),
    { ok: unpaid.length === 0, label: 'Invoices paid', detail: unpaid.length ? `${unpaid.length} awaiting payment (doesn’t block closure)` : 'All paid', blocking: false },
    { ok: notes.trim().length > 0, label: 'Closure notes written', detail: 'Summarise what was delivered', blocking: false },
  ];
  const blockers = checks.filter((c) => c.blocking && !c.ok);
  const done = p.status === 'Closed';

  const request = async () => {
    setBusy(true);
    try {
      await saveClosure(p.id, { notes, lessons, override: blockers.length ? override : '' });
      await setProjectStatus(p.id, 'Closing');
      await Promise.all([refresh('projects'), d.reload('all')]);
      notify('Closure requested', 'The sponsor will review and close the project.');
    } catch (e) {
      notify('Can’t close yet', errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <GlassCard className="closed-card">
        <Confetti fire={!party} onDone={() => setParty(true)} />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="stack center">
          <CheckmarkCircle24Filled className="c-ok big-icon" />
          <h2>Project closed</h2>
          <p className="muted">Closed {fmtDate(p.closedOn)} · {Math.round(p.actualHours)} hours delivered · {money(p.billed, cur)} invoiced</p>
          {p.closureNotes && <p className="pre">{p.closureNotes}</p>}
          {p.lessons && (
            <>
              <h3>Lessons learned</h3>
              <p className="pre">{p.lessons}</p>
            </>
          )}
        </motion.div>
      </GlassCard>
    );

  return (
    <div className="grid-2">
      <GlassCard>
        <SectionTitle title="Closure checklist" hint="The server checks the same rules when the sponsor approves" />
        <ul className="checklist">
          {checks.map((c, i) => (
            <motion.li key={c.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className={c.ok ? 'ok' : c.blocking ? 'bad' : 'warn'}>
              {c.ok ? <CheckmarkCircle24Filled /> : <DismissCircle24Filled />}
              <span className="grow">
                <strong>{c.label}</strong>
                <span className="muted small block">{c.detail}</span>
              </span>
            </motion.li>
          ))}
        </ul>
      </GlassCard>
      <GlassCard>
        <SectionTitle title="Close the project" />
        {p.status === 'Closing' ? (
          <MessageBar intent="info">
            <MessageBarBody>Closure is with {byId.resource.get(p.sponsorId ?? '')?.name ?? 'the sponsor'} for approval.</MessageBarBody>
          </MessageBar>
        ) : (
          <div className="stack">
            <Field label="Closure notes" required>
              <Textarea value={notes} onChange={(_, v) => setNotes(v.value)} rows={4} placeholder="What was delivered, acceptance, handover" disabled={!d.canManage} />
            </Field>
            <Field label="Lessons learned">
              <Textarea value={lessons} onChange={(_, v) => setLessons(v.value)} rows={3} disabled={!d.canManage} />
            </Field>
            {blockers.length > 0 && (
              <Field label="Override reason" hint="Required to close with open items (e.g. client accepted as-is)">
                <Textarea value={override} onChange={(_, v) => setOverride(v.value)} rows={2} disabled={!d.canManage} />
              </Field>
            )}
            {d.canManage && (
              <Button
                appearance="primary"
                icon={busy ? <Spinner size="tiny" /> : <Flag20Regular />}
                disabled={busy || !notes.trim() || (blockers.length > 0 && !override.trim()) || !['Active', 'On hold'].includes(p.status)}
                onClick={request}
              >
                Request closure
              </Button>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
