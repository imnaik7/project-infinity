import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Dropdown, Option, Tab, TabList } from '@fluentui/react-components';
import { useData } from '../state/dataContext';
import { useToast, errorText } from '../hooks/useToast';
import type { Navigate } from '../state/nav';
import { GlassCard, SectionTitle } from '../ui/GlassCard';
import { Bar, Empty, Status } from '../ui/bits';
import { fmtShort, isoDay } from '../lib/format';
import { loadRequests, loadTasks, updateTask, TASK_STATUS, type TalentRequest, type Task, type TaskStatus } from '../services/pi';

export function MyWork({ onNavigate }: { onNavigate: Navigate }) {
  const { myself, byId, projects, members, now } = useData();
  const notify = useToast();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [requests, setRequests] = useState<TalentRequest[]>([]);
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const today = isoDay(new Date(now));

  useEffect(() => {
    if (!myself) return;
    loadTasks(undefined, myself.id).then(setTasks).catch(() => setTasks([]));
    loadRequests().then((r) => setRequests(r.filter((x) => x.requestedById === myself.id))).catch(() => undefined);
  }, [myself]);

  const move = async (t: Task, status: TaskStatus) => {
    setTasks((list) => list?.map((x) => (x.id === t.id ? { ...x, status } : x)) ?? null);
    try {
      await updateTask(t.id, { status });
      if (status === 'Done') notify('Nice work 🎉', t.title);
    } catch (e) {
      setTasks((list) => list?.map((x) => (x.id === t.id ? t : x)) ?? null);
      notify('Not updated', errorText(e), 'error');
    }
  };

  const mine = (tasks ?? []).filter((t) => (tab === 'open' ? t.status !== 'Done' : t.status === 'Done'));
  const byProject = new Map<string, Task[]>();
  for (const t of mine) byProject.set(t.projectId, [...(byProject.get(t.projectId) ?? []), t]);
  const myProjects = (projects ?? []).filter((p) => p.pmId === myself?.id || members.some((m) => m.projectId === p.id && m.resourceId === myself?.id && m.active));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My work</h1>
          <p className="muted">
            {(tasks ?? []).filter((t) => t.status !== 'Done').length} open tasks · {(tasks ?? []).filter((t) => t.status !== 'Done' && t.due && t.due < today).length} overdue
          </p>
        </div>
        <TabList selectedValue={tab} onTabSelect={(_, v) => setTab(v.value as 'open' | 'done')}>
          <Tab value="open">Open</Tab>
          <Tab value="done">Done</Tab>
        </TabList>
      </div>

      <div className="mywork">
        <div className="stack">
          {tasks && mine.length === 0 && <Empty title={tab === 'open' ? 'You’re all caught up' : 'Nothing completed yet'} />}
          {[...byProject.entries()].map(([pid, list], gi) => {
            const p = byId.project.get(pid);
            return (
              <GlassCard key={pid} index={gi}>
                <SectionTitle title={p?.name ?? 'Project'} hint={`${list.length} task(s)`} action={<button className="linkish small" onClick={() => onNavigate({ page: 'projects', projectId: pid, tab: 'tasks' })}>Open board →</button>} />
                <ul className="list">
                  {list.map((t, i) => (
                    <motion.li key={t.id} className="list-row" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                      <span className={`prio prio-${t.priority.toLowerCase()}`} title={`${t.priority} priority`} />
                      <span className="grow">
                        {t.title}
                        <span className={`small block ${t.due && t.due < today && t.status !== 'Done' ? 'c-bad' : 'muted'}`}>
                          {t.due ? `Due ${fmtShort(t.due)}` : 'No due date'} · {t.actual}/{t.estimate} h
                        </span>
                      </span>
                      <Bar value={t.percent} label="Progress" />
                      <Dropdown size="small" className="status-dd" value={t.status} selectedOptions={[t.status]} onOptionSelect={(_, v) => v.optionValue && move(t, v.optionValue as TaskStatus)} aria-label="Status">
                        {TASK_STATUS.map((s) => (
                          <Option key={s} value={s}>
                            {s}
                          </Option>
                        ))}
                      </Dropdown>
                    </motion.li>
                  ))}
                </ul>
              </GlassCard>
            );
          })}
        </div>
        <div className="stack">
          <GlassCard>
            <SectionTitle title="My projects" />
            <ul className="list">
              {myProjects.map((p) => (
                <li key={p.id} className="list-row clickable" onClick={() => onNavigate({ page: 'projects', projectId: p.id })}>
                  <span className="dot" style={{ background: p.color }} />
                  <span className="grow">
                    {p.name}
                    <span className="muted small block">{p.pmId === myself?.id ? 'You manage this' : members.find((m) => m.projectId === p.id && m.resourceId === myself?.id)?.access}</span>
                  </span>
                  <Status value={p.status} />
                </li>
              ))}
            </ul>
          </GlassCard>
          {requests.length > 0 && (
            <GlassCard>
              <SectionTitle title="My talent requests" />
              <ul className="list">
                {requests.map((r) => (
                  <li key={r.id} className="list-row">
                    <span className="grow">
                      {r.title}
                      <span className="muted small block">
                        {byId.project.get(r.projectId)?.name} · {r.number}
                      </span>
                    </span>
                    <Status value={r.status} />
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
