'use strict';

var express = require('express');
var path = require('path');
var router = express.Router();

router.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

router.get('/config', function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    requireAccessToken: Boolean(process.env.WEBSITE_DOWNLOADER_ACCESS_TOKEN)
  });
});

module.exports = router;
