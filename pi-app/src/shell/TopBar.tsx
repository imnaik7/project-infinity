import { AnimatePresence, motion } from 'motion/react';
import { Popover, PopoverSurface, PopoverTrigger, Tooltip } from '@fluentui/react-components';
import { Alert24Regular, ChevronRight16Regular, Search20Regular, WeatherMoon20Regular, WeatherSunny20Regular } from '@fluentui/react-icons';
import { useData } from '../state/dataContext';
import type { Navigate } from '../state/nav';
import { relative } from '../lib/format';
import { Avatar, ApprovalIcon } from '../ui/bits';

interface Crumb {
  label: string;
  onClick?: () => void;
}

interface Props {
  crumbs: Crumb[];
  dark: boolean;
  onToggleTheme: () => void;
  onOpenPalette: () => void;
  onNavigate: Navigate;
}

export function TopBar({ crumbs, dark, onToggleTheme, onOpenPalette, onNavigate }: Props) {
  const { myApprovals, myself, me, now, byId } = useData();
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  return (
    <header className="topbar">
      <nav className="crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} className="crumb">
            {i > 0 && <ChevronRight16Regular className="muted" />}
            {c.onClick ? <button onClick={c.onClick}>{c.label}</button> : <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>}
          </span>
        ))}
      </nav>

      <button className="search-pill" onClick={onOpenPalette} aria-label="Search and commands">
        <Search20Regular />
        <span>Search projects, people, actions…</span>
        <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>

      <div className="topbar-actions">
        <Popover positioning="below-end" withArrow>
          <PopoverTrigger disableButtonEnhancement>
            <button className="icon-btn bell" aria-label={`Approvals waiting (${myApprovals.length})`}>
              <Alert24Regular />
              <AnimatePresence>
                {myApprovals.length > 0 && (
                  <motion.span className="bell-dot" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                    {myApprovals.length}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </PopoverTrigger>
          <PopoverSurface className="notes">
            <strong>Waiting for you</strong>
            {myApprovals.length === 0 && <p className="muted small">Nothing to approve — inbox zero ✨</p>}
            {myApprovals.slice(0, 8).map((a) => (
              <button key={a.id} className="note" onClick={() => onNavigate({ page: 'approvals' })}>
                <ApprovalIcon type={a.type} />
                <span className="grow">
                  {a.summary || a.title}
                  {a.requestedById && <span className="muted small block">from {byId.resource.get(a.requestedById)?.name}</span>}
                </span>
                <span className="muted small">{relative(a.requestedOn, now)}</span>
              </button>
            ))}
          </PopoverSurface>
        </Popover>

        <Tooltip content={dark ? 'Light theme' : 'Dark theme'} relationship="label">
          <button className="icon-btn" onClick={onToggleTheme}>
            {dark ? <WeatherSunny20Regular /> : <WeatherMoon20Regular />}
          </button>
        </Tooltip>

        <Tooltip content={myself ? `${myself.name} · ${myself.designation}` : (me?.name ?? 'Signed in')} relationship="label">
          <span className="me">
            <Avatar name={myself?.name ?? me?.name ?? '?'} color={myself?.color} size={34} />
          </span>
        </Tooltip>
      </div>
    </header>
  );
}
