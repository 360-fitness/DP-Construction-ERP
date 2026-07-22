// =============================================================
// PAYMENT SERVICE
// Recording a payment is a transaction: create the payment record
// AND update the parent invoice's amountPaid + paymentStatus in the
// same atomic operation, so the two can never drift out of sync.
// =============================================================

import {
  collection, doc, addDoc, getDocs, query, where, orderBy,
  runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase/firebase-init.js";
import { logAction } from "./audit-service.js";
import { derivePaymentStatus } from "./invoice-service.js";

const COLLECTION = "payments";

// data: { invoiceId, date, amount, method, reference }
export async function recordPayment(user, data) {
  const invoiceRef = doc(db, "invoices", data.invoiceId);
  const paymentRef = doc(collection(db, COLLECTION));

  let resultInvoice;

  await runTransaction(db, async (tx) => {
    const invoiceSnap = await tx.get(invoiceRef);
    if (!invoiceSnap.exists()) throw new Error("Invoice not found");
    const invoice = invoiceSnap.data();

    const newAmountPaid = Math.round(((invoice.amountPaid || 0) + Number(data.amount)) * 100) / 100;
    const newStatus = derivePaymentStatus({ grandTotal: invoice.grandTotal, amountPaid: newAmountPaid, dueDate: invoice.dueDate });

    tx.set(paymentRef, {
      invoiceId: data.invoiceId,
      clientId: invoice.clientId,
      date: data.date || new Date().toISOString().slice(0, 10),
      amount: Number(data.amount),
      method: data.method || "EFT",
      reference: data.reference || "",
      createdAt: serverTimestamp(),
      createdBy: user.uid
    });

    tx.update(invoiceRef, {
      amountPaid: newAmountPaid,
      paymentStatus: newStatus,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid
    });

    resultInvoice = { ...invoice, amountPaid: newAmountPaid, paymentStatus: newStatus };
  });

  await logAction({ user, action: "create", collectionName: COLLECTION, docId: paymentRef.id, newValue: data });
  return resultInvoice;
}

export async function listPaymentsForInvoice(invoiceId) {
  const q = query(collection(db, COLLECTION), where("invoiceId", "==", invoiceId), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
