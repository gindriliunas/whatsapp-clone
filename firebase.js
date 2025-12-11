import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBwo7BhPLkCqtppI-YC3BsEyh702zN5Cag",
    authDomain: "watsapp-2-f2f1c.firebaseapp.com",
    projectId: "watsapp-2-f2f1c",
    storageBucket: "watsapp-2-f2f1c.firebasestorage.app",
    messagingSenderId: "651325523102",
    appId: "1:651325523102:web:9e0b559b898e72ec65278f"
};

// Initialize Firebase
let app;
if (typeof window !== 'undefined') {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
} else {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
}

const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Add additional OAuth scopes if needed
provider.addScope('profile');
provider.addScope('email');

export { db, auth, provider };
  