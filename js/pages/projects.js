import { requireAuth } from "../services/auth-service.js";
import { renderSidebar, initThemeToggle } from "../components/sidebar.js";
import { listClients } from "../services/client-service.js";
import { listProjects, createProject, updateProject, getProject } from "../services/project-service.js";
import { listInvoicesByProject } from "../services/invoice-service.js";
import { formatCurrency, formatDate, debounce } from "../utils/validators.js";
import { showToast } from "../utils/toast.js";

let currentUser = null;
let allProjects = [];
let allClients = [];

const modalOverlay = document.getElementById("project-modal-overlay");
const form = document.getElementById("project-form");
const detailOverlay = document.getElementById("project-detail-overlay");

requireAuth({
  moduleKey: "projects",
  onReady: async ({ user, profile }) => {
    currentUser = user;
    renderSidebar({ role: profile.role, activeKey: "projects", profile });
    initThemeToggle();
    allClients = await listClients();
    populateClientSelect();
    await refreshProjects();
  }
});

function populateClientSelect() {
  const select = document.getElementById("p-client");
  select.innerHTML = `<option value="">Select a client…</option>` +
    allClients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ` — ${escapeHtml(c.company)}` : ""}</option>`).join("");
}

async function refreshProjects() {
  const container = document.getElementById("projects-container");
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading projects…</div>`;
  allProjects = await listProjects();
  document.getElementById("project-count-msg").textContent = `${allProjects.length} project${allProjects.length === 1 ? "" : "s"}`;
  applyFilters();
}

function applyFilters() {
  const term = document.getElementById("project-search").value.trim().toLowerCase();
  const status = document.getElementById("status-filter").value;
  let filtered = allProjects;
  if (status) filtered = filtered.filter(p => p.status === status);
  if (term) filtered = filtered.filter(p =>
    [p.projectNumber, p.name, p.clientSnapshot?.name, p.clientSnapshot?.company].some(v => (v || "").toLowerCase().includes(term)));
  renderTable(filtered);
}

function statusBadgeClass(status) {
  return {
    Planning: "badge--neutral", "In Progress": "badge--warning", "On Hold": "badge--danger",
    Completed: "badge--success", Cancelled: "badge--danger"
  }[status] || "badge--neutral";
}

function renderTable(projects) {
  const container = document.getElementById("projects-container");
  if (!projects.length) {
    container.innerHTML = `<div class="empty-state"><h3>No projects yet</h3><p>Create a project directly, or convert an accepted quote from the Quotes page.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Project #</th><th>Name</th><th>Client</th><th>Status</th><th>Start</th><th>Completion</th><th></th></tr></thead>
        <tbody>
          ${projects.map(rowHtml).join("")}
        </tbody>
      </table>
    </div>`;

  container.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => openDetail(btn.dataset.view)));
  container.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => openEditModal(btn.dataset.edit)));
}

function rowHtml(p) {
  return `
    <tr>
      <td class="mono">${p.projectNumber}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.clientSnapshot?.name || "—")}</td>
      <td><span class="badge ${statusBadgeClass(p.status)}">${p.status}</span></td>
      <td>${p.startDate || "—"}</td>
      <td>${p.completionDate || "—"}</td>
      <td>
        <div class="flex gap-8">
          <button class="btn btn--ghost btn--sm" data-view="${p.id}">View</button>
          <button class="btn btn--ghost btn--sm" data-edit="${p.id}">Edit</button>
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
document.getElementById("project-search").addEventListener("input", debounce(applyFilters, 250));
document.getElementById("status-filter").addEventListener("change", applyFilters);

// ---------- Add/Edit modal ----------
document.getElementById("add-project-btn").addEventListener("click", () => openAddModal());
document.getElementById("project-modal-close-btn").addEventListener("click", closeModal);
document.getElementById("project-modal-cancel-btn").addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });

function openAddModal() {
  form.reset();
  document.getElementById("p-id").value = "";
  document.getElementById("project-modal-title").textContent = "New Project";
  document.getElementById("p-status").value = "Planning";
  modalOverlay.classList.add("modal-overlay--visible");
}

async function openEditModal(id) {
  const project = await getProject(id);
  if (!project) return showToast("Could not load that project.", "error");

  document.getElementById("p-id").value = project.id;
  document.getElementById("p-client").value = project.clientId || "";
  document.getElementById("p-name").value = project.name || "";
  document.getElementById("p-site-address").value = project.siteAddress || "";
  document.getElementById("p-gps").value = project.gps ? `${project.gps.lat}, ${project.gps.lng}` : "";
  document.getElementById("p-start").value = project.startDate || "";
  document.getElementById("p-completion").value = project.completionDate || "";
  document.getElementById("p-status").value = project.status || "Planning";
  document.getElementById("p-notes").value = project.notes || "";
  document.getElementById("project-modal-title").textContent = `Edit Project — ${project.projectNumber}`;
  modalOverlay.classList.add("modal-overlay--visible");
}

function closeModal() {
  modalOverlay.classList.remove("modal-overlay--visible");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const clientId = document.getElementById("p-client").value;
  if (!clientId) return showToast("Please select a client.", "error");

  const client = allClients.find(c => c.id === clientId);
  const gpsRaw = document.getElementById("p-gps").value.trim();
  let gps = null;
  if (gpsRaw) {
    const parts = gpsRaw.split(",").map(v => parseFloat(v.trim()));
    if (parts.length === 2 && parts.every(n => !isNaN(n))) gps = { lat: parts[0], lng: parts[1] };
  }

  const data = {
    clientId,
    clientSnapshot: client ? { name: client.name, company: client.company, email: client.email, phone: client.phone } : null,
    name: document.getElementById("p-name").value.trim(),
    siteAddress: document.getElementById("p-site-address").value.trim(),
    gps,
    startDate: document.getElementById("p-start").value || null,
    completionDate: document.getElementById("p-completion").value || null,
    status: document.getElementById("p-status").value,
    notes: document.getElementById("p-notes").value.trim()
  };

  const saveBtn = document.getElementById("project-save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    const id = document.getElementById("p-id").value;
    if (id) {
      await updateProject(currentUser, id, data);
      showToast("Project updated.", "success");
    } else {
      await createProject(currentUser, data);
      showToast("Project created.", "success");
    }
    closeModal();
    await refreshProjects();
  } catch (err) {
    console.error(err);
    showToast("Something went wrong saving this project.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Project";
  }
});

// ---------- Detail / profitability ----------
document.getElementById("detail-close-btn").addEventListener("click", () => detailOverlay.classList.remove("modal-overlay--visible"));
detailOverlay.addEventListener("click", (e) => { if (e.target === detailOverlay) detailOverlay.classList.remove("modal-overlay--visible"); });

async function openDetail(id) {
  const project = await getProject(id);
  if (!project) return showToast("Could not load that project.", "error");

  document.getElementById("detail-title").textContent = `${project.projectNumber} — ${project.name}`;
  const body = document.getElementById("detail-body");
  body.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading financials…</div>`;
  detailOverlay.classList.add("modal-overlay--visible");

  const invoices = await listInvoicesByProject(id);
  const income = invoices.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0);
  const outstanding = invoices.reduce((sum, inv) => sum + (inv.grandTotal - (inv.amountPaid || 0)), 0);

  body.innerHTML = `
    <div class="stat-grid" style="margin-bottom:20px;">
      <div class="card"><div class="stat-card__label">Client</div><div style="font-size:15px;font-weight:600;">${escapeHtml(project.clientSnapshot?.name || "—")}</div></div>
      <div class="card"><div class="stat-card__label">Status</div><div style="font-size:15px;font-weight:600;">${project.status}</div></div>
      <div class="card"><div class="stat-card__label">Income Received</div><div class="stat-card__value up">${formatCurrency(income)}</div></div>
      <div class="card"><div class="stat-card__label">Outstanding</div><div class="stat-card__value">${formatCurrency(outstanding)}</div></div>
    </div>

    <div class="field__hint" style="margin-bottom:16px;">
      Materials, Labour, Fuel, Equipment and Other Expenses will appear here once the Expenses module (Phase 3) is live — full profit % calculation follows automatically once that data exists.
    </div>

    <h3 style="font-size:15px;margin-bottom:10px;">Linked Invoices</h3>
    ${invoices.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Invoice #</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead>
          <tbody>
            ${invoices.map(inv => `
              <tr>
                <td class="mono">${inv.invoiceNumber}</td>
                <td class="mono">${formatCurrency(inv.grandTotal)}</td>
                <td class="mono">${formatCurrency(inv.amountPaid)}</td>
                <td><span class="badge ${inv.paymentStatus === "Paid" ? "badge--success" : inv.paymentStatus === "Overdue" ? "badge--danger" : "badge--warning"}">${inv.paymentStatus}</span></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty-state" style="padding:24px;"><p>No invoices linked to this project yet.</p></div>`}
  `;
}
