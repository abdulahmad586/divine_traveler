import * as userRepository from '../repositories/userRepository';

export async function upsertUser(uid: string, name: string, email: string): Promise<void> {
  await userRepository.upsert(uid, name, email);
}
