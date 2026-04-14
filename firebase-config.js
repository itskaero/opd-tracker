/**
 * Firebase Configuration  Pediatric OPD Tracker
 * ================================================
 *
 * CONNECT YOUR DATABASE (5 minutes):
 *
 *  1. Go to  https://console.firebase.google.com/
 *  2. Create a project    click the </>  Web icon    register the app
 *  3. Copy the firebaseConfig values from the console into the fields below
 *  4. Enable Firestore: Build  Firestore Database  Create database
 *      Start in "test mode"
 *  5. Set  FIREBASE_ENABLED = true  and save
 *
 * Data is stored at:
 *   hospitals/{HOSPITAL_CODE}/patients
 *   hospitals/{HOSPITAL_CODE}/visits
 *   hospitals/{HOSPITAL_CODE}/admissions
 *   hospitals/{HOSPITAL_CODE}/meta
 *
 * Firebase web API keys are safe to commit to public repos 
 * they are locked to your authorised domain + Firestore security rules.
 */

const FIREBASE_CONFIG = {
  apiKey:            "",   //  from Firebase console
  authDomain:        "",   //  yourproject.firebaseapp.com
  projectId:         "",   //  your-project-id
  storageBucket:     "",   //  yourproject.appspot.com
  messagingSenderId: "",   //  12-digit sender ID
  appId:             "",   //  1:xxx:web:xxx
};

//  Set to true after filling in all fields above 
const FIREBASE_ENABLED = false;

/*  Recommended Firestore Security Rules 
 * Paste these in: Firebase console  Firestore  Rules tab
 *
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     match /hospitals/{hospitalId}/{document=**} {
 *       allow read, write: if true;
 *       // Replace "true" with auth checks before going to production
 *     }
 *   }
 * }
 *  */
