import { Request, Response } from "express";

// GET /users
export function getUsers(req: Request, res: Response) {
    // Logic to retrieve users from the database
    const users = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
    ];
    res.json(users);
}

// POST /users
export function createUser(req: Request, res: Response) {
    const { name } = req.body;
    // Validate and save to the database
    const newUser = { id: 3, name };
    res.status(201).json(newUser);
}