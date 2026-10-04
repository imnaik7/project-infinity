export type Page = 'home' | 'projects' | 'mywork' | 'timesheet' | 'leave' | 'approvals' | 'billing' | 'talent' | 'people' | 'settings';
export type ProjectTab = 'overview' | 'team' | 'tasks' | 'time' | 'billing' | 'activity' | 'closure';

export type View =
  | { page: Exclude<Page, 'projects'> }
  | { page: 'projects'; projectId?: string; tab?: ProjectTab; create?: boolean };

export type Navigate = (v: View) => void;

export const PAGE_TITLES: Record<Page, string> = {
  home: 'Home',
  projects: 'Projects',
  mywork: 'My work',
  timesheet: 'Timesheet',
  leave: 'Leave',
  approvals: 'Approvals',
  billing: 'Billing & revenue',
  talent: 'Talent (RMG)',
  people: 'People',
  settings: 'Settings',
};
