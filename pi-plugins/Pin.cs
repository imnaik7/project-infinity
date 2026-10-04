using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace ProjectInfinity.Plugins
{
    /// <summary>Choice values (publisher option prefix 54320) — must match pi-dataverse/schema.mjs.</summary>
    internal static class Pin
    {
        private const int B = 543200000;

        public static class ProjectStatus { public const int Draft = B, Pending = B + 1, Approved = B + 2, Rejected = B + 3, Active = B + 4, OnHold = B + 5, Closing = B + 6, Closed = B + 7, Cancelled = B + 8; }
        public static class Billing { public const int TimeAndMaterials = B, FixedPrice = B + 1, Retainer = B + 2, NonBillable = B + 3; }
        public static class Access { public const int ProjectManager = B, Contributor = B + 1, Viewer = B + 2; }
        public static class MilestoneStatus { public const int Planned = B, InProgress = B + 1, Completed = B + 2, Accepted = B + 3, Invoiced = B + 4; }
        public static class TaskStatus { public const int Backlog = B, ToDo = B + 1, InProgress = B + 2, InReview = B + 3, Blocked = B + 4, Done = B + 5; }
        public static class SheetStatus { public const int Draft = B, Submitted = B + 1, Approved = B + 2, Rejected = B + 3; }
        public static class EntryType { public const int Work = B, Leave = B + 1, Holiday = B + 2; }
        public static class ApprovalType { public const int Project = B, Timesheet = B + 1, Closure = B + 2, Invoice = B + 3, Leave = B + 4; }
        public static class ApprovalStatus { public const int Pending = B, Approved = B + 1, Rejected = B + 2, Cancelled = B + 3; }
        public static class InvoiceStatus { public const int Draft = B, Approved = B + 1, Sent = B + 2, Paid = B + 3, Cancelled = B + 4; }
        public static class LineType { public const int Time = B, Milestone = B + 1, Retainer = B + 2, Adjustment = B + 3; }
        public static class RevenueSource { public const int Time = B, Milestone = B + 1, Retainer = B + 2, Adjustment = B + 3; }
        public static class Kind { public const int Status = B, Approval = B + 1, Team = B + 2, Task = B + 3, Time = B + 4, Billing = B + 5, Talent = B + 6, Note = B + 7; }
        public static class RequestStatus { public const int Submitted = B, InReview = B + 1, Matched = B + 2, Hiring = B + 3, CandidateSelected = B + 4, Fulfilled = B + 5, Cancelled = B + 6; }
        public static class LeaveStatus { public const int Submitted = B, Approved = B + 1, Rejected = B + 2, Cancelled = B + 3; }

        public const string TeamTemplate = "Project Infinity Team";
        public static readonly string[] AdminRoles = { "System Administrator", "Project Infinity PMO Admin" };
        public const string RmgRole = "Project Infinity Resource Manager";
        public const string FinanceRole = "Project Infinity Finance";

        // ---------- attribute helpers ----------
        public static int Opt(Entity e, string a, int fallback = -1) => e?.GetAttributeValue<OptionSetValue>(a)?.Value ?? fallback;
        public static decimal Dec(Entity e, string a) => e?.GetAttributeValue<decimal?>(a) ?? 0m;
        public static decimal Money(Entity e, string a) => e?.GetAttributeValue<Money>(a)?.Value ?? 0m;
        public static int Int(Entity e, string a) => e?.GetAttributeValue<int?>(a) ?? 0;
        public static bool Bool(Entity e, string a, bool fallback = false) => e?.GetAttributeValue<bool?>(a) ?? fallback;
        public static EntityReference Ref(Entity e, string a) => e?.GetAttributeValue<EntityReference>(a);
        public static DateTime? Date(Entity e, string a) => e?.GetAttributeValue<DateTime?>(a);
        public static string Str(Entity e, string a) => e?.GetAttributeValue<string>(a) ?? "";
        public static OptionSetValue O(int v) => new OptionSetValue(v);
        public static Money M(decimal v) => new Money(Math.Round(v, 2));

        /// <summary>Value from the update target if present, else from the pre-image (the effective row after the update).</summary>
        public static T Merged<T>(Entity target, Entity pre, string a) => target != null && target.Contains(a) ? target.GetAttributeValue<T>(a) : (pre != null ? pre.GetAttributeValue<T>(a) : default);
        public static Entity Merge(Entity target, Entity pre)
        {
            var e = new Entity(target.LogicalName, target.Id);
            if (pre != null) foreach (var kv in pre.Attributes) e[kv.Key] = kv.Value;
            foreach (var kv in target.Attributes) e[kv.Key] = kv.Value;
            return e;
        }

        public static EntityCollection Query(IOrganizationService svc, string entity, string[] cols, params (string attr, ConditionOperator op, object value)[] where)
        {
            var q = new QueryExpression(entity) { ColumnSet = new ColumnSet(cols) };
            foreach (var w in where)
            {
                if (w.value == null) q.Criteria.AddCondition(w.attr, w.op);
                else if (w.value is object[] many) q.Criteria.AddCondition(w.attr, w.op, many); // In / NotIn: spread, don't nest
                else q.Criteria.AddCondition(w.attr, w.op, w.value);
            }
            return svc.RetrieveMultiple(q);
        }

        public static DateTime Monday(DateTime d)
        {
            var day = d.Date;
            int diff = ((int)day.DayOfWeek + 6) % 7;
            return day.AddDays(-diff);
        }

        public static string Fmt(DateTime d) => d.ToString("d MMM yyyy");

        public static void Fail(string message) => throw new InvalidPluginExecutionException(message);
    }

    /// <summary>Who is calling: their resource row, org roles, and helpers for per-project access.</summary>
    internal sealed class Caller
    {
        public Guid UserId;
        public EntityReference Resource;
        public string ResourceName = "";
        public bool IsAdmin, IsRmg, IsFinance;

        public static Caller Resolve(IOrganizationService sys, Guid userId)
        {
            var c = new Caller { UserId = userId };
            var q = new QueryExpression("role") { ColumnSet = new ColumnSet("name") };
            var link = q.AddLink("systemuserroles", "roleid", "roleid");
            link.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            var roles = sys.RetrieveMultiple(q).Entities.Select(r => r.GetAttributeValue<string>("name")).ToList();
            c.IsAdmin = roles.Any(r => Pin.AdminRoles.Contains(r));
            c.IsRmg = c.IsAdmin || roles.Contains(Pin.RmgRole);
            c.IsFinance = c.IsAdmin || roles.Contains(Pin.FinanceRole);
            var res = Pin.Query(sys, "pin_resource", new[] { "pin_name" }, ("pin_systemuser", ConditionOperator.Equal, userId)).Entities.FirstOrDefault();
            if (res != null)
            {
                c.Resource = res.ToEntityReference();
                c.ResourceName = res.GetAttributeValue<string>("pin_name");
            }
            return c;
        }

        /// <summary>Best project access level on a date (PM &lt; Contributor &lt; Viewer), or null when not on the project.</summary>
        public int? LevelOn(IOrganizationService sys, Guid projectId, DateTime? date = null)
        {
            if (Resource == null) return null;
            var project = sys.Retrieve("pin_project", projectId, new ColumnSet("pin_projectmanager"));
            if (Pin.Ref(project, "pin_projectmanager")?.Id == Resource.Id) return Pin.Access.ProjectManager;
            var m = Members.ActiveFor(sys, projectId, Resource.Id, (date ?? DateTime.UtcNow).Date).FirstOrDefault();
            return m == null ? (int?)null : Pin.Opt(m, "pin_accesslevel", Pin.Access.Contributor);
        }

        public bool IsPm(IOrganizationService sys, Guid projectId) => IsAdmin || LevelOn(sys, projectId) == Pin.Access.ProjectManager;

        public void RequirePm(IOrganizationService sys, Guid projectId, string action)
        {
            if (!IsPm(sys, projectId)) Pin.Fail($"Only the project manager (or a PMO admin) can {action}.");
        }
    }

    internal static class Members
    {
        /// <summary>Active assignments of a resource on a project covering a date, best access level first.</summary>
        public static IEnumerable<Entity> ActiveFor(IOrganizationService sys, Guid projectId, Guid resourceId, DateTime date)
        {
            var rows = Pin.Query(sys, "pin_member", new[] { "pin_role", "pin_accesslevel", "pin_effectivefrom", "pin_effectiveto", "pin_billrate", "pin_allocation" },
                ("pin_project", ConditionOperator.Equal, projectId), ("pin_resource", ConditionOperator.Equal, resourceId), ("pin_isactive", ConditionOperator.Equal, true)).Entities;
            return rows.Where(m => (Pin.Date(m, "pin_effectivefrom") ?? DateTime.MinValue).Date <= date.Date && (Pin.Date(m, "pin_effectiveto") ?? DateTime.MaxValue).Date >= date.Date)
                .OrderBy(m => Pin.Opt(m, "pin_accesslevel", Pin.Access.Contributor));
        }

        /// <summary>Any assignment that is current or starts in the future (keeps access-team membership).</summary>
        public static bool HasCurrentOrFuture(IOrganizationService sys, Guid projectId, Guid resourceId, Guid? exceptMemberId = null)
        {
            var today = DateTime.UtcNow.Date;
            return Pin.Query(sys, "pin_member", new[] { "pin_effectiveto" },
                    ("pin_project", ConditionOperator.Equal, projectId), ("pin_resource", ConditionOperator.Equal, resourceId), ("pin_isactive", ConditionOperator.Equal, true)).Entities
                .Any(m => m.Id != exceptMemberId && (Pin.Date(m, "pin_effectiveto") ?? DateTime.MaxValue).Date >= today);
        }
    }

    /// <summary>Row-level security: keeps the project's access team in step with its people.</summary>
    internal static class AccessTeam
    {
        private static Guid? Template(IOrganizationService sys) =>
            Pin.Query(sys, "teamtemplate", new[] { "teamtemplateid" }, ("teamtemplatename", ConditionOperator.Equal, Pin.TeamTemplate)).Entities.FirstOrDefault()?.Id;

        private static Guid? UserOf(IOrganizationService sys, EntityReference resource)
        {
            if (resource == null) return null;
            return Pin.Ref(sys.Retrieve("pin_resource", resource.Id, new ColumnSet("pin_systemuser")), "pin_systemuser")?.Id;
        }

        public static void Add(IOrganizationService sys, ITracingService trace, Guid projectId, EntityReference resource)
        {
            var user = UserOf(sys, resource);
            var template = Template(sys);
            if (user == null || template == null) return; // demo people without accounts need no sharing
            sys.Execute(new AddUserToRecordTeamRequest { Record = new EntityReference("pin_project", projectId), SystemUserId = user.Value, TeamTemplateId = template.Value });
            trace.Trace($"Access team + {user} on {projectId}");
        }

        public static void Remove(IOrganizationService sys, ITracingService trace, Guid projectId, EntityReference resource)
        {
            var user = UserOf(sys, resource);
            var template = Template(sys);
            if (user == null || template == null) return;
            try
            {
                sys.Execute(new RemoveUserFromRecordTeamRequest { Record = new EntityReference("pin_project", projectId), SystemUserId = user.Value, TeamTemplateId = template.Value });
                trace.Trace($"Access team − {user} on {projectId}");
            }
            catch (Exception ex)
            {
                trace.Trace($"Remove from access team skipped: {ex.Message}"); // was never added
            }
        }

        /// <summary>Removes a person unless they still have a role on the project (member, PM or sponsor).</summary>
        public static void RemoveIfUnused(IOrganizationService sys, ITracingService trace, Guid projectId, EntityReference resource, Guid? exceptMemberId = null)
        {
            if (resource == null) return;
            var p = sys.Retrieve("pin_project", projectId, new ColumnSet("pin_projectmanager", "pin_sponsor"));
            if (Pin.Ref(p, "pin_projectmanager")?.Id == resource.Id || Pin.Ref(p, "pin_sponsor")?.Id == resource.Id) return;
            if (Members.HasCurrentOrFuture(sys, projectId, resource.Id, exceptMemberId)) return;
            Remove(sys, trace, projectId, resource);
        }
    }

    /// <summary>Bill / cost rates in the project's currency, resolved for one assignment on one date.</summary>
    internal static class Rates
    {
        public static decimal ExchangeRate(IOrganizationService sys, EntityReference currency)
        {
            if (currency == null) return 1m;
            var r = sys.Retrieve("transactioncurrency", currency.Id, new ColumnSet("exchangerate")).GetAttributeValue<decimal?>("exchangerate") ?? 1m;
            return r <= 0 ? 1m : r;
        }

        /// <summary>member override → project rate for the role → role default (base INR converted).</summary>
        public static (decimal bill, decimal cost) For(IOrganizationService sys, Entity project, Entity member, EntityReference role)
        {
            decimal bill = Pin.Money(member, "pin_billrate"), cost = 0m;
            var pr = Pin.Query(sys, "pin_projectrate", new[] { "pin_billrate", "pin_costrate" },
                ("pin_project", ConditionOperator.Equal, project.Id), ("pin_role", ConditionOperator.Equal, role.Id)).Entities.FirstOrDefault();
            if (pr != null)
            {
                if (bill <= 0) bill = Pin.Money(pr, "pin_billrate");
                cost = Pin.Money(pr, "pin_costrate");
            }
            if (bill <= 0 || cost <= 0)
            {
                var r = sys.Retrieve("pin_role", role.Id, new ColumnSet("pin_billrate", "pin_costrate", "pin_billrate_base", "pin_costrate_base"));
                var fx = ExchangeRate(sys, Pin.Ref(project, "transactioncurrencyid"));
                var baseBill = r.GetAttributeValue<Money>("pin_billrate_base")?.Value ?? Pin.Money(r, "pin_billrate");
                var baseCost = r.GetAttributeValue<Money>("pin_costrate_base")?.Value ?? Pin.Money(r, "pin_costrate");
                if (bill <= 0) bill = Math.Round(baseBill * fx, 2);
                if (cost <= 0) cost = Math.Round(baseCost * fx, 2);
            }
            return (bill, cost);
        }
    }

    internal static class Activity
    {
        public static void Log(IOrganizationService sys, Guid projectId, int kind, string text, EntityReference actor = null, string details = null)
        {
            var a = new Entity("pin_activity")
            {
                ["pin_name"] = text.Length > 400 ? text.Substring(0, 400) : text,
                ["pin_project"] = new EntityReference("pin_project", projectId),
                ["pin_kind"] = Pin.O(kind),
            };
            if (actor != null) a["pin_actor"] = actor;
            if (details != null) a["pin_details"] = details;
            sys.Create(a);
        }
    }

    internal static class Approvals
    {
        /// <summary>Creates a pending approval owned by the approver (so it lands in their inbox and Teams card).</summary>
        public static Guid Request(IOrganizationService sys, int type, string summary, EntityReference approver, EntityReference requestedBy, string lookup, EntityReference target, EntityReference project = null)
        {
            if (approver == null) Pin.Fail("No approver is set. Ask a PMO admin to set the sponsor / manager first.");
            var a = new Entity("pin_approval")
            {
                ["pin_name"] = summary.Length > 300 ? summary.Substring(0, 300) : summary,
                ["pin_summary"] = summary.Length > 400 ? summary.Substring(0, 400) : summary,
                ["pin_type"] = Pin.O(type),
                ["pin_status"] = Pin.O(Pin.ApprovalStatus.Pending),
                ["pin_approver"] = approver,
                ["pin_requestedon"] = DateTime.UtcNow,
                [lookup] = target,
            };
            if (requestedBy != null) a["pin_requestedby"] = requestedBy;
            if (project != null && lookup != "pin_project") a["pin_project"] = project;
            var user = Pin.Ref(sys.Retrieve("pin_resource", approver.Id, new ColumnSet("pin_systemuser")), "pin_systemuser");
            if (user != null) a["ownerid"] = new EntityReference("systemuser", user.Id);
            return sys.Create(a);
        }

        public static void CancelPending(IOrganizationService sys, string lookup, Guid targetId, int type)
        {
            foreach (var a in Pin.Query(sys, "pin_approval", new[] { "pin_approvalid" },
                         (lookup, ConditionOperator.Equal, targetId), ("pin_type", ConditionOperator.Equal, type), ("pin_status", ConditionOperator.Equal, Pin.ApprovalStatus.Pending)).Entities)
                sys.Update(new Entity("pin_approval", a.Id) { ["pin_status"] = Pin.O(Pin.ApprovalStatus.Cancelled), ["pin_decidedon"] = DateTime.UtcNow });
        }
    }
}
