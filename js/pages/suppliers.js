import { requireAuth } from "../services/auth-service.js";
import { renderSidebar, initThemeToggle } from "../components/sidebar.js";
import {
  listSuppliers, createSupplier, updateSupplier, archiveSupplier, restoreSupplier, getSupplier
} from "../services/supplier-service.js";
import { listProjects } from "../services/project-service.js";
import { createPurchase, listPurchases, updatePurchaseStatus, PURCHASE_STATUSES } from "../services/purchase-service.js";
import { EXPENSE_CATEGORIES } from "../services/expense-service.js";
import { compressImageToBase64 } from "../utils/image-compress.js";
import { formatCurrency, formatDate, debounce } from "../utils/validators.js";
import { showToast, confirmDialog } from "../utils/toast.js";

let currentUser = null;
let allSuppliers = [];
let allPurchases = [];
let allProjects = [];
let activeTab = "suppliers";
let pendingReceiptFile = null;

const supplierOverlay = document.getElementById("supplier-modal-overlay");
const supplierForm = document.getElementById("supplier-form");
const purchaseOverlay = document.getElementById("purchase-modal-overlay");
const purchaseForm = document.getElementById("purchase-form");

requireAuth({
  moduleKey: "suppliers",
  onReady: async ({ user, profile }) => {
    currentUser = user;
    renderSidebar({ role: profile.role, activeKey: "suppliers", profile });
    initThemeToggle();
    allProjects = await listProjects();
    populatePurchaseSelects();
    await refreshSuppliers();
    await refreshPurchases();
  }
});

function populatePurchaseSelects() {
  const projectSelect = document.getElementById("po-project");
  projectSelect.innerHTML = `<option value="">No linked project</option>` +
    allProjects.map(p => `<option value="${p.id}">${p.projectNumber} — ${escapeHtml(p.name)}</option>`).join("");

  const categorySelect = document.getElementById("po-category");
  categorySelect.innerHTML = EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("");
}

// ---------- Tabs ----------
document.getElementById("tab-suppliers-btn").addEventListener("click", () => switchTab("suppliers"));
document.getElementById("tab-purchases-btn").addEventListener("click", () => switchTab("purchases"));

function switchTab(tab) {
  activeTab = tab;
  document.getElementById("suppliers-tab").style.display = tab === "suppliers" ? "block" : "none";
  document.getElementById("purchases-tab").style.display = tab === "purchases" ? "block" : "none";
  document.getElementById("tab-suppliers-btn").className = `btn btn--${tab === "suppliers" ? "secondary" : "ghost"}`;
  document.getElementById("tab-purchases-btn").className = `btn btn--${tab === "purchases" ? "secondary" : "ghost"}`;
}

// ============================================================
// SUPPLIERS
// ============================================================
async function refreshSuppliers() {
  const container = document.getElementById("suppliers-container");
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading suppliers…</div>`;
  const showArchived = document.getElementById("show-archived").checked;
  allSuppliers = await listSuppliers({ includeArchived: showArchived });
  document.getElementById("supplier-count-msg").textContent = `${allSuppliers.filter(s => !s.archived).length} active supplier${allSuppliers.length === 1 ? "" : "s"}`;
  populateSupplierSelect();
  applySupplierFilter();
}

function populateSupplierSelect() {
  const select = document.getElementById("po-supplier");
  select.innerHTML = `<option value="">Select a supplier…</option>` +
    allSuppliers.filter(s => !s.archived).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
}

function applySupplierFilter() {
  const term = document.getElementById("supplier-search").value.trim().toLowerCase();
  if (activeTab !== "suppliers") return;
  const filtered = term
    ? allSuppliers.filter(s => [s.name, s.supplierNumber, s.contactPerson, s.email].some(v => (v || "").toLowerCase().includes(term)))
    : allSuppliers;
  renderSupplierTable(filtered);
}

function renderSupplierTable(suppliers) {
  const container = document.getElementById("suppliers-container");
  if (!suppliers.length) {
    container.innerHTML = `<div class="empty-state"><h3>No suppliers yet</h3><p>Add your first supplier to start recording purchases.</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Supplier #</th><th>Name</th><th>Contact</th><th>Phone</th><th>Outstanding Balance</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${suppliers.map(s => `
            <tr>
              <td class="mono">${s.supplierNumber}</td>
              <td>${escapeHtml(s.name)}</td>
              <td>${escapeHtml(s.contactPerson || "—")}</td>
              <td>${escapeHtml(s.phone || "—")}</td>
              <td class="mono">${formatCurrency(s.outstandingBalance)}</td>
              <td>${s.archived ? '<span class="badge badge--neutral">Archived</span>' : '<span class="badge badge--success">Active</span>'}</td>
              <td>
                <div class="flex gap-8">
                  <button class="btn btn--ghost btn--sm" data-edit="${s.id}">Edit</button>
                  ${s.archived ? `<button class="btn btn--ghost btn--sm" data-restore="${s.id}">Restore</button>` : `<button class="btn btn--ghost btn--sm" data-archive="${s.id}">Archive</button>`}
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  container.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => openEditSupplier(btn.dataset.edit)));
  container.querySelectorAll("[data-archive]").forEach(btn => btn.addEventListener("click", () => handleArchiveSupplier(btn.dataset.archive)));
  container.querySelectorAll("[data-restore]").forEach(btn => btn.addEventListener("click", () => handleRestoreSupplier(btn.dataset.restore)));
}

document.getElementById("supplier-search").addEventListener("input", debounce(applySupplierFilter, 250));
document.getElementById("show-archived").addEventListener("change", refreshSuppliers);

document.getElementById("add-supplier-btn").addEventListener("click", () => {
  supplierForm.reset();
  document.getElementById("s-id").value = "";
  document.getElementById("supplier-modal-title").textContent = "New Supplier";
  supplierOverlay.classList.add("modal-overlay--visible");
});
document.getElementById("supplier-modal-close-btn").addEventListener("click", () => supplierOverlay.classList.remove("modal-overlay--visible"));
document.getElementById("supplier-modal-cancel-btn").addEventListener("click", () => supplierOverlay.classList.remove("modal-overlay--visible"));
supplierOverlay.addEventListener("click", (e) => { if (e.target === supplierOverlay) supplierOverlay.classList.remove("modal-overlay--visible"); });

async function openEditSupplier(id) {
  const s = await getSupplier(id);
  if (!s) return showToast("Could not load that supplier.", "error");
  document.getElementById("s-id").value = s.id;
  document.getElementById("s-name").value = s.name || "";
  document.getElementById("s-contact").value = s.contactPerson || "";
  document.getElementById("s-phone").value = s.phone || "";
  document.getElementById("s-email").value = s.email || "";
  document.getElementById("s-terms").value = s.creditTerms || "";
  document.getElementById("s-vat").value = s.vatNumber || "";
  document.getElementById("supplier-modal-title").textContent = `Edit Supplier — ${s.supplierNumber}`;
  supplierOverlay.classList.add("modal-overlay--visible");
}

supplierForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    name: document.getElementById("s-name").value.trim(),
    contactPerson: document.getElementById("s-contact").value.trim(),
    phone: document.getElementById("s-phone").value.trim(),
    email: document.getElementById("s-email").value.trim(),
    creditTerms: document.getElementById("s-terms").value.trim(),
    vatNumber: document.getElementById("s-vat").value.trim()
  };
  const saveBtn = document.getElementById("supplier-save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";
  try {
    const id = document.getElementById("s-id").value;
    if (id) { await updateSupplier(currentUser, id, data); showToast("Supplier updated.", "success"); }
    else { await createSupplier(currentUser, data); showToast("Supplier added.", "success"); }
    supplierOverlay.classList.remove("modal-overlay--visible");
    await refreshSuppliers();
  } catch (err) {
    console.error(err);
    showToast("Something went wrong saving this supplier.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Supplier";
  }
});

async function handleArchiveSupplier(id) {
  const ok = await confirmDialog("Archive this supplier?", { confirmLabel: "Archive" });
  if (!ok) return;
  await archiveSupplier(currentUser, id);
  showToast("Supplier archived.", "success");
  await refreshSuppliers();
}
async function handleRestoreSupplier(id) {
  await restoreSupplier(currentUser, id);
  showToast("Supplier restored.", "success");
  await refreshSuppliers();
}

// ============================================================
// PURCHASE ORDERS
// ============================================================
async function refreshPurchases() {
  const container = document.getElementById("purchases-container");
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading purchase orders…</div>`;
  allPurchases = await listPurchases();
  applyPurchaseFilter();
}

function applyPurchaseFilter() {
  const term = document.getElementById("supplier-search").value.trim().toLowerCase();
  if (activeTab !== "purchases") return;
  const filtered = term
    ? allPurchases.filter(p => [p.poNumber, p.supplierSnapshot?.name, p.description].some(v => (v || "").toLowerCase().includes(term)))
    : allPurchases;
  renderPurchaseTable(filtered);
}

function statusBadgeClass(status) {
  return { Ordered: "badge--neutral", Received: "badge--warning", Paid: "badge--success" }[status] || "badge--neutral";
}

function renderPurchaseTable(purchases) {
  const container = document.getElementById("purchases-container");
  if (!purchases.length) {
    container.innerHTML = `<div class="empty-state"><h3>No purchase orders yet</h3><p>Create one to record what you've bought from a supplier — an Expense record is created automatically.</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>PO #</th><th>Supplier</th><th>Category</th><th>Amount (incl. VAT)</th><th>Status</th><th>Date</th><th></th></tr></thead>
        <tbody>
          ${purchases.map(p => `
            <tr>
              <td class="mono">${p.poNumber}</td>
              <td>${escapeHtml(p.supplierSnapshot?.name || "—")}</td>
              <td>${p.category}</td>
              <td class="mono">${formatCurrency(p.amount + p.vatAmount)}</td>
              <td><span class="badge ${statusBadgeClass(p.status)}">${p.status}</span></td>
              <td>${p.date}</td>
              <td>${p.status !== "Paid" ? `<button class="btn btn--secondary btn--sm" data-mark-paid="${p.id}">Mark Paid</button>` : ""}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  container.querySelectorAll("[data-mark-paid]").forEach(btn => btn.addEventListener("click", () => handleMarkPaid(btn.dataset.markPaid)));
}

async function handleMarkPaid(id) {
  const ok = await confirmDialog("Mark this purchase order as paid? This will reduce the supplier's outstanding balance.", { confirmLabel: "Mark Paid" });
  if (!ok) return;
  await updatePurchaseStatus(currentUser, id, "Paid");
  showToast("Purchase order marked as paid.", "success");
  await refreshPurchases();
  await refreshSuppliers();
}

document.getElementById("add-purchase-btn").addEventListener("click", () => {
  purchaseForm.reset();
  pendingReceiptFile = null;
  document.getElementById("po-date").value = new Date().toISOString().slice(0, 10);
  purchaseOverlay.classList.add("modal-overlay--visible");
});
document.getElementById("purchase-modal-close-btn").addEventListener("click", () => purchaseOverlay.classList.remove("modal-overlay--visible"));
document.getElementById("purchase-modal-cancel-btn").addEventListener("click", () => purchaseOverlay.classList.remove("modal-overlay--visible"));
purchaseOverlay.addEventListener("click", (e) => { if (e.target === purchaseOverlay) purchaseOverlay.classList.remove("modal-overlay--visible"); });

document.getElementById("po-receipt").addEventListener("change", (e) => {
  pendingReceiptFile = e.target.files[0] || null;
});

purchaseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const supplierId = document.getElementById("po-supplier").value;
  if (!supplierId) return showToast("Please select a supplier.", "error");
  const supplier = allSuppliers.find(s => s.id === supplierId);

  const saveBtn = document.getElementById("purchase-save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    let receiptBase64 = null;
    if (pendingReceiptFile) {
      receiptBase64 = await compressImageToBase64(pendingReceiptFile);
      if (!receiptBase64) showToast("Receipt image was too large to store even after compression — purchase order saved without it.", "warning", 6000);
    }

    await createPurchase(currentUser, {
      supplierId,
      supplierSnapshot: supplier ? { name: supplier.name } : null,
      projectId: document.getElementById("po-project").value || null,
      invoiceNumber: document.getElementById("po-invoice-number").value.trim(),
      date: document.getElementById("po-date").value,
      category: document.getElementById("po-category").value,
      description: document.getElementById("po-description").value.trim(),
      amount: parseFloat(document.getElementById("po-amount").value) || 0,
      vatAmount: parseFloat(document.getElementById("po-vat").value) || 0,
      status: document.getElementById("po-status").value,
      receiptBase64
    });

    showToast("Purchase order created — expense recorded automatically.", "success");
    purchaseOverlay.classList.remove("modal-overlay--visible");
    await refreshPurchases();
    await refreshSuppliers();
  } catch (err) {
    console.error(err);
    showToast("Something went wrong saving this purchase order.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Purchase Order";
  }
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
