import "server-only";
import { cookies, headers } from "next/headers";

const baseUrl = (process.env.BACKOFFICE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export class BackOfficeApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
  }
}

async function authorizationHeader(): Promise<string> {
  const incomingHeaders = await headers();
  const forwarded = incomingHeaders.get("authorization");
  if (forwarded?.startsWith("Bearer ")) return forwarded;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("nolivendaz_access_token")?.value;
  if (sessionToken) return `Bearer ${sessionToken}`;

  if (process.env.NODE_ENV !== "production" && process.env.BACKOFFICE_DEV_BEARER_TOKEN) {
    return `Bearer ${process.env.BACKOFFICE_DEV_BEARER_TOKEN}`;
  }

  throw new BackOfficeApiError(401, "Operator session is not available", "OPERATOR_SESSION_REQUIRED");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const incomingHeaders = await headers();
  const correlationId = incomingHeaders.get("x-correlation-id") ?? crypto.randomUUID();
  const authorization = await authorizationHeader();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization,
      "x-correlation-id": correlationId,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers
    }
  });

  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { message: text }; }
  }

  if (!response.ok) {
    const objectPayload = payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : {};
    throw new BackOfficeApiError(
      response.status,
      typeof objectPayload.message === "string" ? objectPayload.message : `API request failed (${response.status})`,
      typeof objectPayload.error === "string" ? objectPayload.error : undefined
    );
  }

  return payload as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await request<{ data: T }>(path);
  return response.data;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await request<{ data: T }>(path, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return response.data;
}
