import { getUsersFromDB, createUserInDB } from '../utils/mysqlutils';

export async function getAllUsersWithService() {
  // Simulate fetching users from a database
  return await getUsersFromDB();
}

export async function createUserWithService(user: { name: string; email: string }) {
  // Simulate creating a user in a database
  return await createUserInDB(user.name, user.email);
}