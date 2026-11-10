const crypto = require('crypto');

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function authorizationUrl({ clientId, redirectUri, state, nonce, challenge }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `https://oauth.telegram.org/auth?${params.toString()}`;
}

async function exchangeCode({ code, redirectUri, verifier, clientId, clientSecret }) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  });
  const response = await fetch('https://oauth.telegram.org/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body,
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload && typeof payload.id_token === 'string' ? payload.id_token : null;
}

let jwksCache = { at: 0, keys: null };

async function telegramJwks(force = false) {
  if (!force && jwksCache.keys && Date.now() - jwksCache.at < 60 * 60 * 1000) return jwksCache.keys;
  const response = await fetch('https://oauth.telegram.org/.well-known/jwks.json');
  if (!response.ok) {
    const error = new Error('jwks');
    error.code = 'JWKS';
    throw error;
  }
  const body = await response.json();
  jwksCache = { at: Date.now(), keys: Array.isArray(body.keys) ? body.keys : [] };
  return jwksCache.keys;
}

module.exports = { pkcePair, authorizationUrl, exchangeCode, telegramJwks };
