// =============================================================
// VALIDATORS & HELPERS
// =============================================================

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidSAPhone(value) {
  // Accepts formats like 082 123 4567, +27 82 123 4567, 0821234567
  return /^(\+27|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}$/.test(value.replace(/\s/g, "").replace(/^\+27/, "+27").trim()) || /^(\+27|0)\d{9}$/.test(value.replace(/[\s-]/g, ""));
}

export function isValidVATNumber(value) {
  // South African VAT numbers are 10 digits
  return /^\d{10}$/.test(value.replace(/\s/g, ""));
}

export function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);
}

export function formatDate(date) {
  if (!date) return "—";
  const d = date.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Pads a running counter to a fixed-width numbered code, e.g. ("CLI", 7) -> "CLI-0007"
export function padCode(prefix, n, width = 4) {
  return `${prefix}-${String(n).padStart(width, "0")}`;
}

// Pads a year-scoped numbered code, e.g. ("QT", 2026, 3) -> "QT-2026-0003"
export function padYearCode(prefix, year, n, width = 4) {
  return `${prefix}-${year}-${String(n).padStart(width, "0")}`;
}
