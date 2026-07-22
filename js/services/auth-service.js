// =============================================================
// AUTH SERVICE
// Wraps Firebase Authentication + the "users" Firestore collection
// (which stores each user's role and profile info).
// =============================================================

import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db, setAuthPersistence } from "../firebase/firebase-init.js";

export const ROLES = {
  ADMIN: "Administrator",
  DIRECTOR: "Director",
  BOOKKEEPER: "Bookkeeper",
  EMPLOYEE: "Employee"
};

// Which top-level modules each role can see. Used by the sidebar
// and by each page's own guard check.
export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: ["dashboard", "clients", "quotes", "projects", "invoices", "suppliers", "expenses", "banking", "payroll", "employees", "timesheets", "reports", "settings"],
  [ROLES.DIRECTOR]: ["dashboard", "clients", "quotes", "projects", "invoices", "suppliers", "expenses", "banking", "payroll", "employees", "timesheets", "reports"],
  [ROLES.BOOKKEEPER]: ["dashboard", "clients", "quotes", "invoices", "suppliers", "expenses", "banking", "payroll", "reports"],
  [ROLES.EMPLOYEE]: ["dashboard", "timesheets"]
};

export async function login(email, password, remember) {
  await setAuthPersistence(remember);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// Fetches the matching Firestore doc from /users/{uid}. This is where
// role + display name + linked employee record live.
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export function canAccess(role, moduleKey) {
  return (ROLE_PERMISSIONS[role] || []).includes(moduleKey);
}

// Every protected page calls this at load time. Redirects to login
// if not authenticated, redirects to dashboard if the user's role
// isn't allowed to view the requested module.
export function requireAuth({ moduleKey, onReady }) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    const profile = await getUserProfile(user.uid);
    if (!profile) {
      // Signed in with Firebase Auth but no Firestore profile/role yet.
      window.location.href = "login.html?error=no-profile";
      return;
    }
    if (moduleKey && !canAccess(profile.role, moduleKey)) {
      window.location.href = "dashboard.html";
      return;
    }
    onReady({ user, profile });
  });
}
