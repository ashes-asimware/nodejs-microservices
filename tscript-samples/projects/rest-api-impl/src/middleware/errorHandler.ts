import { Request, Response, NextFunction } from 'express';

export function errorHandler(
    err: Error, 
    req: Request, 
    res: Response, next: NextFunction) {
console.error(err.stack);
const status = (err as any).status || 500;
res.status(status).json({
    error: {
        message: err.message || 'Internal Server Error'}
})};