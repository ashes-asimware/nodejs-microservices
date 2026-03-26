import { Request, Response, NextFunction } from 'express';

export function validateCreateUser(req: Request, res: Response, next: NextFunction) {
    const { name, email } = req.body;
    if(typeof name !== 'string' || name.length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters long' });
    }
    if(!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address' });
    }
    next();
}