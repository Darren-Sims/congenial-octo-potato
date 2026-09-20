// Minimal, dependency-free user-agent parsing - identical logic to the
// Node version. Only needs to sort visits into broad buckets, not
// fingerprint anyone.

const BOT_PATTERN =
  /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|headless|phantom|lighthouse|pingdom|uptimerobot|monitor|preview|curl|wget|python-requests|axios|go-http-client|postmanruntime/i;

export function isBot(ua) {
  if (!ua) return true;
  return BOT_PATTERN.test(ua);
}

export function deviceType(ua) {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function browserName(ua) {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Other';
}

export function osName(ua) {
  if (/windows/i.test(ua)) return 'Windows';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/mac os x|macintosh/i.test(ua)) return 'macOS';
  if (/android/i.test(ua)) return 'Android';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Other';
}
