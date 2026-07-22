import { requireAuth } from "../services/auth-service.js";
import { renderSidebar, initThemeToggle } from "../components/sidebar.js";
import { listClients } from "../services/client-service.js";
import { listProjects } from "../services/project-service.js";
import { listInvoices, createInvoice, updateInvoice, getInvoice } from "../services/invoice-service.js";
import { recordPayment, listPaymentsForInvoice } from "../services/payment-service.js";
import { getCompanySettings } from "../services/settings-service.js";
import { mountLineItemEditor } from "../components/line-item-editor.js";
import { formatCurrency, formatDate, debounce } from "../utils/validators.js";
import { showToast } from "../utils/toast.js";
import { generateDocumentPDF, openEmailDraft } from "../utils/pdf-utils.js";

let currentUser = null;
let allInvoices = [];
let allClients = [];
let allProjects = [];
let companySettings = null;
let editor = null;

const invoiceOverlay = document.getElementById("invoice-modal-overlay");
const invoiceForm = document.getElementById("invoice-form");
const paymentOverlay = document.getElementById("payment-modal-overlay");
const paymentForm = document.getElementById("payment-form");

requireAuth({
  moduleKey: "invoices",
  onReady: async ({ user, profile }) => {
    currentUser = user;
    renderSidebar({ role: profile.role, activeKey: "invoices", profile });
    initThemeToggle();
    companySettings = await getCompanySettings();
    [allClients, allProjects] = await Promise.all([listClients(), listProjects()]);
    populateSelects();
    await refreshInvoices();
  }
});

function populateSelects() {
  const clientSelect = document.getElementById("i-client");
  clientSelect.innerHTML = `<option value="">Select a client…</option>` +
    allClients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ` — ${escapeHtml(c.company)}` : ""}</option>`).join("");

  const projectSelect = document.getElementById("i-project");
  projectSelect.innerHTML = `<option value="">No linked project</option>` +
    allProjects.map(p => `<option value="${p.id}">${p.projectNumber} — ${escapeHtml(p.name)}</option>`).join("");
}

async function refreshInvoices() {
  const container = document.getElementById("invoices-container");
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading invoices…</div>`;
  allInvoices = await listInvoices();
  document.getElementById("invoice-count-msg").textContent = `${allInvoices.length} invoice${allInvoices.length === 1 ? "" : "s"}`;
  applyFilters();
}

function applyFilters() {
  const term = document.getElementById("invoice-search").value.trim().toLowerCase();
  const status = document.getElementById("status-filter").value;
  let filtered = allInvoices;
  if (status) filtered = filtered.filter(inv => inv.paymentStatus === status);
  if (term) filtered = filtered.filter(inv =>
    [inv.invoiceNumber, inv.clientSnapshot?.name, inv.clientSnapshot?.company].some(v => (v || "").toLowerCase().includes(term)));
  renderTable(filtered);
}

function statusBadgeClass(status) {
  return { Outstanding: "badge--warning", "Partially Paid": "badge--warning", Paid: "badge--success", Overdue: "badge--danger" }[status] || "badge--neutral";
}

function renderTable(invoices) {
  const container = document.getElementById("invoices-container");
  if (!invoices.length) {
    container.innerHTML = `<div class="empty-state"><h3>No invoices yet</h3><p>Create one directly, or convert an accepted quote from the Quotes page.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Invoice #</th><th>Client</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Due</th><th></th></tr></thead>
        <tbody>${invoices.map(rowHtml).join("")}</tbody>
      </table>
    </div>`;

  container.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => openEditModal(btn.dataset.edit)));
  container.querySelectorAll("[data-pdf]").forEach(btn => btn.addEventListener("click", () => handlePdf(btn.dataset.pdf)));
  container.querySelectorAll("[data-email]").forEach(btn => btn.addEventListener("click", () => handleEmail(btn.dataset.email)));
  container.querySelectorAll("[data-pay]").forEach(btn => btn.addEventListener("click", () => openPaymentModal(btn.dataset.pay)));
}

function rowHtml(inv) {
  const balance = inv.grandTotal - (inv.amountPaid || 0);
  return `
    <tr>
      <td class="mono">${inv.invoiceNumber}</td>
      <td>${escapeHtml(inv.clientSnapshot?.name || "—")}</td>
      <td class="mono">${formatCurrency(inv.grandTotal)}</td>
      <td class="mono">${formatCurrency(inv.amountPaid)}</td>
      <td class="mono">${formatCurrency(balance)}</td>
      <td><span class="badge ${statusBadgeClass(inv.paymentStatus)}">${inv.paymentStatus}</span></td>
      <td>${inv.dueDate || "—"}</td>
      <td>
        <div class="flex gap-8" style="flex-wrap:wrap;">
          <button class="btn btn--ghost btn--sm" data-edit="${inv.id}">Edit</button>
          <button class="btn btn--ghost btn--sm" data-pdf="${inv.id}">PDF</button>
          <button class="btn btn--ghost btn--sm" data-email="${inv.id}">Email</button>
          ${inv.paymentStatus !== "Paid" ? `<button class="btn btn--secondary btn--sm" data-pay="${inv.id}">Record Payment</button>` : ""}
        </div>
      </td>
    </tr>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Search / filter ----------
document.getElementById("invoice-search").addEventListener("input", debounce(applyFilters, 250));
document.getElementById("status-filter").addEventListener("change", applyFilters);

// ---------- Add/Edit modal ----------
document.getElementById("add-invoice-btn").addEventListener("click", () => openAddModal());
document.getElementById("invoice-modal-close-btn").addEventListener("click", closeInvoiceModal);
document.getElementById("invoice-modal-cancel-btn").addEventListener("click", closeInvoiceModal);
invoiceOverlay.addEventListener("click", (e) => { if (e.target === invoiceOverlay) closeInvoiceModal(); });

function openAddModal() {
  invoiceForm.reset();
  document.getElementById("i-id").value = "";
  document.getElementById("invoice-modal-title").textContent = "New Invoice";
  document.getElementById("i-terms").value = companySettings?.termsAndConditions || "";
  editor = mountLineItemEditor(document.getElementById("i-line-items"), { vatRate: companySettings?.vatRate ?? 15 });
  invoiceOverlay.classList.add("modal-overlay--visible");
}

async function openEditModal(id) {
  const inv = await getInvoice(id);
  if (!inv) return showToast("Could not load that invoice.", "error");

  document.getElementById("i-id").value = inv.id;
  document.getElementById("i-client").value = inv.clientId || "";
  document.getElementById("i-project").value = inv.projectId || "";
  document.getElementById("i-due").value = inv.dueDate || "";
  document.getElementById("i-terms").value = inv.terms || "";
  document.getElementById("invoice-modal-title").textContent = `Edit Invoice — ${inv.invoiceNumber}`;

  editor = mountLineItemEditor(document.getElementById("i-line-items"), {
    items: inv.items, discountType: inv.discountType, discountValue: inv.discountValue, vatRate: inv.vatRate
  });
  invoiceOverlay.classList.add("modal-overlay--visible");
}

function closeInvoiceModal() {
  invoiceOverlay.classList.remove("modal-overlay--visible");
}

invoiceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const clientId = document.getElementById("i-client").value;
  if (!clientId) return showToast("Please select a client.", "error");

  const client = allClients.find(c => c.id === clientId);
  const lineState = editor.getState();

  const data = {
    clientId,
    clientSnapshot: client ? { name: client.name, company: client.company, email: client.email, phone: client.phone, address: client.address, vatNumber: client.vatNumber } : null,
    projectId: document.getElementById("i-project").value || null,
    items: lineState.items,
    discountType: lineState.discountType,
    discountValue: lineState.discountValue,
    vatRate: lineState.vatRate,
    dueDate: document.getElementById("i-due").value || null,
    terms: document.getElementById("i-terms").value.trim()
  };

  const saveBtn = document.getElementById("invoice-save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    const id = document.getElementById("i-id").value;
    if (id) {
      await updateInvoice(currentUser, id, data);
      showToast("Invoice updated.", "success");
    } else {
      await createInvoice(currentUser, data);
      showToast("Invoice created.", "success");
    }
    closeInvoiceModal();
    await refreshInvoices();
  } catch (err) {
    console.error(err);
    showToast("Something went wrong saving this invoice.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Invoice";
  }
});

// ---------- Payments ----------
document.getElementById("payment-modal-close-btn").addEventListener("click", closePaymentModal);
document.getElementById("payment-modal-cancel-btn").addEventListener("click", closePaymentModal);
paymentOverlay.addEventListener("click", (e) => { if (e.target === paymentOverlay) closePaymentModal(); });

async function openPaymentModal(invoiceId) {
  const inv = allInvoices.find(x => x.id === invoiceId) || await getInvoice(invoiceId);
  const balance = inv.grandTotal - (inv.amountPaid || 0);

  document.getElementById("payment-invoice-summary").innerHTML = `
    <div class="flex-between"><span class="text-muted">Invoice</span><span class="mono">${inv.invoiceNumber}</span></div>
    <div class="flex-between"><span class="text-muted">Client</span><span>${escapeHtml(inv.clientSnapshot?.name || "—")}</span></div>
    <div class="flex-between"><span class="text-muted">Total</span><span class="mono">${formatCurrency(inv.grandTotal)}</span></div>
    <div class="flex-between"><span class="text-muted">Already Paid</span><span class="mono">${formatCurrency(inv.amountPaid)}</span></div>
    <div class="flex-between" style="font-weight:700;"><span>Balance Due</span><span class="mono">${formatCurrency(balance)}</span></div>
  `;

  paymentForm.reset();
  document.getElementById("pay-invoice-id").value = invoiceId;
  document.getElementById("pay-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("pay-amount").value = balance > 0 ? balance.toFixed(2) : "";

  await renderPaymentHistory(invoiceId);
  paymentOverlay.classList.add("modal-overlay--visible");
}

async function renderPaymentHistory(invoiceId) {
  const historyBox = document.getElementById("payment-history");
  historyBox.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading…</div>`;
  const payments = await listPaymentsForInvoice(invoiceId);
  if (!payments.length) {
    historyBox.innerHTML = `<p class="text-muted" style="font-size:13px;">No payments recorded yet.</p>`;
    return;
  }
  historyBox.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead>
        <tbody>
          ${payments.map(p => `<tr><td>${p.date}</td><td class="mono">${formatCurrency(p.amount)}</td><td>${p.method}</td><td>${escapeHtml(p.reference || "—")}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function closePaymentModal() {
  paymentOverlay.classList.remove("modal-overlay--visible");
}

paymentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const invoiceId = document.getElementById("pay-invoice-id").value;
  const amount = parseFloat(document.getElementById("pay-amount").value);
  if (!amount || amount <= 0) return showToast("Enter a valid payment amount.", "error");

  const saveBtn = document.getElementById("payment-save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Recording…";

  try {
    await recordPayment(currentUser, {
      invoiceId,
      date: document.getElementById("pay-date").value,
      amount,
      method: document.getElementById("pay-method").value,
      reference: document.getElementById("pay-reference").value.trim()
    });
    showToast("Payment recorded.", "success");
    closePaymentModal();
    await refreshInvoices();
  } catch (err) {
    console.error(err);
    showToast("Something went wrong recording this payment.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Record Payment";
  }
});

// ---------- PDF / Email ----------
async function handlePdf(id) {
  const inv = allInvoices.find(x => x.id === id) || await getInvoice(id);
  await generateDocumentPDF({
    docType: "INVOICE",
    number: inv.invoiceNumber,
    date: formatDate(inv.createdAt),
    expiryOrDueDate: inv.dueDate,
    client: inv.clientSnapshot || {},
    items: inv.items,
    totals: { subtotal: inv.subtotal, discountAmount: inv.discountAmount, vatAmount: inv.vatAmount, grandTotal: inv.grandTotal },
    vatRate: inv.vatRate,
    terms: inv.terms,
    company: companySettings
  });
}

async function handleEmail(id) {
  const inv = allInvoices.find(x => x.id === id) || await getInvoice(id);
  const balance = inv.grandTotal - (inv.amountPaid || 0);
  openEmailDraft({
    to: inv.clientSnapshot?.email,
    subject: `Invoice ${inv.invoiceNumber} from ${companySettings?.tradingName || companySettings?.name || "DP Construction"}`,
    body: `Hi ${inv.clientSnapshot?.name || ""},\n\nPlease find attached invoice ${inv.invoiceNumber}, total ${formatCurrency(inv.grandTotal)}, balance due ${formatCurrency(balance)}${inv.dueDate ? ` by ${inv.dueDate}` : ""}.\n\nRemember to attach the PDF you just downloaded before sending.\n\nKind regards,\n${companySettings?.tradingName || "DP Construction"}`
  });
  showToast("Download the PDF (if you haven't already) and attach it before sending.", "info", 6000);
}
