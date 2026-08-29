'use strict';

function isAllowedOrigin(origin, requestHost, configuredOrigin) {
  if (!origin) return true;

  var parsed;
  try {
    parsed = new URL(origin);
  } catch (err) {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  if (configuredOrigin) {
    try {
      return parsed.origin === new URL(configuredOrigin).origin;
    } catch (err) {
      return false;
    }
  }

  if (typeof requestHost !== 'string' || !requestHost.trim()) return false;
  var host = requestHost.split(',')[0].trim().toLowerCase();
  return parsed.host.toLowerCase() === host;
}

module.exports = {
  isAllowedOrigin: isAllowedOrigin
};
