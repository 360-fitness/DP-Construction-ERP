// =============================================================
// CLIENT SERVICE
// CRUD for the "clients" Firestore collection. Soft-delete only —
// records are marked archived, never destroyed.
// =============================================================

import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, orderBy, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase/firebase-init.js";
import { getNextCode } from "./counter-service.js";
import { logAction } from "./audit-service.js";

const COLLECTION = "clients";

export async function createClient(user, data) {
  const clientNumber = await getNextCode("clients", { prefix: "CLI", width: 4 });

  const payload = {
    clientNumber,
    name: data.name || "",
    company: data.company || "",
    vatNumber: data.vatNumber || "",
    phone: data.phone || "",
    email: data.email || "",
    address: data.address || "",
    gps: data.gps || null,        // { lat, lng }
    notes: data.notes || "",
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

export async function updateClient(user, id, changes) {
  const ref = doc(db, COLLECTION, id);
  const before = await getDoc(ref);
  const oldValue = before.exists() ? before.data() : null;

  const payload = { ...changes, updatedAt: serverTimestamp(), updatedBy: user.uid };
  await updateDoc(ref, payload);
  await logAction({ user, action: "update", collectionName: COLLECTION, docId: id, oldValue, newValue: payload });
}

export async function archiveClient(user, id) {
  await updateClient(user, id, { archived: true });
}

export async function restoreClient(user, id) {
  await updateClient(user, id, { archived: false });
}

export async function getClient(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listClients({ includeArchived = false } = {}) {
  const base = collection(db, COLLECTION);
  const q = includeArchived
    ? query(base, orderBy("createdAt", "desc"))
    : query(base, where("archived", "==", false), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
