import { requireAuth } from "../services/auth-service.js";
import { renderSidebar, initThemeToggle } from "../components/sidebar.js";
import { listClients, createClient, updateClient, archiveClient, restoreClient, getClient } from "../services/client-service.js";
import { isValidEmail, isValidVATNumber, formatDate, debounce } from "../utils/validators.js";
import { showToast, confirmDialog } from "../utils/toast.js";

let currentUser = null;
let allClients = [];
let showArchived = false;

const overlay = document.getElementById("client-modal-overlay");
const form = document.getElementById("client-form");

requireAuth({
  moduleKey: "clients",
  onReady: async ({ user, profile }) => {
    currentUser = user;
    renderSidebar({ role: profile.role, activeKey: "clients", profile });
    initThemeToggle();
    await refreshClients();
  }
});

async function refreshClients() {
  const container = document.getElementById("clients-container");
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading clients…</div>`;
  allClients = await listClients({ includeArchived: showArchived });
  document.getElementById("client-count-msg").textContent =
    `${allClients.filter(c => !c.archived).length} active client${allClients.length === 1 ? "" : "s"}`;
  renderClientTable(allClients);
}

function renderClientTable(clients) {
  const container = document.getElementById("clients-container");
  if (!clients.length) {
    container.innerHTML = `<div class="empty-state"><h3>No clients yet</h3><p>Add your first client to start building your client base.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Client #</th><th>Name</th><th>Company</th><th>Phone</th><th>Email</th><th>Status</th><th>Added</th><th></th></tr>
        </thead>
        <tbody>
          ${clients.map(rowHtml).join("")}
        </tbody>
      </table>
    </div>`;

  container.querySelectorAll("[data-edit]").forEach(btn =>
    btn.addEventListener("click", () => openEditModal(btn.dataset.edit)));
  container.querySelectorAll("[data-archive]").forEach(btn =>
    btn.addEventListener("click", () => handleArchive(btn.dataset.archive)));
  container.querySelectorAll("[data-restore]").forEach(btn =>
    btn.addEventListener("click", () => handleRestore(btn.dataset.restore)));
}

function rowHtml(c) {
  return `
    <tr>
      <td class="mono">${c.clientNumber}</td>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.company || "—")}</td>
      <td>${escapeHtml(c.phone || "—")}</td>
      <td>${escapeHtml(c.email || "—")}</td>
      <td>${c.archived ? '<span class="badge badge--neutral">Archived</span>' : '<span class="badge badge--success">Active</span>'}</td>
      <td>${formatDate(c.createdAt)}</td>
      <td>
        <div class="flex gap-8">
          <button class="btn btn--ghost btn--sm" data-edit="${c.id}">Edit</button>
          ${c.archived
            ? `<button class="btn btn--ghost btn--sm" data-restore="${c.id}">Restore</button>`
            : `<button class="btn btn--ghost btn--sm" data-archive="${c.id}">Archive</button>`}
        </div>
      </td>
    </tr>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Search ----------
document.getElementById("client-search").addEventListener("input", debounce((e) => {
  const term = e.target.value.trim().toLowerCase();
  if (!term) return renderClientTable(allClients);
  const filtered = allClients.filter(c =>
    [c.name, c.company, c.clientNumber, c.email, c.phone].some(v => (v || "").toLowerCase().includes(term)));
  renderClientTable(filtered);
}, 250));

document.getElementById("show-archived").addEventListener("change", async (e) => {
  showArchived = e.target.checked;
  await refreshClients();
});

// ---------- Modal open/close ----------
document.getElementById("add-client-btn").addEventListener("click", () => openAddModal());
document.getElementById("modal-close-btn").addEventListener("click", closeModal);
document.getElementById("modal-cancel-btn").addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

function openAddModal() {
  form.reset();
  document.getElementById("client-id").value = "";
  document.getElementById("modal-title").textContent = "New Client";
  overlay.classList.add("modal-overlay--visible");
}

async function openEditModal(id) {
  const client = await getClient(id);
  if (!client) return showToast("Could not load that client.", "error");

  document.getElementById("client-id").value = client.id;
  document.getElementById("c-name").value = client.name || "";
  document.getElementById("c-company").value = client.company || "";
  document.getElementById("c-phone").value = client.phone || "";
  document.getElementById("c-email").value = client.email || "";
  document.getElementById("c-vat").value = client.vatNumber || "";
  document.getElementById("c-gps").value = client.gps ? `${client.gps.lat}, ${client.gps.lng}` : "";
  document.getElementById("c-address").value = client.address || "";
  document.getElementById("c-notes").value = client.notes || "";
  document.getElementById("modal-title").textContent = `Edit Client — ${client.clientNumber}`;
  overlay.classList.add("modal-overlay--visible");
}

function closeModal() {
  overlay.classList.remove("modal-overlay--visible");
}

// ---------- Save ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("c-email").value.trim();
  const vat = document.getElementById("c-vat").value.trim();
  if (email && !isValidEmail(email)) return showToast("Please enter a valid email address.", "error");
  if (vat && !isValidVATNumber(vat)) return showToast("VAT number should be 10 digits.", "error");

  const gpsRaw = document.getElementById("c-gps").value.trim();
  let gps = null;
  if (gpsRaw) {
    const parts = gpsRaw.split(",").map(p => parseFloat(p.trim()));
    if (parts.length === 2 && parts.every(n => !isNaN(n))) gps = { lat: parts[0], lng: parts[1] };
  }

  const data = {
    name: document.getElementById("c-name").value.trim(),
    company: document.getElementById("c-company").value.trim(),
    phone: document.getElementById("c-phone").value.trim(),
    email,
    vatNumber: vat,
    gps,
    address: document.getElementById("c-address").value.trim(),
    notes: document.getElementById("c-notes").value.trim()
  };

  const saveBtn = document.getElementById("modal-save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    const id = document.getElementById("client-id").value;
    if (id) {
      await updateClient(currentUser, id, data);
      showToast("Client updated.", "success");
    } else {
      await createClient(currentUser, data);
      showToast("Client added.", "success");
    }
    closeModal();
    await refreshClients();
  } catch (err) {
    console.error(err);
    showToast("Something went wrong saving this client.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Client";
  }
});

// ---------- Archive / Restore ----------
async function handleArchive(id) {
  const ok = await confirmDialog("Archive this client? You can restore it later.", { confirmLabel: "Archive" });
  if (!ok) return;
  await archiveClient(currentUser, id);
  showToast("Client archived.", "success");
  await refreshClients();
}

async function handleRestore(id) {
  await restoreClient(currentUser, id);
  showToast("Client restored.", "success");
  await refreshClients();
}
