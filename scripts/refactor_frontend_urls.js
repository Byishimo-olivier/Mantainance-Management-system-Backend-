const fs = require('fs');
const path = require('path');
const glob = require('glob'); // Need to check if glob is available, if not use recursive walk

function walk(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') {
                walk(filePath, fileList);
            }
        } else {
            if (file.endsWith('.jsx') || file.endsWith('.js')) {
                fileList.push(filePath);
            }
        }
    });
    return fileList;
}

const frontendDir = path.resolve(__dirname, '../../frontend/src');
console.log('Scanning directory:', frontendDir);

const files = walk(frontendDir);
console.log(`Found ${files.length} files.`);

let changedCount = 0;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Replace backtick string occurrences: `http://localhost:5000...` -> `${import.meta.env.VITE_API_URL}...`
    // We use a regex that matches `http://localhost:5000 and captures the rest of the string if it's inside a template literal check?
    // Actually, standard string replaceAll is safest for the prefix.

    // 1. Handle Template Literals: `http://localhost:5000
    // CASE: `http://localhost:5000/api/...`
    // REPLACEMENT: `${import.meta.env.VITE_API_URL}/api/...`
    // Note: we need to escape the special chars for regex if using regex, or just string replace.
    // Using global replace for the string literal `http://localhost:5000 inside backticks is tricky because we don't capture backticks easily.
    // However, based on the codebase, it's used as a prefix.

    // Strategy: 
    // Replace `http://localhost:5000 wih `${import.meta.env.VITE_API_URL}
    content = content.replace(/`http:\/\/localhost:5000/g, '`${import.meta.env.VITE_API_URL}');

    // 2. Handle Single Quotes: 'http://localhost:5000
    // CASE: 'http://localhost:5000/api/...'
    // REPLACEMENT: import.meta.env.VITE_API_URL + '/api/...'
    content = content.replace(/'http:\/\/localhost:5000/g, "import.meta.env.VITE_API_URL + '");

    // 3. Handle Double Quotes: "http://localhost:5000
    // CASE: "http://localhost:5000/api/..."
    // REPLACEMENT: import.meta.env.VITE_API_URL + "/api/..."
    content = content.replace(/"http:\/\/localhost:5000/g, 'import.meta.env.VITE_API_URL + "');

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated: ${file}`);
        changedCount++;
    }
});

console.log(`Finished. Updated ${changedCount} files.`);
