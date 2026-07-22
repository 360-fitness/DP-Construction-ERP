// =============================================================
// DASHBOARD SERVICE
// Pulls real numbers from Clients, Quotes, Projects, and Invoices.
// Bank Balance, Money Owing, Payroll Due, Monthly Expenses/Profit
// stay null until Phase 3 (Banking/Expenses) and Phase 4 (Payroll)
// exist — the dashboard page shows those as "—" automatically.
// =============================================================

import { listClients } from "./client-service.js";
import { listQuotes } from "./quote-service.js";
import { listProjects } from "./project-service.js";
import { listInvoices } from "./invoice-service.js";

export async function getDashboardStats() {
  const [clients, quotes, projects, invoices] = await Promise.all([
    listClients(), listQuotes(), listProjects(), listInvoices()
  ]);

  const outstandingQuotes = quotes.filter(q => q.status === "Sent").length;
  const outstandingInvoicesTotal = invoices.reduce((sum, inv) => sum + Math.max(inv.grandTotal - (inv.amountPaid || 0), 0), 0);
  const activeProjects = projects.filter(p => ["Planning", "In Progress"].includes(p.status)).length;
  const completedProjects = projects.filter(p => p.status === "Completed").length;

  const now = new Date();
  const thisMonth = invoices.filter(inv => {
    const d = inv.createdAt?.toDate ? inv.createdAt.toDate() : (inv.createdAt ? new Date(inv.createdAt) : null);
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthlyIncome = thisMonth.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0);

  return {
    clients: {
      total: clients.length,
      recent: clients.slice(0, 5)
    },
    bankBalance: null,        // Phase 3 — Banking
    moneyOwing: null,         // Phase 3 — Banking (what the company owes suppliers)
    outstandingQuotes,
    outstandingInvoices: formatRand(outstandingInvoicesTotal),
    activeProjects,
    completedProjects,
    payrollDue: null,         // Phase 4 — Payroll
    monthlyIncome: formatRand(monthlyIncome),
    monthlyExpenses: null,    // Phase 3 — Banking/Expenses
    monthlyProfit: null       // Phase 3 — needs expenses to be meaningful
  };
}

function formatRand(n) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n || 0);
}
