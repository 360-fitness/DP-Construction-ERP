// =============================================================
// FIREBASE INITIALIZATION
// Loads the Firebase SDK from CDN (ES6 modules), initializes the
// app once, and exports the auth / firestore / storage instances
// that every other module in the app imports from.
// =============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Called by the login page depending on whether "Remember Me" is checked.
export async function setAuthPersistence(remember) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
}
