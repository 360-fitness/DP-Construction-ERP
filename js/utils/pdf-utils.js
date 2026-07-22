// =============================================================
// PDF UTILS
// Generates Quote / Invoice PDFs in the browser using jsPDF,
// loaded lazily from a CDN so it never slows down page load.
// Also provides a "mailto" helper — actual email *sending* would
// need a backend, so this opens the user's mail client with the
// message prefilled and reminds them to attach the downloaded PDF.
// =============================================================

let jsPDFPromise = null;

function loadJsPDF() {
  if (jsPDFPromise) return jsPDFPromise;
  jsPDFPromise = new Promise((resolve, reject) => {
    if (window.jspdf) return resolve(window.jspdf.jsPDF);
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => resolve(window.jspdf.jsPDF);
    script.onerror = () => reject(new Error("Could not load PDF library. Check your internet connection."));
    document.head.appendChild(script);
  });
  return jsPDFPromise;
}

// docData: { docType: 'QUOTE'|'INVOICE', number, date, expiryOrDueDate, client, items, totals, discountType, discountValue, vatRate, terms, depositNote, company }
export async function generateDocumentPDF(docData) {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = 56;

  const company = docData.company || {};

  // ---- Header ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(28, 32, 35);
  doc.text(company.tradingName || company.name || "DP Construction & Maintenance", margin, y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(104, 111, 117);
  y += 16;
  if (company.address) { doc.text(company.address, margin, y, { maxWidth: 260 }); y += 28; } else { y += 12; }
  if (company.vatNumber) { doc.text(`VAT No: ${company.vatNumber}`, margin, y); y += 14; }
  if (company.phone) { doc.text(`Tel: ${company.phone}`, margin, y); y += 14; }
  if (company.email) { doc.text(company.email, margin, y); }

  // Document title block (top right)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(232, 89, 12);
  doc.text(docData.docType === "INVOICE" ? "TAX INVOICE" : "QUOTATION", pageWidth - margin, 56, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(28, 32, 35);
  doc.text(`No: ${docData.number}`, pageWidth - margin, 76, { align: "right" });
  doc.text(`Date: ${docData.date}`, pageWidth - margin, 90, { align: "right" });
  if (docData.expiryOrDueDate) {
    doc.text(`${docData.docType === "INVOICE" ? "Due" : "Valid Until"}: ${docData.expiryOrDueDate}`, pageWidth - margin, 104, { align: "right" });
  }

  y = 160;
  doc.setDrawColor(221, 217, 206);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  // ---- Client ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Bill To:", margin, y);
  y += 15;
  doc.setFont("helvetica", "normal");
  doc.text(docData.client.name || "", margin, y); y += 14;
  if (docData.client.company) { doc.text(docData.client.company, margin, y); y += 14; }
  if (docData.client.address) { doc.text(docData.client.address, margin, y, { maxWidth: 260 }); y += 28; }
  if (docData.client.vatNumber) { doc.text(`VAT No: ${docData.client.vatNumber}`, margin, y); y += 14; }

  y += 20;

  // ---- Line items table ----
  const colX = { desc: margin, type: margin + 260, qty: margin + 340, price: margin + 400, total: pageWidth - margin };
  doc.setFillColor(28, 32, 35);
  doc.rect(margin, y, pageWidth - margin * 2, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Description", colX.desc + 6, y + 15);
  doc.text("Type", colX.type, y + 15);
  doc.text("Qty", colX.qty, y + 15);
  doc.text("Unit Price", colX.price, y + 15);
  doc.text("Total", colX.total, y + 15, { align: "right" });
  y += 22;

  doc.setTextColor(28, 32, 35);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  docData.items.forEach((item, i) => {
    if (y > 720) { doc.addPage(); y = 56; }
    if (i % 2 === 1) { doc.setFillColor(241, 239, 233); doc.rect(margin, y - 14, pageWidth - margin * 2, 20, "F"); }
    doc.text(item.description || "", colX.desc + 6, y, { maxWidth: 240 });
    doc.text(capitalize(item.type), colX.type, y);
    doc.text(String(item.quantity), colX.qty, y);
    doc.text(formatZAR(item.unitPrice), colX.price, y);
    doc.text(formatZAR((item.quantity || 0) * (item.unitPrice || 0)), colX.total, y, { align: "right" });
    y += 20;
  });

  y += 16;
  doc.setDrawColor(221, 217, 206);
  doc.line(margin + 280, y, pageWidth - margin, y);
  y += 18;

  const totalsRow = (label, value, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 10);
    doc.text(label, margin + 300, y);
    doc.text(value, pageWidth - margin, y, { align: "right" });
    y += bold ? 20 : 16;
  };

  totalsRow("Subtotal", formatZAR(docData.totals.subtotal));
  totalsRow(`Discount`, `-${formatZAR(docData.totals.discountAmount)}`);
  totalsRow(`VAT (${docData.vatRate}%)`, formatZAR(docData.totals.vatAmount));
  totalsRow("Grand Total", formatZAR(docData.totals.grandTotal), true);

  y += 20;

  // ---- Terms / deposit / banking ----
  if (docData.depositNote) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Deposit Required:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(docData.depositNote, margin + 110, y);
    y += 20;
  }

  if (docData.docType === "INVOICE" && company.bank?.name) {
    doc.setFont("helvetica", "bold");
    doc.text("Banking Details:", margin, y); y += 14;
    doc.setFont("helvetica", "normal");
    doc.text(`${company.bank.name} | Acc: ${company.bank.accountNumber} | Branch: ${company.bank.branchCode} | ${company.bank.accountType}`, margin, y, { maxWidth: pageWidth - margin * 2 });
    y += 24;
  }

  if (docData.terms) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Terms & Conditions", margin, y); y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(docData.terms, margin, y, { maxWidth: pageWidth - margin * 2 });
  }

  doc.save(`${docData.number}.pdf`);
}

function formatZAR(n) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(n) || 0);
}
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

// Opens the user's email client with a prefilled subject/body. Reminds
// them to attach the PDF they just downloaded, since sending an actual
// attachment requires a backend mail server, which this app doesn't have.
export function openEmailDraft({ to, subject, body }) {
  const url = `mailto:${encodeURIComponent(to || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
}
