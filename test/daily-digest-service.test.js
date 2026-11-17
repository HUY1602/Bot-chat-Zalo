const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  checkAndTriggerMorningDigest,
  getVietnamDateTimeParts,
  isMorningDigestWindow,
  getTargetChatIds
} = require('../lib/daily-digest-service');
const weatherService = require('../lib/weather-service');

test('daily digest time window follows Vietnam local time and stays close to 7:30', () => {
  assert.equal(isMorningDigestWindow({ hour: 7, minute: 29 }), false);
  assert.equal(isMorningDigestWindow({ hour: 7, minute: 30 }), true);
  assert.equal(isMorningDigestWindow({ hour: 7, minute: 44 }), true);
  assert.equal(isMorningDigestWindow({ hour: 7, minute: 45 }), false);
  assert.equal(isMorningDigestWindow({ hour: 8, minute: 0 }), false);
});

test('Vietnam date-time conversion uses Asia/Ho_Chi_Minh', () => {
  const parts = getVietnamDateTimeParts(new Date('2026-11-17T00:30:00.000Z'));
  assert.equal(parts.hour, 7);
  assert.equal(parts.minute, 30);
  assert.equal(parts.dateKey, '2026-11-17');
});

test('weather defaults to Hanoi coordinates and accepts accented city names', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async url => {
    requests.push(new URL(url));
    return {
      ok: true,
      json: async () => ({
        current_weather: { temperature: 20, windspeed: 5, weathercode: 1 },
        daily: {
          temperature_2m_max: [22],
          temperature_2m_min: [16],
          precipitation_probability_max: [10],
          weathercode: [1]
        }
      })
    };
  };

  try {
    const defaultWeather = await weatherService.getWeatherToday();
    const accentedCityWeather = await weatherService.getWeatherToday('Hà Nội');
    assert.equal(defaultWeather.cityName, 'Hà Nội');
    assert.equal(accentedCityWeather.cityName, 'Hà Nội');
    assert.equal(requests[0].searchParams.get('latitude'), '21.0285');
    assert.equal(requests[0].searchParams.get('longitude'), '105.8542');
  } finally {
    global.fetch = originalFetch;
  }
});

test('unsupported weather city does not silently report Hanoi or Ho Chi Minh City', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('Should not fetch for unsupported city');
  };

  try {
    assert.equal(await weatherService.getWeatherToday('unknown-city'), null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('reports Redis read failures instead of treating them as an empty subscriber list', async () => {
  const originalFetch = global.fetch;
  const originalRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  global.fetch = async () => ({
    ok: false,
    status: 503,
    text: async () => 'unavailable'
  });

  try {
    await assert.rejects(getTargetChatIds(), /Không đọc được danh sách nhóm/);
  } finally {
    global.fetch = originalFetch;
    if (originalRedisUrl === undefined) {
      delete process.env.UPSTASH_REDIS_REST_URL;
    } else {
      process.env.UPSTASH_REDIS_REST_URL = originalRedisUrl;
    }
    if (originalRedisToken === undefined) {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalRedisToken;
    }
  }
});

test('explains that persistent subscriber storage is required when no chats are found', async () => {
  const originalRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  try {
    const result = await checkAndTriggerMorningDigest(true);
    assert.equal(result.triggeredCount, 0);
    assert.match(result.reason, /Chưa cấu hình Upstash Redis/);
  } finally {
    if (originalRedisUrl !== undefined) {
      process.env.UPSTASH_REDIS_REST_URL = originalRedisUrl;
    }
    if (originalRedisToken !== undefined) {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalRedisToken;
    }
  }
});
