// =============================================================
// INVOICE SERVICE
// CRUD for "invoices". amountPaid + paymentStatus are kept in sync
// by payment-service.js whenever a payment is recorded/allocated.
// =============================================================

import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase/firebase-init.js";
import { getNextCode } from "./counter-service.js";
import { logAction } from "./audit-service.js";
import { computeTotals } from "../utils/line-items.js";

const COLLECTION = "invoices";

export const PAYMENT_STATUSES = ["Outstanding", "Partially Paid", "Paid", "Overdue"];

export function derivePaymentStatus({ grandTotal, amountPaid, dueDate }) {
  if (amountPaid >= grandTotal && grandTotal > 0) return "Paid";
  if (amountPaid > 0) return "Partially Paid";
  if (dueDate && new Date(dueDate) < new Date()) return "Overdue";
  return "Outstanding";
}

export async function createInvoice(user, data) {
  const invoiceNumber = await getNextCode("invoices", { prefix: "INV", yearScoped: true });
  const totals = computeTotals(data.items, data);

  const payload = {
    invoiceNumber,
    clientId: data.clientId,
    clientSnapshot: data.clientSnapshot || null,
    projectId: data.projectId || null,
    quoteId: data.quoteId || null,
    items: data.items || [],
    discountType: data.discountType || "percentage",
    discountValue: Number(data.discountValue) || 0,
    vatRate: Number(data.vatRate) ?? 15,
    ...totals,
    dueDate: data.dueDate || null,
    terms: data.terms || "",
    amountPaid: 0,
    paymentStatus: "Outstanding",
    archived: false,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid
  };

  const ref = await addDoc(collection(db, COLLECTION), payload);
  await logAction({ user, action: "create", collectionName: COLLECTION, docId: ref.id, newValue: payload });
  return { id: ref.id, ...payload };
}

export async function updateInvoice(user, id, changes) {
  const ref = doc(db, COLLECTION, id);
  const before = await getDoc(ref);
  const oldValue = before.exists() ? before.data() : null;

  let payload = { ...changes, updatedAt: serverTimestamp(), updatedBy: user.uid };
  if (changes.items) {
    const base = { ...oldValue, ...changes };
    const totals = computeTotals(changes.items, base);
    payload = { ...payload, ...totals, paymentStatus: derivePaymentStatus({ grandTotal: totals.grandTotal, amountPaid: oldValue?.amountPaid || 0, dueDate: base.dueDate }) };
  }

  await updateDoc(ref, payload);
  await logAction({ user, action: "update", collectionName: COLLECTION, docId: id, oldValue, newValue: payload });
}

export async function getInvoice(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listInvoices() {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listInvoicesByProject(projectId) {
  const q = query(collection(db, COLLECTION), where("projectId", "==", projectId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listInvoicesByClient(clientId) {
  const q = query(collection(db, COLLECTION), where("clientId", "==", clientId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
