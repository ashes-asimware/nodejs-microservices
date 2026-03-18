const path = require('path');
const fs = require('fs').promises;

fs.readFile(path.join(__dirname, 'data', 'example.txt'), 'utf-8')
  .then((data) => {
    console.log('File content:', data);
  })
  .catch((err) => {
    console.error('Error reading file:', err);
  });

  console.log('This will log before the file content is printed due to the asynchronous nature of promises.\n');