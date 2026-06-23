import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { auth } from './firebase';

export { auth };
export type { User };

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

export function subscribeToAuthChanges(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function loginWithEmailAndPassword(
  email: string,
  password: string
): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmailAndPassword(
  email: string,
  password: string,
  displayName: string
): Promise<UserCredential> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential;
}

export async function logoutUser(): Promise<void> {
  return signOut(auth);
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  return firebaseSendPasswordResetEmail(auth, email);
}

export function getUserId(user: User | null): string | undefined {
  return user?.uid;
}

export function getUserEmail(user: User | null): string | null | undefined {
  return user?.email;
}

export function getUserDisplayName(user: User | null): string | null | undefined {
  return user?.displayName;
}
