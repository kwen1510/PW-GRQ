import { initializeApp } from 'firebase/app';
import { confirmPasswordReset, getAuth, verifyPasswordResetCode } from 'firebase/auth';

const $ = (selector) => document.querySelector(selector);

function show(selector, visible = true) {
  $(selector)?.classList.toggle('hidden', !visible);
}

function setMessage(text) {
  const node = $('#resetMessage');
  node.textContent = text;
  show('#resetMessage', Boolean(text));
}

function invalidLink() {
  show('#resetLoading', false);
  show('#resetForm', false);
  show('#resetInvalid', true);
}

function resetErrorMessage(error) {
  if (error?.code === 'auth/weak-password') return 'That password is too weak. Choose a longer, less predictable password and try again.';
  if (error?.code === 'auth/network-request-failed') return 'The password service could not be reached. Check your connection and try again.';
  if (error?.code === 'auth/expired-action-code' || error?.code === 'auth/invalid-action-code') return '';
  return 'Your password could not be changed. Check both entries and try again.';
}

async function initializeReset() {
  const parameters = new URLSearchParams(window.location.search);
  const mode = parameters.get('mode');
  const actionCode = parameters.get('oobCode');
  if (mode !== 'resetPassword' || !actionCode) return invalidLink();

  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Configuration unavailable');
    const config = await response.json();
    if (!config.firebase) throw new Error('Firebase unavailable');
    const auth = getAuth(initializeApp(config.firebase));
    const email = await verifyPasswordResetCode(auth, actionCode);

    $('#resetAccount').textContent = `Resetting the password for ${email}.`;
    $('#resetEmail').value = email;
    show('#resetLoading', false);
    show('#resetForm', true);
    $('#newPassword').focus();

    $('#showPasswords').addEventListener('change', (event) => {
      const type = event.currentTarget.checked ? 'text' : 'password';
      $('#newPassword').type = type;
      $('#confirmPassword').type = type;
    });

    $('#resetForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage('');
      const password = $('#newPassword').value;
      const confirmation = $('#confirmPassword').value;
      if (password !== confirmation) {
        setMessage('The passwords do not match. Re-enter the confirmation and try again.');
        $('#confirmPassword').focus();
        return;
      }

      const button = $('#confirmResetButton');
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Changing password…';
      try {
        await confirmPasswordReset(auth, actionCode, password);
        $('#resetForm').reset();
        show('#resetForm', false);
        show('#resetSuccess', true);
        $('#resetSuccess a').focus();
      } catch (error) {
        const message = resetErrorMessage(error);
        if (!message) return invalidLink();
        setMessage(message);
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = 'Try again';
      }
    });
  } catch {
    invalidLink();
  }
}

initializeReset();
