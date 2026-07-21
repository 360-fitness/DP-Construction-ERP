// =============================================================
// SIDEBAR COMPONENT
// Renders the left nav, showing only modules the user's role can
// access, and highlights the current page.
// =============================================================

import { canAccess, logout } from "../services/auth-service.js";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", href: "dashboard.html", icon: "▦" },
  { key: "clients", label: "Clients", href: "clients.html", icon: "◈" },
  { key: "quotes", label: "Quotes", href: "quotes.html", icon: "▤" },
  { key: "projects", label: "Projects", href: "projects.html", icon: "▣" },
  { key: "invoices", label: "Invoices", href: "invoices.html", icon: "▥" },
  { key: "suppliers", label: "Suppliers", href: "suppliers.html", icon: "▧" },
  { key: "expenses", label: "Expenses", href: "expenses.html", icon: "▨" },
  { key: "payroll", label: "Payroll", href: "payroll.html", icon: "◫" },
  { key: "employees", label: "Employees", href: "employees.html", icon: "◉" },
  { key: "timesheets", label: "Timesheets", href: "timesheets.html", icon: "◷" },
  { key: "reports", label: "Reports", href: "reports.html", icon: "▩" },
  { key: "settings", label: "Settings", href: "settings.html", icon: "⚙" }
];

export function renderSidebar({ role, activeKey, profile }) {
  const nav = document.getElementById("sidebar-nav");
  const footer = document.getElementById("sidebar-footer");
  if (!nav) return;

  nav.innerHTML = NAV_ITEMS
    .filter((item) => canAccess(role, item.key))
    .map((item) => `
      <a class="sidebar__link ${item.key === activeKey ? "is-active" : ""}" href="${item.href}">
        <span class="sidebar__icon">${item.icon}</span>${item.label}
      </a>`)
    .join("");

  if (footer) {
    footer.innerHTML = `
      <div class="flex-between">
        <div>
          <div style="color:#fff;font-weight:600;">${profile.displayName || "—"}</div>
          <div>${role}</div>
        </div>
        <button id="logout-btn" class="icon-btn" title="Sign out" style="background:transparent;border-color:rgba(255,255,255,0.15);color:#C9CDD1;">⏻</button>
      </div>`;
    document.getElementById("logout-btn").addEventListener("click", async () => {
      await logout();
      window.location.href = "login.html";
    });
  }
}

export function initThemeToggle() {
  const stored = localStorage.getItem("erp-theme");
  if (stored === "dark") document.documentElement.setAttribute("data-theme", "dark");

  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  updateToggleIcon(btn);
  btn.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("erp-theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("erp-theme", "dark");
    }
    updateToggleIcon(btn);
  });
}

function updateToggleIcon(btn) {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  btn.textContent = isDark ? "☀" : "☾";
}
