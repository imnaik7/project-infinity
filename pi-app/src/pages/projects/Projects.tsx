import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Button, Dropdown, Input, Option, Tab, TabList, ToggleButton } from '@fluentui/react-components';
import { Add20Regular, Board20Regular, Grid20Regular, Person20Regular, Search20Regular, TableSimple20Regular } from '@fluentui/react-icons';
import { useData } from '../../state/dataContext';
import type { Navigate } from '../../state/nav';
import { AvatarStack, Avatar, Bar, Empty, Status } from '../../ui/bits';
import { compact, fmtShort, pct } from '../../lib/format';
import { BILLING, PROJECT_STATUS, type Project } from '../../services/pi';
import { SkeletonBlock } from '../../ui/Skeletons';

type Mode = 'cards' | 'board' | 'table';
const FILTERS = ['All', 'Active', 'Pending approval', 'Draft', 'On hold', 'Closing', 'Closed'] as const;

export function Projects({ onNavigate }: { onNavigate: Navigate }) {
  const { projects, byId, members, myself, isPmo } = useData();
  const [mode, setMode] = useState<Mode>('cards');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [billing, setBilling] = useState('all');
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (projects ?? [])
      .filter((p) => filter === 'All' || p.status === filter)
      .filter((p) => billing === 'all' || p.billing === billing)
      .filter((p) => !mine || p.pmId === myself?.id || members.some((m) => m.projectId === p.id && m.resourceId === myself?.id))
      .filter((p) => !t || `${p.name} ${p.code} ${byId.client.get(p.clientId ?? '')?.name ?? ''} ${p.tags.join(' ')}`.toLowerCase().includes(t));
  }, [projects, filter, billing, mine, q, byId, members, myself]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f, (projects ?? []).filter((p) => f === 'All' || p.status === f).length])), [projects]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="muted">{isPmo ? 'Every project in the portfolio' : 'Projects you lead, sponsor or work on'} · {projects?.length ?? '…'} total</p>
        </div>
        <Button appearance="primary" size="large" icon={<Add20Regular />} onClick={() => onNavigate({ page: 'projects', create: true })}>
          New project
        </Button>
      </div>

      <div className="toolbar glass">
        <TabList size="small" selectedValue={filter} onTabSelect={(_, d) => setFilter(d.value as (typeof FILTERS)[number])}>
          {FILTERS.map((f) => (
            <Tab key={f} value={f}>
              {f} <span className="tab-count">{counts[f]}</span>
            </Tab>
          ))}
        </TabList>
        <span className="grow" />
        <Input contentBefore={<Search20Regular />} placeholder="Search name, code, client, tag" value={q} onChange={(_, d) => setQ(d.value)} />
        <Dropdown value={billing === 'all' ? 'All billing models' : billing} selectedOptions={[billing]} onOptionSelect={(_, d) => d.optionValue && setBilling(d.optionValue)}>
          <Option value="all">All billing models</Option>
          {BILLING.map((b) => (
            <Option key={b} value={b}>
              {b}
            </Option>
          ))}
        </Dropdown>
        <ToggleButton icon={<Person20Regular />} checked={mine} onClick={() => setMine((m) => !m)}>
          Mine
        </ToggleButton>
        <div className="seg" role="group" aria-label="View">
          <Button appearance={mode === 'cards' ? 'primary' : 'subtle'} icon={<Grid20Regular />} onClick={() => setMode('cards')} aria-label="Cards" />
          <Button appearance={mode === 'board' ? 'primary' : 'subtle'} icon={<Board20Regular />} onClick={() => setMode('board')} aria-label="Board" />
          <Button appearance={mode === 'table' ? 'primary' : 'subtle'} icon={<TableSimple20Regular />} onClick={() => setMode('table')} aria-label="Table" />
        </div>
      </div>

      {!projects ? (
        <div className="project-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="glass pad">
              <SkeletonBlock h={120} />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <Empty title="No projects match" action={<Button onClick={() => onNavigate({ page: 'projects', create: true })}>Start a project</Button>}>
          Try another filter, or request a new project.
        </Empty>
      ) : mode === 'cards' ? (
        <div className="project-grid">
          {list.map((p, i) => (
            <ProjectCard key={p.id} p={p} index={i} onOpen={() => onNavigate({ page: 'projects', projectId: p.id })} />
          ))}
        </div>
      ) : mode === 'board' ? (
        <div className="board">
          {PROJECT_STATUS.filter((s) => s !== 'Cancelled' && s !== 'Rejected').map((s) => {
            const col = list.filter((p) => p.status === s);
            return (
              <div key={s} className="board-col">
                <div className="board-col-head">
                  <Status value={s} />
                  <span className="muted small">{col.length}</span>
                </div>
                {col.map((p) => (
                  <button key={p.id} className="board-card" onClick={() => onNavigate({ page: 'projects', projectId: p.id })} style={{ ['--accent' as string]: p.color }}>
                    <strong>{p.name}</strong>
                    <span className="muted small">{byId.client.get(p.clientId ?? '')?.name}</span>
                    <Bar value={p.percent} label="Progress" />
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Status</th>
                <th>Health</th>
                <th>Billing</th>
                <th>PM</th>
                <th className="n">Progress</th>
                <th className="n">Hours</th>
                <th className="n">Recognised</th>
                <th>Ends</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const cur = byId.currency.get(p.currencyId ?? '');
                const pm = byId.resource.get(p.pmId ?? '');
                return (
                  <tr key={p.id} className="clickable" onClick={() => onNavigate({ page: 'projects', projectId: p.id })}>
                    <td>
                      <span className="dot" style={{ background: p.color }} /> <strong>{p.name}</strong> <span className="muted small">{p.code}</span>
                    </td>
                    <td>{byId.client.get(p.clientId ?? '')?.name}</td>
                    <td><Status value={p.status} /></td>
                    <td><Status value={p.health} /></td>
                    <td className="small">{p.billing}</td>
                    <td>{pm && <Avatar name={pm.name} color={pm.color} size={24} />}</td>
                    <td className="n">{Math.round(p.percent)}%</td>
                    <td className="n">{Math.round(p.actualHours)} / {p.budgetHours}</td>
                    <td className="n">{compact(p.recognised, cur)}</td>
                    <td>{fmtShort(p.end)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProjectCard({ p, index, onOpen }: { p: Project; index: number; onOpen: () => void }) {
  const { byId, members } = useData();
  const client = byId.client.get(p.clientId ?? '');
  const cur = byId.currency.get(p.currencyId ?? '');
  const pm = byId.resource.get(p.pmId ?? '');
  const team = [...new Set(members.filter((m) => m.projectId === p.id && m.active).map((m) => m.resourceId))].map((id) => byId.resource.get(id)).filter(Boolean) as { name: string; color: string }[];
  const burn = pct(p.actualHours, p.budgetHours);
  return (
    <motion.button
      className="project-card glass"
      onClick={onOpen}
      style={{ ['--accent' as string]: p.color }}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.05, type: 'spring', stiffness: 260, damping: 26 }}
      whileHover={{ y: -4 }}
    >
      <span className="pc-glow" />
      <div className="pc-top">
        <span className="pc-code mono">{p.code}</span>
        <Status value={p.status} live={p.status === 'Active'} />
      </div>
      <h3 className="pc-name">{p.name}</h3>
      <span className="muted small">
        {client?.name} · {p.billing}
      </span>
      <div className="pc-metrics">
        <div>
          <span className="muted small">Progress</span>
          <strong>{Math.round(p.percent)}%</strong>
          <Bar value={p.percent} label="Progress" />
        </div>
        <div>
          <span className="muted small">Budget burn</span>
          <strong className={burn > 100 ? 'c-bad' : burn > 85 ? 'c-warn' : ''}>{burn}%</strong>
          <Bar value={burn} tone={burn > 100 ? 'bad' : burn > 85 ? 'warn' : 'ok'} label="Budget hours used" />
        </div>
      </div>
      <div className="pc-foot">
        {pm && (
          <span className="pc-pm">
            <Avatar name={pm.name} color={pm.color} size={24} /> <span className="small">{pm.name.split(' ')[0]}</span>
          </span>
        )}
        <AvatarStack people={team} size={24} />
        <span className="grow" />
        <span className={`health-dot ${p.health.replace(' ', '-').toLowerCase()}`} title={p.health} />
        <span className="small muted">{p.billing === 'Non-billable' ? 'Internal' : compact(p.recognised, cur)}</span>
      </div>
    </motion.button>
  );
}
