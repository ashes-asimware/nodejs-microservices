import {Pool} from "pg";

function getRequiredEnv(varName: string): string {
    const value = process.env[varName];
    if (!value) {
        throw new Error(`Environment variable ${varName} is required for database configuration.`);
    }
    return value;
}

const pool = new Pool({
    user: getRequiredEnv('DB_USER'),
    host: getRequiredEnv('DB_HOST'),
    database: getRequiredEnv('DB_NAME'),
    password: getRequiredEnv('DB_PASSWORD'),
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

