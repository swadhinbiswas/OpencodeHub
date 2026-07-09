import fs from 'fs';
import path from 'path';

function processDirectory(dirPath) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.md') || fullPath.endsWith('.mdx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (!content.startsWith('---')) {
                // Find the first heading if it exists
                const headingMatch = content.match(/^#\s+(.+)$/m);
                let title = 'Untitled';
                if (headingMatch) {
                    title = headingMatch[1].replace(/"/g, '\\"');
                } else {
                    // Use filename as fallback title
                    title = path.basename(file, path.extname(file)).replace(/-/g, ' ');
                    title = title.charAt(0).toUpperCase() + title.slice(1);
                }
                
                const frontmatter = `---\ntitle: "${title}"\n---\n\n`;
                fs.writeFileSync(fullPath, frontmatter + content);
                console.log(`Added frontmatter to ${fullPath}`);
            }
        }
    }
}

processDirectory('./src/content/docs');
