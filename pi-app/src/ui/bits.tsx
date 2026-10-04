// Small shared visual pieces: avatars, status chips, empty states, progress bars, money.
import type { ReactNode } from 'react';
import {
  Briefcase20Regular, CalendarLtr20Regular, CheckmarkCircle20Regular, Clock20Regular, DocumentCheckmark20Regular, Receipt20Regular,
} from '@fluentui/react-icons';
import { initials } from '../lib/format';
import type { ApprovalType } from '../services/pi';

export function Avatar({ name, color = '#7c3aed', size = 30, title }: { name: string; color?: string; size?: number; title?: string }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${color}, ${color}aa)` }} title={title ?? name} aria-label={name} role="img">
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 26 }: { people: { name: string; color?: string }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  return (
    <span className="avatar-stack">
      {shown.map((p, i) => (
        <Avatar key={i} name={p.name} color={p.color} size={size} />
      ))}
      {people.length > max && (
        <span className="avatar more" style={{ width: size, height: size, fontSize: size * 0.36 }}>
          +{people.length - max}
        </span>
      )}
    </span>
  );
}

const TONE: Record<string, string> = {
  // projects
  Draft: 'slate', 'Pending approval': 'amber', Approved: 'indigo', Rejected: 'red', Active: 'green', 'On hold': 'gray', Closing: 'violet', Closed: 'teal', Cancelled: 'gray',
  // tasks
  Backlog: 'gray', 'To do': 'slate', 'In progress': 'indigo', 'In review': 'violet', Blocked: 'red', Done: 'green',
  // sheets / approvals / invoices / leave / talent
  Submitted: 'amber', Pending: 'amber', Sent: 'indigo', Paid: 'green', Planned: 'slate', Completed: 'teal', Accepted: 'green', Invoiced: 'violet',
  'In review ': 'violet', 'Matched internally': 'teal', Hiring: 'amber', 'Candidate selected': 'indigo', Fulfilled: 'green',
  // health / priority
  'On track': 'green', 'At risk': 'amber', 'Off track': 'red', Low: 'gray', Medium: 'slate', High: 'amber', Critical: 'red',
};

export function Status({ value, live }: { value: string; live?: boolean }) {
  return (
    <span className={`status status-${TONE[value] ?? 'gray'}`}>
      <span className={`status-dot ${live ? 'live' : ''}`} />
      {value}
    </span>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <span className="empty-icon">{icon}</span>}
      <strong>{title}</strong>
      {children && <span className="muted small">{children}</span>}
      {action}
    </div>
  );
}

export function Bar({ value, max = 100, tone = 'brand', label }: { value: number; max?: number; tone?: 'brand' | 'ok' | 'warn' | 'bad'; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <span className={`bar bar-${tone}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

export function ApprovalIcon({ type }: { type: ApprovalType }) {
  const map: Record<ApprovalType, ReactNode> = {
    Project: <Briefcase20Regular className="c-info" />,
    Timesheet: <Clock20Regular className="c-warn" />,
    Closure: <DocumentCheckmark20Regular className="c-ok" />,
    Invoice: <Receipt20Regular className="c-info" />,
    Leave: <CalendarLtr20Regular className="c-bad" />,
  };
  return <>{map[type] ?? <CheckmarkCircle20Regular />}</>;
}

export function Kpi({ label, value, foot, tone, icon }: { label: string; value: ReactNode; foot?: ReactNode; tone?: string; icon?: ReactNode }) {
  return (
    <div className={`kpi glass pad ${tone ?? ''}`}>
      <span className="kpi-label">
        {icon}
        {label}
      </span>
      <span className="kpi-value">{value}</span>
      {foot && <span className="kpi-foot">{foot}</span>}
    </div>
  );
}
