// Thin fetch wrapper for the Todo List API.
// Attaches the JWT as `Authorization: Bearer <token>` and surfaces errors
// from the unified error envelope (see docs/api-spec.md).

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";
const TOKEN_KEY = "todo-list-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string }[];
  };
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const body = data as ApiErrorBody | null;
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}
