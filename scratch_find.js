const fs = require('fs');
const path = require('path');

function walk(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) {
        if (file !== 'node_modules' && file !== '.git') {
          console.log('Dir:', full);
          walk(full);
        }
      } else {
        if (file.endsWith('.js') && file !== 'scratch_find.js') {
          console.log('File:', full);
        }
      }
    }
  } catch (e) {
    console.error('Error walking', dir, e.message);
  }
}

console.log('Starting search in:', __dirname);
walk(__dirname);
