// =============================================================
// DASHBOARD SERVICE
// Phase 1 only has Clients + Settings built, so this pulls real
// numbers where it can and marks the rest as pending until the
// Quotes/Invoices/Projects/Payroll/Banking modules exist.
// =============================================================

import { listClients } from "./client-service.js";
import { listQuotes } from "./quote-service.js";
import { listProjects } from "./project-service.js";
import { listInvoices } from "./invoice-service.js";
import { listTransactions, computeBalance } from "./banking-service.js";
import { listExpenses } from "./expense-service.js";
import { listSuppliers } from "./supplier-service.js";

export async function getDashboardStats() {
  const [clients, quotes, projects, invoices, transactions, expenses, suppliers] = await Promise.all([
    listClients(), listQuotes(), listProjects(), listInvoices(), listTransactions(), listExpenses(), listSuppliers()
  ]);

  const outstandingQuotes = quotes.filter(q => q.status === "Sent").length;
  const outstandingInvoicesTotal = invoices.reduce((sum, inv) => sum + Math.max(inv.grandTotal - (inv.amountPaid || 0), 0), 0);
  const activeProjects = projects.filter(p => ["Planning", "In Progress"].includes(p.status)).length;
  const completedProjects = projects.filter(p => p.status === "Completed").length;

  const bankBalance = computeBalance(transactions);
  const moneyOwing = suppliers.reduce((sum, s) => sum + (s.outstandingBalance || 0), 0);

  const now = new Date();
  const isThisMonth = (dateLike) => {
    const d = dateLike?.toDate ? dateLike.toDate() : (dateLike ? new Date(dateLike) : null);
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  const monthlyIncomeTotal = invoices.filter(inv => isThisMonth(inv.createdAt)).reduce((sum, inv) => sum + (inv.amountPaid || 0), 0);
  const monthlyExpensesTotal = expenses.filter(e => isThisMonth(e.date)).reduce((sum, e) => sum + e.amount + e.vatAmount, 0);
  const monthlyProfit = monthlyIncomeTotal - monthlyExpensesTotal;

  return {
    clients: {
      total: clients.length,
      recent: clients.slice(0, 5)
    },
    bankBalance: formatRand(bankBalance),
    moneyOwing: formatRand(moneyOwing),
    outstandingQuotes,
    outstandingInvoices: formatRand(outstandingInvoicesTotal),
    activeProjects,
    completedProjects,
    payrollDue: null,         // Phase 4 — Payroll
    monthlyIncome: formatRand(monthlyIncomeTotal),
    monthlyExpenses: formatRand(monthlyExpensesTotal),
    monthlyProfit: formatRand(monthlyProfit)
  };
}

function formatRand(n) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n || 0);
}
