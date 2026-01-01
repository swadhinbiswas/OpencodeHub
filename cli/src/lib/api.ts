/**
 * CLI API Client
 * Make authenticated requests to OpenCodeHub
 */

import { getConfig } from "./config.js";

export async function apiCall<T = any>(
    serverUrl: string,
    endpoint: string,
    method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
    body?: any
): Promise<T> {
    const config = getConfig();
    const url = serverUrl || config.serverUrl;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    if (config.token) {
        headers["Authorization"] = `Bearer ${config.token}`;
    }

    const response = await fetch(`${url}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `API error: ${response.status}`);
    }

    return data;
}

export async function getWithAuth<T = any>(endpoint: string): Promise<T> {
    const config = getConfig();
    return apiCall<T>(config.serverUrl, endpoint, "GET");
}

export async function postWithAuth<T = any>(endpoint: string, body: any): Promise<T> {
    const config = getConfig();
    return apiCall<T>(config.serverUrl, endpoint, "POST", body);
}
