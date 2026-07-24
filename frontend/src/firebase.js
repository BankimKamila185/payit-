// firebase.js — Firebase Client SDK Initialization & Phone Auth Helpers
import { initializeApp } from "firebase/app";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "payit-194e6.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "payit-194e6",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "payit-194e6.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "107270168939640824795",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

let app = null;
let auth = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
} catch (e) {
  console.warn("Firebase client initialization warning:", e.message);
}

export { auth, RecaptchaVerifier, signInWithPhoneNumber };

export async function sendFirebaseOtp(phoneNumber, recaptchaContainerId = "recaptcha-container") {
  if (!auth || !import.meta.env.VITE_FIREBASE_API_KEY) {
    console.log("Firebase API key not set — defaulting to server OTP / demo mode");
    return { success: false, fallback: true };
  }
  try {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
        size: "invisible"
      });
    }
    const cleanDigits = phoneNumber.replace(/\D/g, "");
    const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : "+91" + cleanDigits.slice(-10);
    const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier);
    return { success: true, confirmationResult };
  } catch (error) {
    console.error("Firebase sendOtp error:", error);
    return { success: false, error: error.message };
  }
}

export async function verifyFirebaseOtp(confirmationResult, code) {
  try {
    const credential = await confirmationResult.confirm(code);
    const idToken = await credential.user.getIdToken();
    return { success: true, idToken, user: credential.user };
  } catch (error) {
    console.error("Firebase verifyOtp error:", error);
    return { success: false, error: error.message };
  }
}

export default app;
