import type { APIRoute } from "astro";
import { z } from "zod";
import { withErrorHandler } from "@/lib/errors";
import { badRequest, forbidden, notFound, parseBody, success, unauthorized } from "@/lib/api";
import { pluginManager } from "@/lib/plugins";

const patchSchema = z.object({
  action: z.enum(["enable", "disable", "reload", "unload"]),
  config: z.record(z.unknown()).optional(),
});

export const GET: APIRoute = withErrorHandler(async ({ locals, params }) => {
  const user = locals.user;
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const name = params.name;
  if (!name) return badRequest("Missing plugin name");

  const plugin = pluginManager.getPlugin(name);
  if (!plugin) return notFound("Plugin not found");

  return success({
    plugin,
    runtime: pluginManager.getPluginState(name) || null,
    config: pluginManager.getPluginConfig(name),
  });
});

export const PATCH: APIRoute = withErrorHandler(async ({ locals, params, request }) => {
  const user = locals.user;
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const name = params.name;
  if (!name) return badRequest("Missing plugin name");

  const plugin = pluginManager.getPlugin(name);
  if (!plugin) return notFound("Plugin not found");

  const parsed = await parseBody(request, patchSchema);
  if ("error" in parsed) return parsed.error;

  try {
    if (parsed.data.config) {
      pluginManager.setPluginConfig(name, parsed.data.config);
    }

    if (parsed.data.action === "enable") {
      pluginManager.enablePlugin(name);
    } else if (parsed.data.action === "disable") {
      pluginManager.disablePlugin(name);
    } else if (parsed.data.action === "reload") {
      await pluginManager.reloadPlugin(name);
    } else if (parsed.data.action === "unload") {
      await pluginManager.unloadPlugin(name);
      return success({
        name,
        action: "unload",
        unloaded: true,
      });
    }
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Plugin operation failed");
  }

  return success({
    name,
    action: parsed.data.action,
    runtime: pluginManager.getPluginState(name) || null,
    config: pluginManager.getPluginConfig(name),
  });
});
