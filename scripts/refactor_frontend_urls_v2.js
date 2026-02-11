const fs = require('fs');
const path = require('path');

function walk(dir, fileList = []) {
    try {
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
    } catch (e) {
        console.error('Error reading dir:', dir, e.message);
    }
    return fileList;
}

const frontendDir = path.resolve(__dirname, '../../frontend/src');
console.log('Scanning directory:', frontendDir);

const files = walk(frontendDir);
console.log(`Found ${files.length} files.`);

let changedCount = 0;

files.forEach(file => {
    try {
        let content = fs.readFileSync(file, 'utf8');
        let original = content;

        // 1. Template Literals: `http://localhost:5000...
        // Replace `http://localhost:5000 with `${import.meta.env.VITE_API_URL}
        content = content.replace(/`http:\/\/localhost:5000/g, '`${import.meta.env.VITE_API_URL}');

        // 2. Single Quotes: 'http://localhost:5000...
        // Replace 'http://localhost:5000 with import.meta.env.VITE_API_URL + '
        content = content.replace(/'http:\/\/localhost:5000/g, "import.meta.env.VITE_API_URL + '");

        // 3. Double Quotes: "http://localhost:5000...
        // Replace "http://localhost:5000 with import.meta.env.VITE_API_URL + "
        content = content.replace(/"http:\/\/localhost:5000/g, 'import.meta.env.VITE_API_URL + "');

        if (content !== original) {
            fs.writeFileSync(file, content, 'utf8');
            console.log(`Updated: ${file}`);
            changedCount++;
        }
    } catch (e) {
        console.error('Error processing file:', file, e.message);
    }
});

console.log(`Finished. Updated ${changedCount} files.`);
