import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const app = initializeApp(firebaseConfig);

// Initialize App Check with reCAPTCHA v3
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('YOUR_RECAPTCHA_V3_SITE_KEY_HERE'),
  
  // Set to true to allow auto-refresh of App Check tokens.
  isTokenAutoRefreshEnabled: true 
});
