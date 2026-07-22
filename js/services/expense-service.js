// =============================================================
// EXPENSE SERVICE
// CRUD for "expenses". A receipt image, if attached, is stored as
// a compressed base64 string in the document itself (see
// utils/image-compress.js) — free-tier friendly, no Storage needed.
// =============================================================

import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase/firebase-init.js";
import { getNextCode } from "./counter-service.js";
import { logAction } from "./audit-service.js";

const COLLECTION = "expenses";

export const EXPENSE_CATEGORIES = [
  "Fuel", "Materials", "Tools", "Office", "Advertising",
  "Vehicles", "Insurance", "Maintenance", "Equipment", "Utilities", "Other"
];

export const PAYMENT_METHODS = ["EFT", "Cash", "Card", "Cheque", "Other"];

// data: { date, category, description, amount, vatAmount, paymentMethod,
//         projectId, supplierId, receiptBase64, sourcePurchaseId }
export async function createExpense(user, data) {
  const expenseNumber = await getNextCode("expenses", { prefix: "EXP", width: 4 });

  const payload = {
    expenseNumber,
    date: data.date || new Date().toISOString().slice(0, 10),
    category: data.category || "Other",
    description: data.description || "",
    amount: Number(data.amount) || 0,
    vatAmount: Number(data.vatAmount) || 0,
    paymentMethod: data.paymentMethod || "EFT",
    projectId: data.projectId || null,
    supplierId: data.supplierId || null,
    receiptBase64: data.receiptBase64 || null,
    sourcePurchaseId: data.sourcePurchaseId || null, // set when auto-created from a Purchase
    archived: false,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid
  };

  const ref = await addDoc(collection(db, COLLECTION), payload);
  await logAction({ user, action: "create", collectionName: COLLECTION, docId: ref.id, newValue: { ...payload, receiptBase64: payload.receiptBase64 ? "[image omitted from log]" : null } });
  return { id: ref.id, ...payload };
}

export async function updateExpense(user, id, changes) {
  const ref = doc(db, COLLECTION, id);
  const before = await getDoc(ref);
  const oldValue = before.exists() ? before.data() : null;

  const payload = { ...changes, updatedAt: serverTimestamp(), updatedBy: user.uid };
  await updateDoc(ref, payload);
  await logAction({ user, action: "update", collectionName: COLLECTION, docId: id, oldValue: { ...oldValue, receiptBase64: oldValue?.receiptBase64 ? "[image omitted from log]" : null }, newValue: { ...payload, receiptBase64: payload.receiptBase64 ? "[image omitted from log]" : undefined } });
}

export async function archiveExpense(user, id) {
  await updateExpense(user, id, { archived: true });
}

export async function getExpense(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listExpenses({ includeArchived = false } = {}) {
  const base = collection(db, COLLECTION);
  const q = includeArchived
    ? query(base, orderBy("createdAt", "desc"))
    : query(base, where("archived", "==", false), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listExpensesByProject(projectId) {
  const q = query(collection(db, COLLECTION), where("projectId", "==", projectId), where("archived", "==", false));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
