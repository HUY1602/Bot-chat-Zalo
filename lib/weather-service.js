/**
 * Weather Service for Zalo Bot
 * Uses Open-Meteo API (Free, high-precision, no API key required)
 * Provides real-time weather and forecast for Vietnam provinces and cities
 */

// Tọa độ các thành phố / tỉnh thành phổ biến tại Việt Nam
const VIETNAM_LOCATIONS = {
  hanoi: { name: 'Hà Nội', lat: 21.0285, lon: 105.8542 },
  hn: { name: 'Hà Nội', lat: 21.0285, lon: 105.8542 },
  hcm: { name: 'TP. Hồ Chí Minh', lat: 10.8231, lon: 106.6297 },
  saigon: { name: 'TP. Hồ Chí Minh', lat: 10.8231, lon: 106.6297 },
  sg: { name: 'TP. Hồ Chí Minh', lat: 10.8231, lon: 106.6297 },
  danang: { name: 'Đà Nẵng', lat: 16.0544, lon: 108.2022 },
  dn: { name: 'Đà Nẵng', lat: 16.0544, lon: 108.2022 },
  haiphong: { name: 'Hải Phòng', lat: 20.8449, lon: 106.6881 },
  cantho: { name: 'Cần Thơ', lat: 10.0452, lon: 105.7469 },
  nhatrang: { name: 'Nha Trang', lat: 12.2388, lon: 109.1967 },
  dalat: { name: 'Đà Lạt', lat: 11.9404, lon: 108.4583 },
  vungtau: { name: 'Vũng Tàu', lat: 10.3460, lon: 107.0843 },
  hue: { name: 'Huế', lat: 16.4637, lon: 107.5909 },
  quangninh: { name: 'Quảng Ninh', lat: 21.0069, lon: 107.2925 },
  binhduong: { name: 'Bình Dương', lat: 11.1603, lon: 106.6569 },
  dongnai: { name: 'Đồng Nai', lat: 10.9575, lon: 106.8427 }
};

/**
 * Bảng mã WMO Weather Code dịch sang tiếng Việt và emoji
 */
const WMO_CODE_MAP = {
  0: { desc: 'Trời quang đãng, nắng đẹp', emoji: '☀️' },
  1: { desc: 'Trời hầu như không mây', emoji: '🌤️' },
  2: { desc: 'Có mây rải rác', emoji: '⛅' },
  3: { desc: 'Trời nhiều mây, âm u', emoji: '☁️' },
  45: { desc: 'Có sương mù', emoji: '🌫️' },
  48: { desc: 'Sương mù dày đặc', emoji: '🌫️' },
  51: { desc: 'Mưa phùn nhẹ', emoji: '🌦️' },
  53: { desc: 'Mưa phùn vừa', emoji: '🌦️' },
  55: { desc: 'Mưa phùn dày hạt', emoji: '🌧️' },
  61: { desc: 'Mưa rào nhẹ', emoji: '🌧️' },
  63: { desc: 'Mưa rào vừa', emoji: '🌧️' },
  65: { desc: 'Mưa to cục bộ', emoji: '⛈️' },
  71: { desc: 'Tuyết rơi nhẹ', emoji: '🌨️' },
  80: { desc: 'Mưa rào thoáng qua', emoji: '🌦️' },
  81: { desc: 'Mưa rào vừa', emoji: '🌧️' },
  82: { desc: 'Mưa rào rất to', emoji: '⛈️' },
  95: { desc: 'Có dông, sấm sét rải rác', emoji: '⛈️' },
  96: { desc: 'Có dông kèm mưa đá nhỏ', emoji: '⛈️' },
  99: { desc: 'Dông bão mạnh nguy hiểm', emoji: '⚡' }
};

/**
 * Lấy dự báo thời tiết hôm nay cho một vị trí cụ thể
 * @param {string} [cityCode='hcm'] - Mã địa danh (hanoi, hcm, danang...)
 * @returns {Promise<{
 *   cityName: string,
 *   description: string,
 *   emoji: string,
 *   tempCurrent: number,
 *   tempMax: number,
 *   tempMin: number,
 *   rainProb: number,
 *   windSpeed: number
 * }|null>}
 */
async function getWeatherToday(cityCode = 'hcm') {
  const normKey = String(cityCode).toLowerCase().replace(/[\s\-_]/g, '');
  const loc = VIETNAM_LOCATIONS[normKey] || VIETNAM_LOCATIONS['hcm'];

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FBangkok`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[Weather] Open-Meteo trả về status ${res.status}`);
      return null;
    }

    const data = await res.json();
    const current = data.current_weather || {};
    const daily = data.daily || {};

    const code = current.weathercode ?? daily.weathercode?.[0] ?? 0;
    const weatherInfo = WMO_CODE_MAP[code] || { desc: 'Thời tiết ôn hòa', emoji: '🌤️' };

    return {
      cityName: loc.name,
      description: weatherInfo.desc,
      emoji: weatherInfo.emoji,
      tempCurrent: Math.round(current.temperature ?? daily.temperature_2m_max?.[0] ?? 28),
      tempMax: Math.round(daily.temperature_2m_max?.[0] ?? 32),
      tempMin: Math.round(daily.temperature_2m_min?.[0] ?? 24),
      rainProb: daily.precipitation_probability_max?.[0] ?? 0,
      windSpeed: Math.round(current.windspeed ?? 10)
    };
  } catch (err) {
    console.warn('[Weather Error]:', err.message);
    return null;
  }
}

/**
 * Lời khuyên chuẩn bị trang phục/vật dụng dựa trên thời tiết
 * @param {{ rainProb: number, tempMax: number, tempMin: number, tempCurrent: number }} weather
 */
function getWeatherAdvice(weather) {
  if (!weather) return 'Chúc anh/chị một ngày mới bình an và thuận lợi nha! ✨';

  if (weather.rainProb >= 60) {
    return 'Hôm nay xác suất mưa khá cao (khoảng ' + weather.rainProb + '%), anh chị nhớ mang theo áo mưa hoặc ô dù khi ra ngoài nghen! ☔';
  }
  if (weather.tempMax >= 34) {
    return 'Trưa nay trời khá oi bức nắng gắt, mọi người nhớ uống nhiều nước và tránh nắng cẩn thận nha! 🥤☀️';
  }
  if (weather.tempMin <= 20) {
    return 'Thời tiết se lạnh, anh chị nhớ khoác thêm áo ấm kẻo cảm lạnh nè! 🧣🧥';
  }
  return 'Thời tiết hôm nay rất dễ chịu, thích hợp cho một ngày làm việc và học tập hiệu quả! 🌈✨';
}

module.exports = {
  getWeatherToday,
  getWeatherAdvice,
  VIETNAM_LOCATIONS
};

