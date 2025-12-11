import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase.js";

/**
 * Creates or updates a user document in Firestore
 * @param {Object} user - Firebase Auth user object
 * @returns {Promise<void>}
 */
export const createOrUpdateUser = async (user) => {
    if (!user || !user.uid) {
        console.error("Invalid user object provided");
        return;
    }

    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        
        const userData = {
            uid: user.uid,
            email: user.email || null,
            displayName: user.displayName || null,
            photoURL: user.photoURL || null,
            lastLogin: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        if (userSnap.exists()) {
            // Update existing user
            const currentData = userSnap.data();
            await setDoc(userRef, {
                ...userData,
                loginCount: (currentData.loginCount || 0) + 1,
                // Preserve existing createdAt
                createdAt: currentData.createdAt || serverTimestamp(),
            }, { merge: true });
            console.log("✅ User document updated:", user.email);
        } else {
            // Create new user document
            await setDoc(userRef, {
                ...userData,
                createdAt: serverTimestamp(),
                loginCount: 1,
                lastLogout: null,
            });
            console.log("✅ New user document created:", user.email);
        }
        
        // Verify the document was created/updated
        const verifySnap = await getDoc(userRef);
        if (verifySnap.exists()) {
            console.log("✅ Verified: User document exists in Firestore");
            console.log("User data:", verifySnap.data());
        } else {
            console.error("❌ Error: User document was not created");
        }
    } catch (error) {
        console.error("❌ Error creating/updating user document:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        throw error;
    }
};

/**
 * Updates user logout time in Firestore
 * @param {Object} user - Firebase Auth user object
 * @returns {Promise<void>}
 */
export const updateUserLogout = async (user) => {
    if (!user || !user.uid) {
        console.error("Invalid user object provided");
        return;
    }

    try {
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, {
            lastLogout: serverTimestamp(),
            updatedAt: serverTimestamp(),
        }, { merge: true });
        console.log("✅ User logout time recorded:", user.email);
    } catch (error) {
        console.error("❌ Error updating user logout time:", error);
        throw error;
    }
};

