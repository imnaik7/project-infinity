import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Add20Regular, Briefcase20Regular, CalendarLtr20Regular, CheckboxChecked20Regular, Clock20Regular, Home20Regular, MoneyHand20Regular, PersonSearch20Regular,
  Search20Regular, TaskListLtr20Regular, WeatherMoon20Regular,
} from '@fluentui/react-icons';
import { useData } from '../state/dataContext';
import type { Navigate } from '../state/nav';
import { Avatar, Status } from '../ui/bits';

interface Item {
  id: string;
  group: 'Actions' | 'Navigate' | 'Projects' | 'People';
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords: string;
  right?: ReactNode;
  run: () => void;
}

/** Subsequence fuzzy match with a score favouring contiguous / word-start hits. */
function score(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) return 100 - idx + (idx === 0 || t[idx - 1] === ' ' ? 50 : 0);
  let ti = 0;
  let s = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    s += found === ti ? 3 : 1;
    ti = found + 1;
  }
  return s;
}

export function CommandPalette({ open, onClose, onNavigate, onToggleTheme }: { open: boolean; onClose: () => void; onNavigate: Navigate; onToggleTheme: () => void }) {
  const { projects, resources, byId, isRmg, isFinance } = useData();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQ('');
      setSel(0);
    }
  }

  const items = useMemo<Item[]>(() => {
    const go = (fn: () => void) => () => {
      onClose();
      fn();
    };
    const base: Item[] = [
      { id: 'new', group: 'Actions', label: 'New project', hint: 'Start the request wizard', icon: <Add20Regular />, keywords: 'create request project wizard', run: go(() => onNavigate({ page: 'projects', create: true })) },
      { id: 'log', group: 'Actions', label: 'Log time', hint: 'This week’s timesheet', icon: <Clock20Regular />, keywords: 'timesheet hours fill', run: go(() => onNavigate({ page: 'timesheet' })) },
      { id: 'leave', group: 'Actions', label: 'Apply for leave', icon: <CalendarLtr20Regular />, keywords: 'pl sick holiday vacation maternity', run: go(() => onNavigate({ page: 'leave' })) },
      { id: 'theme', group: 'Actions', label: 'Toggle dark / light theme', icon: <WeatherMoon20Regular />, keywords: 'theme dark light', run: go(onToggleTheme) },
      { id: 'home', group: 'Navigate', label: 'Home', icon: <Home20Regular />, keywords: 'dashboard overview', run: go(() => onNavigate({ page: 'home' })) },
      { id: 'mywork', group: 'Navigate', label: 'My work', icon: <TaskListLtr20Regular />, keywords: 'tasks assigned', run: go(() => onNavigate({ page: 'mywork' })) },
      { id: 'approvals', group: 'Navigate', label: 'Approvals', icon: <CheckboxChecked20Regular />, keywords: 'inbox approve reject', run: go(() => onNavigate({ page: 'approvals' })) },
      { id: 'projects', group: 'Navigate', label: 'Projects', icon: <Briefcase20Regular />, keywords: 'portfolio', run: go(() => onNavigate({ page: 'projects' })) },
      ...(isRmg ? [{ id: 'talent', group: 'Navigate' as const, label: 'Talent (RMG)', icon: <PersonSearch20Regular />, keywords: 'resource request bench hiring', run: go(() => onNavigate({ page: 'talent' })) }] : []),
      ...(isFinance ? [{ id: 'billing', group: 'Navigate' as const, label: 'Billing & revenue', icon: <MoneyHand20Regular />, keywords: 'invoice wip revenue', run: go(() => onNavigate({ page: 'billing' })) }] : []),
    ];
    const proj: Item[] = (projects ?? []).map((p) => ({
      id: `p${p.id}`, group: 'Projects', label: p.name, hint: `${p.code} · ${byId.client.get(p.clientId ?? '')?.name ?? ''}`, icon: <span className="dot" style={{ background: p.color }} />,
      keywords: `${p.code} ${p.tags.join(' ')} ${byId.client.get(p.clientId ?? '')?.name ?? ''}`, right: <Status value={p.status} />,
      run: go(() => onNavigate({ page: 'projects', projectId: p.id })),
    }));
    const people: Item[] = resources.map((r) => ({
      id: `r${r.id}`, group: 'People', label: r.name, hint: r.designation, icon: <Avatar name={r.name} color={r.color} size={22} />,
      keywords: `${r.skills.join(' ')} ${r.location}`, run: go(() => onNavigate({ page: 'people' })),
    }));
    return [...base, ...proj, ...people];
  }, [projects, resources, byId, isRmg, isFinance, onClose, onNavigate, onToggleTheme]);

  const results = useMemo(() => {
    if (!q) return items.filter((i) => i.group === 'Actions' || i.group === 'Navigate');
    return items
      .map((it) => ({ it, s: Math.max(score(q, it.label) * 2, score(q, it.keywords)) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.it);
  }, [items, q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[sel]?.run();
    } else if (e.key === 'Escape') onClose();
  };

  const groupHeads = results.map((it, i) => (i === 0 || results[i - 1]!.group !== it.group ? it.group : null));
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="palette-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="palette-input">
              <Search20Regular />
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSel(0);
                }}
                onKeyDown={onKey}
                placeholder="Search projects, people, skills and actions…"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
              />
              <kbd>Esc</kbd>
            </div>
            <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
              {results.length === 0 && <p className="muted palette-empty">No matches for “{q}”</p>}
              {results.map((it, i) => {
                const header = groupHeads[i];
                return (
                  <div key={it.id}>
                    {header && <div className="palette-group">{header}</div>}
                    <button data-idx={i} role="option" aria-selected={i === sel} className={`palette-item ${i === sel ? 'sel' : ''}`} onMouseMove={() => setSel(i)} onClick={it.run}>
                      <span className="palette-icon">{it.icon}</span>
                      <span className="grow">
                        <span className="palette-label">{it.label}</span>
                        {it.hint && <span className="muted small"> {it.hint}</span>}
                      </span>
                      {it.right}
                      {i === sel && <kbd>↵</kbd>}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="palette-foot muted small">
              <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
              <span><kbd>↵</kbd> open</span>
              <span><kbd>Esc</kbd> close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
