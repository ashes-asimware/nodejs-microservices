const fs = require('fs');

fs.readFile('eventloop.js', 'utf8', (err, data) => {
    if (err) throw err;
console.log("File contents:",data);
});

console.log("Reading file...");