'use strict';

var dns = require('dns').promises;
var net = require('net');

var MAX_URL_LENGTH = 4096;
var BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'kubernetes.default',
  'kubernetes.default.svc'
]);

function parseTarget(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('That does not look like a website address.');
  }

  var raw = input.trim();
  if (raw.length > MAX_URL_LENGTH) {
    throw new Error('The website address is too long.');
  }

  var url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : 'https://' + raw);
  } catch (err) {
    throw new Error('That does not look like a website address.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http:// and https:// addresses are allowed.');
  }
  if (!url.hostname) {
    throw new Error('A hostname is required.');
  }
  if (url.username || url.password) {
    throw new Error('Credentials embedded in URLs are not allowed.');
  }

  var hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') || hostname.endsWith('.internal') ||
      hostname.endsWith('.home.arpa')) {
    throw new Error('Local and internal hostnames are not allowed.');
  }

  if (process.env.ALLOW_NONSTANDARD_PORTS !== 'true' &&
      url.port && url.port !== '80' && url.port !== '443') {
    throw new Error('Only ports 80 and 443 are allowed.');
  }

  if (net.isIP(hostname) && isBlockedIp(hostname)) {
    throw new Error('Private, loopback, link-local and reserved addresses are not allowed.');
  }

  return url;
}

async function validateTarget(input, lookup) {
  var url = parseTarget(input);
  var resolver = lookup || dns.lookup.bind(dns);
  var hostname = url.hostname;

  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error('Private, loopback, link-local and reserved addresses are not allowed.');
    }
    return url;
  }

  var records = await resolver(hostname, { all: true, verbatim: true });
  if (!Array.isArray(records)) records = [records];
  if (!records.length) throw new Error('The hostname did not resolve to an address.');

  for (var i = 0; i < records.length; i++) {
    var address = records[i] && records[i].address;
    if (!address || isBlockedIp(address)) {
      throw new Error('The hostname resolves to a private, loopback, link-local or reserved address.');
    }
  }

  return url;
}

function isBlockedIp(address) {
  if (typeof address !== 'string') return true;
  var value = address.toLowerCase().split('%')[0];
  var family = net.isIP(value);
  if (!family) return true;

  if (family === 4) return isBlockedIpv4(value);

  if (value.startsWith('::')) return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true;
  if (value.startsWith('fe')) return true;
  if (value.startsWith('ff')) return true;
  if (value === '2001:db8::' || value.startsWith('2001:db8:')) return true;

  return false;
}

function isBlockedIpv4(address) {
  var parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(function (part) {
    return !Number.isInteger(part) || part < 0 || part > 255;
  })) return true;

  var a = parts[0];
  var b = parts[1];

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true;

  return false;
}

module.exports = {
  parseTarget: parseTarget,
  validateTarget: validateTarget,
  isBlockedIp: isBlockedIp
};
