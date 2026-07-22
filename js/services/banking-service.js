// =============================================================
// BANKING SERVICE
// CRUD for "bankTransactions" — a manual ledger the bookkeeper
// keeps in sync with the actual bank statement. This is deliberately
// manual entry (the spec calls for "Manual Bank Reconciliation"),
// not an automatic bank feed — those need paid third-party APIs.
// The running balance is just the sum of all transactions ordered
// by date; income/interest are positive, expenses/charges/transfers
// out are negative, exactly as they'd appear on a real statement.
// =============================================================

import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase/firebase-init.js";
import { logAction } from "./audit-service.js";

const COLLECTION = "bankTransactions";

export const TRANSACTION_TYPES = ["Income", "Expense", "Transfer", "Interest", "Bank Charge"];

// Positive types add to the balance, negative types subtract.
const SIGN = { Income: 1, Interest: 1, Expense: -1, Transfer: -1, "Bank Charge": -1 };

// data: { date, type, description, amount, reconciled }
export async function createTransaction(user, data) {
  const payload = {
    date: data.date || new Date().toISOString().slice(0, 10),
    type: data.type || "Expense",
    description: data.description || "",
    amount: Math.abs(Number(data.amount) || 0), // always stored positive; sign comes from `type`
    reconciled: false,
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

export async function setReconciled(user, id, reconciled) {
  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, { reconciled, updatedAt: serverTimestamp(), updatedBy: user.uid });
  await logAction({ user, action: "update", collectionName: COLLECTION, docId: id, newValue: { reconciled } });
}

export async function getTransaction(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listTransactions() {
  const q = query(collection(db, COLLECTION), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function signedAmount(transaction) {
  return (SIGN[transaction.type] || -1) * transaction.amount;
}

export function computeBalance(transactions) {
  return Math.round(transactions.reduce((sum, t) => sum + signedAmount(t), 0) * 100) / 100;
}
