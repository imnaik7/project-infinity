import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Button, DrawerBody, DrawerHeader, DrawerHeaderTitle, Field, Input, MessageBar, MessageBarBody, OverlayDrawer, Spinner, Textarea } from '@fluentui/react-components';
import { Dismiss20Regular, PersonAdd20Regular, PersonSearch20Regular, Handshake20Regular, PeopleCheckmark20Regular } from '@fluentui/react-icons';
import { useData } from '../state/dataContext';
import { useToast, errorText } from '../hooks/useToast';
import { Avatar, Bar, Empty, Status } from '../ui/bits';
import { fmtShort } from '../lib/format';
import { skillMatch, utilisation } from '../lib/capacity';
import { loadRequests, updateRequest, type RequestStatus, type TalentRequest } from '../services/pi';

const COLUMNS: { status: RequestStatus; label: string; hint: string }[] = [
  { status: 'Submitted', label: 'New', hint: 'Waiting for an RMG owner' },
  { status: 'In review', label: 'Searching the bench', hint: 'Matching internal people' },
  { status: 'Hiring', label: 'Hiring', hint: 'Sent to Onboarding via Talent Bridge' },
  { status: 'Candidate selected', label: 'Candidate selected', hint: 'Joining soon' },
  { status: 'Fulfilled', label: 'Staffed', hint: 'Assigned to the project' },
];

export function Talent() {
  const { byId } = useData();
  const [requests, setRequests] = useState<TalentRequest[] | null>(null);
  const [open, setOpen] = useState<TalentRequest | null>(null);
  const load = useCallback(() => loadRequests().then(setRequests), []);
  useEffect(() => {
    load().catch(() => setRequests([]));
  }, [load]);

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <h1>Talent (RMG)</h1>
          <p className="muted">Staff projects from the bench first; hire through the Onboarding system when nobody fits.</p>
        </div>
      </div>
      {requests && requests.length === 0 && <Empty title="No talent requests">PMs request people from a project’s Team tab.</Empty>}
      <div className="pipeline">
        {COLUMNS.map((c) => {
          const col = (requests ?? []).filter((r) => r.status === c.status || (c.status === 'In review' && r.status === 'Matched internally'));
          return (
            <section key={c.status} className="pipe-col">
              <header>
                <strong>{c.label}</strong> <span className="muted small">{col.length}</span>
                <span className="muted small block">{c.hint}</span>
              </header>
              {col.map((r, i) => {
                const p = byId.project.get(r.projectId);
                return (
                  <motion.button key={r.id} className="pipe-card" onClick={() => setOpen(r)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} style={{ ['--accent' as string]: p?.color }}>
                    <span className="row-between">
                      <span className="mono small muted">{r.number}</span>
                      <Status value={r.priority} />
                    </span>
                    <strong>{r.title}</strong>
                    <span className="muted small">{p?.name}</span>
                    <span className="skills">
                      {r.skills.slice(0, 3).map((s) => (
                        <span key={s} className="skill">
                          {s}
                        </span>
                      ))}
                    </span>
                    <span className="small muted">
                      {r.allocation}% · from {fmtShort(r.start)}
                    </span>
                    {r.fulfilledById && (
                      <span className="small c-ok">
                        <Avatar name={byId.resource.get(r.fulfilledById)?.name ?? '?'} size={18} /> {byId.resource.get(r.fulfilledById)?.name}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </section>
          );
        })}
      </div>
      {open && <RequestDrawer r={open} onClose={() => setOpen(null)} onChanged={async () => { await load(); }} />}
    </div>
  );
}

function RequestDrawer({ r, onClose, onChanged }: { r: TalentRequest; onClose: () => void; onChanged: () => Promise<void> }) {
  const { resources, members, byId, myself, refresh } = useData();
  const notify = useToast();
  const [notes, setNotes] = useState(r.notes);
  const [candidate, setCandidate] = useState(r.candidateName);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const p = byId.project.get(r.projectId);
  const from = r.start ?? new Date().toISOString().slice(0, 10);
  const to = r.end ?? from;

  const bench = useMemo(
    () =>
      resources
        .filter((x) => x.active && x.experience >= r.minExperience)
        .map((x) => ({ x, match: skillMatch(x, r.skills), free: Math.max(0, 100 - utilisation(members, x.id, from, to)) }))
        .filter((m) => m.match > 0 || m.x.roleId === r.roleId)
        .sort((a, b) => b.match - a.match || b.free - a.free)
        .slice(0, 8),
    [resources, members, r, from, to],
  );

  const act = async (key: string, fields: Parameters<typeof updateRequest>[1], msg: string, detail?: string) => {
    setBusy(key);
    setError('');
    try {
      await updateRequest(r.id, { notes, ...fields });
      await onChanged();
      await refresh('projects');
      notify(msg, detail);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <OverlayDrawer open position="end" size="large" onOpenChange={(_, v) => !v.open && onClose()}>
      <DrawerHeader>
        <DrawerHeaderTitle action={<Button appearance="subtle" icon={<Dismiss20Regular />} onClick={onClose} aria-label="Close" />}>
          {r.title} <span className="mono small muted">{r.number}</span>
        </DrawerHeaderTitle>
        <span className="muted">
          {p?.name} · requested by {byId.resource.get(r.requestedById ?? '')?.name} · <Status value={r.status} />
        </span>
      </DrawerHeader>
      <DrawerBody className="stack">
        <dl className="review-grid">
          <dt>Role</dt>
          <dd>{byId.role.get(r.roleId ?? '')?.name}</dd>
          <dt>Skills</dt>
          <dd>{r.skills.join(', ')}</dd>
          <dt>Experience</dt>
          <dd>{r.minExperience}+ years</dd>
          <dt>Need</dt>
          <dd>
            {r.headcount} × {r.allocation}% · {fmtShort(r.start)} – {fmtShort(r.end)} · {r.location || 'Any location'}
          </dd>
          <dt>Why</dt>
          <dd>{r.justification || '—'}</dd>
        </dl>

        {!['Fulfilled', 'Cancelled'].includes(r.status) && (
          <>
            <h3 className="h3">Bench matches</h3>
            {bench.length === 0 && <Empty title="Nobody on the bench fits">Start hiring — the request goes to the Onboarding system.</Empty>}
            <ul className="list">
              {bench.map(({ x, match, free }) => (
                <li key={x.id} className="list-row">
                  <Avatar name={x.name} color={x.color} size={32} />
                  <span className="grow">
                    <strong>{x.name}</strong>
                    <span className="muted small block">
                      {x.designation} · {x.experience} yrs · {x.location}
                    </span>
                  </span>
                  <span className="pill pill-brand">{match}% match</span>
                  <span className="avail-col">
                    <span className={`small ${free >= r.allocation ? 'c-ok' : 'c-warn'}`}>{free}% free</span>
                    <Bar value={100 - free} tone={free >= r.allocation ? 'ok' : 'warn'} label="Booked" />
                  </span>
                  <Button
                    size="small"
                    appearance="primary"
                    icon={busy === x.id ? <Spinner size="tiny" /> : <PeopleCheckmark20Regular />}
                    disabled={!!busy}
                    onClick={() => act(x.id, { status: 'Fulfilled', fulfilledById: x.id, rmgOwnerId: myself?.id }, `${x.name} assigned`, `Added to ${p?.name} from ${fmtShort(r.start)} — the PM is notified.`)}
                  >
                    Assign
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}

        <Field label="RMG notes">
          <Textarea value={notes} onChange={(_, v) => setNotes(v.value)} rows={3} />
        </Field>
        {(r.status === 'Hiring' || r.status === 'Candidate selected') && (
          <Field label="Selected candidate (from Onboarding)">
            <Input value={candidate} onChange={(_, v) => setCandidate(v.value)} placeholder="Name of the accepted candidate" />
          </Field>
        )}
        {r.onboardingUrl && (
          <a href={r.onboardingUrl} target="_blank" rel="noreferrer">
            Open in Onboarding ↗
          </a>
        )}
        {error && (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        <div className="row">
          {r.status === 'Submitted' && (
            <Button icon={<PersonSearch20Regular />} onClick={() => act('own', { status: 'In review', rmgOwnerId: myself?.id }, 'You own this request')} disabled={!!busy}>
              Take ownership
            </Button>
          )}
          {['Submitted', 'In review', 'Matched internally'].includes(r.status) && (
            <Button icon={busy === 'hire' ? <Spinner size="tiny" /> : <PersonAdd20Regular />} onClick={() => act('hire', { status: 'Hiring', rmgOwnerId: myself?.id }, 'Hiring started', 'The Talent Bridge connector opens a requisition in Onboarding.')} disabled={!!busy}>
              Start hiring
            </Button>
          )}
          {r.status === 'Hiring' && (
            <Button icon={<Handshake20Regular />} onClick={() => act('cand', { status: 'Candidate selected', candidateName: candidate }, 'Candidate recorded', 'They’ll be staffed automatically once onboarded.')} disabled={!!busy || !candidate.trim()}>
              Candidate selected
            </Button>
          )}
          {!['Fulfilled', 'Cancelled'].includes(r.status) && (
            <Button appearance="subtle" onClick={() => act('cancel', { status: 'Cancelled' }, 'Request cancelled')} disabled={!!busy}>
              Cancel request
            </Button>
          )}
        </div>
      </DrawerBody>
    </OverlayDrawer>
  );
}
