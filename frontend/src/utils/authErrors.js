export const getAuthErrorMessage = (error) => {
  switch (error.code || error.name) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Invalid email or password.';
    case 'auth/invalid-email': return 'Enter a valid email address.';
    case 'auth/user-disabled': return 'This account is disabled. Contact an administrator.';
    case 'auth/too-many-requests': return 'Too many sign-in attempts. Please wait and try again.';
    case 'auth/network-request-failed':
    case 'TimeoutError': return 'Unable to reach the sign-in service. Check your connection and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return 'Google sign-in was cancelled. You can try again or use your email and password.';
    case 'auth/popup-blocked': return 'Your browser blocked the sign-in popup. Allow popups and try again.';
    case 'auth/unauthorized-domain': return 'Google sign-in is not configured for this website. Contact an administrator.';
    case 'auth/operation-not-allowed': return 'This sign-in method is not enabled. Contact an administrator.';
    case 'auth/account-exists-with-different-credential': return 'An account already exists with this email using another sign-in method. Sign in with that method; contact an administrator to link Google to the same account.';
    case 'auth/email-already-in-use': return 'An account already exists with this email. Use your existing sign-in method.';
    case 'auth/weak-password': return 'Choose a password with at least 6 characters.';
    default: return error.message || 'Sign-in failed. Please try again.';
  }
};
