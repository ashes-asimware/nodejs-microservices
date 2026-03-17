const os = require('os');

console.log("Platform:", os.platform());
console.log("CPU Cores:", os.cpus().length);
console.log("Free Memory:", os.freemem());