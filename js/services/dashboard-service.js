// =============================================================
// DASHBOARD SERVICE
// Phase 1 only has Clients + Settings built, so this pulls real
// numbers where it can and marks the rest as pending until the
// Quotes/Invoices/Projects/Payroll/Banking modules exist.
// =============================================================

import { listClients } from "./client-service.js";

export async function getDashboardStats() {
  const clients = await listClients();

  return {
    clients: {
      total: clients.length,
      recent: clients.slice(0, 5)
    },
    // Populated once their respective modules ship:
    bankBalance: null,        // Phase 3 — Banking
    moneyOwing: null,         // Phase 3 — Banking
    outstandingQuotes: null,  // Phase 2 — Quotes
    outstandingInvoices: null,// Phase 2 — Invoices
    activeProjects: null,     // Phase 2 — Projects
    completedProjects: null,  // Phase 2 — Projects
    payrollDue: null,         // Phase 4 — Payroll
    monthlyIncome: null,      // Phase 3 — Banking
    monthlyExpenses: null,    // Phase 3 — Banking
    monthlyProfit: null       // Phase 3 — Banking
  };
}
