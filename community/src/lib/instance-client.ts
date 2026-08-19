export interface InstanceInfo {
  product: string; name: string; siteUrl: string; version: string; capabilities: string[];
}
export interface RemoteRepo {
  id: string; name: string; fullName: string; description: string | null;
  visibility: string; defaultBranch: string; starCount: number; forkCount: number; watchCount: number;
  language: string | null; topics: string[]; httpCloneUrl: string; updatedAt: string; createdAt: string;
  owner: { id: string; username: string; displayName: string | null; avatarUrl: string | null; };
}

export async function probeInstance(baseUrl: string): Promise<{ ok: true; info: InstanceInfo } | { ok: false; error: string }> {
  try {
    const origin = new URL(baseUrl).origin;
    const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 8000);
    const res = await fetch(`${origin}/api/instance`, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: `Instance probe failed: ${res.status}` };
    const json = await res.json();
    if (json?.data?.product !== "opencodehub") return { ok: false, error: "Not an OpenCodeHub instance" };
    return { ok: true, info: json.data as InstanceInfo };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

export async function fetchPublicRepos(origin: string, page = 1, perPage = 50): Promise<{ repos: RemoteRepo[]; total: number; totalPages: number }> {
  const url = `${new URL(origin).origin}/api/repos?visibility=public&sort=updated&page=${page}&per_page=${perPage}`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "CommunityHub/1.0" } });
  if (!res.ok) throw new Error(`Failed to fetch repos: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Failed");
  return { repos: json.data as RemoteRepo[], total: json.meta?.total || json.data.length, totalPages: json.meta?.totalPages || 1 };
}

export async function fetchAllPublicRepos(origin: string): Promise<RemoteRepo[]> {
  let page = 1; const all: RemoteRepo[] = [];
  while (true) {
    const { repos, totalPages } = await fetchPublicRepos(origin, page, 100);
    all.push(...repos);
    if (page >= totalPages || repos.length === 0) break;
    page++; await new Promise(r=>setTimeout(r,150));
  }
  return all;
}
