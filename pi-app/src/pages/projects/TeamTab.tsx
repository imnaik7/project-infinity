import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown, Field, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger,
  MessageBar, MessageBarBody, Option, Slider, Spinner, Textarea,
} from '@fluentui/react-components';
import { Add20Regular, MoreHorizontal20Regular, PersonSearch20Regular } from '@fluentui/react-icons';
import { useData } from '../../state/dataContext';
import { useToast, errorText } from '../../hooks/useToast';
import { GlassCard, SectionTitle } from '../../ui/GlassCard';
import { Avatar, Bar, Empty, Status } from '../../ui/bits';
import { fmtShort, isoDay, money } from '../../lib/format';
import { ACCESS, PRIORITY, addMember, changeRole, createRequest, setProjectRate, updateMember, type AccessLevel, type Member, type Priority } from '../../services/pi';
import { utilisation, skillMatch } from '../../lib/capacity';
import type { ProjectData } from './Workspace';

export function TeamTab({ d }: { d: ProjectData }) {
  const { members, byId, now, refresh } = useData();
  const notify = useToast();
  const p = d.project;
  const cur = byId.currency.get(p.currencyId ?? '');
  const today = isoDay(new Date(now));
  const team = members.filter((m) => m.projectId === p.id);
  const current = team.filter((m) => m.active && (m.to ?? '9999') >= today);
  const past = team.filter((m) => !current.includes(m));
  const [adding, setAdding] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [roleChange, setRoleChange] = useState<Member | null>(null);
  const [ending, setEnding] = useState<Member | null>(null);

  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      await refresh('projects');
      await d.reload('team');
      notify(ok);
    } catch (e) {
      notify('Not saved', errorText(e), 'error');
    }
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <GlassCard>
        <SectionTitle
          title={`Team · ${current.length}`}
          hint="Everyone here can open this project. Access decides what they can change."
          action={
            d.canManage && (
              <div className="row">
                <Button icon={<PersonSearch20Regular />} onClick={() => setRequesting(true)}>
                  Request talent
                </Button>
                <Button appearance="primary" icon={<Add20Regular />} onClick={() => setAdding(true)}>
                  Add member
                </Button>
              </div>
            )
          }
        />
        {current.length === 0 && <Empty title="No one assigned yet" />}
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Project access</th>
                <th className="n">Allocation</th>
                <th>From</th>
                <th>Until</th>
                <th className="n">Bill rate</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {current.map((m, i) => {
                const r = byId.resource.get(m.resourceId);
                const role = byId.role.get(m.roleId ?? '');
                return (
                  <motion.tr key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                    <td>
                      <span className="person">
                        <Avatar name={r?.name ?? '?'} color={r?.color} size={30} />
                        <span>
                          <strong>{r?.name}</strong>
                          <span className="muted small block">{r?.designation}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="role-chip" style={{ ['--c' as string]: role?.color }}>
                        {role?.name ?? '—'}
                      </span>
                    </td>
                    <td>
                      <Status value={m.access === 'Project Manager' ? 'Active' : m.access === 'Contributor' ? 'In progress' : 'Draft'} />
                      <span className="small"> {m.access}</span>
                    </td>
                    <td className="n">
                      {m.allocation}%
                      <Bar value={m.allocation} label="Allocation" />
                    </td>
                    <td>{fmtShort(m.from)}</td>
                    <td>{m.to ? fmtShort(m.to) : <span className="muted">Open</span>}</td>
                    <td className="n">{m.billRate ? money(m.billRate, cur) : <span className="muted small">rate card</span>}</td>
                    <td>
                      {d.canManage && (
                        <Menu>
                          <MenuTrigger disableButtonEnhancement>
                            <Button appearance="subtle" icon={<MoreHorizontal20Regular />} aria-label={`Manage ${r?.name}`} />
                          </MenuTrigger>
                          <MenuPopover>
                            <MenuList>
                              <MenuItem onClick={() => setRoleChange(m)}>Change role…</MenuItem>
                              {ACCESS.filter((a) => a !== m.access).map((a) => (
                                <MenuItem key={a} onClick={() => act(() => updateMember(m.id, { access: a }), `${r?.name} is now ${a}`)}>
                                  Make {a}
                                </MenuItem>
                              ))}
                              <MenuItem onClick={() => setEnding(m)}>End assignment…</MenuItem>
                            </MenuList>
                          </MenuPopover>
                        </Menu>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {past.length > 0 && (
          <details className="history">
            <summary className="muted small">History · {past.length} earlier assignment(s)</summary>
            <ul className="list">
              {past.map((m) => (
                <li key={m.id} className="list-row small">
                  <span className="grow">
                    {byId.resource.get(m.resourceId)?.name} · {byId.role.get(m.roleId ?? '')?.name}
                  </span>
                  <span className="muted">
                    {fmtShort(m.from)} – {fmtShort(m.to)}
                  </span>
                  {m.reason && <span className="muted">· {m.reason}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </GlassCard>

      <div className="grid-2">
        <TalentRequests d={d} onNew={() => setRequesting(true)} />
        {p.billing === 'Time & materials' && <RateCard d={d} />}
      </div>

      {adding && <AddMemberDialog d={d} onClose={() => setAdding(false)} onSaved={() => act(async () => undefined, 'Team updated')} />}
      {requesting && <RequestDialog d={d} onClose={() => setRequesting(false)} />}
      {roleChange && (
        <RoleChangeDialog
          member={roleChange}
          onClose={() => setRoleChange(null)}
          onSave={(roleId, eff, reason) =>
            act(async () => {
              const r = byId.resource.get(roleChange.resourceId);
              await changeRole(roleChange, roleId, eff, reason, `${r?.name ?? ''} · ${byId.role.get(roleId)?.name ?? ''}`);
              setRoleChange(null);
            }, 'Role changed from the effective date')
          }
        />
      )}
      <Dialog open={!!ending} onOpenChange={(_, v) => !v.open && setEnding(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>End {byId.resource.get(ending?.resourceId ?? '')?.name}’s assignment?</DialogTitle>
            <DialogContent>Their assignment ends today. They lose access to the project unless they have another role on it. Logged time is kept.</DialogContent>
            <DialogActions>
              <Button onClick={() => setEnding(null)}>Cancel</Button>
              <Button
                appearance="primary"
                onClick={() =>
                  ending &&
                  act(async () => {
                    await updateMember(ending.id, { to: today });
                    setEnding(null);
                  }, 'Assignment ended')
                }
              >
                End assignment
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

function AddMemberDialog({ d, onClose, onSaved }: { d: ProjectData; onClose: () => void; onSaved: () => void }) {
  const { resources, roles, members, byId, now } = useData();
  const today = isoDay(new Date(now));
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<string>('');
  const [roleId, setRoleId] = useState('');
  const [access, setAccess] = useState<AccessLevel>('Contributor');
  const [alloc, setAlloc] = useState(50);
  const [from, setFrom] = useState(d.project.start && d.project.start > today ? d.project.start : today);
  const [to, setTo] = useState(d.project.end ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ranked = useMemo(() => {
    const words = q.toLowerCase().split(/[,\s]+/).filter(Boolean);
    return resources
      .filter((r) => r.active)
      .map((r) => ({ r, match: skillMatch(r, words), util: utilisation(members, r.id, from, to || from) }))
      .filter((x) => !words.length || x.match > 0 || x.r.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.match - a.match || a.util - b.util);
  }, [resources, members, q, from, to]);

  const save = async () => {
    const r = byId.resource.get(pick);
    if (!r || !roleId) return;
    setBusy(true);
    setError('');
    try {
      await addMember({ projectId: d.project.id, resourceId: r.id, roleId, access, allocation: alloc, from, to: to || undefined, name: `${r.name} · ${byId.role.get(roleId)?.name}` });
      onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(_, v) => !v.open && !busy && onClose()}>
      <DialogSurface className="wide-dialog">
        <DialogBody>
          <DialogTitle>Add a team member</DialogTitle>
          <DialogContent className="stack">
            <Input autoFocus value={q} onChange={(_, v) => setQ(v.value)} placeholder="Search by name or skills — e.g. React, Power BI" />
            <div className="pick-people">
              {ranked.slice(0, 12).map(({ r, match, util }) => (
                <button key={r.id} className={`pick-person ${pick === r.id ? 'on' : ''}`} onClick={() => { setPick(r.id); if (!roleId && r.roleId) setRoleId(r.roleId); }}>
                  <Avatar name={r.name} color={r.color} size={34} />
                  <span className="grow">
                    <strong>{r.name}</strong>
                    <span className="muted small block">
                      {r.designation} · {r.experience} yrs · {r.location}
                    </span>
                    <span className="skills">
                      {r.skills.slice(0, 4).map((s) => (
                        <span key={s} className="skill">
                          {s}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="avail">
                    {match > 0 && <span className="pill pill-brand">{match}% match</span>}
                    <span className={`small ${util >= 100 ? 'c-bad' : util >= 80 ? 'c-warn' : 'c-ok'}`}>{Math.max(0, 100 - util)}% free</span>
                    <Bar value={util} tone={util >= 100 ? 'bad' : util >= 80 ? 'warn' : 'ok'} label="Booked" />
                  </span>
                </button>
              ))}
            </div>
            <div className="form-grid">
              <Field label="Role on this project" required>
                <Dropdown placeholder="Role" value={byId.role.get(roleId)?.name ?? ''} selectedOptions={roleId ? [roleId] : []} onOptionSelect={(_, v) => v.optionValue && setRoleId(v.optionValue)}>
                  {roles.map((r) => (
                    <Option key={r.id} value={r.id}>
                      {r.name}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Field label="Project access">
                <Dropdown value={access} selectedOptions={[access]} onOptionSelect={(_, v) => v.optionValue && setAccess(v.optionValue as AccessLevel)}>
                  {ACCESS.map((a) => (
                    <Option key={a} value={a}>
                      {a}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Field label={`Allocation · ${alloc}%`}>
                <Slider min={5} max={100} step={5} value={alloc} onChange={(_, v) => setAlloc(v.value)} />
              </Field>
              <Field label="From">
                <Input type="date" value={from} onChange={(_, v) => setFrom(v.value)} />
              </Field>
              <Field label="Until (optional)">
                <Input type="date" value={to} onChange={(_, v) => setTo(v.value)} />
              </Field>
            </div>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button appearance="primary" disabled={!pick || !roleId || busy} onClick={save} icon={busy ? <Spinner size="tiny" /> : undefined}>
              Add to team
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function RoleChangeDialog({ member, onClose, onSave }: { member: Member; onClose: () => void; onSave: (roleId: string, effective: string, reason: string) => void }) {
  const { roles, byId, now } = useData();
  const [roleId, setRoleId] = useState('');
  const [eff, setEff] = useState(isoDay(new Date(now)));
  const [reason, setReason] = useState('');
  const r = byId.resource.get(member.resourceId);
  return (
    <Dialog open onOpenChange={(_, v) => !v.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Change {r?.name}’s role</DialogTitle>
          <DialogContent className="stack">
            <p className="muted small">
              Currently <strong>{byId.role.get(member.roleId ?? '')?.name}</strong>. Time before the change date keeps the old role and rate; time from that date uses the new
              one.
            </p>
            <Field label="New role" required>
              <Dropdown placeholder="Role" value={byId.role.get(roleId)?.name ?? ''} selectedOptions={roleId ? [roleId] : []} onOptionSelect={(_, v) => v.optionValue && setRoleId(v.optionValue)}>
                {roles.filter((x) => x.id !== member.roleId).map((x) => (
                  <Option key={x.id} value={x.id}>
                    {x.name}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="Effective from">
              <Input type="date" value={eff} onChange={(_, v) => setEff(v.value)} />
            </Field>
            <Field label="Reason">
              <Input value={reason} onChange={(_, v) => setReason(v.value)} placeholder="e.g. Promoted to Senior Developer" />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button appearance="primary" disabled={!roleId || !eff} onClick={() => onSave(roleId, eff, reason)}>
              Change role
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function TalentRequests({ d, onNew }: { d: ProjectData; onNew: () => void }) {
  const { byId } = useData();
  return (
    <GlassCard>
      <SectionTitle title="Talent requests" hint="Ask RMG for people who aren’t on the team" action={d.canManage && <Button size="small" onClick={onNew}>New request</Button>} />
      {d.requests.length === 0 && <Empty title="No open requests" />}
      <ul className="list">
        {d.requests.map((r) => (
          <li key={r.id} className="list-row">
            <span className="grow">
              <strong>{r.title}</strong> <span className="muted small mono">{r.number}</span>
              <span className="muted small block">
                {byId.role.get(r.roleId ?? '')?.name} · {r.allocation}% from {fmtShort(r.start)} · {r.skills.slice(0, 3).join(', ')}
              </span>
              {r.fulfilledById && <span className="small c-ok block">Staffed: {byId.resource.get(r.fulfilledById)?.name}</span>}
              {r.candidateName && !r.fulfilledById && <span className="small block">Candidate: {r.candidateName}</span>}
            </span>
            <Status value={r.status} live={['Hiring', 'In review'].includes(r.status)} />
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function RequestDialog({ d, onClose }: { d: ProjectData; onClose: () => void }) {
  const { roles, byId, now } = useData();
  const notify = useToast();
  const [f, setF] = useState({ title: '', roleId: '', skills: '', exp: 3, alloc: 100, start: isoDay(new Date(now + 14 * 86_400_000)), end: d.project.end ?? '', headcount: 1, priority: 'Medium' as Priority, location: '', why: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await createRequest({
        projectId: d.project.id, title: f.title || byId.role.get(f.roleId)?.name || 'Talent', roleId: f.roleId, skills: f.skills, minExperience: f.exp, allocation: f.alloc,
        start: f.start, end: f.end || undefined, headcount: f.headcount, priority: f.priority, location: f.location, justification: f.why,
      });
      await d.reload('team');
      notify('Request sent to RMG', 'They’ll check the bench first, then hire through Onboarding if needed.');
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(_, v) => !v.open && !busy && onClose()}>
      <DialogSurface className="wide-dialog">
        <DialogBody>
          <DialogTitle>Request talent from RMG</DialogTitle>
          <DialogContent className="form-grid">
            <Field label="Position title" className="span2">
              <Input value={f.title} onChange={(_, v) => setF({ ...f, title: v.value })} placeholder="e.g. Senior React Developer" />
            </Field>
            <Field label="Role" required>
              <Dropdown placeholder="Role" value={byId.role.get(f.roleId)?.name ?? ''} selectedOptions={f.roleId ? [f.roleId] : []} onOptionSelect={(_, v) => v.optionValue && setF({ ...f, roleId: v.optionValue })}>
                {roles.map((r) => (
                  <Option key={r.id} value={r.id}>
                    {r.name}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="Priority">
              <Dropdown value={f.priority} selectedOptions={[f.priority]} onOptionSelect={(_, v) => v.optionValue && setF({ ...f, priority: v.optionValue as Priority })}>
                {PRIORITY.map((p) => (
                  <Option key={p} value={p}>
                    {p}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="Required skills" className="span2" hint="Comma separated — used to match the bench">
              <Input value={f.skills} onChange={(_, v) => setF({ ...f, skills: v.value })} placeholder="React, TypeScript, Accessibility" />
            </Field>
            <Field label="Min. experience (years)">
              <Input type="number" value={String(f.exp)} onChange={(_, v) => setF({ ...f, exp: Number(v.value) || 0 })} />
            </Field>
            <Field label={`Allocation · ${f.alloc}%`}>
              <Slider min={10} max={100} step={10} value={f.alloc} onChange={(_, v) => setF({ ...f, alloc: v.value })} />
            </Field>
            <Field label="Needed from">
              <Input type="date" value={f.start} onChange={(_, v) => setF({ ...f, start: v.value })} />
            </Field>
            <Field label="Until">
              <Input type="date" value={f.end} onChange={(_, v) => setF({ ...f, end: v.value })} />
            </Field>
            <Field label="Headcount">
              <Input type="number" value={String(f.headcount)} onChange={(_, v) => setF({ ...f, headcount: Math.max(1, Number(v.value) || 1) })} />
            </Field>
            <Field label="Location">
              <Input value={f.location} onChange={(_, v) => setF({ ...f, location: v.value })} placeholder="Bengaluru / Remote" />
            </Field>
            <Field label="Why do you need this person?" className="span2">
              <Textarea value={f.why} onChange={(_, v) => setF({ ...f, why: v.value })} rows={3} />
            </Field>
            {error && (
              <MessageBar intent="error" className="span2">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button appearance="primary" disabled={!f.roleId || busy} onClick={save} icon={busy ? <Spinner size="tiny" /> : undefined}>
              Send to RMG
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function RateCard({ d }: { d: ProjectData }) {
  const { roles, byId } = useData();
  const notify = useToast();
  const cur = byId.currency.get(d.project.currencyId ?? '');
  const [edit, setEdit] = useState<Record<string, string>>({});
  const save = async (roleId: string) => {
    const existing = d.rates.find((r) => r.roleId === roleId);
    try {
      await setProjectRate(d.project.id, roleId, Number(edit[roleId]) || 0, existing?.costRate ?? 0, existing?.id, `${byId.role.get(roleId)?.name} rate`);
      await d.reload('billing');
      setEdit((e) => ({ ...e, [roleId]: '' }));
      notify('Rate saved', 'Applies to time submitted from now on.');
    } catch (e) {
      notify('Not saved', errorText(e), 'error');
    }
  };
  return (
    <GlassCard>
      <SectionTitle title="Rate card" hint={`Bill rate per hour in ${cur?.code ?? 'project currency'} · blank = company default`} />
      <ul className="list">
        {roles.map((r) => {
          const override = d.rates.find((x) => x.roleId === r.id);
          const fallback = r.billRate * (cur?.rate ?? 1);
          return (
            <li key={r.id} className="list-row">
              <span className="role-chip" style={{ ['--c' as string]: r.color }}>
                {r.name}
              </span>
              <span className="grow muted small">default {money(fallback, cur)}</span>
              {d.canManage ? (
                <>
                  <Input size="small" className="rate-input" type="number" placeholder={override ? String(override.billRate) : ''} value={edit[r.id] ?? ''} onChange={(_, v) => setEdit((e) => ({ ...e, [r.id]: v.value }))} contentBefore={<span className="muted">{cur?.symbol}</span>} />
                  <Button size="small" disabled={!edit[r.id]} onClick={() => save(r.id)}>
                    Save
                  </Button>
                </>
              ) : (
                <strong>{money(override?.billRate ?? fallback, cur)}</strong>
              )}
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
