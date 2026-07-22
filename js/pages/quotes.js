import { requireAuth } from "../services/auth-service.js";
import { renderSidebar, initThemeToggle } from "../components/sidebar.js";
import { listClients } from "../services/client-service.js";
import {
  listQuotes, createQuote, updateQuote, getQuote, setQuoteStatus,
  linkQuoteToProject, linkQuoteToInvoice
} from "../services/quote-service.js";
import { createProject } from "../services/project-service.js";
import { createInvoice } from "../services/invoice-service.js";
import { getCompanySettings } from "../services/settings-service.js";
import { mountLineItemEditor } from "../components/line-item-editor.js";
import { formatCurrency, formatDate, debounce } from "../utils/validators.js";
import { showToast, confirmDialog } from "../utils/toast.js";
import { generateDocumentPDF, openEmailDraft } from "../utils/pdf-utils.js";

let currentUser = null;
let allQuotes = [];
let allClients = [];
let companySettings = null;
let editor = null;

const overlay = document.getElementById("quote-modal-overlay");
const form = document.getElementById("quote-form");

requireAuth({
  moduleKey: "quotes",
  onReady: async ({ user, profile }) => {
    currentUser = user;
    renderSidebar({ role: profile.role, activeKey: "quotes", profile });
    initThemeToggle();
    companySettings = await getCompanySettings();
    allClients = await listClients();
    populateClientSelect();
    await refreshQuotes();
  }
});

function populateClientSelect() {
  const select = document.getElementById("q-client");
  select.innerHTML = `<option value="">Select a client…</option>` +
    allClients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ` — ${escapeHtml(c.company)}` : ""}</option>`).join("");
}

async function refreshQuotes() {
  const container = document.getElementById("quotes-container");
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading quotes…</div>`;
  allQuotes = await listQuotes();
  document.getElementById("quote-count-msg").textContent = `${allQuotes.length} quote${allQuotes.length === 1 ? "" : "s"}`;
  applyFilters();
}

function applyFilters() {
  const term = document.getElementById("quote-search").value.trim().toLowerCase();
  const status = document.getElementById("status-filter").value;
  let filtered = allQuotes;
  if (status) filtered = filtered.filter(q => q.status === status);
  if (term) filtered = filtered.filter(q =>
    [q.quoteNumber, q.clientSnapshot?.name, q.clientSnapshot?.company, q.projectDescription].some(v => (v || "").toLowerCase().includes(term)));
  renderTable(filtered);
}

function statusBadgeClass(status) {
  return { Draft: "badge--neutral", Sent: "badge--warning", Accepted: "badge--success", Rejected: "badge--danger", Expired: "badge--danger" }[status] || "badge--neutral";
}

function renderTable(quotes) {
  const container = document.getElementById("quotes-container");
  if (!quotes.length) {
    container.innerHTML = `<div class="empty-state"><h3>No quotes yet</h3><p>Create your first quote to get started.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Quote #</th><th>Client</th><th>Project</th><th>Total</th><th>Status</th><th>Expiry</th><th></th></tr></thead>
        <tbody>
          ${quotes.map(rowHtml).join("")}
        </tbody>
      </table>
    </div>`;

  container.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => openEditModal(btn.dataset.edit)));
  container.querySelectorAll("[data-pdf]").forEach(btn => btn.addEventListener("click", () => handlePdf(btn.dataset.pdf)));
  container.querySelectorAll("[data-email]").forEach(btn => btn.addEventListener("click", () => handleEmail(btn.dataset.email)));
  container.querySelectorAll("[data-send]").forEach(btn => btn.addEventListener("click", () => handleStatusChange(btn.dataset.send, "Sent")));
  container.querySelectorAll("[data-accept]").forEach(btn => btn.addEventListener("click", () => handleStatusChange(btn.dataset.accept, "Accepted")));
  container.querySelectorAll("[data-reject]").forEach(btn => btn.addEventListener("click", () => handleStatusChange(btn.dataset.reject, "Rejected")));
  container.querySelectorAll("[data-to-project]").forEach(btn => btn.addEventListener("click", () => handleConvertToProject(btn.dataset.toProject)));
  container.querySelectorAll("[data-to-invoice]").forEach(btn => btn.addEventListener("click", () => handleConvertToInvoice(btn.dataset.toInvoice)));
}

function rowHtml(q) {
  const actions = [];
  actions.push(`<button class="btn btn--ghost btn--sm" data-edit="${q.id}">Edit</button>`);
  actions.push(`<button class="btn btn--ghost btn--sm" data-pdf="${q.id}">PDF</button>`);
  actions.push(`<button class="btn btn--ghost btn--sm" data-email="${q.id}">Email</button>`);
  if (q.status === "Draft") actions.push(`<button class="btn btn--secondary btn--sm" data-send="${q.id}">Mark Sent</button>`);
  if (q.status === "Sent") {
    actions.push(`<button class="btn btn--secondary btn--sm" data-accept="${q.id}">Accept</button>`);
    actions.push(`<button class="btn btn--ghost btn--sm" data-reject="${q.id}">Reject</button>`);
  }
  if (q.status === "Accepted" && !q.convertedToProjectId) actions.push(`<button class="btn btn--primary btn--sm" data-to-project="${q.id}">→ Project</button>`);
  if (q.status === "Accepted" && !q.convertedToInvoiceId) actions.push(`<button class="btn btn--primary btn--sm" data-to-invoice="${q.id}">→ Invoice</button>`);

  return `
    <tr>
      <td class="mono">${q.quoteNumber}</td>
      <td>${escapeHtml(q.clientSnapshot?.name || "—")}</td>
      <td>${escapeHtml(q.projectDescription || "—")}</td>
      <td class="mono">${formatCurrency(q.grandTotal)}</td>
      <td><span class="badge ${statusBadgeClass(q.status)}">${q.status}</span></td>
      <td>${q.expiryDate || "—"}</td>
      <td><div class="flex gap-8" style="flex-wrap:wrap;">${actions.join("")}</div></td>
    </tr>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Search / filter ----------
document.getElementById("quote-search").addEventListener("input", debounce(applyFilters, 250));
document.getElementById("status-filter").addEventListener("change", applyFilters);

// ---------- Modal ----------
document.getElementById("add-quote-btn").addEventListener("click", () => openAddModal());
document.getElementById("quote-modal-close-btn").addEventListener("click", closeModal);
document.getElementById("quote-modal-cancel-btn").addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

function openAddModal() {
  form.reset();
  document.getElementById("q-id").value = "";
  document.getElementById("quote-modal-title").textContent = "New Quote";
  document.getElementById("q-deposit-type").value = "percentage";
  document.getElementById("q-deposit-value").value = 0;
  document.getElementById("q-terms").value = companySettings?.termsAndConditions || "";
  editor = mountLineItemEditor(document.getElementById("q-line-items"), { vatRate: companySettings?.vatRate ?? 15 });
  overlay.classList.add("modal-overlay--visible");
}

async function openEditModal(id) {
  const quote = await getQuote(id);
  if (!quote) return showToast("Could not load that quote.", "error");

  document.getElementById("q-id").value = quote.id;
  document.getElementById("q-client").value = quote.clientId || "";
  document.getElementById("q-expiry").value = quote.expiryDate || "";
  document.getElementById("q-project-desc").value = quote.projectDescription || "";
  document.getElementById("q-site-address").value = quote.siteAddress || "";
  document.getElementById("q-deposit-type").value = quote.depositType || "percentage";
  document.getElementById("q-deposit-value").value = quote.depositValue || 0;
  document.getElementById("q-terms").value = quote.terms || "";
  document.getElementById("quote-modal-title").textContent = `Edit Quote — ${quote.quoteNumber}`;

  editor = mountLineItemEditor(document.getElementById("q-line-items"), {
    items: quote.items, discountType: quote.discountType, discountValue: quote.discountValue, vatRate: quote.vatRate
  });
  overlay.classList.add("modal-overlay--visible");
}

function closeModal() {
  overlay.classList.remove("modal-overlay--visible");
}

// ---------- Save ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const clientId = document.getElementById("q-client").value;
  if (!clientId) return showToast("Please select a client.", "error");

  const client = allClients.find(c => c.id === clientId);
  const lineState = editor.getState();

  const data = {
    clientId,
    clientSnapshot: client ? { name: client.name, company: client.company, email: client.email, phone: client.phone, address: client.address, vatNumber: client.vatNumber } : null,
    projectDescription: document.getElementById("q-project-desc").value.trim(),
    siteAddress: document.getElementById("q-site-address").value.trim(),
    items: lineState.items,
    discountType: lineState.discountType,
    discountValue: lineState.discountValue,
    vatRate: lineState.vatRate,
    depositType: document.getElementById("q-deposit-type").value,
    depositValue: parseFloat(document.getElementById("q-deposit-value").value) || 0,
    expiryDate: document.getElementById("q-expiry").value || null,
    terms: document.getElementById("q-terms").value.trim()
  };

  const saveBtn = document.getElementById("quote-save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    const id = document.getElementById("q-id").value;
    if (id) {
      await updateQuote(currentUser, id, data);
      showToast("Quote updated.", "success");
    } else {
      await createQuote(currentUser, data);
      showToast("Quote created.", "success");
    }
    closeModal();
    await refreshQuotes();
  } catch (err) {
    console.error(err);
    showToast("Something went wrong saving this quote.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Quote";
  }
});

// ---------- Status workflow ----------
async function handleStatusChange(id, status) {
  await setQuoteStatus(currentUser, id, status);
  showToast(`Quote marked as ${status}.`, "success");
  await refreshQuotes();
}

// ---------- PDF / Email ----------
function depositNoteFor(q) {
  if (!q.depositValue) return "";
  return q.depositType === "percentage" ? `${q.depositValue}% of grand total` : formatCurrency(q.depositValue);
}

async function handlePdf(id) {
  const q = allQuotes.find(x => x.id === id) || await getQuote(id);
  await generateDocumentPDF({
    docType: "QUOTE",
    number: q.quoteNumber,
    date: formatDate(q.createdAt),
    expiryOrDueDate: q.expiryDate,
    client: q.clientSnapshot || {},
    items: q.items,
    totals: { subtotal: q.subtotal, discountAmount: q.discountAmount, vatAmount: q.vatAmount, grandTotal: q.grandTotal },
    vatRate: q.vatRate,
    terms: q.terms,
    depositNote: depositNoteFor(q),
    company: companySettings
  });
}

async function handleEmail(id) {
  const q = allQuotes.find(x => x.id === id) || await getQuote(id);
  openEmailDraft({
    to: q.clientSnapshot?.email,
    subject: `Quote ${q.quoteNumber} from ${companySettings?.tradingName || companySettings?.name || "DP Construction"}`,
    body: `Hi ${q.clientSnapshot?.name || ""},\n\nPlease find attached our quote ${q.quoteNumber} for ${q.projectDescription || "your project"}, totalling ${formatCurrency(q.grandTotal)}.\n\nRemember to attach the PDF you just downloaded before sending.\n\nKind regards,\n${companySettings?.tradingName || "DP Construction"}`
  });
  showToast("Download the PDF (if you haven't already) and attach it before sending.", "info", 6000);
}

// ---------- Convert to Project / Invoice ----------
async function handleConvertToProject(id) {
  const ok = await confirmDialog("Create a new Project from this accepted quote?", { confirmLabel: "Create Project" });
  if (!ok) return;
  const q = await getQuote(id);
  const project = await createProject(currentUser, {
    clientId: q.clientId,
    clientSnapshot: q.clientSnapshot,
    quoteId: q.id,
    name: q.projectDescription || `Project for ${q.clientSnapshot?.name || "client"}`,
    siteAddress: q.siteAddress,
    status: "Planning"
  });
  await linkQuoteToProject(currentUser, q.id, project.id);
  showToast(`Project ${project.projectNumber} created.`, "success");
  await refreshQuotes();
}

async function handleConvertToInvoice(id) {
  const ok = await confirmDialog("Create a new Invoice from this accepted quote?", { confirmLabel: "Create Invoice" });
  if (!ok) return;
  const q = await getQuote(id);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (companySettings?.quoteValidityDays || 30));

  const invoice = await createInvoice(currentUser, {
    clientId: q.clientId,
    clientSnapshot: q.clientSnapshot,
    projectId: q.convertedToProjectId || null,
    quoteId: q.id,
    items: q.items,
    discountType: q.discountType,
    discountValue: q.discountValue,
    vatRate: q.vatRate,
    dueDate: dueDate.toISOString().slice(0, 10),
    terms: q.terms
  });
  await linkQuoteToInvoice(currentUser, q.id, invoice.id);
  showToast(`Invoice ${invoice.invoiceNumber} created.`, "success");
  await refreshQuotes();
}
