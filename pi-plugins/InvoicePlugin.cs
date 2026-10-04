using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace ProjectInfinity.Plugins
{
    /// <summary>
    /// pin_invoice — Create Post 40: builds the lines for project + period (approved unbilled T&amp;M time grouped by
    /// role and rate, accepted milestones, retainer months), applies client tax and links what was billed.
    /// Update(pin_status) Pre 20 (who may) + Post 40: Cancelled releases everything; billed totals are recomputed.
    /// </summary>
    public class InvoicePlugin : PluginBase
    {
        public InvoicePlugin(string unsecure, string secure) : base(typeof(InvoicePlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext local)
        {
            var ctx = local.PluginExecutionContext;
            var sys = local.OrgSvcFactory.CreateOrganizationService(null);
            var target = (Entity)ctx.InputParameters["Target"];
            ctx.PreEntityImages.TryGetValue("pre", out var pre);
            var row = Pin.Merge(target, pre);
            var project = Pin.Ref(row, "pin_project");
            if (project == null) return;

            if (ctx.Stage == 20)
            {
                if (ctx.Depth > 1) return;
                var caller = Caller.Resolve(sys, ctx.InitiatingUserId);
                if (!caller.IsFinance && !caller.IsPm(sys, project.Id)) Pin.Fail("Only Finance or the project manager can create or change invoices.");
                if (ctx.MessageName == "Create")
                {
                    var from = Pin.Date(target, "pin_periodfrom");
                    var to = Pin.Date(target, "pin_periodto");
                    if (from == null || to == null || to < from) Pin.Fail("Choose a billing period (from – to).");
                    target["pin_status"] = Pin.O(Pin.InvoiceStatus.Draft);
                }
                else if (target.Contains("pin_status"))
                {
                    var f = Pin.Opt(pre, "pin_status");
                    var t = Pin.Opt(target, "pin_status");
                    if (f == Pin.InvoiceStatus.Cancelled) Pin.Fail("A cancelled invoice can't be reopened. Create a new one.");
                    if (f == Pin.InvoiceStatus.Paid && t != Pin.InvoiceStatus.Paid) Pin.Fail("A paid invoice can't change status.");
                    if (t == Pin.InvoiceStatus.Sent && f == Pin.InvoiceStatus.Draft) Pin.Fail("Approve the invoice before sending it.");
                    if (t == Pin.InvoiceStatus.Paid) target["pin_paidon"] = Pin.Date(target, "pin_paidon") ?? DateTime.UtcNow.Date;
                    if (t == Pin.InvoiceStatus.Sent && Pin.Date(row, "pin_issuedon") == null) target["pin_issuedon"] = DateTime.UtcNow.Date;
                }
                return;
            }

            if (ctx.MessageName == "Create") Build(sys, target.Id, row, project);
            else if (target.Contains("pin_status") && Pin.Opt(target, "pin_status") != Pin.Opt(pre, "pin_status"))
            {
                if (Pin.Opt(target, "pin_status") == Pin.InvoiceStatus.Cancelled) Release(sys, target.Id);
                RecomputeBilled(sys, project.Id);
                var labels = new[] { "Draft", "Approved", "Sent", "Paid", "Cancelled" };
                Activity.Log(sys, project.Id, Pin.Kind.Billing, $"Invoice {Pin.Str(row, "pin_name")} {labels[Pin.Opt(target, "pin_status") - Pin.InvoiceStatus.Draft].ToLower()}", Caller.Resolve(sys, ctx.InitiatingUserId).Resource);
            }
        }

        private static void Build(IOrganizationService sys, Guid invoiceId, Entity inv, EntityReference projectRef)
        {
            var project = sys.Retrieve("pin_project", projectRef.Id, new ColumnSet("pin_name", "pin_billingmodel", "pin_client", "pin_retainerfee", "transactioncurrencyid"));
            var model = Pin.Opt(project, "pin_billingmodel");
            if (model == Pin.Billing.NonBillable) Pin.Fail("This project is non-billable.");
            var clientRef = Pin.Ref(inv, "pin_client") ?? Pin.Ref(project, "pin_client") ?? throw new InvalidPluginExecutionException("The project has no client.");
            var client = sys.Retrieve("pin_client", clientRef.Id, new ColumnSet("pin_taxrate", "pin_paymenttermsdays"));
            var currency = Pin.Ref(project, "transactioncurrencyid");
            var from = Pin.Date(inv, "pin_periodfrom").Value.Date;
            var to = Pin.Date(inv, "pin_periodto").Value.Date;
            var invoiceRef = new EntityReference("pin_invoice", invoiceId);
            var lines = new List<(Entity line, Action<Guid> link)>();
            int order = 0;

            Entity Line(string name, int type, decimal amount)
            {
                var l = new Entity("pin_invoiceline")
                {
                    ["pin_name"] = name.Length > 300 ? name.Substring(0, 300) : name,
                    ["pin_invoice"] = invoiceRef,
                    ["pin_linetype"] = Pin.O(type),
                    ["pin_amount"] = Pin.M(amount),
                    ["pin_sortorder"] = ++order,
                };
                if (currency != null) l["transactioncurrencyid"] = currency;
                return l;
            }

            // 1) Time & materials: approved, billable, not yet invoiced — grouped by role and rate
            if (model == Pin.Billing.TimeAndMaterials && Pin.Bool(inv, "pin_includetime", true))
            {
                var q = new QueryExpression("pin_timeentry") { ColumnSet = new ColumnSet("pin_hours", "pin_billrate", "pin_amount", "pin_role", "pin_workdate") };
                q.Criteria.AddCondition("pin_project", ConditionOperator.Equal, projectRef.Id);
                q.Criteria.AddCondition("pin_status", ConditionOperator.Equal, Pin.SheetStatus.Approved);
                q.Criteria.AddCondition("pin_billable", ConditionOperator.Equal, true);
                q.Criteria.AddCondition("pin_invoiceline", ConditionOperator.Null);
                q.Criteria.AddCondition("pin_workdate", ConditionOperator.OnOrAfter, from);
                q.Criteria.AddCondition("pin_workdate", ConditionOperator.OnOrBefore, to);
                var entries = sys.RetrieveMultiple(q).Entities.Where(e => Pin.Money(e, "pin_amount") > 0).ToList();
                foreach (var g in entries.GroupBy(e => (role: Pin.Ref(e, "pin_role")?.Id ?? Guid.Empty, rate: Pin.Money(e, "pin_billrate"))).OrderBy(g => g.Key.rate))
                {
                    var roleName = g.Key.role == Guid.Empty ? "Professional services" : sys.Retrieve("pin_role", g.Key.role, new ColumnSet("pin_name")).GetAttributeValue<string>("pin_name");
                    var hours = g.Sum(e => Pin.Dec(e, "pin_hours"));
                    var amount = g.Sum(e => Pin.Money(e, "pin_amount"));
                    var l = Line($"{roleName} — {hours:0.##} h × {g.Key.rate:0.##}", Pin.LineType.Time, amount);
                    l["pin_hours"] = hours;
                    l["pin_rate"] = Pin.M(g.Key.rate);
                    if (g.Key.role != Guid.Empty) l["pin_role"] = new EntityReference("pin_role", g.Key.role);
                    var ids = g.Select(e => e.Id).ToList();
                    lines.Add((l, lineId => { foreach (var id in ids) sys.Update(new Entity("pin_timeentry", id) { ["pin_invoiceline"] = new EntityReference("pin_invoiceline", lineId) }); }));
                }
            }

            // 2) Fixed price: accepted milestones not yet invoiced
            if (model == Pin.Billing.FixedPrice && Pin.Bool(inv, "pin_includemilestones", true))
            {
                foreach (var m in Pin.Query(sys, "pin_milestone", new[] { "pin_name", "pin_amount", "pin_acceptedon" },
                             ("pin_project", ConditionOperator.Equal, projectRef.Id), ("pin_status", ConditionOperator.Equal, Pin.MilestoneStatus.Accepted)).Entities
                             .Where(m => (Pin.Date(m, "pin_acceptedon") ?? from).Date <= to))
                {
                    var l = Line($"Milestone — {Pin.Str(m, "pin_name")}", Pin.LineType.Milestone, Pin.Money(m, "pin_amount"));
                    l["pin_milestone"] = m.ToEntityReference();
                    var mid = m.Id;
                    lines.Add((l, _ => sys.Update(new Entity("pin_milestone", mid) { ["pin_status"] = Pin.O(Pin.MilestoneStatus.Invoiced) })));
                }
            }

            // 3) Retainer: one line per month starting inside the period, never twice
            if (model == Pin.Billing.Retainer && Pin.Bool(inv, "pin_includeretainer", true))
            {
                var fee = Pin.Money(project, "pin_retainerfee");
                if (fee <= 0) Pin.Fail("Set the monthly retainer fee on the project first.");
                var billedMonths = new HashSet<string>(
                    Pin.Query(sys, "pin_invoiceline", new[] { "pin_name", "pin_invoice" }, ("pin_linetype", ConditionOperator.Equal, Pin.LineType.Retainer)).Entities
                        .Where(l => Pin.Ref(l, "pin_invoice") != null)
                        .Where(l =>
                        {
                            var i = sys.Retrieve("pin_invoice", Pin.Ref(l, "pin_invoice").Id, new ColumnSet("pin_project", "pin_status"));
                            return Pin.Ref(i, "pin_project")?.Id == projectRef.Id && Pin.Opt(i, "pin_status") != Pin.InvoiceStatus.Cancelled;
                        })
                        .Select(l => Pin.Str(l, "pin_name")));
                for (var month = new DateTime(from.Year, from.Month, 1); month <= to; month = month.AddMonths(1))
                {
                    if (month < from) continue;
                    var name = $"Retainer — {month:MMMM yyyy}";
                    if (billedMonths.Contains(name)) continue;
                    lines.Add((Line(name, Pin.LineType.Retainer, fee), _ => { }));
                }
            }

            if (lines.Count == 0)
                Pin.Fail($"Nothing to bill for {from:d MMM} – {to:d MMM yyyy}: no approved unbilled time, accepted milestones or retainer months in this period.");

            foreach (var (line, link) in lines)
            {
                var id = sys.Create(line);
                link(id);
            }
            var subtotal = lines.Sum(l => Pin.Money(l.line, "pin_amount"));
            var taxRate = Pin.Dec(client, "pin_taxrate");
            var tax = Math.Round(subtotal * taxRate / 100m, 2);
            var issued = DateTime.UtcNow.Date;
            var update = new Entity("pin_invoice", invoiceId)
            {
                ["pin_client"] = clientRef,
                ["pin_subtotal"] = Pin.M(subtotal),
                ["pin_taxrate"] = taxRate,
                ["pin_tax"] = Pin.M(tax),
                ["pin_total"] = Pin.M(subtotal + tax),
                ["pin_linecount"] = lines.Count,
                ["pin_issuedon"] = issued,
                ["pin_duedate"] = issued.AddDays(Pin.Int(client, "pin_paymenttermsdays") > 0 ? Pin.Int(client, "pin_paymenttermsdays") : 30),
            };
            if (currency != null) update["transactioncurrencyid"] = currency;
            sys.Update(update);

            // Revenue already recognised for this period is now billed
            foreach (var r in Pin.Query(sys, "pin_revenue", new[] { "pin_revenuedate" }, ("pin_project", ConditionOperator.Equal, projectRef.Id), ("pin_billed", ConditionOperator.Equal, false)).Entities
                         .Where(r => { var d = (Pin.Date(r, "pin_revenuedate") ?? from).Date; return d >= from && d <= to; }))
                sys.Update(new Entity("pin_revenue", r.Id) { ["pin_billed"] = true, ["pin_invoice"] = new EntityReference("pin_invoice", invoiceId) });

            Activity.Log(sys, projectRef.Id, Pin.Kind.Billing, $"Invoice drafted: {lines.Count} line(s), total {subtotal + tax:0.00}");
        }

        /// <summary>Cancelled invoice: everything it billed becomes billable again.</summary>
        private static void Release(IOrganizationService sys, Guid invoiceId)
        {
            foreach (var line in Pin.Query(sys, "pin_invoiceline", new[] { "pin_linetype", "pin_milestone" }, ("pin_invoice", ConditionOperator.Equal, invoiceId)).Entities)
            {
                foreach (var e in Pin.Query(sys, "pin_timeentry", new[] { "pin_timeentryid" }, ("pin_invoiceline", ConditionOperator.Equal, line.Id)).Entities)
                    sys.Update(new Entity("pin_timeentry", e.Id) { ["pin_invoiceline"] = null });
                var ms = Pin.Ref(line, "pin_milestone");
                if (ms != null) sys.Update(new Entity("pin_milestone", ms.Id) { ["pin_status"] = Pin.O(Pin.MilestoneStatus.Accepted) });
            }
            foreach (var r in Pin.Query(sys, "pin_revenue", new[] { "pin_revenueid" }, ("pin_invoice", ConditionOperator.Equal, invoiceId)).Entities)
                sys.Update(new Entity("pin_revenue", r.Id) { ["pin_billed"] = false, ["pin_invoice"] = null });
        }

        private static void RecomputeBilled(IOrganizationService sys, Guid projectId)
        {
            var billed = Pin.Query(sys, "pin_invoice", new[] { "pin_total", "pin_status" }, ("pin_project", ConditionOperator.Equal, projectId)).Entities
                .Where(i => { var s = Pin.Opt(i, "pin_status"); return s == Pin.InvoiceStatus.Approved || s == Pin.InvoiceStatus.Sent || s == Pin.InvoiceStatus.Paid; })
                .Sum(i => Pin.Money(i, "pin_total"));
            sys.Update(new Entity("pin_project", projectId) { ["pin_billedamount"] = Pin.M(billed) });
        }
    }
}
