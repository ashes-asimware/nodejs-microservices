const EventEmitter = require('events');

class MyEmitter extends EventEmitter {}

const emitter = new MyEmitter();

emitter.on('greet', (name) => {
    console.log(`Hello, ${name}!`);
});

console.log("Waiting for event...");

setTimeout(() => {
    emitter.emit('greet', 'Node.js  Developer');
}, 1000);