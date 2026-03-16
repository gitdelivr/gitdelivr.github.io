import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendEmailVerification, 
    signOut, 
    reauthenticateWithCredential, 
    EmailAuthProvider, 
    updatePassword 
} from "firebase/auth";

const auth = getAuth();

/**
 * STRICT SIGN-UP: Creates user, sends verification, and immediately kills the session.
 */
export async function secureSignUp(email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // 1. Send Verification Email
        await sendEmailVerification(user);
        
        // 2. Instantly log them out (Zero Access until verified)
        await signOut(auth);
        
        return { success: true, message: "Account created. Please verify your email before logging in." };
    } catch (error) {
        throw new Error(error.message);
    }
}

/**
 * LOGIN GUARD: Blocks unverified users and prompts them to check their inbox.
 */
export async function secureLogin(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Strictly enforce email verification
        if (!user.emailVerified) {
            // Optional: Resend verification email here if requested
            // await sendEmailVerification(user);
            
            await signOut(auth); // Kill session
            throw new Error("unverified_email"); 
        }

        return { success: true, user };
    } catch (error) {
        if (error.message === "unverified_email") {
            // Trigger your UI to show a "Resend Verification" button
            return { success: false, code: "unverified", message: "Email not verified. Please check your inbox." };
        }
        throw error;
    }
}

/**
 * RE-AUTHENTICATION: Forces user to prove identity before critical actions.
 */
export async function securePasswordChange(currentPassword, newPassword) {
    const user = auth.currentUser;
    if (!user) throw new Error("No user logged in.");

    try {
        // 1. Re-authenticate
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);

        // 2. Perform sensitive action
        await updatePassword(user, newPassword);
        
        return { success: true, message: "Password updated securely." };
    } catch (error) {
        throw new Error("Re-authentication failed. Incorrect current password.");
    }
}
