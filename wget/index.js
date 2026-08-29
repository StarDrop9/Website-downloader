'use strict';

var execFile = require('child_process').execFile;
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var archive = require('../archiver');
var registry = require('../security/download-registry');
var urlPolicy = require('../security/url-policy');

var DOWNLOAD_ROOT = path.join(__dirname, '..', 'downloads');
var QUOTA = process.env.DOWNLOAD_QUOTA || '100m';
var TIMEOUT_MS = positiveNumber(process.env.DOWNLOAD_TIMEOUT_MS, 5 * 60 * 1000);

initializeDownloadRoot();

module.exports = function (socket, data, onFinished) {
  var done = typeof onFinished === 'function' ? onFinished : function () {};
  var child = null;
  var timer = null;
  var jobDir = null;
  var settled = false;
  var cancelled = false;
  var stderrTail = [];

  function send(payload) {
    try {
      socket.emit('status', payload);
    } catch (err) {
      console.error('Could not send socket status: ' + err.message);
    }
  }

  function settle() {
    if (settled) return false;
    settled = true;
    if (timer) clearTimeout(timer);
    done();
    return true;
  }

  function fail(message) {
    if (!settle()) return;
    if (jobDir) removeJobDir(jobDir);
    send({ error: message });
  }

  var controller = {
    cancel: function () {
      cancelled = true;
      if (child) {
        try { child.kill(); } catch (ignore) {}
      }
      if (jobDir) removeJobDir(jobDir);
      settle();
    }
  };

  Promise.resolve()
    .then(function () {
      return urlPolicy.validateTarget(data && data.website);
    })
    .then(function (target) {
      if (cancelled || settled) return;

      var jobId = crypto.randomBytes(16).toString('hex');
      jobDir = path.join(DOWNLOAD_ROOT, jobId);
      fs.mkdirSync(jobDir, { recursive: true, mode: 0o700 });

      // execFile avoids a shell entirely. Redirects are disabled so an
      // initially public URL cannot redirect wget into localhost/private
      // services after validation. Recursive crawling is restricted to the
      // validated hostname and wget is forbidden from using ambient proxies.
      var args = [
        '--mirror',
        '--convert-links',
        '--adjust-extension',
        '--page-requisites',
        '--no-parent',
        '--no-if-modified-since',
        '--no-proxy',
        '--max-redirect=0',
        '--domains=' + target.hostname,
        '--quota=' + QUOTA,
        '--dns-timeout=10',
        '--connect-timeout=15',
        '--read-timeout=30',
        '--tries=2',
        '--restrict-file-names=unix',
        target.href
      ];

      child = execFile('wget', args, {
        cwd: jobDir,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
        env: safeChildEnvironment(process.env)
      });

      timer = setTimeout(function () {
        if (settled) return;
        try { child.kill(); } catch (ignore) {}
        fail('The download exceeded the configured time limit and was stopped.');
      }, TIMEOUT_MS);

      child.on('error', function (err) {
        if (settled) return;
        if (err.code === 'ENOENT') {
          fail('wget is not installed on the server. Install wget and restart the app.');
          return;
        }
        fail('Could not start the download: ' + err.message);
      });

      child.stderr.on('data', function (chunk) {
        if (settled) return;
        var text = chunk.toString();
        stderrTail = stderrTail.concat(text.split('\n')).slice(-60);
        send({ progress: text });
      });

      child.on('close', function (code) {
        if (settled) return;
        if (cancelled) {
          if (jobDir) removeJobDir(jobDir);
          settle();
          return;
        }
        if (timer) clearTimeout(timer);

        if (countFiles(jobDir) === 0) {
          fail('Nothing could be downloaded from ' + target.hostname + '. ' +
            explainFailure(stderrTail, code));
          return;
        }

        send({ progress: 'Converting' });
        var zipName = target.hostname.replace(/[^a-zA-Z0-9._-]/g, '_') + '-' + jobId;
        archive(jobDir, zipName, function (err, result) {
          removeJobDir(jobDir);
          if (settled) {
            if (result && result.path) registry.safeUnlink(result.path);
            return;
          }
          if (err || !result) {
            fail('The site downloaded but could not be compressed: ' +
              (err ? err.message : 'unknown archive error'));
            return;
          }

          var token;
          try {
            token = registry.register(result.path, result.name);
          } catch (registerErr) {
            registry.safeUnlink(result.path);
            fail('The archive could not be registered for download: ' + registerErr.message);
            return;
          }

          send({ progress: 'Completed', file: token });
          settle();
        });
      });
    })
    .catch(function (err) {
      if (!settled) fail(err && err.message ? err.message : 'The website address was rejected.');
    });

  return controller;
};

function explainFailure(lines, exitCode) {
  var interesting = /failed|unable|refused|denied|ERROR \d|error \d|robots|No such|not found|forbidden|timed out|giving up|Unsupported scheme|redirection/i;
  for (var i = lines.length - 1; i >= 0; i--) {
    var line = lines[i].trim();
    if (line && interesting.test(line)) return line;
  }
  if (exitCode === 8) return 'The server refused the request or redirected it.';
  return 'wget exited with code ' + exitCode + ' without saving any files.';
}

function countFiles(directory) {
  var total = 0;
  var entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (err) {
    return 0;
  }
  for (var i = 0; i < entries.length; i++) {
    var full = path.join(directory, entries[i].name);
    if (entries[i].isDirectory()) total += countFiles(full);
    else if (entries[i].isFile()) total++;
  }
  return total;
}

function removeJobDir(directory) {
  var resolved = path.resolve(directory);
  var root = path.resolve(DOWNLOAD_ROOT);
  if (resolved === root || !resolved.startsWith(root + path.sep)) {
    console.error('Refusing to delete a path outside the downloads folder: ' + resolved);
    return;
  }
  try {
    fs.rmSync(resolved, { recursive: true, force: true });
  } catch (err) {
    console.error('Could not clean up ' + resolved + ': ' + err.message);
  }
}

function initializeDownloadRoot() {
  fs.mkdirSync(DOWNLOAD_ROOT, { recursive: true, mode: 0o700 });
  var entries = fs.readdirSync(DOWNLOAD_ROOT, { withFileTypes: true });
  entries.forEach(function (entry) {
    var full = path.join(DOWNLOAD_ROOT, entry.name);
    try {
      fs.rmSync(full, { recursive: true, force: true });
    } catch (err) {
      console.error('Could not remove stale download ' + full + ': ' + err.message);
    }
  });
}

function safeChildEnvironment(source) {
  var env = {};
  ['PATH', 'SystemRoot', 'WINDIR', 'HOME', 'TMP', 'TEMP', 'TMPDIR', 'LANG', 'LC_ALL'].forEach(function (key) {
    if (source[key]) env[key] = source[key];
  });
  env.http_proxy = '';
  env.https_proxy = '';
  env.HTTP_PROXY = '';
  env.HTTPS_PROXY = '';
  env.ALL_PROXY = '';
  env.all_proxy = '';
  return env;
}

function positiveNumber(value, fallback) {
  var parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
