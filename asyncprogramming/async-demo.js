const fs = require('fs');

async  function showFile() {
    try {
        const data = await fs.promises.readFile('package.json', 'utf-8');
        console.log('package.json', data.slice(0, 80) + '...'); // Print the first 100 characters of the file
    } catch (err) {
        console.error('Error reading file:', err);
    }
}

showFile();
console.log('This will log before the file content is printed due to the asynchronous nature of async/await.');