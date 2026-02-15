
import type { APIRoute } from "astro";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import { logger } from "@/lib/logger";

const TEMPLATES_DIR = join(process.cwd(), "src/lib/templates/workflows");

export interface WorkflowTemplate {
    id: string;
    name: string;
    filename: string;
    content: string;
}

export const GET: APIRoute = async () => {
    try {
        const files = await readdir(TEMPLATES_DIR);
        const templates: WorkflowTemplate[] = [];

        for (const file of files) {
            if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;

            const content = await readFile(join(TEMPLATES_DIR, file), "utf-8");
            let name = file;

            try {
                const parsed = yaml.load(content) as any;
                if (parsed && parsed.name) {
                    name = parsed.name;
                }
            } catch (e) {
                // Ignore parsing error, use filename
            }

            templates.push({
                id: file.replace(/\.(yml|yaml)$/, ""),
                name,
                filename: file,
                content
            });
        }

        return new Response(JSON.stringify(templates), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        logger.error({ err: error }, "Failed to list workflow templates");
        return new Response(JSON.stringify({ error: "Failed to load templates" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
