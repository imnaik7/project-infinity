import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown, Field, MessageBar, MessageBarBody, Option, Spinner, Tab, TabList, Textarea,
} from '@fluentui/react-components';
import { ArrowUndo20Regular, Pause20Regular, Play20Regular, Send20Regular, DismissCircle20Regular, Flag20Regular } from '@fluentui/react-icons';
import { useData } from '../../state/dataContext';
import { useToast, errorText } from '../../hooks/useToast';
import type { Navigate, ProjectTab } from '../../state/nav';
import { Avatar, Status } from '../../ui/bits';
import { PageSkeleton } from '../../ui/Skeletons';
import {
  loadActivity, loadEntries, loadInvoices, loadMilestones, loadProjectRates, loadRequests, loadTasks, setProjectStatus, updateProject, HEALTH,
  type ActivityItem, type Health, type Invoice, type Milestone, type Project, type ProjectStatus, type TalentRequest, type Task, type TimeEntry,
} from '../../services/pi';
import { OverviewTab } from './OverviewTab';
import { TeamTab } from './TeamTab';
import { TasksTab } from './TasksTab';
import { TimeTab } from './TimeTab';
import { BillingTab } from './BillingTab';
import { ActivityTab } from './ActivityTab';
import { ClosureTab } from './ClosureTab';

export interface ProjectData {
  project: Project;
  tasks: Task[];
  milestones: Milestone[];
  activity: ActivityItem[];
  invoices: Invoice[];
  requests: TalentRequest[];
  entries: TimeEntry[];
  rates: { id: string; roleId: string; billRate: number; costRate: number }[];
  canManage: boolean;
  canContribute: boolean;
  reload: (what?: 'all' | 'tasks' | 'team' | 'billing' | 'activity') => Promise<void>;
}

const TABS: { id: ProjectTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'team', label: 'Team' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'time', label: 'Time' },
  { id: 'billing', label: 'Billing' },
  { id: 'activity', label: 'Activity' },
  { id: 'closure', label: 'Closure' },
];

export function Workspace({ projectId, tab, onNavigate }: { projectId: string; tab?: ProjectTab; onNavigate: Navigate }) {
  const { byId, accessOn, refresh, myself } = useData();
  const notify = useToast();
  const project = byId.project.get(projectId);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [requests, setRequests] = useState<TalentRequest[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [rates, setRates] = useState<ProjectData['rates']>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState<{ to: ProjectStatus; title: string; body: string } | null>(null);

  const reload = useCallback(
    (what: 'all' | 'tasks' | 'team' | 'billing' | 'activity' = 'all'): Promise<void> => {
      const jobs: Promise<unknown>[] = [];
      if (what === 'all' || what === 'tasks') jobs.push(loadTasks(projectId).then(setTasks), loadMilestones(projectId).then(setMilestones));
      if (what === 'all' || what === 'billing') jobs.push(loadInvoices(projectId).then(setInvoices), loadEntries({ projectId }).then(setEntries), loadProjectRates(projectId).then(setRates));
      if (what === 'all' || what === 'team') jobs.push(loadRequests(projectId).then(setRequests), refresh('projects'));
      jobs.push(loadActivity(projectId).then(setActivity));
      return Promise.all(jobs)
        .then(() => setLoaded(true))
        .catch((e: unknown) => notify('Could not load the project', errorText(e), 'error'));
    },
    [projectId, refresh, notify],
  );

  useEffect(() => {
    reload('all').catch(() => undefined);
  }, [reload]);

  if (!project) return <PageSkeleton />;
  const access = accessOn(projectId);
  const canManage = access === 'Project Manager';
  const canContribute = canManage || access === 'Contributor';
  const client = byId.client.get(project.clientId ?? '');
  const pm = byId.resource.get(project.pmId ?? '');
  const sponsor = byId.resource.get(project.sponsorId ?? '');
  const active = tab ?? 'overview';

  const move = async (to: ProjectStatus) => {
    setBusy(to);
    try {
      await setProjectStatus(project.id, to);
      await reload('all');
      const msgs: Partial<Record<ProjectStatus, string>> = {
        'Pending approval': `${sponsor?.name ?? 'The sponsor'} has an approval request.`,
        Active: 'The team can log time now.',
        Closing: 'Closure request sent to the sponsor.',
      };
      notify(`Project ${to.toLowerCase()}`, msgs[to]);
    } catch (e) {
      notify('Not possible yet', errorText(e), 'error');
    } finally {
      setBusy('');
      setConfirm(null);
    }
  };

  const setHealth = async (h: Health) => {
    try {
      await updateProject(project.id, { health: h });
      await refresh('projects');
    } catch (e) {
      notify('Could not update health', errorText(e), 'error');
    }
  };

  const actions: { to: ProjectStatus; label: string; icon: React.ReactElement; primary?: boolean; confirm?: string }[] = [];
  if (canManage) {
    if (project.status === 'Draft' || project.status === 'Rejected') actions.push({ to: 'Pending approval', label: 'Submit for approval', icon: <Send20Regular />, primary: true });
    if (project.status === 'Pending approval') actions.push({ to: 'Draft', label: 'Withdraw', icon: <ArrowUndo20Regular /> });
    if (project.status === 'Approved') actions.push({ to: 'Active', label: 'Start project', icon: <Play20Regular />, primary: true });
    if (project.status === 'Active') actions.push({ to: 'On hold', label: 'Put on hold', icon: <Pause20Regular /> });
    if (project.status === 'On hold') actions.push({ to: 'Active', label: 'Resume', icon: <Play20Regular />, primary: true });
    if (project.status === 'Closing') actions.push({ to: 'Active', label: 'Withdraw closure', icon: <ArrowUndo20Regular /> });
    if (!['Closed', 'Cancelled', 'Closing'].includes(project.status)) actions.push({ to: 'Cancelled', label: 'Cancel project', icon: <DismissCircle20Regular />, confirm: 'Cancelling stops all work. Time can no longer be logged. This can’t be undone.' });
  }

  const data: ProjectData = { project, tasks, milestones, activity, invoices, requests, entries, rates, canManage, canContribute, reload };

  return (
    <div className="page wide">
      <motion.header className="ws-head glass" style={{ ['--accent' as string]: project.color }} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <span className="ws-glow" />
        <div className="ws-title">
          <span className="ws-code mono">{project.code}</span>
          <h1>{project.name}</h1>
          <div className="row">
            <Status value={project.status} live={project.status === 'Active'} />
            <span className="muted">{client?.name}</span>
            <span className="muted">·</span>
            <span className="muted">{project.billing}</span>
            {access && <span className="pill pill-brand">You: {access}</span>}
          </div>
        </div>
        <div className="ws-people">
          {pm && (
            <span className="ws-person">
              <Avatar name={pm.name} color={pm.color} size={34} />
              <span>
                <strong>{pm.name}</strong>
                <span className="muted small block">Project manager</span>
              </span>
            </span>
          )}
          {sponsor && (
            <span className="ws-person">
              <Avatar name={sponsor.name} color={sponsor.color} size={34} />
              <span>
                <strong>{sponsor.name}</strong>
                <span className="muted small block">Sponsor</span>
              </span>
            </span>
          )}
        </div>
        <div className="ws-actions">
          {canManage && project.status === 'Active' && (
            <Dropdown className="health-dd" aria-label="Health" value={project.health} selectedOptions={[project.health]} onOptionSelect={(_, d) => d.optionValue && setHealth(d.optionValue as Health)}>
              {HEALTH.map((h) => (
                <Option key={h} value={h}>
                  {h}
                </Option>
              ))}
            </Dropdown>
          )}
          {canManage && project.status === 'Active' && (
            <Button icon={<Flag20Regular />} onClick={() => onNavigate({ page: 'projects', projectId, tab: 'closure' })}>
              Close project
            </Button>
          )}
          {actions.map((a) => (
            <Button
              key={a.label}
              appearance={a.primary ? 'primary' : 'secondary'}
              icon={busy === a.to ? <Spinner size="tiny" /> : a.icon}
              disabled={!!busy}
              onClick={() => (a.confirm ? setConfirm({ to: a.to, title: a.label, body: a.confirm }) : move(a.to))}
            >
              {a.label}
            </Button>
          ))}
        </div>
        {project.status === 'Pending approval' && (
          <MessageBar intent="info" className="span-all">
            <MessageBarBody>Waiting for {sponsor?.name ?? 'the sponsor'} to approve. They can decide here or on the Teams / Outlook card.</MessageBarBody>
          </MessageBar>
        )}
        {project.status === 'Rejected' && project.approvalComments && (
          <MessageBar intent="warning" className="span-all">
            <MessageBarBody>Sponsor’s note: “{project.approvalComments}”. Update the plan and resubmit.</MessageBarBody>
          </MessageBar>
        )}
        {!access && myself && (
          <MessageBar intent="info" className="span-all">
            <MessageBarBody>You’re viewing this project with read-only access.</MessageBarBody>
          </MessageBar>
        )}
      </motion.header>

      <TabList selectedValue={active} onTabSelect={(_, d) => onNavigate({ page: 'projects', projectId, tab: d.value as ProjectTab })} className="ws-tabs">
        {TABS.map((t) => (
          <Tab key={t.id} value={t.id}>
            {t.label}
            {t.id === 'tasks' && tasks.length > 0 && <span className="tab-count">{tasks.filter((x) => x.status !== 'Done').length}</span>}
            {t.id === 'team' && requests.some((r) => !['Fulfilled', 'Cancelled'].includes(r.status)) && <span className="tab-dot" aria-label="open talent requests" />}
          </Tab>
        ))}
      </TabList>

      {!loaded ? (
        <PageSkeleton />
      ) : (
        <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
          {active === 'overview' && <OverviewTab d={data} onNavigate={onNavigate} />}
          {active === 'team' && <TeamTab d={data} />}
          {active === 'tasks' && <TasksTab d={data} />}
          {active === 'time' && <TimeTab d={data} />}
          {active === 'billing' && <BillingTab d={data} />}
          {active === 'activity' && <ActivityTab d={data} />}
          {active === 'closure' && <ClosureTab d={data} />}
        </motion.div>
      )}

      <Dialog open={!!confirm} onOpenChange={(_, d) => !d.open && setConfirm(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{confirm?.title}?</DialogTitle>
            <DialogContent>{confirm?.body}</DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirm(null)}>Keep project</Button>
              <Button appearance="primary" className="danger" onClick={() => confirm && move(confirm.to)} disabled={!!busy}>
                {confirm?.title}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

/** Shared tiny form used by several tabs. */
export function NoteField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <Textarea value={value} onChange={(_, d) => onChange(d.value)} rows={3} />
    </Field>
  );
}
