// =============================================================
// SETTINGS SERVICE
// Company-wide settings live in a single doc: /settings/company
// =============================================================

import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, storage } from "../firebase/firebase-init.js";
import { logAction } from "./audit-service.js";

const SETTINGS_DOC = doc(db, "settings", "company");

export async function getCompanySettings() {
  const snap = await getDoc(SETTINGS_DOC);
  return snap.exists() ? snap.data() : null;
}

export async function saveCompanySettings(user, data) {
  const before = await getDoc(SETTINGS_DOC);
  const oldValue = before.exists() ? before.data() : null;

  const payload = { ...data, updatedAt: serverTimestamp(), updatedBy: user.uid };
  await setDoc(SETTINGS_DOC, payload, { merge: true });
  await logAction({ user, action: "update", collectionName: "settings/company", docId: "company", oldValue, newValue: payload });
}

// Uploads a logo file to Storage and returns its download URL.
// Only the URL gets saved into Firestore, per the spec.
export async function uploadCompanyLogo(file) {
  const path = `company/logo-${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}
