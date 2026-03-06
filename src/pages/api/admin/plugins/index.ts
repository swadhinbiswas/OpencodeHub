import type { APIRoute } from "astro";
import { z } from "zod";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, forbidden, parseBody, success, unauthorized } from "@/lib/api";
import { pluginManager } from "@/lib/plugins";

const loadSchema = z.object({
  pluginPath: z.string().min(1),
});

export const GET: APIRoute = withErrorHandler(async ({ locals }) => {
  const user = locals.user;
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const plugins = pluginManager.getAllPlugins();
  const states = pluginManager.getPluginStates();
  const stateMap = new Map(states.map((state) => [state.name, state]));

  return success({
    health: pluginManager.getPluginHealth(),
    plugins: plugins.map((plugin) => ({
      ...plugin,
      runtime: stateMap.get(plugin.name) || null,
      config: pluginManager.getPluginConfig(plugin.name),
    })),
  });
});

export const POST: APIRoute = withErrorHandler(async ({ locals, request }) => {
  const user = locals.user;
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const parsed = await parseBody(request, loadSchema);
  if ("error" in parsed) return parsed.error;

  try {
    await pluginManager.loadPlugin(parsed.data.pluginPath);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Failed to load plugin");
  }

  return success({
    loaded: true,
    pluginPath: parsed.data.pluginPath,
    health: pluginManager.getPluginHealth(),
  });
});
