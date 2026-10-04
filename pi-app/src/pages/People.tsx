import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Input, Tab, TabList } from '@fluentui/react-components';
import { Search20Regular } from '@fluentui/react-icons';
import { useData } from '../state/dataContext';
import { GlassCard } from '../ui/GlassCard';
import { Avatar } from '../ui/bits';
import { addDays, isoDay, mondayOf } from '../lib/format';
import { skillMatch, weeklyLoad } from '../lib/capacity';

export function People() {
  const { resources, members, byId, now } = useData();
  const [tab, setTab] = useState<'directory' | 'capacity'>('directory');
  const [q, setQ] = useState('');
  const mondays = useMemo(() => Array.from({ length: 10 }, (_, i) => isoDay(addDays(mondayOf(new Date(now)), i * 7))), [now]);
  const today = isoDay(new Date(now));

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/[,\s]+/).filter(Boolean);
    return resources
      .filter((r) => r.active)
      .map((r) => ({ r, score: words.length ? Math.max(skillMatch(r, words), r.name.toLowerCase().includes(q.toLowerCase()) ? 100 : 0) : 1 }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name))
      .map((x) => x.r);
  }, [resources, q]);

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <h1>People</h1>
          <p className="muted">{resources.length} people · skills, current projects and capacity</p>
        </div>
        <div className="row">
          <Input contentBefore={<Search20Regular />} placeholder="Name or skills — e.g. React, SQL" value={q} onChange={(_, v) => setQ(v.value)} />
          <TabList selectedValue={tab} onTabSelect={(_, v) => setTab(v.value as 'directory' | 'capacity')}>
            <Tab value="directory">Directory</Tab>
            <Tab value="capacity">Capacity</Tab>
          </TabList>
        </div>
      </div>

      {tab === 'directory' ? (
        <div className="people-grid">
          {list.map((r, i) => {
            const now_ = members.filter((m) => m.resourceId === r.id && m.active && (m.from ?? '0000') <= today && (m.to ?? '9999') >= today);
            const load = now_.reduce((s, m) => s + m.allocation, 0);
            return (
              <motion.div key={r.id} className="person-card glass" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
                <div className="row">
                  <Avatar name={r.name} color={r.color} size={46} />
                  <div className="grow">
                    <strong>{r.name}</strong>
                    <span className="muted small block">{r.designation}</span>
                    <span className="muted small block">
                      {r.location} · {r.experience} yrs · {r.source}
                    </span>
                  </div>
                  <span className={`load-badge ${load >= 100 ? 'full' : load >= 70 ? 'busy' : 'free'}`}>{load}%</span>
                </div>
                <div className="skills">
                  {r.skills.slice(0, 6).map((s) => (
                    <span key={s} className="skill">
                      {s}
                    </span>
                  ))}
                </div>
                <div className="small muted">
                  {now_.length ? now_.map((m) => byId.project.get(m.projectId)?.name).filter(Boolean).join(' · ') : 'On the bench'}
                </div>
                {r.managerId && <div className="small muted">Reports to {byId.resource.get(r.managerId)?.name}</div>}
              </motion.div>
            );
          })}
        </div>
      ) : (
        <GlassCard padded={false} className="heat-wrap">
          <table className="heat">
            <thead>
              <tr>
                <th>Person</th>
                {mondays.map((m) => (
                  <th key={m}>{new Date(`${m}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="person">
                      <Avatar name={r.name} color={r.color} size={24} /> {r.name}
                    </span>
                  </td>
                  {weeklyLoad(members, r.id, mondays).map((v, i) => (
                    <td key={i} className={`heat-cell ${v === 0 ? 'h0' : v < 50 ? 'h1' : v < 90 ? 'h2' : v <= 100 ? 'h3' : 'h4'}`} title={`${v}% allocated`}>
                      {v ? `${v}%` : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="heat-legend small muted">
            <span><i className="h1" /> &lt; 50%</span>
            <span><i className="h2" /> 50–89%</span>
            <span><i className="h3" /> 90–100%</span>
            <span><i className="h4" /> Over-allocated</span>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
