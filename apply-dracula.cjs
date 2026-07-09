const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk(path.join(__dirname, 'cli', 'src', 'commands'));
files.push(path.join(__dirname, 'cli', 'src', 'lib', 'branding.ts'));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace chalk colors with Dracula colors
    let original = content;
    
    // We only replace exact matches like chalk.cyan( or chalk.cyan.
    // If it's chalk.cyan` (tagged template), this regex wouldn't catch it, but CLI usually uses chalk.cyan()
    content = content.replace(/chalk\.cyan/g, 'chalk.hex("#8be9fd")');
    content = content.replace(/chalk\.green/g, 'chalk.hex("#50fa7b")');
    content = content.replace(/chalk\.magenta/g, 'chalk.hex("#ff79c6")');
    content = content.replace(/chalk\.yellow/g, 'chalk.hex("#f1fa8c")');
    content = content.replace(/chalk\.red/g, 'chalk.hex("#ff5555")');
    content = content.replace(/chalk\.gray/g, 'chalk.hex("#6272a4")');
    content = content.replace(/chalk\.dim/g, 'chalk.hex("#6272a4")');
    
    // There are some places that do chalk.bold.hex or something? 
    // Wait, chalk.hex("...").bold() is correct.
    // The previous regex converts chalk.green.bold(...) to chalk.hex("#50fa7b").bold(...) which is valid in chalk!

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated ${file}`);
    }
});
