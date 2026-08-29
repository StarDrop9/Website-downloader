'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var ARCHIVE_ROOT = path.join(__dirname, '..', 'archives');
var TTL_MS = positiveNumber(process.env.DOWNLOAD_LINK_TTL_MS, 10 * 60 * 1000);
var entries = new Map();
var initialized = false;

function initialize() {
  if (initialized) return;
  initialized = true;
  fs.mkdirSync(ARCHIVE_ROOT, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(ARCHIVE_ROOT, 0o700); } catch (err) {
    console.error('Could not restrict archive directory permissions: ' + err.message);
  }

  // Tokens live only in memory, so archives left by a previous process cannot
  // be downloaded safely. Remove them at startup rather than leaving residue.
  var files = fs.readdirSync(ARCHIVE_ROOT, { withFileTypes: true });
  files.forEach(function (entry) {
    if (entry.isFile()) safeUnlink(path.join(ARCHIVE_ROOT, entry.name));
  });

  var timer = setInterval(purgeExpired, Math.min(TTL_MS, 60 * 1000));
  if (timer.unref) timer.unref();
}

function register(filePath, downloadName) {
  initialize();
  var resolved = path.resolve(filePath);
  var root = path.resolve(ARCHIVE_ROOT);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error('Refusing to register an archive outside the archive directory.');
  }

  var token = crypto.randomBytes(32).toString('hex');
  entries.set(token, {
    path: resolved,
    name: sanitizeDownloadName(downloadName),
    expiresAt: Date.now() + TTL_MS
  });
  return token;
}

function consume(token) {
  purgeExpired();
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  var entry = entries.get(token);
  if (!entry) return null;
  entries.delete(token);
  if (entry.expiresAt <= Date.now()) {
    safeUnlink(entry.path);
    return null;
  }
  return entry;
}

function purgeExpired() {
  var now = Date.now();
  entries.forEach(function (entry, token) {
    if (entry.expiresAt <= now) {
      entries.delete(token);
      safeUnlink(entry.path);
    }
  });
}

function safeUnlink(filePath) {
  var resolved = path.resolve(filePath);
  var root = path.resolve(ARCHIVE_ROOT);
  if (!resolved.startsWith(root + path.sep)) return;
  try {
    fs.rmSync(resolved, { force: true });
  } catch (err) {
    console.error('Could not remove archive ' + resolved + ': ' + err.message);
  }
}

function sanitizeDownloadName(name) {
  var safe = String(name || 'website.zip').replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safe.toLowerCase().endsWith('.zip')) safe += '.zip';
  return safe.slice(0, 160);
}

function positiveNumber(value, fallback) {
  var parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  ARCHIVE_ROOT: ARCHIVE_ROOT,
  initialize: initialize,
  register: register,
  consume: consume,
  purgeExpired: purgeExpired,
  safeUnlink: safeUnlink
};
