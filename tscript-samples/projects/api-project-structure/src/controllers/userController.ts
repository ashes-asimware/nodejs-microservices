import {Request, Response} from 'express';
import {getAllUsersWithService, createUserWithService} from '../services/userService';

export async function getUsers(req: Request, res: Response) {
  const users = await getAllUsersWithService();
  res.json(users);
}

export async function createUser(req: Request, res: Response) {
  const user = await createUserWithService(req.body);
  res.status(201).json(user);
}

