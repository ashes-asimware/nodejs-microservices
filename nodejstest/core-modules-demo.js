const fs = require('fs');
const path = require('path');
const os = require('os');

fs.writeFileSync(path.join('data', 'info.txt'), `Platform: ${os.platform()}\nCPU Cores: ${os.cpus().length}\nFree Memory: ${os.freemem()}`);
console.log("System information written to data/info.txt");
console.log('File absolute path:', path.resolve('data/info.txt'));