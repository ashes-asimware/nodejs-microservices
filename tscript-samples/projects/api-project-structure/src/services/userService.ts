import { getUsersFromDB, createUserInDB } from '../utils/mysqlutils';

export async function getAllUsersWithService() {
  // Fetching users from a database
  return await getUsersFromDB();
}

export async function createUserWithService(user: { name: string; email: string }) {
  // Create a new user in the database
  return await createUserInDB(user.name, user.email);
}