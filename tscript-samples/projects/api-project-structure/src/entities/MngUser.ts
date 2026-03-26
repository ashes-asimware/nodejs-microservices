import {Schema, model, Document} from 'mongoose';

interface IUser extends Document {
    name: string;
    email: string;
    age?: number;
}

const UserSchema = new Schema<IUser>({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    age: { type: Number }
});

const UserModel = model<IUser>('User', UserSchema);

export default UserModel;