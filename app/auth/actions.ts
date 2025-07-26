'use server';

import { signIn } from './index';

export async function signInAction() {
  await signIn();
} 