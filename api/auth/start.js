const crypto = require('crypto');
const { redirect, queryOf } = require('../../lib/http');
const { referralCode } = require('../../lib/telegram');
const { pkcePair, authorizationUrl } = require('../../lib/oauth');
const { issueOAuth, requestOrigin } = require('../../lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('method');
    return;
  }
  const clientId = process.env.TELEGRAM_CLIENT_ID || '';
  const clientSecret = process.env.TELEGRAM_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return redirect(res, '/?auth=unconfigured');

  try {
    const { verifier, challenge } = pkcePair();
    const state = crypto.randomBytes(24).toString('base64url');
    const nonce = crypto.randomBytes(24).toString('base64url');
    const ref = referralCode(queryOf(req).ref || '');
    issueOAuth(res, req, { state, verifier, nonce, ref });
    const redirectUri = `${requestOrigin(req)}/api/auth/callback`;
    return redirect(res, authorizationUrl({ clientId, redirectUri, state, nonce, challenge }));
  } catch (error) {
    if (error && error.code === 'NO_TELEGRAM') return redirect(res, '/?auth=unconfigured');
    console.error('oauth start failed');
    return redirect(res, '/?auth=error');
  }
};
