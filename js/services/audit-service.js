// =============================================================
// AUDIT LOG SERVICE
// Every create/update/soft-delete across the app writes an entry
// here. Never edit or delete audit log entries themselves.
// =============================================================

import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase/firebase-init.js";

export async function logAction({ user, action, collectionName, docId, oldValue = null, newValue = null }) {
  await addDoc(collection(db, "auditLog"), {
    userId: user.uid,
    userEmail: user.email,
    action,          // "create" | "update" | "soft-delete" | "restore"
    collection: collectionName,
    docId,
    oldValue,
    newValue,
    timestamp: serverTimestamp()
  });
}
