using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace ProjectInfinity.Plugins
{
    /// <summary>Calendar helpers shared by timesheets and leave: holidays, working days, daily hours.</summary>
    internal static class Calendar
    {
        public static decimal DailyHours(Entity resource) => Math.Max(1m, (Pin.Dec(resource, "pin_weeklycapacity") > 0 ? Pin.Dec(resource, "pin_weeklycapacity") : 40m) / 5m);
        public static decimal WeeklyHours(Entity resource) => Pin.Dec(resource, "pin_weeklycapacity") > 0 ? Pin.Dec(resource, "pin_weeklycapacity") : 40m;
        public static bool IsWeekend(DateTime d) => d.DayOfWeek == DayOfWeek.Saturday || d.DayOfWeek == DayOfWeek.Sunday;

        /// <summary>Holidays between two dates that apply to a location (blank location = everyone).</summary>
        public static Dictionary<DateTime, string> Holidays(IOrganizationService sys, DateTime from, DateTime to, string location)
        {
            var rows = Pin.Query(sys, "pin_holiday", new[] { "pin_name", "pin_date", "pin_location" },
                ("pin_date", ConditionOperator.OnOrAfter, from.Date), ("pin_date", ConditionOperator.OnOrBefore, to.Date)).Entities;
            var map = new Dictionary<DateTime, string>();
            foreach (var h in rows)
            {
                var loc = Pin.Str(h, "pin_location");
                if (loc != "" && !string.Equals(loc, location ?? "", StringComparison.OrdinalIgnoreCase)) continue;
                var d = (Pin.Date(h, "pin_date") ?? DateTime.MinValue).Date;
                map[d] = Pin.Str(h, "pin_name");
            }
            return map;
        }
    }

    /// <summary>Finds or creates a resource's timesheet for a week (Draft), owned by the resource's user.</summary>
    internal static class Sheets
    {
        public static string Key(Guid resourceId, DateTime weekStart) => $"{resourceId:N}|{weekStart:yyyy-MM-dd}";

        public static Entity For(IOrganizationService sys, EntityReference resource, DateTime anyDay, bool create = true)
        {
            var week = Pin.Monday(anyDay);
            var existing = Pin.Query(sys, "pin_timesheet", new[] { "pin_status", "pin_weekstart", "ownerid" }, ("pin_weekkey", ConditionOperator.Equal, Key(resource.Id, week))).Entities.FirstOrDefault();
            if (existing != null || !create) return existing;
            var res = sys.Retrieve("pin_resource", resource.Id, new ColumnSet("pin_systemuser", "pin_manager"));
            var sheet = new Entity("pin_timesheet")
            {
                ["pin_resource"] = resource,
                ["pin_weekstart"] = week,
                ["pin_weekkey"] = Key(resource.Id, week),
                ["pin_status"] = Pin.O(Pin.SheetStatus.Draft),
            };
            if (Pin.Ref(res, "pin_manager") != null) sheet["pin_approver"] = Pin.Ref(res, "pin_manager");
            if (Pin.Ref(res, "pin_systemuser") != null) sheet["ownerid"] = new EntityReference("systemuser", Pin.Ref(res, "pin_systemuser").Id);
            sheet.Id = sys.Create(sheet);
            return sys.Retrieve("pin_timesheet", sheet.Id, new ColumnSet("pin_status", "pin_weekstart", "ownerid"));
        }

        public static List<Entity> Entries(IOrganizationService sys, Guid sheetId) =>
            Pin.Query(sys, "pin_timeentry", new[] { "pin_project", "pin_task", "pin_workdate", "pin_hours", "pin_billable", "pin_entrytype", "pin_status", "pin_leaverequest", "pin_name" },
                ("pin_timesheet", ConditionOperator.Equal, sheetId)).Entities.ToList();

        /// <summary>Recomputes totals; a Draft week fully covered by leave/holidays with no work is auto-approved.</summary>
        public static void Totals(IOrganizationService sys, Guid sheetId, bool autoApproveLeaveWeeks)
        {
            var sheet = sys.Retrieve("pin_timesheet", sheetId, new ColumnSet("pin_status", "pin_resource"));
            var entries = Entries(sys, sheetId);
            var total = entries.Sum(e => Pin.Dec(e, "pin_hours"));
            var billable = entries.Where(e => Pin.Opt(e, "pin_entrytype") == Pin.EntryType.Work && Pin.Bool(e, "pin_billable")).Sum(e => Pin.Dec(e, "pin_hours"));
            var update = new Entity("pin_timesheet", sheetId) { ["pin_totalhours"] = total, ["pin_billablehours"] = billable };

            if (autoApproveLeaveWeeks && Pin.Opt(sheet, "pin_status") == Pin.SheetStatus.Draft && entries.Count > 0 && entries.All(e => Pin.Opt(e, "pin_entrytype") != Pin.EntryType.Work))
            {
                var res = sys.Retrieve("pin_resource", Pin.Ref(sheet, "pin_resource").Id, new ColumnSet("pin_weeklycapacity"));
                if (total >= Calendar.WeeklyHours(res))
                {
                    update["pin_status"] = Pin.O(Pin.SheetStatus.Approved);
                    update["pin_decidedon"] = DateTime.UtcNow;
                    update["pin_comments"] = "Auto-approved: the whole week is leave / holidays.";
                    foreach (var e in entries) sys.Update(new Entity("pin_timeentry", e.Id) { ["pin_status"] = Pin.O(Pin.SheetStatus.Approved) });
                }
            }
            sys.Update(update);
        }
    }

    /// <summary>
    /// pin_timesheet — Create Pre 20 (normalise week, key, approver) + Post 40 (pre-fill holidays and approved leave);
    /// Update(pin_status) Pre 20 (submit validation + rate snapshot) + Post 40 (approval request / recall).
    /// </summary>
    public class TimesheetPlugin : PluginBase
    {
        public TimesheetPlugin(string unsecure, string secure) : base(typeof(TimesheetPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext local)
        {
            var ctx = local.PluginExecutionContext;
            var sys = local.OrgSvcFactory.CreateOrganizationService(null);
            var target = (Entity)ctx.InputParameters["Target"];
            ctx.PreEntityImages.TryGetValue("pre", out var pre);

            if (ctx.MessageName == "Create" && ctx.Stage == 20)
            {
                var resource = Pin.Ref(target, "pin_resource");
                if (resource == null)
                {
                    var me = Caller.Resolve(sys, ctx.InitiatingUserId).Resource;
                    if (me == null) Pin.Fail("Your user isn't linked to a Project Infinity resource yet. Ask a PMO admin.");
                    target["pin_resource"] = resource = me;
                }
                var week = Pin.Monday(Pin.Date(target, "pin_weekstart") ?? DateTime.UtcNow);
                target["pin_weekstart"] = week;
                target["pin_weekkey"] = Sheets.Key(resource.Id, week);
                if (!target.Contains("pin_approver"))
                {
                    var mgr = Pin.Ref(sys.Retrieve("pin_resource", resource.Id, new ColumnSet("pin_manager")), "pin_manager");
                    if (mgr != null) target["pin_approver"] = mgr;
                }
                if (ctx.Depth == 1) target["pin_status"] = Pin.O(Pin.SheetStatus.Draft);
                return;
            }
            if (ctx.MessageName == "Create" && ctx.Stage == 40)
            {
                Prefill(sys, target.Id, Pin.Ref(target, "pin_resource"), (Pin.Date(target, "pin_weekstart") ?? DateTime.UtcNow).Date);
                return;
            }
            if (!target.Contains("pin_status")) return;
            var from = Pin.Opt(pre, "pin_status");
            var to = Pin.Opt(target, "pin_status");
            if (from == to) return;
            var row = Pin.Merge(target, pre);

            if (ctx.Stage == 20)
            {
                if (ctx.Depth > 1) return; // our own approval / auto-approval
                var caller = Caller.Resolve(sys, ctx.InitiatingUserId);
                var isOwner = Pin.Ref(row, "pin_resource")?.Id == caller.Resource?.Id;
                if (to == Pin.SheetStatus.Submitted && (from == Pin.SheetStatus.Draft || from == Pin.SheetStatus.Rejected))
                {
                    if (!isOwner && !caller.IsAdmin) Pin.Fail("You can submit only your own timesheet.");
                    Submit(sys, target, row);
                }
                else if (to == Pin.SheetStatus.Draft && from == Pin.SheetStatus.Submitted)
                {
                    if (!isOwner && !caller.IsAdmin) Pin.Fail("Only the person who submitted the timesheet can recall it.");
                }
                else Pin.Fail("Timesheets are approved or rejected from the approvals inbox.");
                return;
            }

            // Post
            var weekStart = (Pin.Date(row, "pin_weekstart") ?? DateTime.UtcNow).Date;
            var resRef = Pin.Ref(row, "pin_resource");
            var resName = sys.Retrieve("pin_resource", resRef.Id, new ColumnSet("pin_name")).GetAttributeValue<string>("pin_name");
            if (to == Pin.SheetStatus.Submitted)
            {
                foreach (var e in Sheets.Entries(sys, target.Id)) sys.Update(new Entity("pin_timeentry", e.Id) { ["pin_status"] = Pin.O(Pin.SheetStatus.Submitted) });
                Approvals.Request(sys, Pin.ApprovalType.Timesheet, $"{resName} · week of {weekStart:d MMM} · {Pin.Dec(row, "pin_totalhours"):0.#} h",
                    Pin.Ref(row, "pin_approver"), resRef, "pin_timesheet", target.ToEntityReference());
            }
            else if (to == Pin.SheetStatus.Draft && from == Pin.SheetStatus.Submitted)
            {
                Approvals.CancelPending(sys, "pin_timesheet", target.Id, Pin.ApprovalType.Timesheet);
                foreach (var e in Sheets.Entries(sys, target.Id)) sys.Update(new Entity("pin_timeentry", e.Id) { ["pin_status"] = Pin.O(Pin.SheetStatus.Draft) });
            }
        }

        /// <summary>Holidays + already-approved leave for a new week, as locked rows.</summary>
        internal static void Prefill(IOrganizationService sys, Guid sheetId, EntityReference resource, DateTime weekStart)
        {
            if (resource == null) return;
            var res = sys.Retrieve("pin_resource", resource.Id, new ColumnSet("pin_location", "pin_weeklycapacity"));
            var hours = Calendar.DailyHours(res);
            var existing = Sheets.Entries(sys, sheetId);
            foreach (var h in Calendar.Holidays(sys, weekStart, weekStart.AddDays(6), Pin.Str(res, "pin_location")))
            {
                if (Calendar.IsWeekend(h.Key) || existing.Any(e => Pin.Opt(e, "pin_entrytype") == Pin.EntryType.Holiday && Pin.Date(e, "pin_workdate")?.Date == h.Key)) continue;
                sys.Create(new Entity("pin_timeentry")
                {
                    ["pin_name"] = $"Holiday · {h.Value}",
                    ["pin_timesheet"] = new EntityReference("pin_timesheet", sheetId),
                    ["pin_resource"] = resource,
                    ["pin_entrytype"] = Pin.O(Pin.EntryType.Holiday),
                    ["pin_workdate"] = h.Key,
                    ["pin_hours"] = hours,
                    ["pin_billable"] = false,
                    ["pin_notes"] = h.Value,
                });
            }
            var leaves = Pin.Query(sys, "pin_leaverequest", new[] { "pin_fromdate", "pin_todate" },
                ("pin_resource", ConditionOperator.Equal, resource.Id), ("pin_status", ConditionOperator.Equal, Pin.LeaveStatus.Approved),
                ("pin_fromdate", ConditionOperator.OnOrBefore, weekStart.AddDays(6)), ("pin_todate", ConditionOperator.OnOrAfter, weekStart)).Entities;
            foreach (var l in leaves) Leave.FillWeek(sys, l.Id, sheetId, weekStart);
            Sheets.Totals(sys, sheetId, autoApproveLeaveWeeks: true);
        }

        /// <summary>Validates the week and snapshots role, rates and amounts onto every work entry.</summary>
        private static void Submit(IOrganizationService sys, Entity target, Entity row)
        {
            var resource = Pin.Ref(row, "pin_resource");
            var res = sys.Retrieve("pin_resource", resource.Id, new ColumnSet("pin_weeklycapacity", "pin_manager", "pin_defaultrole"));
            if (Pin.Ref(row, "pin_approver") == null)
            {
                if (Pin.Ref(res, "pin_manager") == null) Pin.Fail("You don't have a manager to approve timesheets. Ask a PMO admin to set one.");
                target["pin_approver"] = Pin.Ref(res, "pin_manager");
            }
            var entries = Sheets.Entries(sys, target.Id);
            if (!entries.Any(e => Pin.Dec(e, "pin_hours") > 0)) Pin.Fail("This timesheet is empty.");

            // At most 24 h on any day (work + leave + holiday)
            foreach (var day in entries.GroupBy(e => Pin.Date(e, "pin_workdate")?.Date))
                if (day.Sum(e => Pin.Dec(e, "pin_hours")) > 24m) Pin.Fail($"More than 24 hours logged on {day.Key:ddd d MMM}.");

            // Expected hours: weekly capacity, with holidays and leave already counted in the total
            var expected = Calendar.WeeklyHours(res);
            var total = entries.Sum(e => Pin.Dec(e, "pin_hours"));
            if (total < expected)
            {
                var off = entries.Where(e => Pin.Opt(e, "pin_entrytype") != Pin.EntryType.Work).Sum(e => Pin.Dec(e, "pin_hours"));
                Pin.Fail($"This week needs {expected:0.#} h. You have {total:0.#} h ({off:0.#} h of it holidays / leave). Add the missing hours, or apply for leave.");
            }

            var projects = new Dictionary<Guid, Entity>();
            decimal billable = 0;
            foreach (var e in entries.Where(x => Pin.Opt(x, "pin_entrytype", Pin.EntryType.Work) == Pin.EntryType.Work))
            {
                var pref = Pin.Ref(e, "pin_project") ?? throw new InvalidPluginExecutionException($"Pick a project for “{Pin.Str(e, "pin_name")}”.");
                if (!projects.TryGetValue(pref.Id, out var project))
                    projects[pref.Id] = project = sys.Retrieve("pin_project", pref.Id, new ColumnSet("pin_name", "pin_status", "pin_billingmodel", "transactioncurrencyid"));
                var st = Pin.Opt(project, "pin_status");
                if (st != Pin.ProjectStatus.Active && st != Pin.ProjectStatus.Closing)
                    Pin.Fail($"{Pin.Str(project, "pin_name")} isn't active ({ProjectRules.StatusName(st)}), so time can't be logged to it.");

                var date = (Pin.Date(e, "pin_workdate") ?? DateTime.UtcNow).Date;
                var member = Members.ActiveFor(sys, pref.Id, resource.Id, date).FirstOrDefault();
                if (member == null) Pin.Fail($"You weren't assigned to {Pin.Str(project, "pin_name")} on {date:ddd d MMM}.");
                if (Pin.Opt(member, "pin_accesslevel") == Pin.Access.Viewer) Pin.Fail($"You have view-only access to {Pin.Str(project, "pin_name")} and can't log time to it.");

                var task = Pin.Ref(e, "pin_task");
                if (task != null && Pin.Ref(sys.Retrieve("pin_task", task.Id, new ColumnSet("pin_project")), "pin_project")?.Id != pref.Id)
                    Pin.Fail("A task on this timesheet belongs to a different project.");

                var role = Pin.Ref(member, "pin_role") ?? Pin.Ref(res, "pin_defaultrole");
                decimal bill = 0, cost = 0;
                if (role != null) (bill, cost) = Rates.For(sys, project, member, role);
                var hours = Pin.Dec(e, "pin_hours");
                var isBillable = Pin.Bool(e, "pin_billable", true) && Pin.Opt(project, "pin_billingmodel") == Pin.Billing.TimeAndMaterials;
                if (isBillable) billable += hours;
                var snap = new Entity("pin_timeentry", e.Id)
                {
                    ["pin_resource"] = resource,
                    ["pin_billrate"] = Pin.M(bill),
                    ["pin_costrate"] = Pin.M(cost),
                    ["pin_amount"] = Pin.M(isBillable ? hours * bill : 0m),
                    ["pin_costamount"] = Pin.M(hours * cost),
                    ["pin_billable"] = isBillable,
                };
                if (role != null) snap["pin_role"] = role;
                if (Pin.Ref(project, "transactioncurrencyid") != null) snap["transactioncurrencyid"] = Pin.Ref(project, "transactioncurrencyid");
                sys.Update(snap);
            }
            target["pin_totalhours"] = total;
            target["pin_billablehours"] = billable;
            target["pin_submittedon"] = DateTime.UtcNow;
            target["pin_comments"] = null;
        }
    }

    /// <summary>
    /// pin_timeentry — Create/Update/Delete Pre 20: entries are editable only while their sheet is Draft or Rejected,
    /// and leave / holiday rows are managed by the system (leave requests, holiday calendar).
    /// </summary>
    public class TimeEntryPlugin : PluginBase
    {
        public TimeEntryPlugin(string unsecure, string secure) : base(typeof(TimeEntryPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext local)
        {
            var ctx = local.PluginExecutionContext;
            if (ctx.Depth > 1) return;
            var sys = local.OrgSvcFactory.CreateOrganizationService(null);
            ctx.PreEntityImages.TryGetValue("pre", out var pre);
            var target = ctx.InputParameters["Target"] as Entity;
            var row = ctx.MessageName == "Delete" ? pre : Pin.Merge(target, pre);
            if (row == null) return;

            var type = Pin.Opt(row, "pin_entrytype", Pin.EntryType.Work);
            if (type != Pin.EntryType.Work) Pin.Fail(type == Pin.EntryType.Leave ? "Leave hours come from your leave request — change or cancel the leave instead." : "Holiday hours come from the company calendar.");

            var sheetRef = Pin.Ref(row, "pin_timesheet");
            if (sheetRef == null) Pin.Fail("Time entries must belong to a timesheet.");
            var sheet = sys.Retrieve("pin_timesheet", sheetRef.Id, new ColumnSet("pin_status", "pin_resource", "pin_weekstart"));
            var st = Pin.Opt(sheet, "pin_status");
            if (st != Pin.SheetStatus.Draft && st != Pin.SheetStatus.Rejected)
                Pin.Fail(st == Pin.SheetStatus.Approved ? "This week is approved and locked." : "This week is submitted. Recall it to make changes.");
            if (ctx.MessageName == "Delete") return;

            var hours = Pin.Dec(row, "pin_hours");
            if (hours < 0 || hours > 24) Pin.Fail("Hours must be between 0 and 24.");
            var week = (Pin.Date(sheet, "pin_weekstart") ?? DateTime.MinValue).Date;
            var date = (Pin.Date(row, "pin_workdate") ?? DateTime.MinValue).Date;
            if (date < week || date > week.AddDays(6)) Pin.Fail($"The date must be in the week of {week:d MMM}.");
            target["pin_resource"] = Pin.Ref(sheet, "pin_resource");
            target["pin_entrytype"] = Pin.O(Pin.EntryType.Work);
            if (ctx.MessageName == "Create")
            {
                target["pin_status"] = Pin.O(st);
                var project = Pin.Ref(row, "pin_project");
                if (project != null)
                {
                    var p = sys.Retrieve("pin_project", project.Id, new ColumnSet("pin_name", "transactioncurrencyid"));
                    if (!target.Contains("pin_name")) target["pin_name"] = $"{Pin.Str(p, "pin_name")} · {date:ddd d MMM}";
                    if (Pin.Ref(p, "transactioncurrencyid") != null) target["transactioncurrencyid"] = Pin.Ref(p, "transactioncurrencyid");
                }
            }
        }
    }

    /// <summary>Leave rules: working-day counting, balances, filling timesheets.</summary>
    internal static class Leave
    {
        public static int Year(Entity leave) => (Pin.Date(leave, "pin_fromdate") ?? DateTime.UtcNow).Year;
        public static string BalanceKey(Guid resource, Guid type, int year) => $"{resource:N}|{type:N}|{year}";

        /// <summary>Leave days as (date, fraction of a day) — weekends and holidays skipped unless the type counts calendar days.</summary>
        public static List<(DateTime day, decimal fraction)> Days(IOrganizationService sys, Entity leave, Entity type, Entity resource)
        {
            var from = (Pin.Date(leave, "pin_fromdate") ?? DateTime.UtcNow).Date;
            var to = (Pin.Date(leave, "pin_todate") ?? from).Date;
            var calendarDays = Pin.Bool(type, "pin_countweekends");
            var holidays = Calendar.Holidays(sys, from, to, Pin.Str(resource, "pin_location"));
            var list = new List<(DateTime, decimal)>();
            for (var d = from; d <= to; d = d.AddDays(1))
            {
                if (!calendarDays && (Calendar.IsWeekend(d) || holidays.ContainsKey(d))) continue;
                var frac = 1m;
                if (d == from && Pin.Bool(leave, "pin_halfdaystart")) frac = 0.5m;
                if (d == to && Pin.Bool(leave, "pin_halfdayend")) frac = Math.Min(frac, 0.5m);
                list.Add((d, frac));
            }
            return list;
        }

        public static Entity Balance(IOrganizationService sys, EntityReference resource, Entity type, int year)
        {
            var key = BalanceKey(resource.Id, type.Id, year);
            var b = Pin.Query(sys, "pin_leavebalance", new[] { "pin_entitled", "pin_used", "pin_pending", "pin_balance" }, ("pin_balancekey", ConditionOperator.Equal, key)).Entities.FirstOrDefault();
            if (b != null) return b;
            var entitled = Pin.Dec(type, "pin_annualquota");
            var row = new Entity("pin_leavebalance")
            {
                ["pin_name"] = $"{Pin.Str(type, "pin_name")} {year}",
                ["pin_resource"] = resource,
                ["pin_leavetype"] = type.ToEntityReference(),
                ["pin_year"] = year,
                ["pin_entitled"] = entitled,
                ["pin_used"] = 0m,
                ["pin_pending"] = 0m,
                ["pin_balance"] = entitled,
                ["pin_balancekey"] = key,
            };
            // Owned by the employee so user-level read shows them their own balances
            var user = Pin.Ref(sys.Retrieve("pin_resource", resource.Id, new ColumnSet("pin_systemuser")), "pin_systemuser");
            if (user != null) row["ownerid"] = new EntityReference("systemuser", user.Id);
            row.Id = sys.Create(row);
            return row;
        }

        public static void Adjust(IOrganizationService sys, Entity balance, decimal usedDelta, decimal pendingDelta)
        {
            var used = Pin.Dec(balance, "pin_used") + usedDelta;
            var pending = Math.Max(0, Pin.Dec(balance, "pin_pending") + pendingDelta);
            sys.Update(new Entity("pin_leavebalance", balance.Id)
            {
                ["pin_used"] = used,
                ["pin_pending"] = pending,
                ["pin_balance"] = Pin.Dec(balance, "pin_entitled") - used - pending,
            });
        }

        /// <summary>Writes leave hours for one week's sheet (idempotent per day).</summary>
        public static void FillWeek(IOrganizationService sys, Guid leaveId, Guid sheetId, DateTime weekStart)
        {
            var leave = sys.Retrieve("pin_leaverequest", leaveId, new ColumnSet("pin_resource", "pin_leavetype", "pin_fromdate", "pin_todate", "pin_halfdaystart", "pin_halfdayend", "pin_name"));
            var type = sys.Retrieve("pin_leavetype", Pin.Ref(leave, "pin_leavetype").Id, new ColumnSet("pin_name", "pin_code", "pin_countweekends"));
            var resource = sys.Retrieve("pin_resource", Pin.Ref(leave, "pin_resource").Id, new ColumnSet("pin_location", "pin_weeklycapacity"));
            var hours = Calendar.DailyHours(resource);
            var existing = Sheets.Entries(sys, sheetId);
            var holidays = Calendar.Holidays(sys, weekStart, weekStart.AddDays(6), Pin.Str(resource, "pin_location"));
            foreach (var (day, frac) in Days(sys, leave, type, resource))
            {
                // Hours only on working days, even for calendar-day leave like maternity
                if (day < weekStart || day > weekStart.AddDays(6) || Calendar.IsWeekend(day) || holidays.ContainsKey(day)) continue;
                if (existing.Any(e => Pin.Ref(e, "pin_leaverequest")?.Id == leaveId && Pin.Date(e, "pin_workdate")?.Date == day)) continue;
                sys.Create(new Entity("pin_timeentry")
                {
                    ["pin_name"] = $"{Pin.Str(type, "pin_code")} · {Pin.Str(type, "pin_name")}",
                    ["pin_timesheet"] = new EntityReference("pin_timesheet", sheetId),
                    ["pin_resource"] = Pin.Ref(leave, "pin_resource"),
                    ["pin_entrytype"] = Pin.O(Pin.EntryType.Leave),
                    ["pin_leavetype"] = type.ToEntityReference(),
                    ["pin_leaverequest"] = new EntityReference("pin_leaverequest", leaveId),
                    ["pin_workdate"] = day,
                    ["pin_hours"] = hours * frac,
                    ["pin_billable"] = false,
                    ["pin_notes"] = Pin.Str(leave, "pin_name"),
                });
            }
        }

        /// <summary>Approved leave: balance used, and leave hours written into every affected week.</summary>
        public static void Apply(IOrganizationService sys, Guid leaveId)
        {
            var leave = sys.Retrieve("pin_leaverequest", leaveId, new ColumnSet("pin_resource", "pin_leavetype", "pin_fromdate", "pin_todate", "pin_days"));
            var resource = Pin.Ref(leave, "pin_resource");
            var type = sys.Retrieve("pin_leavetype", Pin.Ref(leave, "pin_leavetype").Id, new ColumnSet("pin_name", "pin_annualquota", "pin_unlimited"));
            if (!Pin.Bool(type, "pin_unlimited")) Adjust(sys, Balance(sys, resource, type, Year(leave)), Pin.Dec(leave, "pin_days"), -Pin.Dec(leave, "pin_days"));

            var from = (Pin.Date(leave, "pin_fromdate") ?? DateTime.UtcNow).Date;
            var to = (Pin.Date(leave, "pin_todate") ?? from).Date;
            // Pre-create sheets only up to 4 weeks ahead (long leave like maternity would otherwise create months of
            // sheets in one transaction); later weeks are filled by TimesheetPlugin.Prefill when their sheet is created.
            var horizon = Pin.Monday(DateTime.UtcNow).AddDays(28);
            for (var week = Pin.Monday(from); week <= to && week <= horizon; week = week.AddDays(7))
            {
                var sheet = Sheets.For(sys, resource, week);
                var st = Pin.Opt(sheet, "pin_status");
                if (st != Pin.SheetStatus.Draft && st != Pin.SheetStatus.Rejected) continue; // already submitted/approved — leave shows on the next edit
                FillWeek(sys, leaveId, sheet.Id, week);
                Sheets.Totals(sys, sheet.Id, autoApproveLeaveWeeks: true);
            }
        }

        /// <summary>Cancelled after approval: give the days back and remove unlocked leave rows.</summary>
        public static void Reverse(IOrganizationService sys, Guid leaveId, bool wasApproved)
        {
            var leave = sys.Retrieve("pin_leaverequest", leaveId, new ColumnSet("pin_resource", "pin_leavetype", "pin_fromdate", "pin_days"));
            var type = sys.Retrieve("pin_leavetype", Pin.Ref(leave, "pin_leavetype").Id, new ColumnSet("pin_name", "pin_annualquota", "pin_unlimited"));
            if (!Pin.Bool(type, "pin_unlimited"))
            {
                var bal = Balance(sys, Pin.Ref(leave, "pin_resource"), type, Year(leave));
                if (wasApproved) Adjust(sys, bal, -Pin.Dec(leave, "pin_days"), 0);
                else Adjust(sys, bal, 0, -Pin.Dec(leave, "pin_days"));
            }
            if (!wasApproved) return;
            var sheets = new HashSet<Guid>();
            foreach (var e in Pin.Query(sys, "pin_timeentry", new[] { "pin_timesheet", "pin_status" }, ("pin_leaverequest", ConditionOperator.Equal, leaveId)).Entities)
            {
                var st = Pin.Opt(e, "pin_status");
                var sheetId = Pin.Ref(e, "pin_timesheet").Id;
                var sheet = sys.Retrieve("pin_timesheet", sheetId, new ColumnSet("pin_status", "pin_comments"));
                // Auto-approved full-leave weeks reopen so the person can log work instead
                if (Pin.Opt(sheet, "pin_status") == Pin.SheetStatus.Approved && Pin.Str(sheet, "pin_comments").StartsWith("Auto-approved"))
                {
                    sys.Update(new Entity("pin_timesheet", sheetId) { ["pin_status"] = Pin.O(Pin.SheetStatus.Draft), ["pin_comments"] = "Reopened: leave was cancelled." });
                    st = Pin.SheetStatus.Draft;
                }
                if (st == Pin.SheetStatus.Draft || st == Pin.SheetStatus.Rejected)
                {
                    sys.Delete("pin_timeentry", e.Id);
                    sheets.Add(sheetId);
                }
            }
            foreach (var s in sheets) Sheets.Totals(sys, s, autoApproveLeaveWeeks: false);
        }
    }

    /// <summary>
    /// pin_leaverequest — Create Pre 20 (days, balance, overlap, approver) + Post 40 (approval request or auto-approve);
    /// Update(pin_status) Pre 20 (only the employee cancels; decisions come from approvals) + Post 40 (apply / reverse).
    /// </summary>
    public class LeaveRequestPlugin : PluginBase
    {
        public LeaveRequestPlugin(string unsecure, string secure) : base(typeof(LeaveRequestPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext local)
        {
            var ctx = local.PluginExecutionContext;
            var sys = local.OrgSvcFactory.CreateOrganizationService(null);
            var target = (Entity)ctx.InputParameters["Target"];
            ctx.PreEntityImages.TryGetValue("pre", out var pre);
            var caller = Caller.Resolve(sys, ctx.InitiatingUserId);

            if (ctx.MessageName == "Create" && ctx.Stage == 20)
            {
                var resource = Pin.Ref(target, "pin_resource") ?? caller.Resource;
                if (resource == null) Pin.Fail("Your user isn't linked to a Project Infinity resource yet.");
                if (ctx.Depth == 1 && resource.Id != caller.Resource?.Id && !caller.IsAdmin) Pin.Fail("You can apply for leave only for yourself.");
                target["pin_resource"] = resource;
                var typeRef = Pin.Ref(target, "pin_leavetype") ?? throw new InvalidPluginExecutionException("Choose a leave type.");
                var type = sys.Retrieve("pin_leavetype", typeRef.Id, new ColumnSet("pin_name", "pin_annualquota", "pin_countweekends", "pin_maxconsecutive", "pin_unlimited", "pin_needsapproval", "pin_isactive"));
                var res = sys.Retrieve("pin_resource", resource.Id, new ColumnSet("pin_name", "pin_location", "pin_manager"));
                var from = (Pin.Date(target, "pin_fromdate") ?? DateTime.UtcNow).Date;
                var to = (Pin.Date(target, "pin_todate") ?? from).Date;
                if (to < from) Pin.Fail("The leave ends before it starts.");
                var days = Leave.Days(sys, target, type, res).Sum(d => d.fraction);
                if (days <= 0) Pin.Fail("Those dates are all weekends or holidays — no leave needed.");
                var max = Pin.Dec(type, "pin_maxconsecutive");
                if (max > 0 && days > max) Pin.Fail($"{Pin.Str(type, "pin_name")} allows at most {max:0.#} days at a time.");

                var overlap = Pin.Query(sys, "pin_leaverequest", new[] { "pin_name" }, ("pin_resource", ConditionOperator.Equal, resource.Id),
                    ("pin_status", ConditionOperator.In, new object[] { Pin.LeaveStatus.Submitted, Pin.LeaveStatus.Approved }),
                    ("pin_fromdate", ConditionOperator.OnOrBefore, to), ("pin_todate", ConditionOperator.OnOrAfter, from)).Entities.FirstOrDefault();
                if (overlap != null) Pin.Fail($"These dates overlap your leave {Pin.Str(overlap, "pin_name")}.");

                if (!Pin.Bool(type, "pin_unlimited"))
                {
                    var bal = Leave.Balance(sys, resource, type, from.Year);
                    var available = Pin.Dec(bal, "pin_entitled") - Pin.Dec(bal, "pin_used") - Pin.Dec(bal, "pin_pending");
                    if (days > available) Pin.Fail($"Not enough {Pin.Str(type, "pin_name")}: {available:0.#} day(s) left, {days:0.#} requested. You could apply for Loss of pay instead.");
                    Leave.Adjust(sys, bal, 0, days);
                }
                target["pin_days"] = days;
                target["pin_status"] = Pin.O(Pin.LeaveStatus.Submitted);
                if (!target.Contains("pin_approver") && Pin.Ref(res, "pin_manager") != null) target["pin_approver"] = Pin.Ref(res, "pin_manager");
                return;
            }
            if (ctx.MessageName == "Create" && ctx.Stage == 40)
            {
                var type = sys.Retrieve("pin_leavetype", Pin.Ref(target, "pin_leavetype").Id, new ColumnSet("pin_name", "pin_needsapproval"));
                var resName = sys.Retrieve("pin_resource", Pin.Ref(target, "pin_resource").Id, new ColumnSet("pin_name")).GetAttributeValue<string>("pin_name");
                if (!Pin.Bool(type, "pin_needsapproval", true) || Pin.Ref(target, "pin_approver") == null)
                {
                    sys.Update(new Entity("pin_leaverequest", target.Id) { ["pin_status"] = Pin.O(Pin.LeaveStatus.Approved), ["pin_decidedon"] = DateTime.UtcNow, ["pin_comments"] = "Auto-approved" });
                    return;
                }
                Approvals.Request(sys, Pin.ApprovalType.Leave,
                    $"{resName} · {Pin.Str(type, "pin_name")} · {Pin.Dec(target, "pin_days"):0.#} day(s) from {(Pin.Date(target, "pin_fromdate") ?? DateTime.UtcNow):d MMM}",
                    Pin.Ref(target, "pin_approver"), Pin.Ref(target, "pin_resource"), "pin_leaverequest", target.ToEntityReference());
                return;
            }

            if (!target.Contains("pin_status")) return;
            var fromSt = Pin.Opt(pre, "pin_status");
            var toSt = Pin.Opt(target, "pin_status");
            if (fromSt == toSt) return;

            if (ctx.Stage == 20)
            {
                if (ctx.Depth > 1) return;
                if (toSt != Pin.LeaveStatus.Cancelled) Pin.Fail("Leave is approved or rejected from the approvals inbox.");
                if (Pin.Ref(pre, "pin_resource")?.Id != caller.Resource?.Id && !caller.IsAdmin) Pin.Fail("Only the employee can cancel their leave.");
                return;
            }

            // Post
            if (toSt == Pin.LeaveStatus.Approved) Leave.Apply(sys, target.Id);
            else if (toSt == Pin.LeaveStatus.Rejected) Leave.Reverse(sys, target.Id, wasApproved: false);
            else if (toSt == Pin.LeaveStatus.Cancelled)
            {
                Leave.Reverse(sys, target.Id, wasApproved: fromSt == Pin.LeaveStatus.Approved);
                if (fromSt == Pin.LeaveStatus.Submitted) Approvals.CancelPending(sys, "pin_leaverequest", target.Id, Pin.ApprovalType.Leave);
            }
        }
    }

    /// <summary>
    /// pin_approval — Update(pin_status) Post 40 (image "pre"). The single place where decisions take effect,
    /// whether made in the app or on a Teams / Outlook approval card (the sync flow writes pin_status).
    /// </summary>
    public class ApprovalPlugin : PluginBase
    {
        public ApprovalPlugin(string unsecure, string secure) : base(typeof(ApprovalPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext local)
        {
            var ctx = local.PluginExecutionContext;
            var sys = local.OrgSvcFactory.CreateOrganizationService(null);
            var target = (Entity)ctx.InputParameters["Target"];
            ctx.PreEntityImages.TryGetValue("pre", out var pre);
            if (!target.Contains("pin_status")) return;
            var from = Pin.Opt(pre, "pin_status");
            var to = Pin.Opt(target, "pin_status");
            if (from == to || to == Pin.ApprovalStatus.Cancelled || to == Pin.ApprovalStatus.Pending) return;
            if (from != Pin.ApprovalStatus.Pending) Pin.Fail("This approval was already decided.");

            var row = Pin.Merge(target, pre);
            var caller = Caller.Resolve(sys, ctx.InitiatingUserId);
            var approver = Pin.Ref(row, "pin_approver");
            if (!caller.IsAdmin && approver?.Id != caller.Resource?.Id) Pin.Fail("Only the assigned approver can decide this.");

            var approved = to == Pin.ApprovalStatus.Approved;
            var comments = Pin.Str(row, "pin_comments");
            sys.Update(new Entity("pin_approval", target.Id) { ["pin_decidedon"] = DateTime.UtcNow });
            var type = Pin.Opt(row, "pin_type");

            switch (type)
            {
                case Pin.ApprovalType.Project:
                {
                    var p = Pin.Ref(row, "pin_project");
                    var upd = new Entity("pin_project", p.Id) { ["pin_status"] = Pin.O(approved ? Pin.ProjectStatus.Approved : Pin.ProjectStatus.Rejected), ["pin_approvalcomments"] = comments };
                    if (approved) upd["pin_approvedon"] = DateTime.UtcNow;
                    sys.Update(upd);
                    Activity.Log(sys, p.Id, Pin.Kind.Approval, approved ? "Project approved by the sponsor" : $"Project rejected{(comments != "" ? $": {comments}" : "")}", approver);
                    break;
                }
                case Pin.ApprovalType.Closure:
                {
                    var p = Pin.Ref(row, "pin_project");
                    if (approved)
                    {
                        var proj = sys.Retrieve("pin_project", p.Id, new ColumnSet("pin_billingmodel", "pin_closureoverride"));
                        var blockers = ProjectRules.ClosureBlockers(sys, p.Id, Pin.Opt(proj, "pin_billingmodel"));
                        if (blockers.Count > 0 && Pin.Str(proj, "pin_closureoverride") == "") Pin.Fail("Can't close yet: " + string.Join("; ", blockers) + ".");
                        sys.Update(new Entity("pin_project", p.Id) { ["pin_status"] = Pin.O(Pin.ProjectStatus.Closed), ["pin_closedon"] = DateTime.UtcNow });
                    }
                    else sys.Update(new Entity("pin_project", p.Id) { ["pin_status"] = Pin.O(Pin.ProjectStatus.Active) });
                    Activity.Log(sys, p.Id, Pin.Kind.Approval, approved ? "Closure approved — project closed 🎉" : $"Closure sent back{(comments != "" ? $": {comments}" : "")}", approver);
                    break;
                }
                case Pin.ApprovalType.Timesheet:
                    DecideTimesheet(sys, Pin.Ref(row, "pin_timesheet").Id, approved, comments);
                    break;
                case Pin.ApprovalType.Leave:
                    sys.Update(new Entity("pin_leaverequest", Pin.Ref(row, "pin_leaverequest").Id)
                    {
                        ["pin_status"] = Pin.O(approved ? Pin.LeaveStatus.Approved : Pin.LeaveStatus.Rejected),
                        ["pin_decidedon"] = DateTime.UtcNow,
                        ["pin_comments"] = comments,
                    });
                    break;
                case Pin.ApprovalType.Invoice:
                    sys.Update(new Entity("pin_invoice", Pin.Ref(row, "pin_invoice").Id) { ["pin_status"] = Pin.O(approved ? Pin.InvoiceStatus.Approved : Pin.InvoiceStatus.Draft) });
                    break;
            }
        }

        /// <summary>Approve: lock entries, roll actuals up to tasks/projects, recognise T&amp;M revenue per project and month.</summary>
        private static void DecideTimesheet(IOrganizationService sys, Guid sheetId, bool approved, string comments)
        {
            var status = approved ? Pin.SheetStatus.Approved : Pin.SheetStatus.Rejected;
            sys.Update(new Entity("pin_timesheet", sheetId) { ["pin_status"] = Pin.O(status), ["pin_decidedon"] = DateTime.UtcNow, ["pin_comments"] = comments });
            var entries = Pin.Query(sys, "pin_timeentry", new[] { "pin_project", "pin_task", "pin_workdate", "pin_hours", "pin_amount", "pin_costamount", "pin_entrytype", "transactioncurrencyid" },
                ("pin_timesheet", ConditionOperator.Equal, sheetId)).Entities;
            foreach (var e in entries) sys.Update(new Entity("pin_timeentry", e.Id) { ["pin_status"] = Pin.O(status) });
            if (!approved) return;

            var work = entries.Where(e => Pin.Opt(e, "pin_entrytype", Pin.EntryType.Work) == Pin.EntryType.Work && Pin.Ref(e, "pin_project") != null).ToList();
            foreach (var t in work.Where(e => Pin.Ref(e, "pin_task") != null).GroupBy(e => Pin.Ref(e, "pin_task").Id))
            {
                var task = sys.Retrieve("pin_task", t.Key, new ColumnSet("pin_actualhours"));
                sys.Update(new Entity("pin_task", t.Key) { ["pin_actualhours"] = Pin.Dec(task, "pin_actualhours") + t.Sum(e => Pin.Dec(e, "pin_hours")) });
            }
            foreach (var p in work.GroupBy(e => Pin.Ref(e, "pin_project").Id))
            {
                var project = sys.Retrieve("pin_project", p.Key, new ColumnSet("pin_actualhours", "pin_actualcost", "pin_recognisedrevenue", "transactioncurrencyid"));
                var revenue = p.Sum(e => Pin.Money(e, "pin_amount"));
                sys.Update(new Entity("pin_project", p.Key)
                {
                    ["pin_actualhours"] = Pin.Dec(project, "pin_actualhours") + p.Sum(e => Pin.Dec(e, "pin_hours")),
                    ["pin_actualcost"] = Pin.M(Pin.Money(project, "pin_actualcost") + p.Sum(e => Pin.Money(e, "pin_costamount"))),
                    ["pin_recognisedrevenue"] = Pin.M(Pin.Money(project, "pin_recognisedrevenue") + revenue),
                });
                foreach (var month in p.GroupBy(e => { var d = Pin.Date(e, "pin_workdate") ?? DateTime.UtcNow; return new DateTime(d.Year, d.Month, 1); }))
                {
                    var amount = month.Sum(e => Pin.Money(e, "pin_amount"));
                    var cost = month.Sum(e => Pin.Money(e, "pin_costamount"));
                    if (amount == 0 && cost == 0) continue;
                    var rev = new Entity("pin_revenue")
                    {
                        ["pin_name"] = $"Time approved · {month.Key:MMM yyyy}",
                        ["pin_project"] = new EntityReference("pin_project", p.Key),
                        ["pin_revenuedate"] = month.Max(e => Pin.Date(e, "pin_workdate") ?? DateTime.UtcNow).Date,
                        ["pin_period"] = month.Key,
                        ["pin_source"] = Pin.O(Pin.RevenueSource.Time),
                        ["pin_amount"] = Pin.M(amount),
                        ["pin_cost"] = Pin.M(cost),
                        ["pin_timesheet"] = new EntityReference("pin_timesheet", sheetId),
                    };
                    if (Pin.Ref(project, "transactioncurrencyid") != null) rev["transactioncurrencyid"] = Pin.Ref(project, "transactioncurrencyid");
                    sys.Create(rev);
                }
            }
        }
    }
}
