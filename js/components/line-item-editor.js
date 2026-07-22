// =============================================================
// LINE ITEM EDITOR COMPONENT
// Renders an editable table of labour/material/equipment lines
// plus discount + VAT controls into any container element.
// Scoped to the container (no global IDs) so Quotes and Invoices
// pages can each mount their own instance safely.
// =============================================================

import { computeTotals, lineTotal, emptyLineItem } from "../utils/line-items.js";
import { formatCurrency } from "../utils/validators.js";

const TYPE_LABELS = { labour: "Labour", material: "Material", equipment: "Equipment" };

export function mountLineItemEditor(container, {
  items = [emptyLineItem()],
  discountType = "percentage",
  discountValue = 0,
  vatRate = 15,
  onChange = () => {}
} = {}) {
  let state = { items: items.length ? items.map(i => ({ ...i })) : [emptyLineItem()], discountType, discountValue, vatRate };

  render();

  function render() {
    const totals = computeTotals(state.items, state);
    container.innerHTML = `
      <div class="table-wrap" style="margin-bottom:14px;">
        <table>
          <thead>
            <tr><th style="width:110px;">Type</th><th>Description</th><th style="width:80px;">Qty</th><th style="width:120px;">Unit Price</th><th style="width:120px;">Total</th><th style="width:40px;"></th></tr>
          </thead>
          <tbody>
            ${state.items.map((item, i) => rowHtml(item, i)).join("")}
          </tbody>
        </table>
      </div>
      <button type="button" class="btn btn--ghost btn--sm" data-action="add-row">+ Add Line Item</button>

      <div class="form-row mt-16">
        <div class="field">
          <label>Discount</label>
          <div class="flex gap-8">
            <select data-field="discountType" style="width:110px;padding:10px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);">
              <option value="percentage" ${state.discountType === "percentage" ? "selected" : ""}>%</option>
              <option value="fixed" ${state.discountType === "fixed" ? "selected" : ""}>R Fixed</option>
            </select>
            <input type="number" data-field="discountValue" value="${state.discountValue}" min="0" step="0.01" />
          </div>
        </div>
        <div class="field">
          <label>VAT Rate (%)</label>
          <input type="number" data-field="vatRate" value="${state.vatRate}" min="0" step="0.1" />
        </div>
      </div>

      <div class="card" style="background:var(--bg);box-shadow:none;">
        <div class="flex-between"><span class="text-muted">Subtotal</span><span class="mono">${formatCurrency(totals.subtotal)}</span></div>
        <div class="flex-between"><span class="text-muted">Discount</span><span class="mono">-${formatCurrency(totals.discountAmount)}</span></div>
        <div class="flex-between"><span class="text-muted">VAT (${state.vatRate}%)</span><span class="mono">${formatCurrency(totals.vatAmount)}</span></div>
        <div class="flex-between" style="font-weight:700;font-size:16px;margin-top:6px;border-top:1px solid var(--border);padding-top:8px;">
          <span>Grand Total</span><span class="mono">${formatCurrency(totals.grandTotal)}</span>
        </div>
      </div>
    `;

    bindEvents();
    onChange({ ...state, totals });
  }

  function rowHtml(item, i) {
    return `
      <tr>
        <td>
          <select data-row="${i}" data-field="type" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);">
            ${Object.entries(TYPE_LABELS).map(([val, label]) => `<option value="${val}" ${item.type === val ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </td>
        <td><input data-row="${i}" data-field="description" value="${escapeAttr(item.description)}" placeholder="Describe the item…" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);" /></td>
        <td><input type="number" data-row="${i}" data-field="quantity" value="${item.quantity}" min="0" step="0.01" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);" /></td>
        <td><input type="number" data-row="${i}" data-field="unitPrice" value="${item.unitPrice}" min="0" step="0.01" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);" /></td>
        <td class="mono">${formatCurrency(lineTotal(item))}</td>
        <td><button type="button" class="btn btn--ghost btn--sm" data-action="remove-row" data-row="${i}" ${state.items.length === 1 ? "disabled" : ""}>✕</button></td>
      </tr>`;
  }

  function bindEvents() {
    container.querySelector('[data-action="add-row"]').addEventListener("click", () => {
      state.items.push(emptyLineItem());
      render();
    });

    container.querySelectorAll('[data-action="remove-row"]').forEach(btn => {
      btn.addEventListener("click", () => {
        state.items.splice(Number(btn.dataset.row), 1);
        render();
      });
    });

    container.querySelectorAll('[data-row][data-field]').forEach(el => {
      el.addEventListener("input", () => {
        const row = Number(el.dataset.row);
        const field = el.dataset.field;
        state.items[row][field] = field === "quantity" || field === "unitPrice" ? parseFloat(el.value) || 0 : el.value;
        // Re-render only the affected row's total + summary, without losing focus on every keystroke:
        renderSoft();
      });
    });

    ["discountType", "discountValue", "vatRate"].forEach(field => {
      const el = container.querySelector(`[data-field="${field}"]`);
      if (el) el.addEventListener("input", () => {
        state[field] = field === "discountValue" || field === "vatRate" ? parseFloat(el.value) || 0 : el.value;
        renderSoft();
      });
    });
  }

  // Updates computed totals/labels without rebuilding inputs (preserves focus + cursor position).
  function renderSoft() {
    const totals = computeTotals(state.items, state);
    state.items.forEach((item, i) => {
      const cell = container.querySelectorAll("tbody tr")[i]?.querySelector("td:nth-child(5)");
      if (cell) cell.textContent = formatCurrency(lineTotal(item));
    });
    const summary = container.querySelector(".card");
    if (summary) {
      summary.innerHTML = `
        <div class="flex-between"><span class="text-muted">Subtotal</span><span class="mono">${formatCurrency(totals.subtotal)}</span></div>
        <div class="flex-between"><span class="text-muted">Discount</span><span class="mono">-${formatCurrency(totals.discountAmount)}</span></div>
        <div class="flex-between"><span class="text-muted">VAT (${state.vatRate}%)</span><span class="mono">${formatCurrency(totals.vatAmount)}</span></div>
        <div class="flex-between" style="font-weight:700;font-size:16px;margin-top:6px;border-top:1px solid var(--border);padding-top:8px;">
          <span>Grand Total</span><span class="mono">${formatCurrency(totals.grandTotal)}</span>
        </div>`;
    }
    onChange({ ...state, totals });
  }

  function escapeAttr(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML.replace(/"/g, "&quot;");
  }

  return {
    getState() {
      return { ...state, totals: computeTotals(state.items, state) };
    },
    reset(newState) {
      state = {
        items: (newState.items?.length ? newState.items : [emptyLineItem()]).map(i => ({ ...i })),
        discountType: newState.discountType || "percentage",
        discountValue: newState.discountValue || 0,
        vatRate: newState.vatRate ?? 15
      };
      render();
    }
  };
}
