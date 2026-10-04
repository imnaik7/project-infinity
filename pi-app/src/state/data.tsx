import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DataCtx, type Data } from './dataContext';
import {
  getMe, loadApprovals, loadClients, loadCurrencies, loadHolidays, loadLeaveTypes, loadMembers, loadProjects, loadResources, loadRoles,
  type AccessLevel, type Approval, type Client, type Currency, type Holiday, type LeaveType, type Me, type Member, type Project, type Resource, type Role,
} from '../services/pi';

const today = () => new Date().toISOString().slice(0, 10);

export function DataProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [myApprovals, setMyApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const myself = useMemo(() => {
    if (!me) return null;
    return resources.find((r) => (me.userId && r.userId === me.userId) || (me.email && r.email === me.email)) ?? null;
  }, [me, resources]);

  // Setters only run inside promise callbacks
  const load = useCallback(
    (what: 'all' | 'projects' | 'approvals' | 'people' = 'all', mySelf?: Resource | null): Promise<void> => {
      const jobs: Promise<unknown>[] = [];
      if (what === 'all') {
        jobs.push(getMe().then(setMe), loadClients().then(setClients), loadRoles().then(setRoles), loadCurrencies().then(setCurrencies));
        jobs.push(loadHolidays().then(setHolidays), loadLeaveTypes().then(setLeaveTypes));
      }
      if (what === 'all' || what === 'people') jobs.push(loadResources().then(setResources));
      if (what === 'all' || what === 'projects') jobs.push(loadProjects().then(setProjects), loadMembers().then(setMembers));
      if ((what === 'all' || what === 'approvals') && mySelf) jobs.push(loadApprovals({ approverId: mySelf.id, status: 'Pending' }).then(setMyApprovals));
      return Promise.all(jobs)
        .then(() => setError(''))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    },
    [],
  );

  useEffect(() => {
    load('all').catch(() => undefined);
  }, [load]);

  // Approvals need to know who I am first
  useEffect(() => {
    if (myself) load('approvals', myself).catch(() => undefined);
  }, [myself, load]);

  const value = useMemo<Data>(() => {
    const caps = new Set(myself?.capabilities ?? []);
    const isPmo = caps.has('PMO');
    const byId = {
      client: new Map(clients.map((c) => [c.id, c])),
      role: new Map(roles.map((r) => [r.id, r])),
      resource: new Map(resources.map((r) => [r.id, r])),
      project: new Map((projects ?? []).map((p) => [p.id, p])),
      currency: new Map(currencies.map((c) => [c.id, c])),
    };
    const t = today();
    const accessOn = (projectId: string): AccessLevel | null => {
      if (isPmo) return 'Project Manager';
      if (!myself) return null;
      const p = byId.project.get(projectId);
      if (p?.pmId === myself.id) return 'Project Manager';
      const mine = members.filter((m) => m.projectId === projectId && m.resourceId === myself.id && m.active && (m.from ?? '0000') <= t && (m.to ?? '9999') >= t);
      if (!mine.length) return p?.sponsorId === myself.id ? 'Viewer' : null;
      const order = ['Project Manager', 'Contributor', 'Viewer'];
      return mine.map((m) => m.access).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0]!;
    };
    return {
      me, myself, isPmo, isRmg: isPmo || caps.has('RMG'), isFinance: isPmo || caps.has('FINANCE'), clients, roles, resources, currencies, holidays, leaveTypes,
      projects, members, myApprovals, error, now, byId, accessOn,
      refresh: (what = 'all') => load(what, myself),
    };
  }, [me, myself, clients, roles, resources, currencies, holidays, leaveTypes, projects, members, myApprovals, error, now, load]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
