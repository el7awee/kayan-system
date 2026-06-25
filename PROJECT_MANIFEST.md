# Project Manifest — منظومة الكيان v6.0 (Kayan System)

## Repository Layout

```
kayan-system/                                # Git root (GitHub Pages host)
│
├── .clasp.json                              # 1 line  — clasp config, rootDir="./backend"
├── .firebaserc                              # 5 lines — Firebase default project: kayan-system-f494f
├── firebase.json                            # 21 lines — Firebase hosting (public: "."),
│                                             #   Firestore rules/indexes, Storage rules
├── firestore.rules                          # 117 lines — Security rules using
│                                             #   request.auth.token.role (custom claims)
├── firestore.indexes.json                   # 4 lines  — 9 composite indexes deployed
├── storage.rules                            # 13 lines — Firebase Storage rules
│
├── PROJECT_MANIFEST.md                      # THIS FILE — master reference document
│
├── index.html                               # 1171 lines — Main frontend: RTL, Tailwind v4 CDN,
│                                             #   Font Awesome, Chart.js, SweetAlert2, XLSX.
│                                             #   11 view sections + login screen.
│                                             #   Bottom nav (mobile) + sidebar (desktop).
│                                             #   Responsive card-table CSS + swipe controls.
│                                             #   Loads: frontend/export.js, app.js
│
├── app.js                                   # 2525 lines — Monolithic frontend app logic.
│                                             #   Contains initApp, callBackend, all load*/
│                                             #   render* functions, bindBottomNav,
│                                             #   initSwipeController, initKeyboardAwareness,
│                                             #   CSRF token management, AppCache LRU,
│                                             #   WRITE_CACHE_INVALIDATION, debounce, esc(),
│                                             #   triggerSettlement, Reports Engine (7 reports),
│                                             #   loadReports, generateReport, renderReportSummary,
│                                             #   renderReportChart, renderReportTable,
│                                             #   exportReportToExcel
│
├── frontend/                                # Modular JS files (created during refactor)
│   ├── constants.js                         # 28 lines  — state, PAGINATION, USE_FIREBASE,
│   │                                         #   BACKEND_API_URL, AppCache class, CACHE_TTL
│   ├── helpers.js                           # 122 lines — esc(), lookup*(), animateCounter(),
│   │                                         #   getPaginatedData(), renderPagination(),
│   │                                         #   debounce(), renderEmptyState()
│   ├── export.js                            # 29 lines  — exportToExcel() with lazy XLSX CDN
│   │                                         #   + CSV fallback (loaded by index.html)
│   ├── firebase-init.js                     # 25 lines  — Firebase SDK init (v8 compat),
│   │                                         #   enablePersistence({ synchronizeTabs: true })
│   └── firebase-db.js                       # 515 lines — Firebase abstraction layer:
│                                             #   _col(), _docRefCache, _findDocRef,
│                                             #   queryCollection, getDashboard (parallel counts),
│                                             #   fbWriteAPI (27 write ops), _safeWrite wrapper
│
├── backend/                                 # OLD Apps Script backend (clasp rootDir)
│   ├── appsscript.json                      # 10 lines  — manifest
│   ├── Code.gs                              # 109 lines — handleRequest WITHOUT middleware (pre-v47)
│   ├── middleware.gs                        # 295 lines — ROLE_PERMISSIONS, token/role/CSRF
│   ├── router.gs                           # 795 lines — WITH duplicate auth checks (pre-v47)
│   ├── authService.gs                       # 450 lines — login, token, password hash, user CRUD
│   ├── tripServices.gs                      # 457 lines — trip CRUD, status FSM, settlement
│   ├── expenseService.gs                    # 259 lines — expense CRUD
│   ├── fuelService.gs                       # 407 lines — fuel balance, transactions, price
│   ├── vehicleService.gs                    # 191 lines — vehicle CRUD
│   ├── driverService.gs                     # 331 lines — driver CRUD, advance management
│   ├── clientService.gs                     # 199 lines — client CRUD
│   ├── balanceService.gs                    # 260 lines — balance add/deduct/transfer
│   ├── notificationService.gs               # 273 lines — notification CRUD
│   ├── archiveService.gs                    # 97 lines  — trip soft-delete → archive
│   ├── maintenanceService.gs                # 182 lines — maintenance CRUD
│   ├── migrationExport.gs                   # 194 lines — data export for Firestore migration
│   ├── permissionService.gs                 # 190 lines — permissions matrix from Sheets
│   ├── observability.gs                     # 85 lines  — timer/profiling utilities
│   └── utils.gs                             # 115 lines — sheet helpers, ID gen, cache
│
├── backend-gs/                              # CURRENT v47 Apps Script backend
│   ├── appsscript.json                      # 13 lines  — updated manifest (runtime V8)
│   ├── Code.gs                              # 164 lines — handleRequest WITH activated
│   │                                         #   executeMiddlewarePipeline for all non-login
│   │                                         #   requests. Distinguishes business errors
│   │                                         #   (INVALID_TOKEN, CSRF_MISSING) from system errors
│   ├── middleware.gs                        # 315 lines — Activated pipeline + validateCSRFToken.
│   │                                         #   ROLE_PERMISSIONS (4 roles × 55+ actions),
│   │                                         #   checkIdempotency, validateBusinessConstraints
│   ├── router.gs                           # 714 lines — CLEANED: removed duplicate token+
│   │                                         #   permission validation. Uses validated userId/role
│   │                                         #   from middleware. 7 report actions registered.
│   ├── authService.gs                       # 450 lines — CSRF_Token column (N), login generates
│   │                                         #   + stores + returns csrf_token
│   ├── tripServices.gs                      # 418 lines — trip CRUD, status FSM, settlement
│   ├── expenseService.gs                    # 220 lines — expense CRUD
│   ├── fuelService.gs                       # 357 lines — fuel balance + transactions + price
│   ├── vehicleService.gs                    # 191 lines — vehicle CRUD
│   ├── driverService.gs                     # 331 lines — driver CRUD, advance management
│   ├── clientService.gs                     # 199 lines — client CRUD
│   ├── balanceService.gs                    # 260 lines — balance add/deduct/transfer
│   ├── notificationService.gs               # 273 lines — notification CRUD
│   ├── reportService.gs                     # 524 lines — Reports Engine: 7 reports with
│   │                                         #   queryRange_ helper (date-range filter),
│   │                                         #   getProfitLoss, getExpenseBreakdown,
│   │                                         #   getFuelSummary, getDriverPerformance,
│   │                                         #   getClientActivity, getMonthlyTrends,
│   │                                         #   getVehicleUtilization
│   ├── archiveService.gs                    # 97 lines  — trip soft-delete → archive
│   ├── observability.gs                     # 85 lines  — timer/profiling
│   └── utils.gs                             # 115 lines — helpers, ID gen, cache
│                                             #   (NO maintenanceService.gs, NO migrationExport.gs,
│                                             #    NO permissionService.gs — these are in backend/)
│
├── migration/                               # Node.js migration scripts (firebase-admin SDK)
│   ├── .gitignore                           # 3 lines
│   ├── package.json                         # 18 lines  — firebase-admin dependency
│   ├── package-lock.json                    # 2094 lines — lockfile
│   ├── createAuthUsers.js                   # 37 lines  — creates 5 Firebase Auth users
│   ├── importToFirestore.js                 # 111 lines — initial data import from Sheets
│   ├── reimport_fresh.js                    # 52 lines  — re-import with fresh Firestore docs
│   └── setCustomClaims.js                   # 28 lines  — sets role/user_id/username on UIDs
│
└── .git/                                    # Git metadata (not deployed)
```

---

## Configuration Summary

| File | Purpose |
|------|---------|
| `.clasp.json` | Apps Script script ID + rootDir (old: `./backend`) |
| `.firebaserc` | Default Firebase project: `kayan-system-f494f` |
| `firebase.json` | Hosting root = `.`, rewrites all paths → index.html (SPA) |
| `firestore.rules` | Allows read/write for authenticated users with `request.auth.token.role` |
| `firestore.indexes.json` | 9 composite indexes for trips, expenses, fuel, balance queries |
| `storage.rules` | Firebase Storage: authenticated read/write |

---

## File Size Summary

| Directory | Files | Total Lines | Role |
|-----------|-------|-------------|------|
| Root | 7 | ~3650 | App config + monolithic frontend + manifest |
| `backend/` (OLD) | 19 | ~4500 | Legacy Apps Script backend |
| `backend-gs/` (CURRENT v47) | 17 | ~4300 | Current Apps Script backend + Reports Engine |
| `frontend/` | 5 | ~720 | Modular JS (loaded via `frontend/export.js` + app.js) |
| `migration/` | 6 | ~2300 | Firebase migration scripts (+node_modules) |
| **Total** | **54** | **~15470** | |

---

## Key Design Differences: `backend/` vs `backend-gs/`

| Aspect | `backend/` (OLD) | `backend-gs/` (CURRENT v47) |
|--------|------------------|------------------------------|
| Middleware | Pipeline code exists but NOT called in Code.gs | Pipeline ACTIVATED in Code.gs |
| CSRF | None | Full: generate → store → validate |
| Router | Has duplicate token+RBAC checks (30+ lines) | Clean — relies on middleware result |
| `permissionService.gs` | Exists | Not ported (merged into middleware) |
| `maintenanceService.gs` | Exists | Not ported (not yet needed) |
| `migrationExport.gs` | Exists | Not ported (one-time use) |
| Reports Engine | None | `reportService.gs` with 7 reports |
| Deployed as | v1–v46 | v47 (current live) |

---

## Data Flow (Current — v47)

```
User clicks "توليد التقرير" (Generate Report)
  │
  ▼
app.js: generateReport()
  → reads report type, date range, year from UI
  → callBackend("getProfitLoss"/"getExpenseBreakdown"/...)
    │
    ├─ appends: Session_Token, User_ID, User_Role
    ├─ POSTs FormData to BACKEND_API_URL (v47 deployment)
    │
    ▼
Code.gs: handleRequest
  ├─ Parse FormData
  ├─ Rate limit check
  ├─ executeMiddlewarePipeline(e, action)
  │   ├─ validateAuthenticationAndRBAC
  │   └─ (no CSRF needed — reports are read-only)
  ├─ routeRequest(action, parameters, userId, role)
  │   └─ reportService_get*(parameters)
  │       ├─ queryRange_(sheet, dateColIndex, fromDate, toDate)
  │       │   └─ Filters rows by date range, max 5000 rows, returns Array
  │       ├─ Aggregates data (SUM, COUNT, GROUP BY)
  │       └─ Returns { success: true, data: { summary, breakdown, chart } }
  │
  ▼
Frontend: renderReport(type, data)
  ├─ renderReportSummary → 4 metric cards
  ├─ renderReportChart → Chart.js (bar/pie)
  └─ renderReportTable → data table + Export Excel button
```

**Write operations** (trip create, expense add, etc.) follow same flow with:
- `LockService` for concurrency
- `Idempotency_Key` check for dedup (5min window)
- `CSRF_Token` validation

---

## Security Architecture

| Layer | Mechanism | File |
|-------|-----------|------|
| Authentication | Session token (SHA-256 password, UUID token, 30min expiry) | `authService.gs` |
| Authorization | RBAC matrix — 4 roles × 55+ actions | `middleware.gs` |
| CSRF | Per-user token stored in Users col N, validated on writes | `middleware.gs:validateCSRFToken` |
| Rate limit | Per-user/minute counter via CacheService | `Code.gs` |
| Idempotency | 5min dedup window via Idempotency_Cache sheet | `middleware.gs:checkIdempotency` |
| Concurrency | LockService tryLock(3000ms) on writes | `router.gs` |
| Business rules | Trip FSM, resource busy detection | `middleware.gs:validateBusinessConstraints` |
| XSS prevention | `esc()` on all innerHTML | `app.js` |

---

## Performance Strategy

| Optimization | Details |
|-------------|---------|
| AppCache LRU | Map with max 50 entries, TTLs: 30s–5min, sessionStorage persist |
| Cache invalidation | `WRITE_CACHE_INVALIDATION` map — clears specific keys per write action |
| Firebase `queryCollection` | `where/orderBy/limit` instead of full `get()` |
| Dashboard | 6 parallel count queries (~8 reads vs ~905) |
| `_docRefCache` | Caches document references to eliminate read-before-write |
| `tryFirebaseWithFallback` | `Promise.race` with 3s timeout → Firebase or Apps Script |
| Script loading | Preconnect hints, deferred non-critical scripts, lazy XLSX (600KB saved) |
| Event delegation | Expense table actions via 1 listener on container |
| Reports `queryRange_` | Date-range filtering, max 5000 row cap, reads from latest rows first |

---

## Mobile UX

| Component | Details |
|-----------|---------|
| Bottom nav | 5 primary tabs + "More" overlay sheet with 7 items |
| Responsive tables | `display: block` on `<768px`, `data-label` on all `<td>`, `::before` labels |
| Swipe gestures | `initSwipeController` — swipe left reveals actions on touch devices |
| Keyboard awareness | `initKeyboardAwareness` — auto-scroll inputs into view on mobile |
| Safe area | `env(safe-area-inset-bottom)` on bottom nav + overlay |

---

## Reports Engine (v47 — NEW)

| # | Report | Source Sheets | Key Metrics | Access |
|---|--------|---------------|-------------|--------|
| 1 | P&L Summary | Trips_Log, Expenses_Log | Revenue, Expenses, Net, Margin %, Category breakdown | All roles |
| 2 | Expense Breakdown | Expenses_Log | By category: amount + % of total | All roles |
| 3 | Fuel Summary | Fuel_Transactions | Per vehicle: liters, cost, avg price, count | Admin, Manager, Accountant |
| 4 | Driver Performance | Trips_Log, Drivers | Per driver: trips, revenue, avg/trip, advance | Admin, Manager, Accountant |
| 5 | Client Activity | Trips_Log, Clients | Per client: trips, revenue, avg/trip | Admin, Manager, Accountant |
| 6 | Monthly Trends | Trips_Log, Expenses_Log | 12-month: revenue, expense, net per month | All roles |
| 7 | Vehicle Utilization | Trips_Log, Vehicles, Fuel_Transactions | Per vehicle: trips, revenue, fuel cost, net | All roles |

---

## Current Deployment

| Component | URL / ID | Version |
|-----------|----------|---------|
| GitHub Pages | `https://el7awee.github.io/kayan-system/` | v47 (commit `d94efa5`) |
| Apps Script | `https://script.google.com/macros/s/AKfycbx8eJLgqDVpKdMnSK12uT8T2AdweI8ZPCjHWtCn9ys9dEcHm62Re0FLoKepKGipyu9F/exec` | v47 |
| Script ID | `1Ok92AhpZmyiRk21cZoLkWU6dQYuliLxZBk9yyJQOSmVdWlvPKTxZiLcZ` | — |
| Firebase project | `kayan-system-f494f` | — |
| Firebase config | `apiKey: AIzaSyCyQQiA4amVXPzPPtY74n_RsVKq0tk4GQ8` | — |
| Service Account | `firebase-adminsdk-fbsvc@kayan-system-f494f.iam.gserviceaccount.com` | — |

---

## Standing Instructions

> **PROJECT_MANIFEST.md is the Source of Truth.** Every feature addition, architecture modification, or file structure change MUST be accompanied by an update to this file as part of the deployment process.
