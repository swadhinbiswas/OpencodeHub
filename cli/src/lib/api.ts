/**
 * CLI API Client
 * Make authenticated requests to OpenCodeHub
 */

import fs from "fs";
import { parseApiErrorMessage } from "./api-error.js";
import { getConfig } from "./config.js";

let tlsConfigured = false;
const DEFAULT_TIMEOUT_MS = 15000;

export function applyTlsConfig() {
  if (tlsConfigured) return;

  const config = getConfig();

  if (config.caFile) {
    if (!fs.existsSync(config.caFile)) {
      throw new Error(`CA file not found: ${config.caFile}`);
    }
    process.env.NODE_EXTRA_CA_CERTS = config.caFile;
  }

  if (config.insecure) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  tlsConfigured = true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function getRequestTimeoutMs() {
  const raw = process.env.OCH_HTTP_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

function isRetriableNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const message = String(record.message || "").toLowerCase();
  const code = String(record.code || "").toUpperCase();
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    message.includes("timed out") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("aborted")
  );
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";
  if (!rawText.trim()) return null;

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawText);
    } catch {
      // Return text fallback for malformed JSON payloads.
      return rawText;
    }
  }

  return rawText;
}

export async function apiCall<T = any>(
  serverUrl: string,
  endpoint: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: any,
): Promise<T> {
  applyTlsConfig();

  const config = getConfig();
  const url = serverUrl || config.serverUrl;

  if (!url) {
    throw new Error(
      "Server URL not configured. Run 'och config set serverUrl <url>' or 'och auth login --url <url>'.",
    );
  }

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    "Content-Type": "application/json",
    "User-Agent": "opencodehub-cli/1.1.0",
  };

  if (config.token) {
    headers["Authorization"] = `Bearer ${config.token}`;
  }

  const maxRetries = method === "GET" ? 2 : 0;
  let attempt = 0;

  while (true) {
    try {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(
        () => controller.abort(),
        getRequestTimeoutMs(),
      );

      let response: Response;
      try {
        response = await fetch(`${url}${endpoint}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutHandle);
      }

      const data = await parseResponseBody(response);

      if (!response.ok) {
        if (attempt < maxRetries && shouldRetry(response.status)) {
          const retryAfter = response.headers.get("retry-after");
          const retryAfterMs =
            retryAfter && !Number.isNaN(Number(retryAfter))
              ? Number(retryAfter) * 1000
              : undefined;
          const delay = retryAfterMs ?? 300 * Math.pow(2, attempt);
          attempt += 1;
          await sleep(delay);
          continue;
        }

        const message = parseApiErrorMessage(response.status, data);
        throw new Error(message);
      }

      return data as T;
    } catch (error) {
      if (attempt < maxRetries && isRetriableNetworkError(error)) {
        attempt += 1;
        await sleep(300 * Math.pow(2, attempt - 1));
        continue;
      }

      throw error;
    }
  }
}

export async function getWithAuth<T = any>(endpoint: string): Promise<T> {
  const config = getConfig();
  return apiCall<T>(config.serverUrl, endpoint, "GET");
}

export async function postWithAuth<T = any>(
  endpoint: string,
  body: any,
): Promise<T> {
  const config = getConfig();
  return apiCall<T>(config.serverUrl, endpoint, "POST", body);
}

export async function patchWithAuth<T = any>(
  endpoint: string,
  body: any,
): Promise<T> {
  const config = getConfig();
  return apiCall<T>(config.serverUrl, endpoint, "PATCH", body);
}

export async function deleteWithAuth<T = any>(endpoint: string): Promise<T> {
  const config = getConfig();
  return apiCall<T>(config.serverUrl, endpoint, "DELETE");
}
