import { initializeApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';

const _k = [0x4b, 0x1e, 0x73, 0x29, 0x62, 0x3d, 0x57, 0x13];
const _x = (a: number[]): string =>
  a.map((v, i) => String.fromCharCode(v ^ _k[i % _k.length])).join('');

const _sb = [40,127,1,93,23,95,50,62,125,43,18,74,84,19,49,122,57,123,17,72,17,88,36,103,36,108,18,78,7,19,54,99,59];

export function getStorageBucketHost(): string {
  return _x(_sb);
}

export const firebaseConfig = {
  apiKey: _x([10,87,9,72,49,68,22,67,51,71,67,88,7,100,28,123,38,100,37,16,12,90,16,65,60,65,10,28,91,110,96,32,57,83,6,4,4,101,103]),
  authDomain: _x([40,127,1,93,23,95,50,62,125,43,18,74,84,19,49,122,57,123,17,72,17,88,54,99,59,48,16,70,15]),
  projectId: _x([40,127,1,93,23,95,50,62,125,43,18,74,84]),
  storageBucket: _x(_sb),
  messagingSenderId: _x([126,40,64,17,86,9,102,36,126,47,64,31]),
  appId: _x([122,36,70,31,81,5,99,39,122,41,70,24,81,11,109,100,46,124,73,29,85,89,52,32,121,45,64,25,90,15,54,114,47,127,68,76,6,14,100,39,126]),
  measurementId: _x([12,51,35,28,54,110,96,66,26,73,42,112]),
};

const app = initializeApp(firebaseConfig);

let authInstance: Auth;
try {
  authInstance = initializeAuth(app, {
    persistence: [
      indexedDBLocalPersistence,
      browserLocalPersistence,
      browserSessionPersistence,
    ],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
} catch {
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const db = getFirestore(app);

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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firebase bağlantısı oflayndır. Konfiqurasiyanı yoxlayın.');
    }
  }
}
