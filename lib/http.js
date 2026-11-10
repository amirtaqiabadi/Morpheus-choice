function send(res, status, body) {
  res.status(status).json(body);
}

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return {};
}

const GAME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function gameId(body) {
  if (!body || typeof body.gameId !== 'string' || !GAME_ID.test(body.gameId)) return null;
  return body.gameId;
}

function boxId(value) {
  const box = Number(value);
  if (!Number.isInteger(box) || box < 0 || box > 8) return null;
  return box;
}

module.exports = { send, readBody, gameId, boxId };
