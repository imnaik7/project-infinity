import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown, Field, Input, MessageBar, MessageBarBody, Option, Spinner, Textarea,
} from '@fluentui/react-components';
import { ArrowLeft20Regular, ArrowRight20Regular, Checkmark20Regular, Send20Regular } from '@fluentui/react-icons';
import { useData } from '../../state/dataContext';
import { useToast, errorText } from '../../hooks/useToast';
import { money } from '../../lib/format';
import { createProject, setProjectStatus, PRIORITY, type BillingModel, type Priority, type ProjectInput } from '../../services/pi';
import type { Navigate } from '../../state/nav';

const STEPS = ['Basics', 'Commercials', 'People & dates', 'Review'] as const;
const MODELS: { model: BillingModel; emoji: string; text: string }[] = [
  { model: 'Time & materials', emoji: '⏱️', text: 'Bill approved hours × role rate' },
  { model: 'Fixed price', emoji: '🎯', text: 'Bill milestones as they’re accepted' },
  { model: 'Retainer', emoji: '🔁', text: 'Fixed monthly fee' },
  { model: 'Non-billable', emoji: '🏠', text: 'Internal — track time & cost only' },
];
const COLORS = ['#7c3aed', '#6366f1', '#2563eb', '#0891b2', '#059669', '#d97706', '#db2777', '#e11d48'];

export function NewProject({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate: Navigate }) {
  const { clients, resources, myself, byId, refresh } = useData();
  const notify = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null);
  const [error, setError] = useState('');
  const [f, setF] = useState<ProjectInput>(() => ({
    name: '', clientId: '', description: '', billing: 'Time & materials', sponsorId: undefined, pmId: myself?.id, start: '', end: '', budgetHours: 0,
    budgetAmount: 0, retainerFee: 0, priority: 'Medium', color: COLORS[0]!, tags: '',
  }));
  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const client = clients.find((c) => c.id === f.clientId);
  const cur = byId.currency.get(client?.currencyId ?? '');
  const people = useMemo(() => resources.filter((r) => r.active), [resources]);

  const stepProblem = [
    !f.name.trim() ? 'Give the project a name' : !f.clientId ? 'Choose a client' : '',
    f.billing === 'Retainer' && f.retainerFee <= 0 ? 'Enter the monthly retainer fee' : f.billing === 'Fixed price' && f.budgetAmount <= 0 ? 'Enter the fixed contract value' : '',
    !f.sponsorId ? 'Choose a sponsor — they approve the project' : !f.start ? 'Pick a start date' : f.end && f.end < f.start ? 'The end date is before the start' : '',
    '',
  ][step];

  const save = async (submit: boolean) => {
    setBusy(submit ? 'submit' : 'draft');
    setError('');
    try {
      const p = await createProject(f, client?.currencyId);
      if (submit) await setProjectStatus(p.id, 'Pending approval');
      await refresh('projects');
      notify(submit ? 'Submitted for approval' : 'Draft saved', submit ? `${byId.resource.get(f.sponsorId ?? '')?.name ?? 'The sponsor'} will get an approval request.` : 'You can submit it any time.');
      onClose();
      onNavigate({ page: 'projects', projectId: p.id });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && !busy && onClose()}>
      <DialogSurface className="wizard">
        <DialogBody>
          <DialogTitle>New project</DialogTitle>
          <DialogContent>
            <ol className="stepper" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
                  <span className="step-dot">{i < step ? <Checkmark20Regular /> : i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>

            <AnimatePresence mode="wait">
              <motion.div key={step} className="wizard-body" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
                {step === 0 && (
                  <div className="form-grid">
                    <Field label="Project name" required className="span2">
                      <Input autoFocus value={f.name} onChange={(_, d) => set('name', d.value)} placeholder="e.g. Contoso Loyalty App" />
                    </Field>
                    <Field label="Client" required>
                      <Dropdown placeholder="Choose client" value={client?.name ?? ''} selectedOptions={f.clientId ? [f.clientId] : []} onOptionSelect={(_, d) => d.optionValue && set('clientId', d.optionValue)}>
                        {clients.map((c) => (
                          <Option key={c.id} value={c.id} text={c.name}>
                            <span className="dot" style={{ background: c.color }} /> {c.name} <span className="muted small">· {byId.currency.get(c.currencyId)?.code}</span>
                          </Option>
                        ))}
                      </Dropdown>
                    </Field>
                    <Field label="Priority">
                      <Dropdown value={f.priority} selectedOptions={[f.priority]} onOptionSelect={(_, d) => d.optionValue && set('priority', d.optionValue as Priority)}>
                        {PRIORITY.map((p) => (
                          <Option key={p} value={p}>
                            {p}
                          </Option>
                        ))}
                      </Dropdown>
                    </Field>
                    <Field label="What is this project about?" className="span2">
                      <Textarea value={f.description} onChange={(_, d) => set('description', d.value)} rows={4} placeholder="Goals, scope and what success looks like" />
                    </Field>
                    <Field label="Tags" hint="Comma separated">
                      <Input value={f.tags} onChange={(_, d) => set('tags', d.value)} placeholder="Mobile, Azure" />
                    </Field>
                    <Field label="Colour">
                      <div className="swatches" role="radiogroup" aria-label="Project colour">
                        {COLORS.map((c) => (
                          <button key={c} role="radio" aria-checked={f.color === c} className={`swatch ${f.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => set('color', c)} aria-label={c} />
                        ))}
                      </div>
                    </Field>
                  </div>
                )}

                {step === 1 && (
                  <div className="stack">
                    <div className="model-grid" role="radiogroup" aria-label="Billing model">
                      {MODELS.map((m) => (
                        <button key={m.model} role="radio" aria-checked={f.billing === m.model} className={`model ${f.billing === m.model ? 'on' : ''}`} onClick={() => set('billing', m.model)}>
                          <span className="model-emoji" aria-hidden>
                            {m.emoji}
                          </span>
                          <strong>{m.model}</strong>
                          <span className="muted small">{m.text}</span>
                        </button>
                      ))}
                    </div>
                    <div className="form-grid">
                      <Field label="Budget hours">
                        <Input type="number" value={String(f.budgetHours || '')} onChange={(_, d) => set('budgetHours', Number(d.value) || 0)} />
                      </Field>
                      {f.billing !== 'Non-billable' && (
                        <Field label={f.billing === 'Fixed price' ? `Contract value (${cur?.code ?? 'client currency'})` : `Budget (${cur?.code ?? 'client currency'})`} required={f.billing === 'Fixed price'}>
                          <Input type="number" contentBefore={<span className="muted">{cur?.symbol ?? '₹'}</span>} value={String(f.budgetAmount || '')} onChange={(_, d) => set('budgetAmount', Number(d.value) || 0)} />
                        </Field>
                      )}
                      {f.billing === 'Retainer' && (
                        <Field label={`Monthly retainer (${cur?.code ?? ''})`} required>
                          <Input type="number" contentBefore={<span className="muted">{cur?.symbol ?? '₹'}</span>} value={String(f.retainerFee || '')} onChange={(_, d) => set('retainerFee', Number(d.value) || 0)} />
                        </Field>
                      )}
                    </div>
                    <p className="muted small">
                      {f.billing === 'Time & materials' && 'Approved timesheet hours are billed at each role’s rate (rate card, or project-specific rates you can set later).'}
                      {f.billing === 'Fixed price' && 'Add milestones on the project page. Each one is billed when the client accepts it.'}
                      {f.billing === 'Retainer' && 'One invoice line per month. Time is still tracked for cost and utilisation.'}
                      {f.billing === 'Non-billable' && 'No invoices — time is tracked for cost and utilisation reporting.'}
                    </p>
                  </div>
                )}

                {step === 2 && (
                  <div className="form-grid">
                    <Field label="Sponsor" required hint="Approves the project and its closure">
                      <Dropdown placeholder="Choose sponsor" value={byId.resource.get(f.sponsorId ?? '')?.name ?? ''} selectedOptions={f.sponsorId ? [f.sponsorId] : []} onOptionSelect={(_, d) => set('sponsorId', d.optionValue)}>
                        {people.map((r) => (
                          <Option key={r.id} value={r.id} text={r.name}>
                            {r.name} <span className="muted small">· {r.designation}</span>
                          </Option>
                        ))}
                      </Dropdown>
                    </Field>
                    <Field label="Project manager" hint="Can be assigned after approval">
                      <Dropdown placeholder="Assign later" value={byId.resource.get(f.pmId ?? '')?.name ?? ''} selectedOptions={f.pmId ? [f.pmId] : []} onOptionSelect={(_, d) => set('pmId', d.optionValue)}>
                        {people.map((r) => (
                          <Option key={r.id} value={r.id} text={r.name}>
                            {r.name} <span className="muted small">· {r.designation}</span>
                          </Option>
                        ))}
                      </Dropdown>
                    </Field>
                    <Field label="Start date" required>
                      <Input type="date" value={f.start} onChange={(_, d) => set('start', d.value)} />
                    </Field>
                    <Field label="Target end date">
                      <Input type="date" value={f.end} onChange={(_, d) => set('end', d.value)} />
                    </Field>
                  </div>
                )}

                {step === 3 && (
                  <div className="review" style={{ ['--accent' as string]: f.color }}>
                    <div className="review-head">
                      <span className="dot big" style={{ background: f.color }} />
                      <div>
                        <h3>{f.name}</h3>
                        <span className="muted">
                          {client?.name} · {f.billing} · {f.priority} priority
                        </span>
                      </div>
                    </div>
                    <dl className="review-grid">
                      <dt>Sponsor</dt>
                      <dd>{byId.resource.get(f.sponsorId ?? '')?.name}</dd>
                      <dt>Project manager</dt>
                      <dd>{byId.resource.get(f.pmId ?? '')?.name ?? 'Assign after approval'}</dd>
                      <dt>Dates</dt>
                      <dd>
                        {f.start} → {f.end || 'open'}
                      </dd>
                      <dt>Budget</dt>
                      <dd>
                        {f.budgetHours} h{f.billing !== 'Non-billable' && ` · ${money(f.budgetAmount, cur)}`}
                        {f.billing === 'Retainer' && ` · ${money(f.retainerFee, cur)}/month`}
                      </dd>
                    </dl>
                    {f.description && <p className="pre">{f.description}</p>}
                    <p className="muted small">Submitting sends an approval to the sponsor in the app and on Teams / Outlook. You can also save it as a draft.</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {(stepProblem || error) && (
              <MessageBar intent={error ? 'error' : 'warning'}>
                <MessageBarBody>{error || stepProblem}</MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            {step > 0 && (
              <Button icon={<ArrowLeft20Regular />} onClick={() => setStep((s) => s - 1)} disabled={!!busy}>
                Back
              </Button>
            )}
            <span className="grow" />
            {step < STEPS.length - 1 ? (
              <Button appearance="primary" icon={<ArrowRight20Regular />} iconPosition="after" disabled={!!stepProblem} onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            ) : (
              <>
                <Button onClick={() => save(false)} disabled={!!busy} icon={busy === 'draft' ? <Spinner size="tiny" /> : undefined}>
                  Save draft
                </Button>
                <Button appearance="primary" onClick={() => save(true)} disabled={!!busy} icon={busy === 'submit' ? <Spinner size="tiny" /> : <Send20Regular />}>
                  Submit for approval
                </Button>
              </>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
