// =============================================================
// LINE ITEM CALCULATIONS
// Shared by Quotes and Invoices — both use the same
// labour/materials/equipment line-item + discount + VAT structure.
// =============================================================

// item: { type: 'labour'|'material'|'equipment', description, quantity, unitPrice }
export function lineTotal(item) {
  return (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
}

export function computeTotals(items, { discountType = "percentage", discountValue = 0, vatRate = 15 } = {}) {
  const subtotal = items.reduce((sum, item) => sum + lineTotal(item), 0);

  const discountAmount = discountType === "percentage"
    ? subtotal * ((Number(discountValue) || 0) / 100)
    : (Number(discountValue) || 0);

  const afterDiscount = Math.max(subtotal - discountAmount, 0);
  const vatAmount = afterDiscount * ((Number(vatRate) || 0) / 100);
  const grandTotal = afterDiscount + vatAmount;

  return {
    subtotal: round2(subtotal),
    discountAmount: round2(discountAmount),
    afterDiscount: round2(afterDiscount),
    vatAmount: round2(vatAmount),
    grandTotal: round2(grandTotal)
  };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function emptyLineItem() {
  return { type: "material", description: "", quantity: 1, unitPrice: 0 };
}
