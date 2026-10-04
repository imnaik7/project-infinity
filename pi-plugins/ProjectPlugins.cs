using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace ProjectInfinity.Plugins
{
    internal static class ProjectRules
    {
        public static string StatusName(int s)
        {
            var names = new[] { "Draft", "Pending approval", "Approved", "Rejected", "Active", "On hold", "Closing", "Closed", "Cancelled" };
            var i = s - Pin.ProjectStatus.Draft;
            return i >= 0 && i < names.Length ? names[i] : "Unknown";
        }

        /// <summary>Everything that must be finished before a project can close.</summary>
        public static List<string> ClosureBlockers(IOrganizationService sys, Guid projectId, int billingModel)
        {
            var blockers = new List<string>();
            var open = Pin.Query(sys, "pin_task", new[] { "pin_taskid" }, ("pin_project", ConditionOperator.Equal, projectId),
                ("pin_status", ConditionOperator.NotEqual, Pin.TaskStatus.Done), ("statecode", ConditionOperator.Equal, 0)).Entities.Count;
            if (open > 0) blockers.Add($"{open} task(s) are not done");

            var entries = Pin.Query(sys, "pin_timeentry", new[] { "pin_status", "pin_amount", "pin_invoiceline", "pin_billable" },
                ("pin_project", ConditionOperator.Equal, projectId), ("pin_entrytype", ConditionOperator.Equal, Pin.EntryType.Work)).Entities;
            var unapproved = entries.Count(e => Pin.Opt(e, "pin_status") == Pin.SheetStatus.Draft || Pin.Opt(e, "pin_status") == Pin.SheetStatus.Submitted);
            if (unapproved > 0) blockers.Add($"{unapproved} time entr{(unapproved == 1 ? "y is" : "ies are")} not approved yet");

            if (billingModel == Pin.Billing.TimeAndMaterials)
            {
                var unbilled = entries.Count(e => Pin.Opt(e, "pin_status") == Pin.SheetStatus.Approved && Pin.Money(e, "pin_amount") > 0 && Pin.Ref(e, "pin_invoiceline") == null);
                if (unbilled > 0) blockers.Add($"{unbilled} approved billable time entr{(unbilled == 1 ? "y has" : "ies have")} not been invoiced");
            }
            if (billingModel == Pin.Billing.FixedPrice)
            {
                var ms = Pin.Query(sys, "pin_milestone", new[] { "pin_status" }, ("pin_project", ConditionOperator.Equal, projectId)).Entities;
                var notBilled = ms.Count(m => Pin.Opt(m, "pin_status") != Pin.MilestoneStatus.Invoiced);
                if (notBilled > 0) blockers.Add($"{notBilled} milestone(s) are not invoiced");
            }
            return blockers;
        }

        public static EntityReference RoleByName(IOrganizationService sys, string name) =>
            Pin.Query(sys, "pin_role", new[] { "pin_roleid" }, ("pin_name", ConditionOperator.Equal, name)).Entities.FirstOrDefault()?.ToEntityReference();

        /// <summary>Recomputes % complete from task estimates (falls back to a plain average).</summary>
        public static void RollUpProgress(IOrganizationService sys, Guid projectId)
        {
            var tasks = Pin.Query(sys, "pin_task", new[] { "pin_estimatehours", "pin_percentcomplete", "pin_status" },
                ("pin_project", ConditionOperator.Equal, projectId), ("statecode", ConditionOperator.Equal, 0)).Entities;
            if (tasks.Count == 0) return;
            decimal pct(Entity t) => Pin.Opt(t, "pin_status") == Pin.TaskStatus.Done ? 100m : Pin.Dec(t, "pin_percentcomplete");
            var weight = tasks.Sum(t => Pin.Dec(t, "pin_estimatehours"));
            var value = weight > 0 ? tasks.Sum(t => Pin.Dec(t, "pin_estimatehours") * pct(t)) / weight : tasks.Average(pct);
            sys.Update(new Entity("pin_project", projectId) { ["pin_percentcomplete"] = Math.Round(value, 1) });
        }
    }

    /// <summary>
    /// pin_project — Create (Pre 20, Post 40) and Update (Pre 20 + Post 40, image "pre").
    /// Status state machine, approvals for start and closure, PM/sponsor access, activity feed.
    /// </summary>
    public class ProjectPlugin : PluginBase
    {
        public ProjectPlugin(string unsecure, string secure) : base(typeof(ProjectPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext local)
        {
            var ctx = local.PluginExecutionContext;
            var sys = local.OrgSvcFactory.CreateOrganizationService(null);
            var target = ctx.InputParameters["Target"] as Entity;
            if (target == null) return;
            ctx.PreEntityImages.TryGetValue("pre", out var pre);

            if (ctx.MessageName == "Create" && ctx.Stage == 20) PreCreate(sys, target, ctx);
            else if (ctx.MessageName == "Create" && ctx.Stage == 40) PostCreate(sys, local, target, ctx);
            else if (ctx.MessageName == "Update" && ctx.Stage == 20 && ctx.Depth == 1) PreUpdate(sys, target, pre, ctx);
            else if (ctx.MessageName == "Update" && ctx.Stage == 40) PostUpdate(sys, local, target, pre, ctx);
        }

        private static void PreCreate(IOrganizationService sys, Entity target, IPluginExecutionContext ctx)
        {
            if (ctx.Depth == 1) target["pin_status"] = Pin.O(Pin.ProjectStatus.Draft);
            var client = Pin.Ref(target, "pin_client");
            if (!target.Contains("transactioncurrencyid") && client != null)
            {
                var cur = Pin.Ref(sys.Retrieve("pin_client", client.Id, new ColumnSet("transactioncurrencyid")), "transactioncurrencyid");
                if (cur != null) target["transactioncurrencyid"] = cur;
            }
        }

        private static void PostCreate(IOrganizationService sys, ILocalPluginContext local, Entity target, IPluginExecutionContext ctx)
        {
            var caller = Caller.Resolve(sys, ctx.InitiatingUserId);
            Activity.Log(sys, target.Id, Pin.Kind.Status, $"Project created by {(caller.ResourceName == "" ? "a user" : caller.ResourceName)}", caller.Resource);
            var pm = Pin.Ref(target, "pin_projectmanager");
            if (pm != null) EnsurePmMember(sys, local, target.Id, pm, Pin.Date(target, "pin_startdate"));
            var sponsor = Pin.Ref(target, "pin_sponsor");
            if (sponsor != null) AccessTeam.Add(sys, local.TracingService, target.Id, sponsor);
        }

        private static void PreUpdate(IOrganizationService sys, Entity target, Entity pre, IPluginExecutionContext ctx)
        {
            var caller = Caller.Resolve(sys, ctx.InitiatingUserId);
            var from = Pin.Opt(pre, "pin_status", Pin.ProjectStatus.Draft);
            var draftOwner = from == Pin.ProjectStatus.Draft && Pin.Ref(pre, "ownerid")?.Id == ctx.InitiatingUserId;
            if (!caller.IsAdmin && !draftOwner && caller.LevelOn(sys, target.Id) != Pin.Access.ProjectManager)
                Pin.Fail("Only the project manager (or a PMO admin) can change this project.");

            if (!target.Contains("pin_status")) return;
            var to = Pin.Opt(target, "pin_status");
            if (to == from) return;
            var merged = Pin.Merge(target, pre);

            bool ok;
            switch (to)
            {
                case Pin.ProjectStatus.Pending:
                    ok = from == Pin.ProjectStatus.Draft || from == Pin.ProjectStatus.Rejected;
                    if (ok)
                    {
                        var missing = new List<string>();
                        if (Pin.Ref(merged, "pin_client") == null) missing.Add("client");
                        if (Pin.Ref(merged, "pin_sponsor") == null) missing.Add("sponsor");
                        if (Pin.Date(merged, "pin_startdate") == null) missing.Add("start date");
                        if (missing.Count > 0) Pin.Fail($"Add the {string.Join(", ", missing)} before submitting for approval.");
                        target["pin_submittedon"] = DateTime.UtcNow;
                    }
                    break;
                case Pin.ProjectStatus.Draft:
                    ok = from == Pin.ProjectStatus.Pending || from == Pin.ProjectStatus.Rejected;
                    break;
                case Pin.ProjectStatus.Active:
                    ok = from == Pin.ProjectStatus.Approved || from == Pin.ProjectStatus.OnHold || from == Pin.ProjectStatus.Closing;
                    if (ok && Pin.Ref(merged, "pin_projectmanager") == null) Pin.Fail("Assign a project manager before starting the project.");
                    break;
                case Pin.ProjectStatus.OnHold:
                    ok = from == Pin.ProjectStatus.Active;
                    break;
                case Pin.ProjectStatus.Closing:
                    ok = from == Pin.ProjectStatus.Active || from == Pin.ProjectStatus.OnHold;
                    if (ok && string.IsNullOrWhiteSpace(Pin.Str(merged, "pin_closureoverride")))
                    {
                        var blockers = ProjectRules.ClosureBlockers(sys, target.Id, Pin.Opt(merged, "pin_billingmodel", Pin.Billing.TimeAndMaterials));
                        if (blockers.Count > 0)
                            Pin.Fail("This project can't close yet: " + string.Join("; ", blockers) + ". Finish these, or give an override reason.");
                    }
                    break;
                case Pin.ProjectStatus.Cancelled:
                    ok = from != Pin.ProjectStatus.Closed && from != Pin.ProjectStatus.Cancelled;
                    break;
                default: // Approved, Rejected, Closed come only from the approval inbox
                    ok = caller.IsAdmin;
                    if (!ok) Pin.Fail($"\"{ProjectRules.StatusName(to)}\" is set by the sponsor's approval — use the approvals inbox.");
                    break;
            }
            if (!ok) Pin.Fail($"A project can't move from {ProjectRules.StatusName(from)} to {ProjectRules.StatusName(to)}.");
        }

        private static void PostUpdate(IOrganizationService sys, ILocalPluginContext local, Entity target, Entity pre, IPluginExecutionContext ctx)
        {
            var caller = Caller.Resolve(sys, ctx.InitiatingUserId);
            var merged = Pin.Merge(target, pre);
            var name = Pin.Str(merged, "pin_name");

            // People changes → access team + PM membership
            if (target.Contains("pin_projectmanager"))
            {
                var pm = Pin.Ref(target, "pin_projectmanager");
                if (pm != null) EnsurePmMember(sys, local, target.Id, pm, Pin.Date(merged, "pin_startdate"));
                var old = Pin.Ref(pre, "pin_projectmanager");
                if (old != null && old.Id != pm?.Id) AccessTeam.RemoveIfUnused(sys, local.TracingService, target.Id, old);
                if (pm != null) Activity.Log(sys, target.Id, Pin.Kind.Team, $"{Name(sys, pm)} is now the project manager", caller.Resource);
            }
            if (target.Contains("pin_sponsor"))
            {
                var sp = Pin.Ref(target, "pin_sponsor");
                if (sp != null) AccessTeam.Add(sys, local.TracingService, target.Id, sp);
                var old = Pin.Ref(pre, "pin_sponsor");
                if (old != null && old.Id != sp?.Id) AccessTeam.RemoveIfUnused(sys, local.TracingService, target.Id, old);
            }

            if (!target.Contains("pin_status")) return;
            var from = Pin.Opt(pre, "pin_status");
            var to = Pin.Opt(target, "pin_status");
            if (from == to) return;
            var project = new EntityReference("pin_project", target.Id);

            if (to == Pin.ProjectStatus.Pending)
                Approvals.Request(sys, Pin.ApprovalType.Project, $"Approve project {name}", Pin.Ref(merged, "pin_sponsor"), caller.Resource, "pin_project", project);
            if (from == Pin.ProjectStatus.Pending && to == Pin.ProjectStatus.Draft)
                Approvals.CancelPending(sys, "pin_project", target.Id, Pin.ApprovalType.Project);
            if (to == Pin.ProjectStatus.Closing)
                Approvals.Request(sys, Pin.ApprovalType.Closure, $"Close project {name}", Pin.Ref(merged, "pin_sponsor"), caller.Resource, "pin_project", project);
            if (from == Pin.ProjectStatus.Closing && to == Pin.ProjectStatus.Active)
                Approvals.CancelPending(sys, "pin_project", target.Id, Pin.ApprovalType.Closure);

            Activity.Log(sys, target.Id, Pin.Kind.Status, $"Status: {ProjectRules.StatusName(from)} → {ProjectRules.StatusName(to)}", caller.Resource);
        }

        private static string Name(IOrganizationService sys, EntityReference r) => sys.Retrieve(r.LogicalName, r.Id, new ColumnSet("pin_name")).GetAttributeValue<string>("pin_name");

        /// <summary>The PM always has a current PM-level assignment (which also puts them in the access team).</summary>
        internal static void EnsurePmMember(IOrganizationService sys, ILocalPluginContext local, Guid projectId, EntityReference pm, DateTime? start)
        {
            var today = DateTime.UtcNow.Date;
            var existing = Members.ActiveFor(sys, projectId, pm.Id, today).FirstOrDefault()
                           ?? Members.ActiveFor(sys, projectId, pm.Id, (start ?? today).Date).FirstOrDefault();
            if (existing != null)
            {
                if (Pin.Opt(existing, "pin_accesslevel") != Pin.Access.ProjectManager)
                    sys.Update(new Entity("pin_member", existing.Id) { ["pin_accesslevel"] = Pin.O(Pin.Access.ProjectManager) });
                AccessTeam.Add(sys, local.TracingService, projectId, pm);
                return;
            }
            var res = sys.Retrieve("pin_resource", pm.Id, new ColumnSet("pin_name", "pin_defaultrole"));
            var role = ProjectRules.RoleByName(sys, "Project Manager") ?? Pin.Ref(res, "pin_defaultrole");
            var m = new Entity("pin_member")
            {
                ["pin_name"] = $"{res.GetAttributeValue<string>("pin_name")} · Project Manager",
                ["pin_project"] = new EntityReference("pin_project", projectId),
                ["pin_resource"] = pm,
                ["pin_accesslevel"] = Pin.O(Pin.Access.ProjectManager),
                ["pin_allocation"] = 50m,
                ["pin_effectivefrom"] = (start ?? today).Date,
                ["pin_isactive"] = true,
            };
            if (role != null) m["pin_role"] = role;
            sys.Create(m);
        }
    }

    /// <summary>
    /// pin_member — Create/Update/Delete Pre 20 (who may staff the project, overlap rules) and Post 40 (access team, activity).
    /// Role changes are effective-dated: the app ends the current assignment and adds a new one from the change date.
    /// </summary>
    public class MemberPlugin : PluginBase
    {
        public MemberPlugin(string unsecure, string secure) : base(typeof(MemberPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext local)
        {
            var ctx = local.PluginExecutionContext;
            var sys = local.OrgSvcFactory.CreateOrganizationService(null);
            ctx.PreEntityImages.TryGetValue("pre", out var pre);
            var target = ctx.InputParameters["Target"] as Entity;
            var row = ctx.MessageName == "Delete" ? pre : Pin.Merge(target, pre);
            if (row == null) return;
            var project = Pin.Ref(row, "pin_project");
            if (project == null) return;

            if (ctx.Stage == 20)
            {
                if (ctx.Depth == 1)
                {
                    var caller = Caller.Resolve(sys, ctx.InitiatingUserId);
                    if (!caller.IsRmg && !caller.IsPm(sys, project.Id)) Pin.Fail("Only the project manager, RMG or a PMO admin can change the project team.");
                }
                if (ctx.MessageName == "Delete") return;
                var from = (Pin.Date(row, "pin_effectivefrom") ?? DateTime.UtcNow).Date;
                var to = Pin.Date(row, "pin_effectiveto")?.Date;
                if (to.HasValue && to < from) Pin.Fail("The assignment ends before it starts.");
                if (!target.Contains("pin_effectivefrom") && ctx.MessageName == "Create") target["pin_effectivefrom"] = from;
                if (ctx.MessageName == "Update" && target.Contains("pin_role") && Pin.Ref(pre, "pin_role")?.Id != Pin.Ref(target, "pin_role")?.Id && from < DateTime.UtcNow.Date && ctx.Depth == 1)
                    Pin.Fail("Role changes are effective-dated: end this assignment and add a new one from the change date (use “Change role” in the app).");

                // No overlapping active assignments for the same person
                var resource = Pin.Ref(row, "pin_resource");
                if (resource != null && Pin.Bool(row, "pin_isactive", true))
                {
                    var clash = Pin.Query(sys, "pin_member", new[] { "pin_effectivefrom", "pin_effectiveto" },
                            ("pin_project", ConditionOperator.Equal, project.Id), ("pin_resource", ConditionOperator.Equal, resource.Id), ("pin_isactive", ConditionOperator.Equal, true)).Entities
                        .Where(m => m.Id != target.Id)
                        .Any(m => (Pin.Date(m, "pin_effectivefrom") ?? DateTime.MinValue).Date <= (to ?? DateTime.MaxValue) && (Pin.Date(m, "pin_effectiveto") ?? DateTime.MaxValue).Date >= from);
                    if (clash) Pin.Fail("This person already has an assignment on the project for these dates. End it first, or change its dates.");
                }
                return;
            }

            // Post: access team + activity
            var res = Pin.Ref(row, "pin_resource");
            var actor = Caller.Resolve(sys, ctx.InitiatingUserId).Resource;
            var person = res == null ? "Someone" : sys.Retrieve("pin_resource", res.Id, new ColumnSet("pin_name")).GetAttributeValue<string>("pin_name");
            var roleName = Pin.Ref(row, "pin_role") == null ? "member" : sys.Retrieve("pin_role", Pin.Ref(row, "pin_role").Id, new ColumnSet("pin_name")).GetAttributeValue<string>("pin_name");
            var ended = !Pin.Bool(row, "pin_isactive", true) || (Pin.Date(row, "pin_effectiveto") ?? DateTime.MaxValue).Date < DateTime.UtcNow.Date;

            if (ctx.MessageName == "Delete" || ended)
            {
                AccessTeam.RemoveIfUnused(sys, local.TracingService, project.Id, res, row.Id);
                if (ctx.MessageName == "Delete") Activity.Log(sys, project.Id, Pin.Kind.Team, $"{person} was removed from the team", actor);
                else if (target.Contains("pin_effectiveto") || target.Contains("pin_isactive")) Activity.Log(sys, project.Id, Pin.Kind.Team, $"{person}'s {roleName} assignment ended", actor);
            }
            else
            {
                AccessTeam.Add(sys, local.TracingService, project.Id, res);
                if (ctx.MessageName == "Create")
                {
                    var levels = new[] { "Project Manager", "Contributor", "Viewer" };
                    var level = levels[Math.Max(0, Pin.Opt(row, "pin_accesslevel", Pin.Access.Contributor) - Pin.Access.ProjectManager)];
                    Activity.Log(sys, project.Id, Pin.Kind.Team, $"{person} joined as {roleName} ({level}, {Pin.Dec(row, "pin_allocation"):0}% from {Pin.Fmt(Pin.Date(row, "pin_effectivefrom") ?? DateTime.UtcNow)})", actor);
                }
            }
        }
    }

    /// <summary>pin_task — Create/Update Pre 20 (project access rules) and Post 40 (progress roll-up).</summary>
    public class TaskPlugin : PluginBase
    {
        public TaskPlugin(string unsecure, string secure) : base(typeof(TaskPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext local)
        {
            var ctx = local.PluginExecutionContext;
            var sys = local.OrgSvcFactory.CreateOrganizationService(null);
            var target = ctx.InputParameters["Target"] as Entity;
            if (target == null) return;
            ctx.PreEntityImages.TryGetValue("pre", out var pre);
            var row = Pin.Merge(target, pre);
            var project = Pin.Ref(row, "pin_project");
            if (project == null) return;

            if (ctx.Stage == 20)
            {
                if (ctx.Depth == 1)
                {
                    var caller = Caller.Resolve(sys, ctx.InitiatingUserId);
                    var level = caller.IsAdmin ? Pin.Access.ProjectManager : caller.LevelOn(sys, project.Id);
                    if (level == null || level == Pin.Access.Viewer) Pin.Fail("You have view-only access to this project.");
                    if (level == Pin.Access.Contributor && ctx.MessageName == "Update")
                    {
                        var assignee = Pin.Ref(pre, "pin_assignee");
                        if (assignee != null && assignee.Id != caller.Resource?.Id) Pin.Fail("Contributors can update only tasks assigned to them. Ask the project manager to reassign it.");
                        var newAssignee = Pin.Ref(target, "pin_assignee");
                        if (target.Contains("pin_assignee") && newAssignee != null && newAssignee.Id != caller.Resource?.Id) Pin.Fail("Only the project manager can assign tasks to other people.");
                    }
                }
                // Done ⇔ 100%
                if (target.Contains("pin_status"))
                {
                    var done = Pin.Opt(target, "pin_status") == Pin.TaskStatus.Done;
                    var wasDone = Pin.Opt(pre, "pin_status") == Pin.TaskStatus.Done;
                    if (done && !wasDone)
                    {
                        target["pin_percentcomplete"] = 100m;
                        target["pin_completedon"] = DateTime.UtcNow;
                    }
                    else if (!done && wasDone) target["pin_completedon"] = null;
                }
                return;
            }

            // Post: roll up project progress; log completions
            if (target.Contains("pin_status") || target.Contains("pin_percentcomplete") || target.Contains("pin_estimatehours") || ctx.MessageName == "Create")
                ProjectRules.RollUpProgress(sys, project.Id);
            if (target.Contains("pin_status") && Pin.Opt(target, "pin_status") == Pin.TaskStatus.Done && Pin.Opt(pre, "pin_status") != Pin.TaskStatus.Done)
                Activity.Log(sys, project.Id, Pin.Kind.Task, $"Task completed: {Pin.Str(row, "pin_name")}", Caller.Resolve(sys, ctx.InitiatingUserId).Resource);
        }
    }

    /// <summary>pin_milestone — Update(pin_status) Post 40: acceptance recognises fixed-price revenue.</summary>
    public class MilestonePlugin : PluginBase
    {
        public MilestonePlugin(string unsecure, string secure) : base(typeof(MilestonePlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext local)
        {
            var ctx = local.PluginExecutionContext;
            if (ctx.Depth > 2) return;
            var sys = local.OrgSvcFactory.CreateOrganizationService(null);
            var target = (Entity)ctx.InputParameters["Target"];
            ctx.PreEntityImages.TryGetValue("pre", out var pre);
            var row = Pin.Merge(target, pre);
            var project = Pin.Ref(row, "pin_project");
            var to = Pin.Opt(target, "pin_status");
            var from = Pin.Opt(pre, "pin_status");
            if (project == null || to == from) return;
            if (ctx.Depth == 1) Caller.Resolve(sys, ctx.InitiatingUserId).RequirePm(sys, project.Id, "change milestone status");

            var p = sys.Retrieve("pin_project", project.Id, new ColumnSet("pin_billingmodel", "pin_recognisedrevenue", "transactioncurrencyid"));
            if (Pin.Opt(p, "pin_billingmodel") != Pin.Billing.FixedPrice) return;
            var amount = Pin.Money(row, "pin_amount");

            if (to == Pin.MilestoneStatus.Accepted && from < Pin.MilestoneStatus.Accepted)
            {
                var today = DateTime.UtcNow.Date;
                var rev = new Entity("pin_revenue")
                {
                    ["pin_name"] = $"Milestone accepted · {Pin.Str(row, "pin_name")}",
                    ["pin_project"] = project,
                    ["pin_revenuedate"] = today,
                    ["pin_period"] = new DateTime(today.Year, today.Month, 1),
                    ["pin_source"] = Pin.O(Pin.RevenueSource.Milestone),
                    ["pin_amount"] = Pin.M(amount),
                    ["pin_milestone"] = target.ToEntityReference(),
                };
                if (Pin.Ref(p, "transactioncurrencyid") != null) rev["transactioncurrencyid"] = Pin.Ref(p, "transactioncurrencyid");
                sys.Create(rev);
                sys.Update(new Entity("pin_milestone", target.Id) { ["pin_acceptedon"] = today });
                sys.Update(new Entity("pin_project", project.Id) { ["pin_recognisedrevenue"] = Pin.M(Pin.Money(p, "pin_recognisedrevenue") + amount) });
                Activity.Log(sys, project.Id, Pin.Kind.Billing, $"Milestone accepted: {Pin.Str(row, "pin_name")}", Caller.Resolve(sys, ctx.InitiatingUserId).Resource);
            }
            else if (from == Pin.MilestoneStatus.Accepted && to < Pin.MilestoneStatus.Accepted)
            {
                foreach (var r in Pin.Query(sys, "pin_revenue", new[] { "pin_amount" }, ("pin_milestone", ConditionOperator.Equal, target.Id)).Entities)
                {
                    sys.Delete("pin_revenue", r.Id);
                    sys.Update(new Entity("pin_project", project.Id) { ["pin_recognisedrevenue"] = Pin.M(Pin.Money(p, "pin_recognisedrevenue") - Pin.Money(r, "pin_amount")) });
                }
            }
        }
    }

    /// <summary>
    /// pin_resourcerequest — Create Pre 20 (who may ask, defaults), Update Pre 20 (RMG-only decisions)
    /// and Post 40 (Fulfilled → staff the project automatically; activity feed).
    /// </summary>
    public class ResourceRequestPlugin : PluginBase
    {
        public ResourceRequestPlugin(string unsecure, string secure) : base(typeof(ResourceRequestPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext local)
        {
            var ctx = local.PluginExecutionContext;
            var sys = local.OrgSvcFactory.CreateOrganizationService(null);
            var target = (Entity)ctx.InputParameters["Target"];
            ctx.PreEntityImages.TryGetValue("pre", out var pre);
            var row = Pin.Merge(target, pre);
            var project = Pin.Ref(row, "pin_project");
            if (project == null) return;
            var caller = Caller.Resolve(sys, ctx.InitiatingUserId);

            if (ctx.Stage == 20 && ctx.MessageName == "Create")
            {
                if (ctx.Depth == 1 && !caller.IsRmg && !caller.IsPm(sys, project.Id)) Pin.Fail("Only the project manager can request talent for this project.");
                target["pin_status"] = Pin.O(Pin.RequestStatus.Submitted);
                if (!target.Contains("pin_requestedby") && caller.Resource != null) target["pin_requestedby"] = caller.Resource;
                if (!target.Contains("pin_headcount")) target["pin_headcount"] = 1;
                return;
            }
            if (ctx.Stage == 20 && ctx.MessageName == "Update")
            {
                if (ctx.Depth > 1 || !target.Contains("pin_status")) return;
                var to = Pin.Opt(target, "pin_status");
                var ownRequest = Pin.Ref(pre, "pin_requestedby")?.Id == caller.Resource?.Id;
                if (!caller.IsRmg && !(to == Pin.RequestStatus.Cancelled && ownRequest))
                    Pin.Fail("Talent requests are progressed by the RMG team. You can cancel your own request.");
                return;
            }

            // Post
            var title = Pin.Str(row, "pin_title");
            var number = Pin.Str(row, "pin_name");
            if (ctx.MessageName == "Create")
            {
                Activity.Log(sys, project.Id, Pin.Kind.Talent, $"Talent requested: {title} ({Pin.Int(row, "pin_headcount")})", caller.Resource);
                return;
            }
            if (!target.Contains("pin_status") || Pin.Opt(target, "pin_status") == Pin.Opt(pre, "pin_status")) return;
            var status = Pin.Opt(target, "pin_status");
            var labels = new[] { "Submitted", "In review", "Matched internally", "Hiring", "Candidate selected", "Fulfilled", "Cancelled" };
            Activity.Log(sys, project.Id, Pin.Kind.Talent, $"{number} {title}: {labels[status - Pin.RequestStatus.Submitted]}", caller.Resource);

            var person = Pin.Ref(row, "pin_fulfilledby");
            if (status == Pin.RequestStatus.Fulfilled && person != null)
            {
                var start = (Pin.Date(row, "pin_startdate") ?? DateTime.UtcNow).Date;
                if (Members.ActiveFor(sys, project.Id, person.Id, start).Any()) return; // already staffed
                var res = sys.Retrieve("pin_resource", person.Id, new ColumnSet("pin_name", "pin_defaultrole"));
                var role = Pin.Ref(row, "pin_role") ?? Pin.Ref(res, "pin_defaultrole");
                var m = new Entity("pin_member")
                {
                    ["pin_name"] = $"{res.GetAttributeValue<string>("pin_name")} · {title}",
                    ["pin_project"] = project,
                    ["pin_resource"] = person,
                    ["pin_accesslevel"] = Pin.O(Pin.Access.Contributor),
                    ["pin_allocation"] = Pin.Dec(row, "pin_allocation") > 0 ? Pin.Dec(row, "pin_allocation") : 100m,
                    ["pin_effectivefrom"] = start,
                    ["pin_isactive"] = true,
                    ["pin_changereason"] = $"Staffed via {number}",
                };
                if (role != null) m["pin_role"] = role;
                if (Pin.Date(row, "pin_enddate") != null) m["pin_effectiveto"] = Pin.Date(row, "pin_enddate");
                sys.Create(m);
            }
        }
    }

    /// <summary>Child rows with money columns inherit the project's currency (Create Pre 20).</summary>
    public class CurrencyPlugin : PluginBase
    {
        public CurrencyPlugin(string unsecure, string secure) : base(typeof(CurrencyPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext local)
        {
            var ctx = local.PluginExecutionContext;
            var target = ctx.InputParameters["Target"] as Entity;
            if (target == null || target.Contains("transactioncurrencyid")) return;
            var project = Pin.Ref(target, "pin_project");
            if (project == null) return;
            var sys = local.OrgSvcFactory.CreateOrganizationService(null);
            var cur = Pin.Ref(sys.Retrieve("pin_project", project.Id, new ColumnSet("transactioncurrencyid")), "transactioncurrencyid");
            if (cur != null) target["transactioncurrencyid"] = cur;
        }
    }
}
