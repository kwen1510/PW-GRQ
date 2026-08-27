'use strict';

const FIREBASE_JWKS = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
);

function exactDomain(email, domain) {
  if (typeof email !== 'string') return false;
  const parts = email.trim().toLowerCase().split('@');
  return parts.length === 2 && Boolean(parts[0]) && parts[1] === domain;
}

function requirePromptAdmin(req, res, next) {
  if (req.user?.promptAdmin) return next();
  return res.status(403).json({ error: 'Prompt administrator access required' });
}

function authorisedPasswordTeacher(decoded, config) {
  const email = typeof decoded?.email === 'string' ? decoded.email.trim().toLowerCase() : '';
  if (!exactDomain(email, config.allowedTeacherDomain)) return '';
  if (decoded.firebase?.sign_in_provider !== 'password') return '';
  return config.allowedTeacherEmails.includes(email) ? email : '';
}

function createAuth(config) {
  const firebaseReady = Boolean(config.firebase.projectId && config.allowedTeacherEmails.length);
  let verifierPromise;

  function getVerifier() {
    if (!verifierPromise) {
      verifierPromise = import('jose').then(({ createRemoteJWKSet, jwtVerify }) => ({
        keys: createRemoteJWKSet(FIREBASE_JWKS),
        jwtVerify
      }));
    }
    return verifierPromise;
  }

  async function requireTeacher(req, res, next) {
    if (config.localAuthBypass) {
      req.user = { uid: 'local-prototype', email: 'local@ri.edu.sg', promptAdmin: config.localPromptAdmin };
      return next();
    }
    if (!firebaseReady) return res.status(503).json({ error: 'Authentication is not configured' });
    const header = req.get('authorization') || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in required' });
    try {
      const { keys, jwtVerify } = await getVerifier();
      const { payload: decoded } = await jwtVerify(header.slice(7), keys, {
        algorithms: ['RS256'],
        audience: config.firebase.projectId,
        issuer: `https://securetoken.google.com/${config.firebase.projectId}`
      });
      const email = authorisedPasswordTeacher(decoded, config);
      if (!email) return res.status(403).json({ error: 'Email or password is incorrect' });
      req.user = {
        uid: decoded.sub,
        email,
        promptAdmin: config.promptAdmins.includes(email)
      };
      return next();
    } catch {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }
  }

  return { firebaseReady, requireTeacher, requirePromptAdmin };
}

module.exports = { authorisedPasswordTeacher, createAuth, exactDomain };
