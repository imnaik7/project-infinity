import { createContext, useContext } from 'react';
import type { AccessLevel, Approval, Client, Currency, Holiday, LeaveType, Me, Member, Project, Resource, Role } from '../services/pi';

export interface Data {
  me: Me | null;
  /** the signed-in user's resource row (null until linked by a PMO admin) */
  myself: Resource | null;
  isPmo: boolean;
  isRmg: boolean;
  isFinance: boolean;
  clients: Client[];
  roles: Role[];
  resources: Resource[];
  currencies: Currency[];
  holidays: Holiday[];
  leaveTypes: LeaveType[];
  projects: Project[] | null;
  members: Member[];
  myApprovals: Approval[];
  error: string;
  /** wall clock, ticking every minute — use instead of Date.now() during render */
  now: number;
  byId: {
    client: Map<string, Client>;
    role: Map<string, Role>;
    resource: Map<string, Resource>;
    project: Map<string, Project>;
    currency: Map<string, Currency>;
  };
  /** best access level the signed-in user has on a project today (PMO counts as Project Manager) */
  accessOn: (projectId: string) => AccessLevel | null;
  refresh: (what?: 'all' | 'projects' | 'approvals' | 'people') => Promise<void>;
}

export const DataCtx = createContext<Data | null>(null);

export function useData(): Data {
  const v = useContext(DataCtx);
  if (!v) throw new Error('useData outside DataProvider');
  return v;
}
