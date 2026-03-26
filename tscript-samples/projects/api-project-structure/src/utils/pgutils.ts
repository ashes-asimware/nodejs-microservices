import {Pool} from "pg";

const pool = new Pool({
    user: process.env.DB_USER || 'myuser',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mydb',
    password: process.env.DB_PASSWORD || 'mypassword',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
});

async function getUsersFromDB() {
    const res = await pool.query('SELECT id,name FROM users');
    return res.rows;
}

async function getUserByIdFromDB(id: number) {
    const res = await pool.query('SELECT id,name FROM users WHERE id = $1', [id]);
    return res.rows[0];
}

async function createUserInDB(user: { name: string; email: string }) {
    const res = await pool.query(
        'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name', 
        [user.name, user.email]);
    return res.rows[0];
}

export {getUsersFromDB, getUserByIdFromDB, createUserInDB};

