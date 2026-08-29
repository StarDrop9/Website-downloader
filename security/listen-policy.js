'use strict';

function normalizeHost(value) {
  if (typeof value !== 'string' || !value.trim()) return '127.0.0.1';
  return value.trim();
}

function isLoopbackHost(value) {
  var host = normalizeHost(value).toLowerCase();
  return host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === 'localhost';
}

function validateListen(hostValue, accessToken) {
  var host = normalizeHost(hostValue);
  if (!isLoopbackHost(host) && (typeof accessToken !== 'string' || !accessToken)) {
    throw new Error('A WEBSITE_DOWNLOADER_ACCESS_TOKEN is required when binding outside loopback.');
  }
  return host;
}

module.exports = {
  normalizeHost: normalizeHost,
  isLoopbackHost: isLoopbackHost,
  validateListen: validateListen
};
