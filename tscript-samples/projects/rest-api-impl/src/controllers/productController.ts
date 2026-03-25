import {Request, Response} from 'express';

export const getProducts = (req: Request, res: Response) => {
    // Logic to retrieve products from the database
    const products = [
        { id: 1, name: "Product A" },
        { id: 2, name: "Product B" },
    ];
    res.json(products);
};

export const createProduct = (req: Request, res: Response) => {
    // Logic to create a new product in the database
    const { name } = req.body;
    const newProduct = { id: 3, name };
    res.status(201).json(newProduct);
};