const fs = require('fs').promises;

async function readFileAsync(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        console.log('File content:', data);
    } catch (err) {
        console.error('Error reading file:', err);
    }
}

const filePath = 'data/example.txt';
readFileAsync(filePath);
console.log('This will log before the file content is printed due to the asynchronous nature of async/await.\n');