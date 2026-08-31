export type GitHubRepository = {
  id: number;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  htmlUrl: string;
};

export type GitHubContent = {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
  size: number;
  downloadUrl: string | null;
};

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";
const MAX_CONTENT_BYTES = 1_000_000;

function headers(token?: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "CodeForge-Mobile/1.0",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function githubFetch<T>(path: string, token?: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  const response = await fetchImpl(`${API_BASE}${path}`, { headers: headers(token) });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
  return (await response.json()) as T;
}

export async function getRepository(owner: string, repo: string, token?: string, fetchImpl: typeof fetch = fetch): Promise<GitHubRepository> {
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("Invalid repository identifier");
  const value = await githubFetch<{ id: number; full_name: string; default_branch: string; private: boolean; html_url: string }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token, fetchImpl);
  return { id: value.id, fullName: value.full_name, defaultBranch: value.default_branch, isPrivate: value.private, htmlUrl: value.html_url };
}

export async function listContents(owner: string, repo: string, path = "", token?: string, fetchImpl: typeof fetch = fetch): Promise<GitHubContent[]> {
  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) throw new Error("Invalid repository path");
  const encodedPath = path ? `/${path.split("/").map(encodeURIComponent).join("/")}` : "";
  const value = await githubFetch<Array<{ name: string; path: string; sha: string; type: "file" | "dir"; size?: number; download_url?: string | null }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${encodedPath}`, token, fetchImpl);
  return value.map((item) => ({ name: item.name, path: item.path, sha: item.sha, type: item.type, size: item.size ?? 0, downloadUrl: item.download_url ?? null })).filter((item) => item.size <= MAX_CONTENT_BYTES);
}

export const GITHUB_LIMITS = { MAX_CONTENT_BYTES } as const;
