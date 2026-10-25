# Project Infinity — projects, time, billing and talent

A professional-services platform on the Microsoft Power Platform: project lifecycle, team and access, tasks and
milestones, timesheets and leave, approvals, invoicing (role × rate, milestones, retainers, tax), revenue and talent
requests.

Everything ships in one Dataverse solution, **ProjectInfinity** (publisher prefix `pin`, base currency INR plus USD
and EUR).

## What's in this repo

| Folder | What it is |
|---|---|
| [`pi-app/`](pi-app/) | **Web code app** (React + Vite + Fluent UI v9 + motion + dnd-kit): Home, Projects (cards / board / table + wizard), project workspace, My work, Timesheet, Leave, Approvals, Billing, Talent, People, Settings. `demo-tour/` records the product video |
| [`pi-dataverse/`](pi-dataverse/) | Node scripts for the Dataverse Web API: `foundation.mjs` (publisher, solution, currencies, access team template), `schema.mjs` (20 tables), `roles.mjs` (5 security roles), `seed.mjs` + `seed-activity.mjs`, `test-engine.mjs` |
| [`pi-plugins/`](pi-plugins/) | C# plug-ins: project lifecycle, members (access team sync), tasks, milestones, resource requests, currency, timesheets, leave, approvals, invoices; `register.mjs` registers 38 steps |

## Prerequisites

- Node.js 22+, npm 10+, .NET SDK (plug-ins)
- A Power Platform environment with Dataverse
- Azure CLI (`az login`) — the scripts use its token for the Dataverse Web API. Set `DATAVERSE_URL` to your environment URL.

## Set up

```bash
node pi-dataverse/foundation.mjs
node pi-dataverse/schema.mjs
node pi-dataverse/foundation.mjs      # again, for the access team template
node pi-dataverse/roles.mjs
dotnet build pi-plugins               # needs a strong-name key, see below
node pi-plugins/register.mjs
node pi-dataverse/seed.mjs && node pi-dataverse/seed-activity.mjs

cd pi-app
npm install
npx --no-install pa app init -n "Project Infinity" -e <environment-id>   # first time only
npm run build
npx --no-install pa app push -s <solution-id>
```

Demo mode with fictional data: `cd pi-app && npx vite --mode demo`.

## Notes

- **Plug-in signing key:** `ProjectInfinity.Plugins.snk` is not in the repo. Create your own with
  `sn -k pi-plugins/ProjectInfinity.Plugins.snk` before building.
- No secrets are stored here; scripts sign in with the Azure CLI.
- Progress notes and IDs: [`pi-app/memory-bank.md`](pi-app/memory-bank.md).
