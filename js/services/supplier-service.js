// =============================================================
// SUPPLIER SERVICE
// CRUD for "suppliers". outstandingBalance is maintained by
// purchase-service.js whenever a purchase is created/paid, so it
// always reflects what the company currently owes that supplier.
// =============================================================

import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase/firebase-init.js";
import { getNextCode } from "./counter-service.js";
import { logAction } from "./audit-service.js";

const COLLECTION = "suppliers";

export async function createSupplier(user, data) {
  const supplierNumber = await getNextCode("suppliers", { prefix: "SUP", width: 4 });

  const payload = {
    supplierNumber,
    name: data.name || "",
    contactPerson: data.contactPerson || "",
    phone: data.phone || "",
    email: data.email || "",
    creditTerms: data.creditTerms || "",
    vatNumber: data.vatNumber || "",
    outstandingBalance: 0,
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

export async function updateSupplier(user, id, changes) {
  const ref = doc(db, COLLECTION, id);
  const before = await getDoc(ref);
  const oldValue = before.exists() ? before.data() : null;

  const payload = { ...changes, updatedAt: serverTimestamp(), updatedBy: user.uid };
  await updateDoc(ref, payload);
  await logAction({ user, action: "update", collectionName: COLLECTION, docId: id, oldValue, newValue: payload });
}

export async function archiveSupplier(user, id) {
  await updateSupplier(user, id, { archived: true });
}

export async function restoreSupplier(user, id) {
  await updateSupplier(user, id, { archived: false });
}

export async function getSupplier(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listSuppliers({ includeArchived = false } = {}) {
  const base = collection(db, COLLECTION);
  const q = includeArchived
    ? query(base, orderBy("createdAt", "desc"))
    : query(base, where("archived", "==", false), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
