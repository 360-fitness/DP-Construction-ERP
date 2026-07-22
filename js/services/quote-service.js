// =============================================================
// QUOTE SERVICE
// CRUD for "quotes". Line items are embedded in the quote document
// (a bounded, small list) rather than a separate quoteItems
// collection — this keeps every save atomic and avoids extra reads.
// =============================================================

import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase/firebase-init.js";
import { getNextCode } from "./counter-service.js";
import { logAction } from "./audit-service.js";
import { computeTotals } from "../utils/line-items.js";

const COLLECTION = "quotes";

export const QUOTE_STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];

export async function createQuote(user, data) {
  const quoteNumber = await getNextCode("quotes", { prefix: "QT", yearScoped: true });
  const totals = computeTotals(data.items, data);

  const payload = {
    quoteNumber,
    clientId: data.clientId,
    clientSnapshot: data.clientSnapshot || null, // { name, company, email, phone, address, vatNumber }
    projectDescription: data.projectDescription || "",
    siteAddress: data.siteAddress || "",
    items: data.items || [],
    discountType: data.discountType || "percentage",
    discountValue: Number(data.discountValue) || 0,
    vatRate: Number(data.vatRate) ?? 15,
    ...totals,
    depositType: data.depositType || "percentage",
    depositValue: Number(data.depositValue) || 0,
    expiryDate: data.expiryDate || null,
    terms: data.terms || "",
    status: "Draft",
    convertedToProjectId: null,
    convertedToInvoiceId: null,
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

export async function updateQuote(user, id, changes) {
  const ref = doc(db, COLLECTION, id);
  const before = await getDoc(ref);
  const oldValue = before.exists() ? before.data() : null;

  let payload = { ...changes, updatedAt: serverTimestamp(), updatedBy: user.uid };
  if (changes.items) {
    const base = { ...oldValue, ...changes };
    payload = { ...payload, ...computeTotals(changes.items, base) };
  }

  await updateDoc(ref, payload);
  await logAction({ user, action: "update", collectionName: COLLECTION, docId: id, oldValue, newValue: payload });
}

export async function setQuoteStatus(user, id, status) {
  await updateQuote(user, id, { status });
}

export async function linkQuoteToProject(user, quoteId, projectId) {
  await updateQuote(user, quoteId, { convertedToProjectId: projectId });
}

export async function linkQuoteToInvoice(user, quoteId, invoiceId) {
  await updateQuote(user, quoteId, { convertedToInvoiceId: invoiceId });
}

export async function getQuote(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listQuotes() {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
