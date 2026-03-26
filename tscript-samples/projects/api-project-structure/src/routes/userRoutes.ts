import {Router} from 'express';
import {getUsers, createUser} from '../controllers/userController';
import {validateCreateUser} from '../validators/userValidator';

const router = Router();

router.get('/users', getUsers);
router.post('/users', validateCreateUser, createUser);

export default router;