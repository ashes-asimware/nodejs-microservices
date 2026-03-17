// server.js
const http = require('http');

const server = http.createServer((req, res) => {
    // res.writeHead(200, { 'Content-Type': 'text/plain' });
    // res.end('Welcome to the Node.js backend!');
    setTimeout(() => {
        res.end('Hello from event loop!');
    }, 2000); // simulate a slow operation
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on http://localhost:${PORT}/`);
});