const fs = require('fs');
const pino  = require('pino');
const logger = pino();

async  function showFile() {
    try {
        const data = await fs.promises.readFile('package.json', 'utf-8');
        logger.info('package.json', data.slice(0, 80) + '...'); // Print the first 100 characters of the file
    } catch (err) {
        logger.error('Error reading file:', err);
    }
}

showFile();
logger.info('This will log before the file content is printed due to the asynchronous nature of async/await.');