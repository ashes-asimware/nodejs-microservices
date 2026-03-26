import express, {Request, Response} from 'express';
import { errorHandler } from './middleware/errorHandler';
import userRoutes from './routes/userRoutes';
import productRoutes from './routes/productRoutes';
const app = express();

app.use(express.json());

app.use((req: Request, res: Response, next: Function) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} - ${duration}ms`);
    });
    next();
});

app.use('/users', userRoutes);
app.use('/products', productRoutes);

app.get('/crash', (req: Request, res: Response, next: Function) => {
    try {
        throw new Error('Crash test');
    } catch (err) {
        next(err);
    }   
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});