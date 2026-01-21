import type { APIRoute } from "astro";

/**
 * Redirect /owner/repo.git to /owner/repo
 * This handles the case when a user visits the .git URL directly in a browser
 */
export const GET: APIRoute = async ({ params, redirect }) => {
    const { owner, repo } = params;

    if (!owner || !repo) {
        return new Response("Not Found", { status: 404 });
    }

    // Remove .git suffix from repo name if present
    const repoName = repo.endsWith(".git") ? repo.slice(0, -4) : repo;

    return redirect(`/${owner}/${repoName}`, 302);
};

// Also handle POST for git operations that come without a path
export const POST: APIRoute = async ({ params }) => {
    return new Response("Bad Request", { status: 400 });
};
