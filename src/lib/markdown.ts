import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { visit } from "unist-util-visit";
import type { Text, Parent } from "mdast";

// Plugin to link owner/repo#123
function remarkCrossRepoLinks() {
  return (tree: any) => {
    visit(tree, "text", (node: Text, index, parent: Parent) => {
      const value = node.value;
      // Regex: owner/repo#123
      const regex = /\b([a-zA-Z0-9-]+)\/([a-zA-Z0-9-_\.]+)\#(\d+)\b/g;

      if (!regex.test(value)) return;

      const children = [];
      let lastIndex = 0;
      let match;

      regex.lastIndex = 0; // Reset
      while ((match = regex.exec(value)) !== null) {
        const start = match.index;
        const end = regex.lastIndex;
        const [fullMatch, owner, repo, number] = match;

        // Text before match
        if (start > lastIndex) {
          children.push({ type: "text", value: value.slice(lastIndex, start) });
        }

        // Link
        children.push({
          type: "link",
          url: `/${owner}/${repo}/issues/${number}`,
          title: null,
          children: [{ type: "text", value: fullMatch }],
          data: {
            hProperties: { className: ["issue-link"] }
          }
        });

        lastIndex = end;
      }

      // Text after last match
      if (lastIndex < value.length) {
        children.push({ type: "text", value: value.slice(lastIndex) });
      }

      // Replace node with children
      if (parent && typeof index === "number") {
        parent.children.splice(index, 1, ...(children as any));
        return index + children.length; // Skip over new nodes
      }
    });
  };
}

export async function renderMarkdown(content: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkCrossRepoLinks) // Add custom plugin
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(content);

  return String(file);
}
