'use strict';

var crypto = require('crypto');
var wget = require('../wget');

var ACCESS_TOKEN = process.env.WEBSITE_DOWNLOADER_ACCESS_TOKEN || '';
var MAX_CONCURRENT = positiveNumber(process.env.MAX_CONCURRENT_DOWNLOADS, 2);
var RATE_WINDOW_MS = positiveNumber(process.env.RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000);
var RATE_MAX = positiveNumber(process.env.RATE_LIMIT_MAX_DOWNLOADS, 5);
var activeJobs = 0;
var rateBuckets = new Map();

module.exports = function (io) {
  io.on('connection', function (socket) {
    socket.authenticated = !ACCESS_TOKEN;
    socket.job = null;

    socket.on('authenticate', function (token) {
      if (!ACCESS_TOKEN) {
        socket.authenticated = true;
        socket.emit('auth-status', { ok: true });
        return;
      }

      if (safeEqual(token, ACCESS_TOKEN)) {
        socket.authenticated = true;
        socket.emit('auth-status', { ok: true });
        return;
      }

      socket.emit('auth-status', { ok: false });
      socket.disconnect(true);
    });

    socket.on('request', function (data) {
      if (!socket.authenticated) {
        socket.emit('status', { error: 'Authentication is required.' });
        return;
      }
      if (socket.job) {
        socket.emit('status', { error: 'A download is already running on this connection.' });
        return;
      }
      if (activeJobs >= MAX_CONCURRENT) {
        socket.emit('status', { error: 'The server is at its download concurrency limit. Try again later.' });
        return;
      }

      var ip = clientAddress(socket);
      if (!takeRateSlot(ip)) {
        socket.emit('status', { error: 'Download rate limit reached. Try again later.' });
        return;
      }

      activeJobs++;
      var released = false;
      function release() {
        if (released) return;
        released = true;
        activeJobs = Math.max(0, activeJobs - 1);
        socket.job = null;
      }

      try {
        socket.job = wget(socket, data || {}, release);
      } catch (err) {
        release();
        socket.emit('status', { error: 'Could not start the download.' });
      }
    });

    socket.on('disconnect', function () {
      if (socket.job) {
        socket.job.cancel();
        socket.job = null;
      }
    });
  });
};

function takeRateSlot(key) {
  var now = Date.now();
  var bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    pruneBuckets(now);
    return true;
  }
  if (bucket.count >= RATE_MAX) return false;
  bucket.count++;
  return true;
}

function pruneBuckets(now) {
  if (rateBuckets.size < 1000) return;
  rateBuckets.forEach(function (bucket, key) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  });
}

function clientAddress(socket) {
  var address = socket && socket.handshake && socket.handshake.address;
  if (typeof address === 'string' && address) return address;
  return 'unknown';
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  var a = Buffer.from(left);
  var b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function positiveNumber(value, fallback) {
  var parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
