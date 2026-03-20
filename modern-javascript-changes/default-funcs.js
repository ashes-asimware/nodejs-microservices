function greet(name = "Guest") {
    return `Hello, ${name}!`;
}

function logAll(...args) {
    args.forEach(arg => console.log(arg));
}

logAll("Hello", "World", 123, { key: "value" });

const arr1 = [1,2];
const arr2 = [3,4];
const combined = [...arr1, ...arr2];
console.log(combined);

const user1 = { name: "Alice", role: "admin" };
const user2 = { ...user1, active: true };
console.log(user2);

const id = 5, status = "active";
const result = { id, status };
console.log(result);

const field = "role";
const obj = {[field]: "admin"};
console.log(obj);   