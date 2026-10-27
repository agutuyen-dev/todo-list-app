# API Specification — Todo List App

**Status: FINAL** (unified spec agreed by tmtuyen, gvtmtuyen and agutuyen).
This file is the canonical contract for the API. Any change is agreed with the
team first, then updated here.

## Conventions

- Base URL: `/api` (e.g. `http://localhost:4000/api`)
- Content type: `application/json`
- Authentication: send the JWT on every protected request as
  `Authorization: Bearer <token>`. Auth endpoints return
  `{ "token": "...", "user": { ... } }` (the user object never includes the
  password hash).
- A missing or invalid token returns **401**. Invalid request data returns
  **400**. Successful creates return **201**, reads and updates **200**,
  deletes **204** with no response body.

### Error envelope

Every error response uses the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "details": [{ "field": "title", "message": "Title is required" }]
  }
}
```

- `code` and `message` are always present.
- `details` is present only for validation errors (400), one entry per field.

### List envelope and pagination

List endpoints return:

```json
{ "items": [], "total": 42, "page": 1, "limit": 20 }
```

- `page` defaults to 1, `limit` defaults to 20, maximum `limit` is 100.

## Auth

| Method | Path             | Notes                                   |
| ------ | ---------------- | --------------------------------------- |
| POST   | `/auth/register` | Body: `{ name?, email, password }` → 201 `{ token, user }` |
| POST   | `/auth/login`    | Body: `{ email, password }` → 200 `{ token, user }` |

## Todos

| Method | Path         | Notes                          |
| ------ | ------------ | ------------------------------ |
| GET    | `/todos`     | List, see query params below   |
| POST   | `/todos`     | Create → 201                   |
| GET    | `/todos/:id` | Single todo                    |
| PUT    | `/todos/:id` | Update → 200                   |
| DELETE | `/todos/:id` | Delete → 204                   |

Todo fields in responses:

```json
{
  "id": 1,
  "title": "Buy milk",
  "description": "2 litres",
  "dueDate": "2026-10-30T09:00:00.000Z",
  "priority": "HIGH",
  "status": "TODO",
  "categoryId": 3,
  "categoryName": "Shopping",
  "isOverdue": false,
  "createdAt": "2026-10-27T09:00:00.000Z",
  "updatedAt": "2026-10-27T09:00:00.000Z"
}
```

- `priority` is one of `LOW`, `MEDIUM`, `HIGH` (default `MEDIUM`).
- `status` is one of `TODO`, `IN_PROGRESS`, `DONE` (default `TODO`).
- `description`, `dueDate` and `categoryId` may be `null`.
- Responses include `categoryName` and `isOverdue`, and never include
  `userId` (the owner is implied by the token).
- `isOverdue` is computed by the backend: `true` when a `dueDate` exists, is
  in the past, and the status is not `DONE`.

List query parameters (`GET /todos`):

- `search` — matches `title` and `description`, case-insensitive.
- `status`, `priority`, `categoryId` — exact-match filters.
- `sortBy` — one of `dueDate`, `createdAt`, `priority`, `title`
  (default `createdAt`). `order` — `asc` or `desc` (default `desc`).
  Sorting by `priority` descending means HIGH → MEDIUM → LOW.
- `page`, `limit` — see pagination above.

## Categories

| Method | Path              | Notes              |
| ------ | ----------------- | ------------------ |
| GET    | `/categories`     | List; `search` matches `name` |
| POST   | `/categories`     | Create → 201       |
| GET    | `/categories/:id` | Single category    |
| PUT    | `/categories/:id` | Update → 200       |
| DELETE | `/categories/:id` | Delete → 204       |

Category fields in responses: `id`, `name`, `createdAt`, `updatedAt`.

## Health

`GET /api/health` → `{ "status": "ok" }` (no auth required).
