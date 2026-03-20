function faultyOperation(a,b) {
    debugger; // This will pause execution when the function is called
    if(typeof a !== 'number') throw new Error('First argument must be a number');
    return a + b;
}

console.log(faultyOperation(5, 10)); // This will work
console.log(faultyOperation('5', 10)); // This will throw an error and pause at the debugger statement