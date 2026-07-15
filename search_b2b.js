const fs = require('fs');
const path = require('path');

function search(dir, pattern) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        search(fullPath, pattern);
      }
    } else {
      if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.json')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes(pattern)) {
          console.log(`Found "${pattern}" in: ${fullPath}`);
        }
      }
    }
  }
}

console.log('Searching client app...');
try {
  search('C:\\Users\\dhurv\\OneDrive\\Desktop\\vply app\\src', 'B2B');
} catch (e) {}

console.log('Searching admin app...');
try {
  search('C:\\Users\\dhurv\\OneDrive\\Desktop\\hd-ply-admin\\src', 'B2B');
} catch (e) {}
