'use strict';

(function () {
  var count = 0;
  var downloadBtn = document.getElementById('download');
  var archiveBtn = document.getElementById('archiveDownload');
  var websiteInput = document.getElementById('website');
  var progressBar = document.getElementById('progress');
  var filesLine = document.getElementById('nFilesP');
  var filesCount = document.getElementById('nFiles');
  var log = document.getElementById('log');
  var socket = io();

  fetch('/config', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error('configuration request failed');
      return response.json();
    })
    .then(function (config) {
      if (!config.requireAccessToken) return;
      var token = window.sessionStorage.getItem('websiteDownloaderAccessToken') || '';
      if (!token) token = window.prompt('Enter the Website Downloader access token:') || '';
      if (token) {
        window.sessionStorage.setItem('websiteDownloaderAccessToken', token);
        socket.emit('authenticate', token);
      } else {
        downloadBtn.disabled = true;
        log.textContent = 'Authentication is required.';
      }
    })
    .catch(function () {
      downloadBtn.disabled = true;
      log.textContent = 'Could not load server configuration.';
    });

  socket.on('auth-status', function (event) {
    if (event && event.ok) return;
    window.sessionStorage.removeItem('websiteDownloaderAccessToken');
    downloadBtn.disabled = true;
    log.textContent = 'Authentication failed. Reload the page and try again.';
  });

  socket.on('status', function (event) {
    if (!event) return;
    if (event.error) {
      progressBar.hidden = true;
      log.textContent = String(event.error).slice(0, 1000);
      downloadBtn.disabled = false;
      return;
    }

    progressBar.hidden = false;
    if (event.progress === 'Converting') {
      log.textContent = 'Compressing website archive...';
    } else if (event.progress === 'Completed') {
      progressBar.hidden = true;
      log.textContent = 'Archive ready. The link is one-time and expires automatically.';
      archiveBtn.hidden = false;
      archiveBtn.onclick = function () {
        archiveBtn.disabled = true;
        window.location.assign('/download/' + encodeURIComponent(event.file));
      };
      downloadBtn.disabled = false;
    } else if (typeof event.progress === 'string') {
      if (event.progress.indexOf('200 OK') !== -1) count++;
      filesLine.hidden = false;
      filesCount.textContent = String(count);
      log.textContent = event.progress.slice(-4000);
    }
  });

  document.getElementById('downloadForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var website = websiteInput.value.trim();
    if (!website) return;
    count = 0;
    filesCount.textContent = '0';
    log.textContent = '';
    archiveBtn.hidden = true;
    archiveBtn.disabled = false;
    downloadBtn.disabled = true;
    socket.emit('request', { website: website });
  });
}());
