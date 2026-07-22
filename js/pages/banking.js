import { requireAuth } from "../services/auth-service.js";
import { renderSidebar, initThemeToggle } from "../components/sidebar.js";
import {
  listTransactions, createTransaction, setReconciled, signedAmount, computeBalance
} from "../services/banking-service.js";
import { formatCurrency, debounce } from "../utils/validators.js";
import { showToast } from "../utils/toast.js";

let currentUser = null;
let allTransactions = [];

const overlay = document.getElementById("txn-modal-overlay");
const form = document.getElementById("txn-form");

requireAuth({
  moduleKey: "banking",
  onReady: async ({ user, profile }) => {
    currentUser = user;
    renderSidebar({ role: profile.role, activeKey: "banking", profile });
    initThemeToggle();
    await refreshTransactions();
  }
});

async function refreshTransactions() {
  const container = document.getElementById("txn-container");
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading transactions…</div>`;
  allTransactions = await listTransactions();
  renderStats(allTransactions);
  applyFilters();
}

function renderStats(transactions) {
  const balance = computeBalance(transactions);
  const unreconciled = transactions.filter(t => !t.reconciled).length;
  const now = new Date();
  const thisMonth = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthIncome = thisMonth.filter(t => t.type === "Income").reduce((s, t) => s + t.amount, 0);
  const monthOut = thisMonth.filter(t => t.type !== "Income").reduce((s, t) => s + t.amount, 0);

  document.getElementById("bank-stats").innerHTML = `
    <div class="card"><div class="stat-card__label">Current Bank Balance</div><div class="stat-card__value ${balance >= 0 ? "up" : "down"}">${formatCurrency(balance)}</div></div>
    <div class="card"><div class="stat-card__label">This Month — In</div><div class="stat-card__value up">${formatCurrency(monthIncome)}</div></div>
    <div class="card"><div class="stat-card__label">This Month — Out</div><div class="stat-card__value down">${formatCurrency(monthOut)}</div></div>
    <div class="card"><div class="stat-card__label">Unreconciled</div><div class="stat-card__value">${unreconciled}</div><div class="stat-card__hint">Transactions not yet ticked off against your bank statement</div></div>
  `;
}

function applyFilters() {
  const term = document.getElementById("txn-search").value.trim().toLowerCase();
  const type = document.getElementById("type-filter").value;
  let filtered = allTransactions;
  if (type) filtered = filtered.filter(t => t.type === type);
  if (term) filtered = filtered.filter(t => (t.description || "").toLowerCase().includes(term));
  renderTable(filtered);
}

function typeBadgeClass(type) {
  return { Income: "badge--success", Interest: "badge--success", Expense: "badge--danger", Transfer: "badge--warning", "Bank Charge": "badge--danger" }[type] || "badge--neutral";
}

function renderTable(transactions) {
  const container = document.getElementById("txn-container");
  if (!transactions.length) {
    container.innerHTML = `<div class="empty-state"><h3>No transactions yet</h3><p>Add income, expenses, transfers, interest, or bank charges as they clear on your statement.</p></div>`;
    return;
  }

  // Running balance shown oldest-to-newest for readability, even though
  // the table itself lists newest first (matches how a bank statement reads).
  const chronological = [...transactions].reverse();
  const balances = new Map();
  let running = 0;
  chronological.forEach(t => { running += signedAmount(t); balances.set(t.id, running); });

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th><th>Balance</th><th>Reconciled</th></tr></thead>
        <tbody>
          ${transactions.map(t => `
            <tr>
              <td>${t.date}</td>
              <td><span class="badge ${typeBadgeClass(t.type)}">${t.type}</span></td>
              <td>${escapeHtml(t.description)}</td>
              <td class="mono">${signedAmount(t) >= 0 ? "" : "-"}${formatCurrency(t.amount)}</td>
              <td class="mono">${formatCurrency(balances.get(t.id))}</td>
              <td>
                <label class="checkbox-row">
                  <input type="checkbox" data-reconcile="${t.id}" ${t.reconciled ? "checked" : ""} />
                </label>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  container.querySelectorAll("[data-reconcile]").forEach(cb => {
    cb.addEventListener("change", async () => {
      await setReconciled(currentUser, cb.dataset.reconcile, cb.checked);
      const txn = allTransactions.find(t => t.id === cb.dataset.reconcile);
      if (txn) txn.reconciled = cb.checked;
      renderStats(allTransactions);
      showToast(cb.checked ? "Marked as reconciled." : "Marked as unreconciled.", "success", 2000);
    });
  });
}

document.getElementById("txn-search").addEventListener("input", debounce(applyFilters, 250));
document.getElementById("type-filter").addEventListener("change", applyFilters);

document.getElementById("add-txn-btn").addEventListener("click", () => {
  form.reset();
  document.getElementById("t-date").value = new Date().toISOString().slice(0, 10);
  overlay.classList.add("modal-overlay--visible");
});
document.getElementById("txn-modal-close-btn").addEventListener("click", () => overlay.classList.remove("modal-overlay--visible"));
document.getElementById("txn-modal-cancel-btn").addEventListener("click", () => overlay.classList.remove("modal-overlay--visible"));
overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("modal-overlay--visible"); });

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const saveBtn = document.getElementById("txn-save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    await createTransaction(currentUser, {
      date: document.getElementById("t-date").value,
      type: document.getElementById("t-type").value,
      description: document.getElementById("t-description").value.trim(),
      amount: parseFloat(document.getElementById("t-amount").value) || 0
    });
    showToast("Transaction added.", "success");
    overlay.classList.remove("modal-overlay--visible");
    await refreshTransactions();
  } catch (err) {
    console.error(err);
    showToast("Something went wrong saving this transaction.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Add Transaction";
  }
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
