import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error("CRITICAL: Firebase configuration is missing apiKey or projectId in firebase-applet-config.json");
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Connection test
async function testConnection() {
  try {
    console.log("[FIREBASE] Running connection diagnostic...");
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("[FIREBASE] Connection verified successfully.");
  } catch (error: any) {
    if (error?.code === 'permission-denied') {
      // If we get permission-denied, it means the SDK IS communicating with the server
      console.log("[FIREBASE] Connection reached server (access was restricted as expected).");
      return;
    }
    
    console.error("[FIREBASE] Connection diagnostic failed.");
    console.error("Diagnostic Error:", error?.code, error?.message);

    if(error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('failed-precondition'))) {
      console.error("ACTION REQUIRED: Check your network or Firebase project availability in the console.");
    }
  }
}
testConnection();

// Error handler
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  
  // If it's already a JSON string from a previous handleFirestoreError, just re-throw
  if (typeof errorMsg === 'string' && errorMsg.startsWith('{"error":')) {
    throw error;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
