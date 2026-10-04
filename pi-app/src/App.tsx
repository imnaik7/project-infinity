import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { FluentProvider, MessageBar, MessageBarBody, Toaster } from '@fluentui/react-components';
import { darkTheme, lightTheme } from './theme/brand';
import { DataProvider } from './state/data';
import { useData } from './state/dataContext';
import { PAGE_TITLES, type View } from './state/nav';
import { TOASTER_ID } from './hooks/useToast';
import { Aura } from './shell/Aura';
import { Sidebar } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';
import { CommandPalette } from './shell/CommandPalette';
import { PageSkeleton } from './ui/Skeletons';
import { Home } from './pages/Home';
import { Projects } from './pages/projects/Projects';
import { NewProject } from './pages/projects/NewProject';
import { Workspace } from './pages/projects/Workspace';
import { MyWork } from './pages/MyWork';
import { Timesheet } from './pages/Timesheet';
import { Leave } from './pages/Leave';
import { Approvals } from './pages/Approvals';
import { Billing } from './pages/Billing';
import { Talent } from './pages/Talent';
import { People } from './pages/People';
import { Settings } from './pages/Settings';
import './styles/tokens.css';
import './styles/shell.css';
import './styles/app.css';

function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function Shell({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const { projects, error, byId } = useData();
  const [view, setView] = useState<View>({ page: 'home' });
  const [collapsed, setCollapsed] = useState(() => readPref('pin-sidebar', 'open') === 'collapsed');
  const [paletteOpen, setPaletteOpen] = useState(false);

  const navigate = useCallback((v: View) => {
    setView(v);
    if (!(v.page === 'projects' && v.create)) document.querySelector('.main')?.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? '');
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const crumbs = useMemo(() => {
    if (view.page === 'projects' && view.projectId) {
      const p = byId.project.get(view.projectId);
      return [{ label: 'Projects', onClick: () => navigate({ page: 'projects' }) }, { label: p?.name ?? 'Project' }];
    }
    return [{ label: PAGE_TITLES[view.page] }];
  }, [view, byId, navigate]);

  let content;
  if (!projects) {
    content = error ? (
      <div className="page">
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      </div>
    ) : (
      <PageSkeleton />
    );
  } else if (view.page === 'home') content = <Home onNavigate={navigate} />;
  else if (view.page === 'projects') content = view.projectId ? <Workspace projectId={view.projectId} tab={view.tab} onNavigate={navigate} /> : <Projects onNavigate={navigate} />;
  else if (view.page === 'mywork') content = <MyWork onNavigate={navigate} />;
  else if (view.page === 'timesheet') content = <Timesheet />;
  else if (view.page === 'leave') content = <Leave />;
  else if (view.page === 'approvals') content = <Approvals onNavigate={navigate} />;
  else if (view.page === 'billing') content = <Billing onNavigate={navigate} />;
  else if (view.page === 'talent') content = <Talent />;
  else if (view.page === 'people') content = <People />;
  else if (view.page === 'settings') content = <Settings />;

  const key = view.page === 'projects' ? `projects-${view.projectId ?? 'list'}` : view.page;
  const creating = view.page === 'projects' && !!view.create;

  return (
    <div className="app">
      <Aura />
      <Sidebar
        active={view.page}
        collapsed={collapsed}
        onToggle={() =>
          setCollapsed((c) => {
            writePref('pin-sidebar', c ? 'open' : 'collapsed');
            return !c;
          })
        }
        onNavigate={navigate}
      />
      <div className="workspace">
        <TopBar crumbs={crumbs} dark={dark} onToggleTheme={onToggleTheme} onOpenPalette={() => setPaletteOpen(true)} onNavigate={navigate} />
        <main className="main">
          <AnimatePresence mode="wait">
            <motion.div key={key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
              {content}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={navigate} onToggleTheme={onToggleTheme} />
      {creating && <NewProject open onClose={() => navigate({ page: 'projects' })} onNavigate={navigate} />}
    </div>
  );
}

export default function App() {
  const [dark, setDark] = useState(() => readPref('pin-theme', 'dark') === 'dark');
  const toggle = useCallback(() => {
    setDark((d) => {
      writePref('pin-theme', d ? 'light' : 'dark');
      return !d;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  return (
    <MotionConfig reducedMotion="user">
      <FluentProvider theme={dark ? darkTheme : lightTheme}>
        <DataProvider>
          <Shell dark={dark} onToggleTheme={toggle} />
        </DataProvider>
        <Toaster toasterId={TOASTER_ID} position="bottom-end" pauseOnHover />
      </FluentProvider>
    </MotionConfig>
  );
}
