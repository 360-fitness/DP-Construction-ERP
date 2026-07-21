# DP Construction ERP — Phase 1

**Modules in this phase:** Authentication, Dashboard, Company Settings, Client Management.

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

4. **Composite index note:** the Clients list filters by `archived` and sorts by `createdAt`. The first time you load the Clients page, Firestore may show an error in the browser console with a link that says "create the required index" — click it, wait ~1 minute, and reload. This only happens once.

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

- **Working end-to-end:** login/logout, forgot password, role-based route guards, company settings (incl. logo upload to Storage), full client CRUD with search, archive/restore, auto-numbering (`CLI-0001`), and audit logging on every write.
- **Dashboard placeholders:** Bank Balance, Outstanding Quotes/Invoices, Projects, Payroll — these show "—" with a note, since Quotes/Projects/Invoices/Payroll/Banking don't exist yet. They'll populate automatically once those phases are built, no dashboard changes needed.

---

## 6. Roadmap

- **Phase 2:** Quotes (with PDF generation), Projects, Invoices, Payments.
- **Phase 3:** Expenses, Suppliers, Purchases, Banking & reconciliation.
- **Phase 4:** Payroll, Employees, Timesheets (with GPS clock-in/out).
- **Phase 5:** Reports, Tax module, Document Management, Health & Safety, full Audit Log viewer, PWA install support.

Say the word when you're ready for Phase 2 and I'll build Quotes → Projects → Invoices on top of this same foundation.
