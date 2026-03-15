import {User} from '../models/user';
import {log} from '../utils/logger';

export function createUser(name: string){
    const user = new User(name);
    log(`User created: ${name}`);
    return user;
}