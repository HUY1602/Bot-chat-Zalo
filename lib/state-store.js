const { randomUUID } = require('node:crypto');
const localClaims = new Map();

function hasRedis() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

// Persistent operations fail explicitly: a Redis outage must not silently bypass locks.
async function command(args) {
  if (!hasRedis()) throw new Error('Redis is not configured');
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`Redis: ${data.error}`);
  return data.result;
}

async function claim(key, ttlSeconds = 120) {
  const token = randomUUID();
  if (hasRedis()) {
    return await command(['SET', key, token, 'NX', 'EX', ttlSeconds]) === 'OK' ? token : null;
  }
  const now = Date.now();
  for (const [id, value] of localClaims) if (value.expires <= now) localClaims.delete(id);
  if (localClaims.has(key)) return null;
  localClaims.set(key, { token, expires: now + ttlSeconds * 1000 });
  return token;
}

async function release(key, token) {
  if (!token) return;
  if (hasRedis()) {
    await command(['EVAL', "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", 1, key, token]);
  } else if (localClaims.get(key)?.token === token) localClaims.delete(key);
}

async function ownsClaim(key, token) {
  if (hasRedis()) return await command(['GET', key]) === token;
  const current = localClaims.get(key);
  return Boolean(current && current.token === token && current.expires > Date.now());
}

module.exports = { hasRedis, command, claim, release, ownsClaim };
