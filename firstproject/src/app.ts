import { createUser } from "./controllers/userController";
import { greet } from "./greet";

const newUser = createUser("Alice");
console.log(newUser);

console.log(greet("TypeScript"));

