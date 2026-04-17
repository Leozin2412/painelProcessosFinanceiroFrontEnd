document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const errorContainer = document.getElementById('error-message');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const submitBtn = document.getElementById('submit-btn');

    // Reset error state
    errorContainer.classList.add('hidden');
    errorContainer.textContent = '';
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Entrando...
    `;

    try {
      const response = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        // Assuming the API returns the token in data.token or data.session.access_token
        const token = data.token || (data.session && data.session.access_token) || data.accessToken;
        if (token) {
          localStorage.setItem('authToken', token);
        }
        
        // Redirect to the main application
        window.location.href = '/home.html';
      } else {
        // Handle authentication errors
        let errorMsg = 'Credenciais inválidas. Tente novamente.';
        try {
          const errorData = await response.json();
          if (errorData.message) errorMsg = errorData.message;
          else if (errorData.error) errorMsg = errorData.error;
        } catch (parseErr) {
          if (response.status === 401) {
            errorMsg = 'E-mail ou senha incorretos.';
          }
        }
        
        showError(errorMsg);
      }
    } catch (error) {
      console.error('Login error:', error);
      showError('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      // Reset button state
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Sign In';
    }
  });

  function showError(message) {
    errorContainer.textContent = message;
    errorContainer.classList.remove('hidden');
  }
});
