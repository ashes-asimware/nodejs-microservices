let count = 5;
const PORT = 3000;

const sum = (a, b) => a + b;

[1,2,3].forEach(num => console.log(num));

console.log(`The count is ${count}`);
console.log(`The sum of 2 and 3 is ${sum(2, 3)}`);

const user = { id:1, name: 'Alex', role: 'admin' };
const { name, role } = user;
console.log(`User ${name} has role ${role}`);

const arr = [10, 20,  30];
const [first, second] = arr;
console.log(`First: ${first}, Second: ${second}`);