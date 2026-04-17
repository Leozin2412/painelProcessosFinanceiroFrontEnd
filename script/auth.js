// Route Guard: Immediately Invoked Function Expression (IIFE)
(function() {
  // Check if we are currently on the login page to avoid redirect loops
  const currentPath = window.location.pathname;
  const isLoginPage = currentPath.endsWith('index.html') || currentPath === '/';

  // Retrieve the token saved during the login process
  const authToken = localStorage.getItem('authToken');

  if (!authToken && !isLoginPage) {
    // If no valid session/token is found and we are not on the login page, redirect immediately
    window.location.replace('index.html');
  } else if (authToken && isLoginPage) {
    // If a session exists and the user is on the login page, redirect them to the dashboard
    window.location.replace('home.html');
  }
})();

// Globally accessible logout function
window.logout = async function() {
  try {
    // Call Supabase to invalidate the session on the server
    if (typeof supabase !== 'undefined') {
      await supabase.auth.signOut();
    } else {
      console.warn('Supabase global object not found. Skipping server-side signOut.');
      // If you are using your Express API for logout instead of the client SDK, 
      // you could uncomment and use a fetch call like this:
      // await fetch('http://localhost:3000/api/auth/logout', { method: 'POST' });
    }
  } catch (error) {
    console.error('Error during Supabase sign out:', error);
  } finally {
    // Clear all auth-related data from local and session storage
    localStorage.removeItem('authToken');
    sessionStorage.clear();

    // Redirect the user to the login page, replacing the history state
    window.location.replace('index.html');
  }
};
