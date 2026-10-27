# Todo List App

A full-stack todo list application — Project 01 for the citfl team.

- **Client:** React + TypeScript (Vite)
- **Server:** Node.js + Express (TypeScript), REST API
- **Database:** SQLite via Prisma ORM
- **Auth:** JWT (`Authorization: Bearer <token>`) + bcrypt password hashing

## Repository layout

```
.
├── docs/
│   └── api-spec.md        # Canonical API contract (final, agreed by the team)
├── client/                # Vite + React + TypeScript frontend
│   └── src/
│       ├── api/client.ts  # Fetch wrapper: token handling + error envelope
│       ├── App.tsx        # App shell
│       └── main.tsx
└── server/                # Express + Prisma API
    ├── prisma/
    │   └── schema.prisma  # User, Category, Todo models
    └── src/
        ├── index.ts           # App entry: routes, error handling
        ├── lib/prisma.ts      # Prisma client singleton
        ├── middleware/auth.ts # JWT requireAuth middleware
        ├── routes/            # auth, todos, categories (stubs to implement)
        └── utils/errors.ts    # ApiError + unified error envelope handler
```

## Getting started

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Configure and initialise the database (server/)
cp .env.example .env
npx prisma migrate dev --name init

# Run the API (http://localhost:4000)
npm run dev

# Run the client (http://localhost:5173, proxies /api to the API)
cd ../client && npm run dev
```

Health check: `GET http://localhost:4000/api/health` → `{ "status": "ok" }`

## API contract

The single source of truth is [docs/api-spec.md](docs/api-spec.md): endpoints,
the unified error envelope, status codes, list pagination and sorting rules.
Changes to the contract are agreed in Slack first, then updated in that file.

## Workflow

- One branch per task, named `feature/<area>` (e.g. `feature/backend-auth`,
  `feature/backend-tasks`, `feature/frontend-ui`), pull requests into `main`.
- The team leader reviews every PR before merge.
- Route handlers in `server/src/routes/` are stubs returning
  `501 NOT_IMPLEMENTED` in the standard error envelope — replace them with the
  real implementations per the spec.

## Roadmap

1. **Phase 1 — Foundation:** repo, schema, auth API, frontend shell.
2. **Phase 2 — Main features:** todo & category CRUD, filter / search / sort,
   overdue highlighting.
3. **Phase 3 — Hardening:** cross-testing, bug fixes, demo.

Out of scope for the MVP: list sharing, subtasks, reminders, mobile app,
dark mode.
