import { requireAuth } from "../services/auth-service.js";
import { renderSidebar, initThemeToggle } from "../components/sidebar.js";
import { getDashboardStats } from "../services/dashboard-service.js";
import { formatDate } from "../utils/validators.js";

requireAuth({
  moduleKey: "dashboard",
  onReady: async ({ user, profile }) => {
    renderSidebar({ role: profile.role, activeKey: "dashboard", profile });
    initThemeToggle();

    document.getElementById("welcome-msg").textContent =
      `Welcome back, ${profile.displayName || user.email} · ${new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}`;

    const stats = await getDashboardStats();
    renderStatGrid(stats);
    renderRecentClients(stats.clients.recent);
  }
});

function statCard(label, value, hint) {
  const pending = value === null;
  return `
    <div class="card">
      <div class="stat-card__label">${label}</div>
      <div class="stat-card__value">${pending ? "—" : value}</div>
      <div class="stat-card__hint">${pending ? "Available once that module ships" : hint || ""}</div>
    </div>`;
}

function renderStatGrid(stats) {
  const grid = document.getElementById("stat-grid");
  grid.innerHTML = [
    statCard("Total Clients", stats.clients.total, "Active client records"),
    statCard("Current Bank Balance", stats.bankBalance),
    statCard("Money Owing", stats.moneyOwing),
    statCard("Outstanding Quotes", stats.outstandingQuotes),
    statCard("Outstanding Invoices", stats.outstandingInvoices),
    statCard("Active Projects", stats.activeProjects),
    statCard("Completed Projects", stats.completedProjects),
    statCard("Payroll Due", stats.payrollDue),
    statCard("Monthly Profit", stats.monthlyProfit)
  ].join("");
}

function renderRecentClients(clients) {
  const box = document.getElementById("recent-clients");
  if (!clients.length) {
    box.innerHTML = `<div class="empty-state"><h3>No clients yet</h3><p>Add your first client to see it here.</p></div>`;
    return;
  }
  box.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Client #</th><th>Name</th><th>Company</th><th>Phone</th><th>Added</th></tr></thead>
        <tbody>
          ${clients.map(c => `
            <tr>
              <td class="mono">${c.clientNumber}</td>
              <td>${escapeHtml(c.name)}</td>
              <td>${escapeHtml(c.company || "—")}</td>
              <td>${escapeHtml(c.phone || "—")}</td>
              <td>${formatDate(c.createdAt)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
