import jwt from 'jsonwebtoken';
import app from '../app'
import { Request, Response } from 'express';

const secret = process.env.JWT_SECRET;

function generateJWT(user: { id: string; role: string }) {
    return jwt.sign({ id: user.id, role: user.role }, secret!, { expiresIn: '1h' });
}

app.post('/login', async(req: Request, res: Response) => {
    const { email, password } = req.body;
    const token = generateJWT({ id: 'user_id', role: 'user_role' });
    res.json({ token });
});

function authenticateToken(req: Request, res: Response, next: Function) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, secret!, (err, payload) => {
        if (err) return res.sendStatus(403);
        req.body.user = payload;
        next();
    });
}

app.get('/profile', authenticateToken, (req: Request, res: Response) => {
    res.json({ message: 'This is a protected route', user: req.body.user });
});