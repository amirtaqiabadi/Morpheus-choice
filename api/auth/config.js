const { send } = require('../../lib/http');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  const username = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
  const botUsername = /^[A-Za-z0-9_]{5,32}$/.test(username) ? username : '';
  return send(res, 200, {
    botUsername,
    oauth: Boolean(process.env.TELEGRAM_CLIENT_ID && process.env.TELEGRAM_CLIENT_SECRET),
    miniAppAuth: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  });
};
