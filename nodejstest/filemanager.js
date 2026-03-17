const fs = require('fs');
const path = require('path');

fs.readFile(path.join('data', 'example.txt'), 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading file:', err);
        return;
    }
    console.log('File contents:', data);
});

fs.writeFile(path.join('data', 'output.txt'), 'Node.js is awesome', (err) => {
    if (err) {
        console.error('Error writing file:', err);
        return;
    }
    console.log('File written successfully');
});