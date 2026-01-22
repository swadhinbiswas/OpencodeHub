import { simpleGit, type SimpleGit } from "simple-git";

export interface RepoInfo {
  owner: string;
  repo: string;
}

function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/i, "");
}

export function parseRepoFromRemoteUrl(url: string): RepoInfo | null {
  try {
    if (!url) return null;

    let path = "";

    if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("ssh://")
    ) {
      const parsed = new URL(url);
      path = parsed.pathname;
    } else if (url.includes(":")) {
      const parts = url.split(":");
      path = parts.slice(1).join(":");
    } else {
      path = url;
    }

    const segments = path.replace(/^\/+/, "").split("/").filter(Boolean);
    if (segments.length < 2) return null;

    const repo = stripGitSuffix(segments.pop() || "");
    const owner = segments.pop() || "";

    if (!owner || !repo) return null;

    return { owner, repo };
  } catch {
    return null;
  }
}

export async function getRepoInfoFromGit(
  git?: SimpleGit,
): Promise<RepoInfo | null> {
  try {
    const client = git ?? simpleGit();
    const remotes = await client.getRemotes(true);
    const origin = remotes.find((r) => r.name === "origin");
    if (!origin?.refs?.push && !origin?.refs?.fetch) return null;

    const remoteUrl = origin.refs.push || origin.refs.fetch;
    if (!remoteUrl) return null;

    return parseRepoFromRemoteUrl(remoteUrl);
  } catch {
    return null;
  }
}
