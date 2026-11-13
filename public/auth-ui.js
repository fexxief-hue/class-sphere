async function getCsrfToken() {
  const response = await fetch('/api/auth/csrf');
  const data = await response.json();
  if (!response.ok || !data.csrfToken) throw new Error(data.error || 'Could not start a secure form session.');
  return data.csrfToken;
}
function showFormMessage(message, isError = false) {
  const node = document.getElementById('form-message');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('error', isError);
}
async function postAuth(url, body, csrfToken) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const admissionNumber = loginForm.elements.admissionNumber.value.trim();
    if (!admissionNumber.startsWith('SB62/')) return showFormMessage('Admission numbers must begin with SB62/.', true);
    try {
      const token = await getCsrfToken();
      const result = await postAuth('/api/auth/login', {
        admissionNumber,
        password: loginForm.elements.password.value,
      }, token);
      window.location.assign(result.redirect);
    } catch (error) { showFormMessage(error.message, true); }
  });
}
const registerForm = document.getElementById('register-form');
if (registerForm) {
  fetch('/api/auth/status').then((r) => r.json()).then((state) => {
    if (!state.emailVerificationAvailable) {
      const note = document.getElementById('email-config-notice');
      note.textContent = 'Email is not configured. You can still register; an administrator will approve your account before first sign-in.';
      note.classList.remove('d-none');
    }
  }).catch(() => {});
  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const admissionNumber = registerForm.elements.admissionNumber.value.trim();
    const password = registerForm.elements.password.value;
    if (!admissionNumber.startsWith('SB62/')) return showFormMessage('Admission numbers must begin with SB62/.', true);
    if (password !== registerForm.elements.passwordConfirmation.value) return showFormMessage('The passwords do not match.', true);
    try {
      const token = await getCsrfToken();
      const result = await postAuth('/api/auth/register', {
        fullName: registerForm.elements.fullName.value,
        admissionNumber,
        email: registerForm.elements.email.value,
        password,
        passwordConfirmation: registerForm.elements.passwordConfirmation.value,
      }, token);
      showFormMessage(result.message);
      registerForm.reset();
    } catch (error) { showFormMessage(error.message, true); }
  });
}
if (location.pathname === '/verify.html') {
  const tokenValue = new URLSearchParams(location.search).get('token');
  const link = document.getElementById('signin-link');
  const button = document.getElementById('verify-button');
  if (!tokenValue) { showFormMessage('This verification link is invalid or expired.', true); button.disabled = true; }
  else button.addEventListener('click', async () => {
    button.disabled = true;
    try { const csrfToken = await getCsrfToken(); const result = await postAuth('/api/auth/verify-email', { token: tokenValue }, csrfToken); showFormMessage(result.message); link.classList.remove('d-none'); }
    catch (error) { showFormMessage(error.message, true); button.disabled = false; }
  });
}

const resetRequestForm=document.getElementById('reset-request-form');
const resetCompleteForm=document.getElementById('reset-complete-form');
const resetToken=new URLSearchParams(location.search).get('token');
if(resetRequestForm&&resetCompleteForm){
  if(resetToken){resetRequestForm.classList.add('d-none');resetCompleteForm.classList.remove('d-none');document.getElementById('recovery-title').textContent='Choose a new password.';}
  resetRequestForm.addEventListener('submit',async(event)=>{event.preventDefault();try{const csrf=await getCsrfToken();const result=await postAuth('/api/auth/password-reset/request',{email:resetRequestForm.elements.email.value},csrf);showFormMessage(result.message);}catch(error){showFormMessage(error.message,true);}});
  resetCompleteForm.addEventListener('submit',async(event)=>{event.preventDefault();const password=resetCompleteForm.elements.password.value;if(password!==resetCompleteForm.elements.passwordConfirmation.value)return showFormMessage('The passwords do not match.',true);try{const csrf=await getCsrfToken();const result=await postAuth('/api/auth/password-reset/complete',{token:resetToken,password,passwordConfirmation:resetCompleteForm.elements.passwordConfirmation.value},csrf);showFormMessage(result.message);resetCompleteForm.reset();}catch(error){showFormMessage(error.message,true);}});
}

const adminLoginForm=document.getElementById('admin-login-form');
if(adminLoginForm){adminLoginForm.addEventListener('submit',async(event)=>{event.preventDefault();const button=adminLoginForm.querySelector('button[type=submit]');button.disabled=true;showFormMessage('Signing in…');try{const csrf=await getCsrfToken();const result=await postAuth('/api/auth/admin-login',{email:adminLoginForm.elements.email.value,password:adminLoginForm.elements.password.value},csrf);window.location.assign(result.redirect);}catch(error){showFormMessage(error.message,true);}finally{button.disabled=false;}});}
