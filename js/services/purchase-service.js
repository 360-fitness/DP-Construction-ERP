// =============================================================
// PURCHASE SERVICE
// CRUD for "purchases" (Purchase Orders). Per the spec, a purchase
// "automatically updates expenses" — so creating a purchase also
// creates a matching Expense record and bumps the supplier's
// outstandingBalance, all inside one atomic transaction so the
// three can never drift out of sync with each other.
// =============================================================

import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase/firebase-init.js";
import { getNextCode } from "./counter-service.js";
import { logAction } from "./audit-service.js";

const COLLECTION = "purchases";
const EXPENSE_COLLECTION = "expenses";
const SUPPLIER_COLLECTION = "suppliers";

export const PURCHASE_STATUSES = ["Ordered", "Received", "Paid"];

// data: { supplierId, supplierSnapshot, projectId, invoiceNumber, amount,
//         vatAmount, category, description, receiptBase64, status, date }
export async function createPurchase(user, data) {
  const poNumber = await getNextCode("purchaseOrders", { prefix: "PO", width: 4 });
  const expenseNumber = await getNextCode("expenses", { prefix: "EXP", width: 4 });

  const purchaseRef = doc(collection(db, COLLECTION));
  const expenseRef = doc(collection(db, EXPENSE_COLLECTION));
  const supplierRef = data.supplierId ? doc(db, SUPPLIER_COLLECTION, data.supplierId) : null;

  const amount = Number(data.amount) || 0;
  const vatAmount = Number(data.vatAmount) || 0;
  const status = data.status || "Ordered";
  // Only unpaid purchases count toward what the company still owes the supplier.
  const addsToOutstanding = status !== "Paid";

  const purchasePayload = {
    poNumber,
    supplierId: data.supplierId || null,
    supplierSnapshot: data.supplierSnapshot || null,
    projectId: data.projectId || null,
    supplierInvoiceNumber: data.invoiceNumber || "",
    date: data.date || new Date().toISOString().slice(0, 10),
    category: data.category || "Materials",
    description: data.description || "",
    amount,
    vatAmount,
    receiptBase64: data.receiptBase64 || null,
    status,
    linkedExpenseId: expenseRef.id,
    archived: false,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid
  };

  const expensePayload = {
    expenseNumber,
    date: purchasePayload.date,
    category: purchasePayload.category,
    description: `Purchase ${poNumber}${data.description ? ` — ${data.description}` : ""}`,
    amount,
    vatAmount,
    paymentMethod: "EFT",
    projectId: purchasePayload.projectId,
    supplierId: purchasePayload.supplierId,
    receiptBase64: purchasePayload.receiptBase64,
    sourcePurchaseId: purchaseRef.id,
    archived: false,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid
  };

  await runTransaction(db, async (tx) => {
    let supplierData = null;
    if (supplierRef) {
      const supplierSnap = await tx.get(supplierRef);
      supplierData = supplierSnap.exists() ? supplierSnap.data() : null;
    }

    tx.set(purchaseRef, purchasePayload);
    tx.set(expenseRef, expensePayload);

    if (supplierRef && supplierData && addsToOutstanding) {
      const newBalance = Math.round(((supplierData.outstandingBalance || 0) + amount + vatAmount) * 100) / 100;
      tx.update(supplierRef, { outstandingBalance: newBalance, updatedAt: serverTimestamp(), updatedBy: user.uid });
    }
  });

  await logAction({ user, action: "create", collectionName: COLLECTION, docId: purchaseRef.id, newValue: { ...purchasePayload, receiptBase64: purchasePayload.receiptBase64 ? "[image omitted]" : null } });
  await logAction({ user, action: "create", collectionName: EXPENSE_COLLECTION, docId: expenseRef.id, newValue: { note: `Auto-created from Purchase ${poNumber}` } });

  return { id: purchaseRef.id, ...purchasePayload };
}

// Marking a previously-unpaid purchase as Paid removes it from the
// supplier's outstanding balance (money owed → money settled).
export async function markPurchasePaid(user, id) {
  const purchaseRef = doc(db, COLLECTION, id);

  await runTransaction(db, async (tx) => {
    const purchaseSnap = await tx.get(purchaseRef);
    if (!purchaseSnap.exists()) throw new Error("Purchase not found");
    const purchase = purchaseSnap.data();
    if (purchase.status === "Paid") return; // already settled, nothing to do

    tx.update(purchaseRef, { status: "Paid", updatedAt: serverTimestamp(), updatedBy: user.uid });

    if (purchase.supplierId) {
      const supplierRef = doc(db, SUPPLIER_COLLECTION, purchase.supplierId);
      const supplierSnap = await tx.get(supplierRef);
      if (supplierSnap.exists()) {
        const supplier = supplierSnap.data();
        const newBalance = Math.max(Math.round(((supplier.outstandingBalance || 0) - (purchase.amount + purchase.vatAmount)) * 100) / 100, 0);
        tx.update(supplierRef, { outstandingBalance: newBalance, updatedAt: serverTimestamp(), updatedBy: user.uid });
      }
    }
  });

  await logAction({ user, action: "update", collectionName: COLLECTION, docId: id, newValue: { status: "Paid" } });
}

export async function updatePurchaseStatus(user, id, status) {
  if (status === "Paid") return markPurchasePaid(user, id);
  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, { status, updatedAt: serverTimestamp(), updatedBy: user.uid });
  await logAction({ user, action: "update", collectionName: COLLECTION, docId: id, newValue: { status } });
}

export async function getPurchase(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listPurchases() {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listPurchasesBySupplier(supplierId) {
  const q = query(collection(db, COLLECTION), where("supplierId", "==", supplierId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
