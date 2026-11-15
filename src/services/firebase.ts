import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { LabScenario } from '../types/lab';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Initial connection test required by skill guidelines
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or network restricted.');
      return false;
    }
    // Permission denied on 'test/connection' is normal because of default-deny rules, but verifies network connection to Firestore
    return true;
  }
}

// Auth functions
export async function loginWithGoogle(): Promise<User | null> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    const msg = err instanceof Error ? err.message : String(err);
    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      msg.includes('popup-closed-by-user') ||
      msg.includes('cancelled-popup-request')
    ) {
      // User closed or dismissed the login popup intentionally
      return null;
    }
    console.error('Google Sign-in failed:', err);
    throw err;
  }
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export function subscribeToAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

// Scenario document persistence
export interface FirestoreScenarioPayload {
  id: string;
  userId: string;
  authorEmail?: string;
  name: string;
  subtitle?: string;
  isBuiltIn: boolean;
  labWidth: number;
  labDepth: number;
  zones: LabScenario['zones'];
  equipment: LabScenario['equipment'];
  walls: LabScenario['walls'];
  openings: LabScenario['openings'];
  createdAt?: string;
  updatedAt: string;
}

export async function saveScenarioToFirebase(
  scenario: LabScenario,
  user: User,
): Promise<void> {
  const path = `scenarios/${scenario.id}`;
  const payload: FirestoreScenarioPayload = {
    id: scenario.id,
    userId: user.uid,
    authorEmail: user.email ?? undefined,
    name: scenario.name,
    subtitle: scenario.subtitle,
    isBuiltIn: false,
    labWidth: scenario.labWidth,
    labDepth: scenario.labDepth,
    zones: scenario.zones,
    equipment: scenario.equipment,
    walls: scenario.walls,
    openings: scenario.openings,
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'scenarios', scenario.id), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteScenarioFromFirebase(
  scenarioId: string,
): Promise<void> {
  const path = `scenarios/${scenarioId}`;
  try {
    await deleteDoc(doc(db, 'scenarios', scenarioId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToUserScenarios(
  userId: string,
  onData: (scenarios: LabScenario[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const path = 'scenarios';
  const q = query(collection(db, path), where('userId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: LabScenario[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as FirestoreScenarioPayload;
        list.push({
          id: data.id,
          name: data.name,
          subtitle: data.subtitle || '',
          isBuiltIn: false,
          labWidth: data.labWidth,
          labDepth: data.labDepth,
          zones: data.zones,
          equipment: data.equipment,
          walls: data.walls,
          openings: data.openings,
          updatedAt: data.updatedAt,
        });
      });
      onData(list);
    },
    (error) => {
      if (onError) {
        try {
          handleFirestoreError(error, OperationType.LIST, path);
        } catch (e) {
          onError(e as Error);
        }
      } else {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    },
  );
}
