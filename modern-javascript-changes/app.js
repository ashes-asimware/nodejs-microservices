import {add, divide} from './calc-utils.js';

console.log(add(5, 3)); // Output: 8
try {
    console.log(divide(10, 0));
} catch (error) {
    console.error(error.message); // Output: Division by zero
}