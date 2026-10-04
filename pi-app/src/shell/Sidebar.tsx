import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { Tooltip } from '@fluentui/react-components';
import {
  Add24Regular, Briefcase24Regular, CalendarLtr24Regular, CheckboxChecked24Regular, ChevronDoubleLeft20Regular, ChevronDoubleRight20Regular, Clock24Regular,
  Home24Regular, MoneyHand24Regular, People24Regular, PersonSearch24Regular, Settings24Regular, TaskListLtr24Regular,
} from '@fluentui/react-icons';
import { useData } from '../state/dataContext';
import type { Navigate, Page } from '../state/nav';
import { Wordmark } from './Logo';

export const APP_VERSION = '1.0.0';

interface Item {
  page: Page;
  label: string;
  icon: ReactNode;
  show?: boolean;
}

interface Props {
  active: Page;
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: Navigate;
}

export function Sidebar({ active, collapsed, onToggle, onNavigate }: Props) {
  const { myApprovals, isPmo, isRmg, isFinance } = useData();
  const groups: { title: string; items: Item[] }[] = [
    {
      title: 'Work',
      items: [
        { page: 'home', label: 'Home', icon: <Home24Regular /> },
        { page: 'mywork', label: 'My work', icon: <TaskListLtr24Regular /> },
        { page: 'timesheet', label: 'Timesheet', icon: <Clock24Regular /> },
        { page: 'leave', label: 'Leave', icon: <CalendarLtr24Regular /> },
        { page: 'approvals', label: 'Approvals', icon: <CheckboxChecked24Regular /> },
      ],
    },
    { title: 'Delivery', items: [{ page: 'projects', label: 'Projects', icon: <Briefcase24Regular /> }] },
    {
      title: 'Operations',
      items: [
        { page: 'talent', label: 'Talent (RMG)', icon: <PersonSearch24Regular />, show: isRmg },
        { page: 'billing', label: 'Billing & revenue', icon: <MoneyHand24Regular />, show: isFinance },
        { page: 'people', label: 'People', icon: <People24Regular /> },
        { page: 'settings', label: 'Settings', icon: <Settings24Regular />, show: isPmo },
      ],
    },
  ];
  const badges: Partial<Record<Page, number>> = { approvals: myApprovals.length };

  const item = (n: Item) => {
    const isActive = n.page === active;
    const btn = (
      <button
        key={n.page}
        className={`nav-item ${isActive ? 'active' : ''}`}
        onClick={() => onNavigate({ page: n.page } as never)}
        aria-current={isActive ? 'page' : undefined}
        aria-label={collapsed ? n.label : undefined}
      >
        {isActive && <motion.span layoutId="nav-active" className="nav-active" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
        <span className="nav-icon">{n.icon}</span>
        {!collapsed && <span className="nav-label">{n.label}</span>}
        {!!badges[n.page] && <span className={`nav-badge ${collapsed ? 'dot' : ''}`}>{collapsed ? '' : badges[n.page]}</span>}
      </button>
    );
    return collapsed ? (
      <Tooltip key={n.page} content={n.label} relationship="label" positioning="after">
        {btn}
      </Tooltip>
    ) : (
      btn
    );
  };

  return (
    <motion.aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} animate={{ width: collapsed ? 72 : 248 }} transition={{ type: 'spring', stiffness: 300, damping: 32 }}>
      <div className="brand">
        <Wordmark collapsed={collapsed} />
      </div>
      <nav aria-label="Main" className="nav-groups">
        {groups.map((g) => {
          const items = g.items.filter((i) => i.show !== false);
          if (!items.length) return null;
          return (
            <div key={g.title} className="nav-group">
              {!collapsed && <span className="nav-group-title">{g.title}</span>}
              {items.map(item)}
            </div>
          );
        })}
      </nav>
      <button className="cta" onClick={() => onNavigate({ page: 'projects', create: true })} aria-label="New project">
        <Add24Regular />
        {!collapsed && <span>New project</span>}
      </button>
      <div className="sidebar-foot">
        {!collapsed && <span className="muted small">v{APP_VERSION}</span>}
        <button className="icon-btn" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronDoubleRight20Regular /> : <ChevronDoubleLeft20Regular />}
        </button>
      </div>
    </motion.aside>
  );
}
