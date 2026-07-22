# DP Construction ERP — Phase 1 + Phase 2 + Phase 3

**Phase 1 modules:** Authentication, Dashboard, Company Settings, Client Management.
**Phase 2 modules:** Quotes, Projects, Invoices & Payments — with PDF generation and the full Quote → Project / Quote → Invoice conversion workflow.
**Phase 3 modules:** Expenses, Suppliers, Purchase Orders, Banking & manual reconciliation.

---

## 1. Connect it to your Firebase project

1. Open `js/firebase/firebase-config.js` and replace the placeholder values with the real config object from **Firebase Console → Project Settings → General → Your apps → SDK setup and configuration**.

2. **Create your first user's profile.** Firebase Authentication (the email/password login) and Firestore (where roles live) are separate systems — creating a user in Authentication does *not* automatically give them a role. For every user you add in **Authentication → Users**, you must also create a matching document:

   - Go to **Firestore Database → Start collection** → collection ID: `users`
   - Document ID: paste the user's **UID** (copy it from the Authentication → Users list)
   - Add these fields:
     | Field | Type | Example |
     |---|---|---|
     | `role` | string | `Administrator` (or `Director`, `Bookkeeper`, `Employee`) |
     | `displayName` | string | `Dawie Pretorius` |
     | `email` | string | `dawie@dpconstruction.co.za` |

   Without this document, the person can log in but will immediately be redirected back to the login page with a "no company profile" message. This is intentional — it stops unassigned accounts from touching data.

3. **Publish the security rules.** Copy the contents of `firestore.rules` into **Firestore Database → Rules** and click Publish. Do the same with `storage.rules` under **Storage → Rules**. Without this, Firestore's default rules will block every read/write.

4. **Composite index note:** several list pages (Clients, Quotes, Projects, Invoices) sort by `createdAt`, and Clients additionally filters by `archived`. The first time you open a page like this, Firestore may show an error in the browser console with a link that says "create the required index" — click it, wait ~1 minute, and reload. This only happens once per query shape, so you may see it a handful of times total across Clients, Quotes, Projects and Invoices as you visit each page for the first time.

---

## 2. Run it locally

Because this uses ES6 modules (`type="module"`), you can't just double-click `index.html` — browsers block module imports over `file://`. Serve it locally instead:

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000
```

Or use the VS Code "Live Server" extension if you prefer.

---

## 3. Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. Go to the repo's **Settings → Pages**.
3. Under "Build and deployment", set **Source: Deploy from a branch**, branch: `main`, folder: `/ (root)`.
4. Save. Your app will be live at `https://<your-username>.github.io/<repo-name>/` within a minute or two.
5. Back in Firebase Console → Authentication → Settings → **Authorized domains**, add your GitHub Pages domain (e.g. `your-username.github.io`) or login will silently fail there.

---

## 4. Folder structure

```
/assets
  /css        → main.css (design system), auth.css (login page)
  /images
  /icons
/js
  /firebase   → firebase-config.js (your keys), firebase-init.js
  /services   → auth, client, settings, counter, audit, dashboard
  /components → sidebar.js (nav + theme toggle)
  /pages      → per-page logic (login.js, dashboard.js, clients.js, settings.js)
/pages        → the actual HTML pages
index.html    → redirects to login or dashboard
firestore.rules
storage.rules
```

Every later phase slots into this same structure — a new Firestore-backed module means one new file in `/js/services`, one new page in `/pages` + `/js/pages`, and one new line in the sidebar's nav list.

---

## 5. What's real vs. placeholder right now

- **Working end-to-end (Phase 1):** login/logout, forgot password, role-based route guards, company settings, full client CRUD with search, archive/restore, auto-numbering (`CLI-0001`), audit logging on every write. The company logo is bundled as a static file rather than uploaded to Cloud Storage, so it works on Firebase's free Spark plan — no billing required.
- **Working end-to-end (Phase 2):** Quotes (auto-numbered, line items, PDF, status workflow), Projects (with a financial detail view), Invoices (line items, PDF, payment recording with automatic status updates), and the full Quote → Project / Quote → Invoice conversion flow.
- **Working end-to-end (Phase 3):**
  - **Suppliers** — auto-numbered (`SUP-0001`), contact details, credit terms, and a running **outstanding balance** that updates automatically whenever a Purchase Order is created or marked Paid.
  - **Purchase Orders** — auto-numbered (`PO-0001`), live inside the Suppliers page as a second tab. Creating one **automatically creates a matching Expense record** and adds to the supplier's outstanding balance, all in a single atomic transaction — exactly the "automatically updates expenses" behaviour from the spec.
  - **Expenses** — auto-numbered (`EXP-0001`), all ten categories from the spec (Fuel, Materials, Tools, Office, Advertising, Vehicles, Insurance, Maintenance, Equipment, Utilities) plus "Other", can be linked to a Project and/or Supplier, tracks VAT and payment method separately.
  - **Receipts** — since Cloud Storage needs the paid Blaze plan, receipt photos are compressed in the browser and stored directly in the database instead (same trick used for the company logo). This works well for a single phone photo of a receipt (roughly under 700KB after compression) but isn't meant for large multi-page scans — if a photo can't be compressed small enough, the app tells you and saves the record without the image rather than failing silently.
  - **Banking** — a manual transaction ledger (Income, Expense, Transfer, Interest, Bank Charge) with a running balance and a per-transaction "reconciled" checkbox, matching the spec's "Manual Bank Reconciliation." This is deliberately manual entry, not a live bank feed — an automatic feed needs a paid third-party banking API, which is out of scope for a free-tier build.
  - **Projects** now show a real cost breakdown by category and a calculated Gross Profit / margin %, pulling from actual linked Expenses instead of the Phase 2 placeholder.
  - **Dashboard** now shows real Bank Balance, Money Owing (sum of all suppliers' outstanding balances), Monthly Expenses, and Monthly Profit (income received minus expenses recorded this month).
- **Still placeholder:** Payroll Due — needs Phase 4.

---

## 6. Roadmap

- ~~**Phase 2:** Quotes (with PDF generation), Projects, Invoices, Payments.~~ ✅ Done
- ~~**Phase 3:** Expenses, Suppliers, Purchases, Banking & reconciliation.~~ ✅ Done
- **Phase 4:** Payroll, Employees, Timesheets (with GPS clock-in/out).
- **Phase 5:** Reports, Tax module, Document Management, Health & Safety, full Audit Log viewer, PWA install support.

Say the word when you're ready for Phase 4 and I'll build Employees → Timesheets → Payroll on top of this same foundation.
