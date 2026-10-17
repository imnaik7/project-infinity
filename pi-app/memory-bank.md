# Project Infinity — Memory Bank

## Project
- Code app: `Flows/pi-app` (React + Vite + Fluent v9 + motion + dnd-kit), display name "Project Infinity"
- Environment: Dev_USA `7a5c7438-a0d8-ebc0-9b61-ad57aa550f0a`; solution **ProjectInfinity** (publisher `pin`, option prefix 54320)
- Plan: `~/.claude/plans/hidden-growing-wozniak.md`
- Deployed 2026-10-04 into ProjectInfinity (fba58828-e1bf-f111-a05a-00224832c67c): https://apps.powerapps.com/play/e/7a5c7438-a0d8-ebc0-9b61-ad57aa550f0a/app/62cbfdc5-cb3c-4a94-aea6-d3c306bb9166 (add &hideNavBar=true to hide the player header). Pushed to GitHub (4736061)

## Backend (live in Dev_USA)
- `pi-dataverse/foundation.mjs` publisher/solution/currencies (INR base + USD, EUR) + access team template "Project Infinity Team"
- `pi-dataverse/schema.mjs` 20 tables (projects, members, tasks, milestones, timesheets/entries, approvals, invoices/lines, revenue, activity, talent requests, holidays, leave types/balances/requests…)
- `pi-dataverse/roles.mjs` 5 roles (PMO Admin, Project Manager, Team Member, Resource Manager, Finance); project read is user-level + access team
- `pi-plugins/` C# (signed) — Project lifecycle, Member (access team sync, effective-dated roles), Task, Milestone, ResourceRequest, Currency, Timesheet (submit validation + rate snapshot + holiday/leave prefill), TimeEntry lock, LeaveRequest (balances, auto-fill sheets, auto-approve full-leave weeks), Approval (single decision point), Invoice (role×rate lines, milestones, retainer, tax, no double billing). `node pi-plugins/register.mjs` (38 steps)
- Seed: `seed.mjs` (master data + 8 projects) then `seed-activity.mjs` (leave, 6 weeks timesheets, invoices, talent requests)
- UI-only capability flags: `pin_resource.pin_capabilities` ("PMO, RMG, Finance")

## App
- Pages: Home, Projects (cards/board/table + wizard), Workspace tabs (Overview, Team, Tasks kanban, Time, Billing + InvoiceView/print, Activity, Closure), My work, Timesheet, Leave (+team calendar), Approvals inbox, Billing, Talent (RMG), People (+heatmap), Settings
- Data: `src/services/pi.ts`; state `src/state/data.tsx` + `dataContext.ts`; styles `src/styles/app.css`
- Status: tsc + eslint clean, build OK

## Next
- Engine test script, deploy (confirm), flows: approval sync (Teams/Outlook), Talent Bridge custom connector (SharePoint REST → Onboarding Candidates, SAP-ready), notifications, retainer run
