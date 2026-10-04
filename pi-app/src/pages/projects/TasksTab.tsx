import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import {
  Button, Dropdown, DrawerBody, DrawerHeader, DrawerHeaderTitle, Field, Input, Option, OverlayDrawer, Slider, Spinner, Tab, TabList, Textarea,
} from '@fluentui/react-components';
import { Add16Regular, Dismiss20Regular, Save20Regular, Board20Regular, TextBulletListLtr20Regular } from '@fluentui/react-icons';
import { useData } from '../../state/dataContext';
import { useToast, errorText } from '../../hooks/useToast';
import { Avatar, Status } from '../../ui/bits';
import { fmtShort, isoDay } from '../../lib/format';
import { createTask, updateTask, PRIORITY, TASK_STATUS, type Priority, type Task, type TaskStatus } from '../../services/pi';
import type { ProjectData } from './Workspace';

const COL_COLOR: Record<TaskStatus, string> = { Backlog: '#64748b', 'To do': '#94a3b8', 'In progress': '#6366f1', 'In review': '#a855f7', Blocked: '#ef4444', Done: '#22c55e' };

export function TasksTab({ d }: { d: ProjectData }) {
  const { myself, byId } = useData();
  const notify = useToast();
  const [tasks, setTasks] = useState<Task[]>(d.tasks);
  const [synced, setSynced] = useState(d.tasks);
  if (synced !== d.tasks) {
    setSynced(d.tasks);
    setTasks(d.tasks);
  }
  const [view, setView] = useState<'board' | 'list'>('board');
  const [dragging, setDragging] = useState<Task | null>(null);
  const [open, setOpen] = useState<Task | 'new' | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const shown = tasks.filter((t) => filter === 'all' || t.assigneeId === myself?.id);

  const canEdit = (t: Task) => d.canManage || (d.canContribute && (!t.assigneeId || t.assigneeId === myself?.id));

  const onStart = (e: DragStartEvent) => setDragging(tasks.find((t) => t.id === e.active.id) ?? null);
  const onEnd = async (e: DragEndEvent) => {
    setDragging(null);
    const task = tasks.find((t) => t.id === e.active.id);
    const to = e.over?.id as TaskStatus | undefined;
    if (!task || !to || task.status === to) return;
    const before = tasks;
    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, status: to, percent: to === 'Done' ? 100 : t.percent } : t)));
    try {
      await updateTask(task.id, { status: to });
      if (to === 'Done') notify('Task done 🎉', task.title);
      d.reload('tasks').catch(() => undefined);
    } catch (err) {
      setTasks(before);
      notify('Not moved', errorText(err), 'error');
    }
  };

  const quickAdd = async (status: TaskStatus, title: string) => {
    try {
      const t = await createTask({ projectId: d.project.id, title, status, assigneeId: d.canManage ? undefined : myself?.id, order: tasks.length + 1 });
      setTasks((list) => [...list, t]);
    } catch (err) {
      notify('Task not added', errorText(err), 'error');
    }
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row-between">
        <TabList size="small" selectedValue={filter} onTabSelect={(_, v) => setFilter(v.value as 'all' | 'mine')}>
          <Tab value="all">All tasks {tasks.length}</Tab>
          <Tab value="mine">Mine {tasks.filter((t) => t.assigneeId === myself?.id).length}</Tab>
        </TabList>
        <div className="row">
          <div className="seg" role="group" aria-label="View">
            <Button appearance={view === 'board' ? 'primary' : 'subtle'} icon={<Board20Regular />} onClick={() => setView('board')} aria-label="Board" />
            <Button appearance={view === 'list' ? 'primary' : 'subtle'} icon={<TextBulletListLtr20Regular />} onClick={() => setView('list')} aria-label="List" />
          </div>
          {d.canContribute && (
            <Button appearance="primary" icon={<Add16Regular />} onClick={() => setOpen('new')}>
              New task
            </Button>
          )}
        </div>
      </div>

      {view === 'board' ? (
        <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd}>
          <div className="kanban">
            {TASK_STATUS.map((s) => (
              <Column key={s} status={s} tasks={shown.filter((t) => t.status === s)} canAdd={d.canContribute} onAdd={(title) => quickAdd(s, title)}>
                {shown
                  .filter((t) => t.status === s)
                  .map((t) => (
                    <DraggableCard key={t.id} task={t} disabled={!canEdit(t)} onOpen={() => setOpen(t)} />
                  ))}
              </Column>
            ))}
          </div>
          <DragOverlay>{dragging ? <Card task={dragging} lifted /> : null}</DragOverlay>
        </DndContext>
      ) : (
        <div className="glass table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Task</th>
                <th>Assignee</th>
                <th>Status</th>
                <th>Priority</th>
                <th className="n">Est / actual</th>
                <th className="n">Done</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const a = byId.resource.get(t.assigneeId ?? '');
                return (
                  <tr key={t.id} className="clickable" onClick={() => setOpen(t)}>
                    <td>
                      <strong>{t.title}</strong>
                    </td>
                    <td>{a ? <span className="person"><Avatar name={a.name} color={a.color} size={22} /> {a.name}</span> : <span className="muted">Unassigned</span>}</td>
                    <td><Status value={t.status} /></td>
                    <td><Status value={t.priority} /></td>
                    <td className="n">{t.estimate} / {t.actual} h</td>
                    <td className="n">{Math.round(t.percent)}%</td>
                    <td>{fmtShort(t.due)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && <TaskDrawer d={d} task={open === 'new' ? null : open} canEdit={open === 'new' ? d.canContribute : canEdit(open)} onClose={() => setOpen(null)} onSaved={(t, isNew) => setTasks((list) => (isNew ? [...list, t] : list.map((x) => (x.id === t.id ? t : x))))} />}
    </div>
  );
}

function Column({ status, tasks, children, canAdd, onAdd }: { status: TaskStatus; tasks: Task[]; children: React.ReactNode; canAdd: boolean; onAdd: (title: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const hours = tasks.reduce((s, t) => s + t.estimate, 0);
  return (
    <section ref={setNodeRef} className={`kanban-col ${isOver ? 'over' : ''}`} style={{ ['--col' as string]: COL_COLOR[status] }} aria-label={status}>
      <header className="kanban-head">
        <span className="kanban-dot" />
        <strong>{status}</strong>
        <span className="muted small">{tasks.length}</span>
        <span className="grow" />
        <span className="muted small">{hours ? `${hours} h` : ''}</span>
      </header>
      <div className="kanban-cards">
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </div>
      {canAdd &&
        (adding ? (
          <form
            className="kanban-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) onAdd(title.trim());
              setTitle('');
              setAdding(false);
            }}
          >
            <Input autoFocus size="small" value={title} onChange={(_, v) => setTitle(v.value)} placeholder="Task title, Enter to add" onBlur={() => !title && setAdding(false)} />
          </form>
        ) : (
          <button className="kanban-add-btn" onClick={() => setAdding(true)}>
            <Add16Regular /> Add task
          </button>
        ))}
    </section>
  );
}

function DraggableCard({ task, disabled, onOpen }: { task: Task; disabled: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled });
  return (
    <motion.div ref={setNodeRef} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: isDragging ? 0.35 : 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} {...attributes} {...listeners}>
      <Card task={task} onOpen={onOpen} locked={disabled} />
    </motion.div>
  );
}

function Card({ task, lifted, onOpen, locked }: { task: Task; lifted?: boolean; onOpen?: () => void; locked?: boolean }) {
  const { byId, now } = useData();
  const a = byId.resource.get(task.assigneeId ?? '');
  const overdue = task.due && task.status !== 'Done' && task.due < isoDay(new Date(now));
  return (
    <article className={`task-card ${lifted ? 'lifted' : ''} ${locked ? 'locked' : ''} prio-${task.priority.toLowerCase()}`} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen?.()} tabIndex={0}>
      <span className="task-title">{task.title}</span>
      {task.percent > 0 && task.status !== 'Done' && (
        <span className="task-progress">
          <span style={{ width: `${task.percent}%` }} />
        </span>
      )}
      <span className="task-meta">
        {a ? <Avatar name={a.name} color={a.color} size={22} /> : <span className="avatar ghost" title="Unassigned">?</span>}
        <span className={`small ${overdue ? 'c-bad' : 'muted'}`}>{task.due ? fmtShort(task.due) : ''}</span>
        <span className="grow" />
        {task.estimate > 0 && (
          <span className="small muted">
            {task.actual}/{task.estimate}h
          </span>
        )}
        <span className={`prio prio-${task.priority.toLowerCase()}`} title={`${task.priority} priority`} />
      </span>
    </article>
  );
}

function TaskDrawer({ d, task, canEdit, onClose, onSaved }: { d: ProjectData; task: Task | null; canEdit: boolean; onClose: () => void; onSaved: (t: Task, isNew: boolean) => void }) {
  const { members, byId, myself } = useData();
  const notify = useToast();
  const [f, setF] = useState(() => ({
    title: task?.title ?? '', description: task?.description ?? '', assigneeId: task?.assigneeId ?? (d.canManage ? '' : (myself?.id ?? '')), status: task?.status ?? ('To do' as TaskStatus),
    priority: task?.priority ?? ('Medium' as Priority), estimate: task?.estimate ?? 0, percent: task?.percent ?? 0, start: task?.start ?? '', due: task?.due ?? '', milestoneId: task?.milestoneId ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => [...new Set(members.filter((m) => m.projectId === d.project.id && m.active).map((m) => m.resourceId))].map((id) => byId.resource.get(id)!).filter(Boolean), [members, d.project.id, byId]);

  const save = async () => {
    if (!f.title.trim()) return;
    setBusy(true);
    try {
      if (task) {
        await updateTask(task.id, { ...f, assigneeId: f.assigneeId || undefined, milestoneId: f.milestoneId || undefined });
        onSaved({ ...task, ...f, assigneeId: f.assigneeId || undefined }, false);
      } else {
        const t = await createTask({ projectId: d.project.id, ...f, assigneeId: f.assigneeId || undefined, milestoneId: f.milestoneId || undefined });
        onSaved(t, true);
      }
      d.reload('tasks').catch(() => undefined);
      notify(task ? 'Task saved' : 'Task added');
      onClose();
    } catch (e) {
      notify('Not saved', errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <OverlayDrawer open position="end" size="medium" onOpenChange={(_, v) => !v.open && onClose()}>
      <DrawerHeader>
        <DrawerHeaderTitle action={<Button appearance="subtle" icon={<Dismiss20Regular />} onClick={onClose} aria-label="Close" />}>{task ? 'Task' : 'New task'}</DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody className="stack">
        <Field label="Title" required>
          <Input value={f.title} disabled={!canEdit} onChange={(_, v) => setF({ ...f, title: v.value })} />
        </Field>
        <Field label="Description">
          <Textarea value={f.description} disabled={!canEdit} rows={4} onChange={(_, v) => setF({ ...f, description: v.value })} />
        </Field>
        <div className="form-grid">
          <Field label="Assignee" hint={!d.canManage ? 'Only the PM assigns to others' : undefined}>
            <Dropdown
              disabled={!d.canManage}
              placeholder="Unassigned"
              value={byId.resource.get(f.assigneeId)?.name ?? ''}
              selectedOptions={f.assigneeId ? [f.assigneeId] : []}
              onOptionSelect={(_, v) => setF({ ...f, assigneeId: v.optionValue ?? '' })}
            >
              {people.map((r) => (
                <Option key={r.id} value={r.id}>
                  {r.name}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="Status">
            <Dropdown disabled={!canEdit} value={f.status} selectedOptions={[f.status]} onOptionSelect={(_, v) => v.optionValue && setF({ ...f, status: v.optionValue as TaskStatus })}>
              {TASK_STATUS.map((s) => (
                <Option key={s} value={s}>
                  {s}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="Priority">
            <Dropdown disabled={!canEdit} value={f.priority} selectedOptions={[f.priority]} onOptionSelect={(_, v) => v.optionValue && setF({ ...f, priority: v.optionValue as Priority })}>
              {PRIORITY.map((s) => (
                <Option key={s} value={s}>
                  {s}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="Milestone">
            <Dropdown disabled={!canEdit} placeholder="None" value={d.milestones.find((m) => m.id === f.milestoneId)?.name ?? ''} selectedOptions={f.milestoneId ? [f.milestoneId] : []} onOptionSelect={(_, v) => setF({ ...f, milestoneId: v.optionValue ?? '' })}>
              {d.milestones.map((m) => (
                <Option key={m.id} value={m.id}>
                  {m.name}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="Estimate (h)">
            <Input type="number" disabled={!canEdit} value={String(f.estimate)} onChange={(_, v) => setF({ ...f, estimate: Number(v.value) || 0 })} />
          </Field>
          <Field label={`Progress · ${f.percent}%`}>
            <Slider disabled={!canEdit} min={0} max={100} step={5} value={f.percent} onChange={(_, v) => setF({ ...f, percent: v.value })} />
          </Field>
          <Field label="Start">
            <Input type="date" disabled={!canEdit} value={f.start} onChange={(_, v) => setF({ ...f, start: v.value })} />
          </Field>
          <Field label="Due">
            <Input type="date" disabled={!canEdit} value={f.due} onChange={(_, v) => setF({ ...f, due: v.value })} />
          </Field>
        </div>
        {task && (
          <p className="muted small">
            {task.actual} h logged against this task from approved timesheets{task.completedOn ? ` · completed ${fmtShort(task.completedOn)}` : ''}.
          </p>
        )}
        {canEdit && (
          <Button appearance="primary" icon={busy ? <Spinner size="tiny" /> : <Save20Regular />} onClick={save} disabled={busy || !f.title.trim()}>
            {task ? 'Save task' : 'Add task'}
          </Button>
        )}
      </DrawerBody>
    </OverlayDrawer>
  );
}
