'use strict';

var express = require('express');
var path = require('path');
var registry = require('./security/download-registry');
var indexRouter = require('./routes/index');

var app = express();
registry.initialize();

app.disable('x-powered-by');

app.use(function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join('; '));
  next();
});

app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

app.get('/download/:token', function (req, res, next) {
  var entry = registry.consume(req.params.token);
  if (!entry) {
    res.status(404).type('text/plain').send('This download link is invalid, expired, or has already been used.');
    return;
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.download(entry.path, entry.name, function (err) {
    registry.safeUnlink(entry.path);
    if (err && !res.headersSent) next(err);
  });
});

app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny',
  fallthrough: true,
  index: false
}));

app.use('/', indexRouter);

app.use(function (req, res) {
  res.status(404).type('text/plain').send('Not found');
});

app.use(function (err, req, res, next) {
  console.error(err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).type('text/plain').send('Internal server error');
});

module.exports = app;
