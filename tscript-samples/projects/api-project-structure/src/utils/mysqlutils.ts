import mysql from 'mysql2/promise';

async function createConnection() {
const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'mypassword',
        database: process.env.DB_NAME || 'test',
    });
    return connection;
}

export const getUsersFromDB = async () => {
    const connection = await createConnection();
    const [rows] = await connection.execute('SELECT id, name FROM users');
    await connection.end();
    return rows;
}

export const createUserInDB = async (name: string, email: string) => {
    const connection = await createConnection();
    const [result] = await connection.execute(
        'INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
    await connection.end();
    return result;
}