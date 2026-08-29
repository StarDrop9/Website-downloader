'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var policy = require('../security/url-policy');
var originPolicy = require('../security/origin-policy');
var listenPolicy = require('../security/listen-policy');

test('rejects non-http schemes', function () {
  assert.throws(function () { policy.parseTarget('file:///etc/passwd'); }, /Only http/);
});

test('rejects embedded credentials', function () {
  assert.throws(function () { policy.parseTarget('https://user:pass@example.com'); }, /Credentials/);
});

test('rejects excessively long URL input', function () {
  assert.throws(function () {
    policy.parseTarget('https://example.com/' + 'a'.repeat(5000));
  }, /too long/);
});

test('rejects localhost and internal hostnames', function () {
  assert.throws(function () { policy.parseTarget('http://localhost'); }, /Local and internal/);
  assert.throws(function () { policy.parseTarget('https://service.internal'); }, /Local and internal/);
  assert.throws(function () { policy.parseTarget('https://router.home.arpa'); }, /Local and internal/);
});

test('rejects dangerous IPv4 targets', function () {
  ['127.0.0.1', '10.0.0.1', '172.16.1.2', '192.168.1.1', '169.254.169.254', '0.0.0.0']
    .forEach(function (address) {
      assert.equal(policy.isBlockedIp(address), true, address);
    });
});

test('rejects dangerous IPv6 targets', function () {
  ['::1', '::ffff:127.0.0.1', 'fc00::1', 'fd12::1', 'fe80::1', 'ff02::1', '2001:db8::1']
    .forEach(function (address) {
      assert.equal(policy.isBlockedIp(address), true, address);
    });
});

test('allows representative public addresses', function () {
  assert.equal(policy.isBlockedIp('1.1.1.1'), false);
  assert.equal(policy.isBlockedIp('8.8.8.8'), false);
  assert.equal(policy.isBlockedIp('2606:4700:4700::1111'), false);
});

test('rejects a hostname if any DNS answer is private', async function () {
  await assert.rejects(function () {
    return policy.validateTarget('https://example.com', async function () {
      return [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 }
      ];
    });
  }, /resolves to a private/);
});

test('accepts a hostname whose DNS answers are public', async function () {
  var target = await policy.validateTarget('https://example.com', async function () {
    return [{ address: '93.184.216.34', family: 4 }];
  });
  assert.equal(target.protocol, 'https:');
  assert.equal(target.hostname, 'example.com');
});

test('rejects nonstandard ports by default', function () {
  assert.throws(function () { policy.parseTarget('https://example.com:8443'); }, /ports 80 and 443/);
});

test('allows same-origin browser socket handshakes', function () {
  assert.equal(originPolicy.isAllowedOrigin('https://download.example.com', 'download.example.com'), true);
  assert.equal(originPolicy.isAllowedOrigin('http://localhost:3000', 'localhost:3000'), true);
});

test('rejects foreign and malformed browser socket origins', function () {
  assert.equal(originPolicy.isAllowedOrigin('https://evil.example', 'download.example.com'), false);
  assert.equal(originPolicy.isAllowedOrigin('null', 'download.example.com'), false);
  assert.equal(originPolicy.isAllowedOrigin('file:///tmp/test', 'download.example.com'), false);
});

test('honors an explicitly configured public origin', function () {
  assert.equal(originPolicy.isAllowedOrigin(
    'https://downloads.example.com',
    'internal-proxy:3000',
    'https://downloads.example.com'
  ), true);
  assert.equal(originPolicy.isAllowedOrigin(
    'https://evil.example',
    'internal-proxy:3000',
    'https://downloads.example.com'
  ), false);
});

test('allows non-browser clients that send no Origin header', function () {
  assert.equal(originPolicy.isAllowedOrigin(undefined, undefined), true);
});

test('binds to loopback by default without requiring a token', function () {
  assert.equal(listenPolicy.validateListen(undefined, undefined), '127.0.0.1');
  assert.equal(listenPolicy.validateListen('localhost', ''), 'localhost');
  assert.equal(listenPolicy.validateListen('::1', ''), '::1');
});

test('requires an access token for non-loopback binds', function () {
  assert.throws(function () {
    listenPolicy.validateListen('0.0.0.0', '');
  }, /ACCESS_TOKEN/);
  assert.equal(listenPolicy.validateListen('0.0.0.0', 'long-random-token'), '0.0.0.0');
});
