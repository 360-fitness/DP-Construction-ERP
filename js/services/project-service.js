// =============================================================
// PROJECT SERVICE
// CRUD for "projects". Profitability is calculated from linked
// invoices (income) — Materials/Labour/Fuel/Equipment expense
// tracking arrives in Phase 3 (Expenses/Suppliers/Purchases), so
// those numbers show as pending until then, same pattern as the
// dashboard placeholders.
// =============================================================

import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase/firebase-init.js";
import { getNextCode } from "./counter-service.js";
import { logAction } from "./audit-service.js";

const COLLECTION = "projects";

export const PROJECT_STATUSES = ["Planning", "In Progress", "On Hold", "Completed", "Cancelled"];

export async function createProject(user, data) {
  const projectNumber = await getNextCode("projects", { prefix: "PRJ", yearScoped: true });

  const payload = {
    projectNumber,
    clientId: data.clientId,
    clientSnapshot: data.clientSnapshot || null,
    quoteId: data.quoteId || null,
    name: data.name || "",
    siteAddress: data.siteAddress || "",
    gps: data.gps || null,
    startDate: data.startDate || null,
    completionDate: data.completionDate || null,
    status: data.status || "Planning",
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

export async function updateProject(user, id, changes) {
  const ref = doc(db, COLLECTION, id);
  const before = await getDoc(ref);
  const oldValue = before.exists() ? before.data() : null;

  const payload = { ...changes, updatedAt: serverTimestamp(), updatedBy: user.uid };
  await updateDoc(ref, payload);
  await logAction({ user, action: "update", collectionName: COLLECTION, docId: id, oldValue, newValue: payload });
}

export async function getProject(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listProjects() {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listProjectsByClient(clientId) {
  const q = query(collection(db, COLLECTION), where("clientId", "==", clientId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
