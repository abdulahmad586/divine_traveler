import * as userRepository from '../repositories/userRepository';
import { User } from '../types/user';

export async function upsertUser(uid: string, name: string, email: string): Promise<User> {
  return userRepository.upsert(uid, name, email);
}

export async function getMe(uid: string): Promise<User> {
  const user = await userRepository.findById(uid);
  if (!user) throw new Error('User not found');
  return user;
}
