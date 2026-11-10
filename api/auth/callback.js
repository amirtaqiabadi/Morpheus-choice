const { getSql, ensureSchema } = require('../../lib/db');
const { queryOf, redirect } = require('../../lib/http');
const { verifyIdToken } = require('../../lib/telegram');
const { exchangeCode, telegramJwks } = require('../../lib/oauth');
const { loginUser } = require('../../lib/users');
const { readOAuth, clearOAuth, issueSession, requestOrigin } = require('../../lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('method');
    return;
  }
  const query = queryOf(req);
  const pending = safeRead(req);
  clearOAuth(res, req);
  if (!pending || !query.state || query.state !== pending.state || query.error) {
    return redirect(res, '/?auth=error');
  }
  const clientId = process.env.TELEGRAM_CLIENT_ID || '';
  const clientSecret = process.env.TELEGRAM_CLIENT_SECRET || '';
  if (!clientId || !clientSecret || !query.code) return redirect(res, '/?auth=error');

  try {
    const redirectUri = `${requestOrigin(req)}/api/auth/callback`;
    const idToken = await exchangeCode({
      code: query.code,
      redirectUri,
      verifier: pending.verifier,
      clientId,
      clientSecret,
    });
    if (!idToken) return redirect(res, '/?auth=error');

    let keys = await telegramJwks();
    let verified = verifyIdToken(idToken, clientId, keys);
    if (!verified) {
      keys = await telegramJwks(true);
      verified = verifyIdToken(idToken, clientId, keys);
    }
    if (!verified || (verified.nonce && verified.nonce !== pending.nonce)) {
      return redirect(res, '/?auth=error');
    }

    const sql = getSql();
    await ensureSchema(sql);
    const profile = await loginUser(sql, verified.user, pending.ref || '');
    issueSession(res, req, profile.user.id);
    const applied = profile.referralApplied ? '&invited=1' : '';
    return redirect(res, `/?auth=ok${applied}`);
  } catch (error) {
    console.error('oauth callback failed');
    return redirect(res, '/?auth=error');
  }
};

function safeRead(req) {
  try {
    return readOAuth(req);
  } catch {
    return null;
  }
}
