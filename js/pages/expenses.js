import { requireAuth } from "../services/auth-service.js";
import { renderSidebar, initThemeToggle } from "../components/sidebar.js";
import {
  listExpenses, createExpense, updateExpense, archiveExpense, getExpense,
  EXPENSE_CATEGORIES, PAYMENT_METHODS
} from "../services/expense-service.js";
import { listProjects } from "../services/project-service.js";
import { listSuppliers } from "../services/supplier-service.js";
import { compressImageToBase64 } from "../utils/image-compress.js";
import { formatCurrency, debounce } from "../utils/validators.js";
import { showToast, confirmDialog } from "../utils/toast.js";

let currentUser = null;
let allExpenses = [];
let allProjects = [];
let allSuppliers = [];
let pendingReceiptFile = null;
let existingReceiptBase64 = null;

const overlay = document.getElementById("expense-modal-overlay");
const form = document.getElementById("expense-form");

requireAuth({
  moduleKey: "expenses",
  onReady: async ({ user, profile }) => {
    currentUser = user;
    renderSidebar({ role: profile.role, activeKey: "expenses", profile });
    initThemeToggle();
    [allProjects, allSuppliers] = await Promise.all([listProjects(), listSuppliers()]);
    populateStaticSelects();
    await refreshExpenses();
  }
});

function populateStaticSelects() {
  const catFilter = document.getElementById("category-filter");
  catFilter.innerHTML = `<option value="">All Categories</option>` + EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("");

  document.getElementById("e-category").innerHTML = EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("");
  document.getElementById("e-payment-method").innerHTML = PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join("");

  document.getElementById("e-project").innerHTML = `<option value="">No linked project</option>` +
    allProjects.map(p => `<option value="${p.id}">${p.projectNumber} — ${escapeHtml(p.name)}</option>`).join("");

  document.getElementById("e-supplier").innerHTML = `<option value="">No linked supplier</option>` +
    allSuppliers.filter(s => !s.archived).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
}

async function refreshExpenses() {
  const container = document.getElementById("expenses-container");
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading expenses…</div>`;
  allExpenses = await listExpenses();
  document.getElementById("expense-count-msg").textContent = `${allExpenses.length} expense${allExpenses.length === 1 ? "" : "s"}`;
  renderStats(allExpenses);
  applyFilters();
}

function renderStats(expenses) {
  const total = expenses.reduce((sum, e) => sum + e.amount + e.vatAmount, 0);
  const now = new Date();
  const thisMonth = expenses.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthTotal = thisMonth.reduce((sum, e) => sum + e.amount + e.vatAmount, 0);
  const fromPurchases = expenses.filter(e => e.sourcePurchaseId).length;

  document.getElementById("expense-stats").innerHTML = `
    <div class="card"><div class="stat-card__label">Total Recorded</div><div class="stat-card__value">${formatCurrency(total)}</div></div>
    <div class="card"><div class="stat-card__label">This Month</div><div class="stat-card__value">${formatCurrency(monthTotal)}</div></div>
    <div class="card"><div class="stat-card__label">Auto-Created from Purchases</div><div class="stat-card__value">${fromPurchases}</div><div class="stat-card__hint">Linked to a supplier Purchase Order</div></div>
  `;
}

function applyFilters() {
  const term = document.getElementById("expense-search").value.trim().toLowerCase();
  const category = document.getElementById("category-filter").value;
  let filtered = allExpenses;
  if (category) filtered = filtered.filter(e => e.category === category);
  if (term) filtered = filtered.filter(e => [e.description, e.expenseNumber].some(v => (v || "").toLowerCase().includes(term)));
  renderTable(filtered);
}

function renderTable(expenses) {
  const container = document.getElementById("expenses-container");
  if (!expenses.length) {
    container.innerHTML = `<div class="empty-state"><h3>No expenses yet</h3><p>Record one directly, or create a Purchase Order from the Suppliers page to have it generated automatically.</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Expense #</th><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>VAT</th><th>Source</th><th></th></tr></thead>
        <tbody>
          ${expenses.map(e => `
            <tr>
              <td class="mono">${e.expenseNumber}</td>
              <td>${e.date}</td>
              <td>${e.category}</td>
              <td>${escapeHtml(e.description)}</td>
              <td class="mono">${formatCurrency(e.amount)}</td>
              <td class="mono">${formatCurrency(e.vatAmount)}</td>
              <td>${e.sourcePurchaseId ? '<span class="badge badge--neutral">Purchase Order</span>' : '<span class="badge badge--neutral">Manual</span>'}</td>
              <td>
                <div class="flex gap-8">
                  <button class="btn btn--ghost btn--sm" data-edit="${e.id}">Edit</button>
                  <button class="btn btn--ghost btn--sm" data-archive="${e.id}">Delete</button>
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  container.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => openEditModal(btn.dataset.edit)));
  container.querySelectorAll("[data-archive]").forEach(btn => btn.addEventListener("click", () => handleArchive(btn.dataset.archive)));
}

document.getElementById("expense-search").addEventListener("input", debounce(applyFilters, 250));
document.getElementById("category-filter").addEventListener("change", applyFilters);

document.getElementById("add-expense-btn").addEventListener("click", () => {
  form.reset();
  document.getElementById("e-id").value = "";
  document.getElementById("e-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("expense-modal-title").textContent = "New Expense";
  pendingReceiptFile = null;
  existingReceiptBase64 = null;
  document.getElementById("e-receipt-preview").style.display = "none";
  overlay.classList.add("modal-overlay--visible");
});
document.getElementById("expense-modal-close-btn").addEventListener("click", closeModal);
document.getElementById("expense-modal-cancel-btn").addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

function closeModal() {
  overlay.classList.remove("modal-overlay--visible");
}

async function openEditModal(id) {
  const exp = await getExpense(id);
  if (!exp) return showToast("Could not load that expense.", "error");

  document.getElementById("e-id").value = exp.id;
  document.getElementById("e-date").value = exp.date || "";
  document.getElementById("e-category").value = exp.category || "Other";
  document.getElementById("e-description").value = exp.description || "";
  document.getElementById("e-amount").value = exp.amount || 0;
  document.getElementById("e-vat").value = exp.vatAmount || 0;
  document.getElementById("e-payment-method").value = exp.paymentMethod || "EFT";
  document.getElementById("e-project").value = exp.projectId || "";
  document.getElementById("e-supplier").value = exp.supplierId || "";
  document.getElementById("expense-modal-title").textContent = `Edit Expense — ${exp.expenseNumber}`;

  pendingReceiptFile = null;
  existingReceiptBase64 = exp.receiptBase64 || null;
  const preview = document.getElementById("e-receipt-preview");
  if (existingReceiptBase64) {
    preview.src = existingReceiptBase64;
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }

  overlay.classList.add("modal-overlay--visible");
}

document.getElementById("e-receipt").addEventListener("change", (e) => {
  pendingReceiptFile = e.target.files[0] || null;
  if (pendingReceiptFile) {
    const preview = document.getElementById("e-receipt-preview");
    preview.src = URL.createObjectURL(pendingReceiptFile);
    preview.style.display = "block";
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const saveBtn = document.getElementById("expense-save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    let receiptBase64 = existingReceiptBase64;
    if (pendingReceiptFile) {
      const compressed = await compressImageToBase64(pendingReceiptFile);
      if (!compressed) {
        showToast("Receipt image was too large to store even after compression — saved without it.", "warning", 6000);
      } else {
        receiptBase64 = compressed;
      }
    }

    const data = {
      date: document.getElementById("e-date").value,
      category: document.getElementById("e-category").value,
      description: document.getElementById("e-description").value.trim(),
      amount: parseFloat(document.getElementById("e-amount").value) || 0,
      vatAmount: parseFloat(document.getElementById("e-vat").value) || 0,
      paymentMethod: document.getElementById("e-payment-method").value,
      projectId: document.getElementById("e-project").value || null,
      supplierId: document.getElementById("e-supplier").value || null,
      receiptBase64
    };

    const id = document.getElementById("e-id").value;
    if (id) { await updateExpense(currentUser, id, data); showToast("Expense updated.", "success"); }
    else { await createExpense(currentUser, data); showToast("Expense recorded.", "success"); }

    closeModal();
    await refreshExpenses();
  } catch (err) {
    console.error(err);
    showToast("Something went wrong saving this expense.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Expense";
  }
});

async function handleArchive(id) {
  const ok = await confirmDialog("Remove this expense? It will be archived, not permanently deleted.", { confirmLabel: "Remove" });
  if (!ok) return;
  await archiveExpense(currentUser, id);
  showToast("Expense removed.", "success");
  await refreshExpenses();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
