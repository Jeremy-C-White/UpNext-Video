import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import config from "../firebase-applet-config.json";

const app = initializeApp(config);

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
}, 'ai-studio-d06e9a0d-62f9-459b-b040-b6e70e7a7bbc');

export { db };
export const auth = getAuth(app);
