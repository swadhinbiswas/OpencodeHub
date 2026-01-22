/**
 * CLI API Client
 * Make authenticated requests to OpenCodeHub
 */

import fs from "fs";
import { getConfig } from "./config.js";

let tlsConfigured = false;

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
    "Content-Type": "application/json",
  };

  if (config.token) {
    headers["Authorization"] = `Bearer ${config.token}`;
  }

  const maxRetries = method === "GET" ? 2 : 0;
  let attempt = 0;

  while (true) {
    try {
      const response = await fetch(`${url}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

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

        const message =
          typeof data === "string"
            ? data
            : data?.error || `API error: ${response.status}`;
        throw new Error(message);
      }

      return data as T;
    } catch (error) {
      if (attempt < maxRetries) {
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
