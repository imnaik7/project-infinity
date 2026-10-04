import { motion } from 'motion/react';
import { ArrowSwap20Regular, CheckmarkCircle20Regular, Clock20Regular, Money20Regular, PeopleTeam20Regular, PersonSearch20Regular, TaskListLtr20Regular, Note20Regular } from '@fluentui/react-icons';
import { useData } from '../../state/dataContext';
import { GlassCard } from '../../ui/GlassCard';
import { Avatar, Empty } from '../../ui/bits';
import { fmtDate, relative } from '../../lib/format';
import type { ProjectData } from './Workspace';

const ICON: Record<string, React.ReactNode> = {
  Status: <ArrowSwap20Regular />,
  Approval: <CheckmarkCircle20Regular />,
  Team: <PeopleTeam20Regular />,
  Task: <TaskListLtr20Regular />,
  Time: <Clock20Regular />,
  Billing: <Money20Regular />,
  Talent: <PersonSearch20Regular />,
  Note: <Note20Regular />,
};

export function ActivityTab({ d }: { d: ProjectData }) {
  const { byId, now } = useData();
  if (!d.activity.length) return <Empty title="No activity yet" />;
  const headers = d.activity.map((a, i) => (i === 0 || fmtDate(a.on) !== fmtDate(d.activity[i - 1]!.on) ? fmtDate(a.on) : null));
  return (
    <GlassCard>
      <ol className="feed">
        {d.activity.map((a, i) => {
          const header = headers[i];
          const actor = byId.resource.get(a.actorId ?? '');
          return (
            <motion.li key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.02 }}>
              {header && <div className="feed-day">{header}</div>}
              <div className={`feed-item kind-${a.kind.toLowerCase()}`}>
                <span className="feed-icon">{ICON[a.kind]}</span>
                <span className="grow">
                  {a.text}
                  {a.details && <span className="muted small block">{a.details}</span>}
                </span>
                {actor && <Avatar name={actor.name} color={actor.color} size={22} />}
                <span className="muted small">{relative(a.on, now)}</span>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </GlassCard>
  );
}
