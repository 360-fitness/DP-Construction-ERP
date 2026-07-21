// =============================================================
// COUNTER SERVICE
// Firestore transaction-based atomic counters so two users creating
// a client (or quote, invoice, etc.) at the same moment never get
// the same number. Counters live in /settings/counters.
// =============================================================

import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase/firebase-init.js";
import { padCode, padYearCode } from "../utils/validators.js";

const COUNTER_DOC = doc(db, "settings", "counters");

// key examples: "clients", "quotes", "invoices", "projects", "suppliers", "expenses", "purchaseOrders", "employees"
export async function getNextCode(key, { prefix, yearScoped = false, width = 4 }) {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(COUNTER_DOC);
    const data = snap.exists() ? snap.data() : {};
    const year = new Date().getFullYear();

    let current = data[key];
    let nextValue;
    let code;

    if (yearScoped) {
      // Reset the counter automatically when the year rolls over.
      if (!current || current.year !== year) {
        nextValue = 1;
      } else {
        nextValue = (current.value || 0) + 1;
      }
      code = padYearCode(prefix, year, nextValue, width);
      tx.set(COUNTER_DOC, { ...data, [key]: { year, value: nextValue } }, { merge: true });
    } else {
      nextValue = (current || 0) + 1;
      code = padCode(prefix, nextValue, width);
      tx.set(COUNTER_DOC, { ...data, [key]: nextValue }, { merge: true });
    }

    return code;
  });
}
