// import "reflect-metadata";
// import { createConnection } from "typeorm";
// import { User } from "./entities/User";

// async function main() {
//     const connection = await createConnection({
//         type: "postgres",
//         host: process.env.DB_HOST || 'localhost',
//         port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
//         username: process.env.DB_USER || 'dbuser',
//         password: process.env.DB_PASSWORD || 'secret',
//         database: process.env.DB_NAME || 'mydb',
//         synchronize: true,
//         logging: false,
//         entities: [User],
//     });
    
//     const userRepo = connection.getRepository(User);

//     // Create a new user
//     const alice = userRepo.create({ name: "Alice", email: "alice@example.com" });
//     await userRepo.save(alice);

//     const users = await userRepo.find();
// }

// main();

