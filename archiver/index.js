'use strict';

var archiver = require('archiver');
var fs = require('fs');
var path = require('path');
var registry = require('../security/download-registry');

var ARCHIVE_ROOT = registry.ARCHIVE_ROOT;

module.exports = function (sourceDir, zipName, callback) {
  var settled = false;
  registry.initialize();

  var safeBase = String(zipName || 'website').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  var zipPath = path.join(ARCHIVE_ROOT, safeBase + '.zip');
  var output = fs.createWriteStream(zipPath, { flags: 'wx', mode: 0o600 });
  var archive = archiver('zip', { zlib: { level: 9 } });

  function finish(err) {
    if (settled) return;
    settled = true;
    if (err) registry.safeUnlink(zipPath);
    callback(err, err ? null : {
      path: zipPath,
      name: safeBase + '.zip'
    });
  }

  output.on('close', function () {
    finish(null);
  });
  output.on('error', finish);

  archive.on('warning', function (err) {
    console.warn('archive warning: ' + err.message);
  });
  archive.on('error', function (err) {
    try { output.destroy(); } catch (ignore) {}
    finish(err);
  });

  archive.pipe(output);
  archive.directory(sourceDir, false);
  archive.finalize();

  return archive;
};
