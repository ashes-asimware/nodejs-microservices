import mysql from 'mysql2/promise';

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'mypassword',
    database: process.env.DB_NAME || 'test',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
});

export const getUsersFromDB = async () => {
    const [rows] = await pool.execute('SELECT id, name FROM users');
    return rows;
}

export const createUserInDB = async (name: string, email: string) => {
    const [result] = await pool.execute(
        'INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
    return result;
}

export const closeMySqlPool = async () => {
    await pool.end();
}