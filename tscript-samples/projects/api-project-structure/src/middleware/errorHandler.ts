import {Request, Response, NextFunction} from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
    console.error(err.stack);
    const status = err.status || 500;
    let message: string = err.message || 'An error occurred';
    if (status === 500) {
        message = 'Internal Server Error';
    }
    else {
        switch (status) {
            case 400:
                message = 'Bad Request';
                break;
            case 401:
                message = 'Unauthorized';
                break;
            case 403:
                message = 'Forbidden';
                break;
            case 404:
                message = 'Not Found';
                break;
            default:
                message = 'An error occurred';
        }            
    }
    res.status(status).json({ error: message });
}
