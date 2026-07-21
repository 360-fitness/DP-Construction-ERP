import { requireAuth } from "../services/auth-service.js";
import { renderSidebar, initThemeToggle } from "../components/sidebar.js";
import { getCompanySettings, saveCompanySettings, uploadCompanyLogo } from "../services/settings-service.js";
import { showToast } from "../utils/toast.js";

let currentUser = null;
let pendingLogoFile = null;

requireAuth({
  moduleKey: "settings",
  onReady: async ({ user, profile }) => {
    currentUser = user;
    renderSidebar({ role: profile.role, activeKey: "settings", profile });
    initThemeToggle();
    await loadSettings();
  }
});

async function loadSettings() {
  const settings = await getCompanySettings();
  if (!settings) return;

  setVal("s-name", settings.name);
  setVal("s-trading", settings.tradingName);
  setVal("s-reg", settings.registrationNumber);
  setVal("s-vat", settings.vatNumber);
  setVal("s-phone", settings.phone);
  setVal("s-email", settings.email);
  setVal("s-address", settings.address);
  setVal("s-bank-name", settings.bank?.name);
  setVal("s-bank-acc", settings.bank?.accountNumber);
  setVal("s-bank-branch", settings.bank?.branchCode);
  setVal("s-bank-type", settings.bank?.accountType || "Cheque");
  setVal("s-vat-rate", settings.vatRate ?? 15);
  setVal("s-quote-validity", settings.quoteValidityDays ?? 30);
  setVal("s-terms", settings.termsAndConditions);

  if (settings.logoUrl) {
    const preview = document.getElementById("logo-preview");
    preview.src = settings.logoUrl;
    preview.style.display = "block";
  }
}

function setVal(id, value) {
  if (value === undefined || value === null) return;
  document.getElementById(id).value = value;
}

document.getElementById("logo-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  pendingLogoFile = file;
  const preview = document.getElementById("logo-preview");
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";
});

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const saveBtn = document.getElementById("settings-save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  let logoUrl;
  let logoFailed = false;
  if (pendingLogoFile) {
    try {
      logoUrl = await uploadCompanyLogo(pendingLogoFile);
    } catch (err) {
      console.error("Logo upload failed:", err);
      logoFailed = true;
    }
  }

  try {
    const payload = {
      name: document.getElementById("s-name").value.trim(),
      tradingName: document.getElementById("s-trading").value.trim(),
      registrationNumber: document.getElementById("s-reg").value.trim(),
      vatNumber: document.getElementById("s-vat").value.trim(),
      phone: document.getElementById("s-phone").value.trim(),
      email: document.getElementById("s-email").value.trim(),
      address: document.getElementById("s-address").value.trim(),
      bank: {
        name: document.getElementById("s-bank-name").value.trim(),
        accountNumber: document.getElementById("s-bank-acc").value.trim(),
        branchCode: document.getElementById("s-bank-branch").value.trim(),
        accountType: document.getElementById("s-bank-type").value
      },
      vatRate: parseFloat(document.getElementById("s-vat-rate").value) || 15,
      quoteValidityDays: parseInt(document.getElementById("s-quote-validity").value) || 30,
      termsAndConditions: document.getElementById("s-terms").value.trim(),
      ...(logoUrl ? { logoUrl } : {})
    };

    await saveCompanySettings(currentUser, payload);
    if (logoFailed) {
      showToast("Settings saved, but the logo upload failed. Check that Storage is enabled on the Blaze plan.", "warning", 6000);
    } else {
      showToast("Settings saved.", "success");
    }
    pendingLogoFile = null;
  } catch (err) {
    console.error(err);
    showToast("Something went wrong saving settings.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Settings";
  }
});
