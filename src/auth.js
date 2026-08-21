'use strict';

/**
 * Optional API key auth. Off by default -- only enforced when the API_KEY
 * env var is set, so local dev and `npm test` don't need a key.
 *
 * API_KEY can hold one key or a comma-separated list, so you can hand out a
 * separate key per consumer and revoke one without rotating everyone else:
 *   API_KEY=abc123
 *   API_KEY=abc123,def456,ghi789
 *
 * Callers pass their key either as:
 *   X-API-Key: abc123
 * or:
 *   Authorization: Bearer abc123
 */

function parseKeys(raw) {
  return (raw || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

function apiKeyAuth(req, res, next) {
  const validKeys = parseKeys(process.env.API_KEY);
  if (validKeys.length === 0) return next(); // no key configured -> auth disabled

  const bearerMatch = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  const provided = req.get('x-api-key') || (bearerMatch ? bearerMatch[1].trim() : null);

  if (!provided || !validKeys.includes(provided)) {
    return res.status(401).json({
      error: 'Missing or invalid API key. Pass it via the X-API-Key header (or Authorization: Bearer <key>).',
    });
  }
  next();
}

module.exports = { apiKeyAuth };
