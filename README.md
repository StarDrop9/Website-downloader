# Complete Website Downloader

Download the browser-visible files for a website and package them for offline viewing. The application uses `wget` for mirroring and `archiver` for ZIP creation.

> This downloads public client-side resources that a web server exposes. It does **not** recover private server source code, databases, secrets, or unpublished backend logic.

## Security-hardened behavior

This fork adds defenses intended to make the downloader safer to operate:

- binds to loopback (`127.0.0.1`) by default and requires an access token before it will bind to a non-loopback interface;
- runs `wget` with `execFile` rather than a shell;
- accepts only HTTP/HTTPS targets and caps URL input length;
- rejects embedded URL credentials;
- blocks localhost, internal/local hostnames, private IPv4 space, loopback, link-local, metadata ranges, reserved ranges, IPv6 unique-local/link-local/multicast ranges, and mixed public/private DNS answers;
- limits ports to 80/443 unless explicitly overridden;
- disables `wget` redirects after target validation and restricts recursion to the validated hostname;
- disables ambient HTTP(S) proxy use in the `wget` process;
- enforces download quota, execution timeout, per-client rate limits, and a global concurrency cap;
- rejects foreign browser origins at the Socket.IO handshake;
- keeps generated ZIP files outside the Express public directory with private directory/file permissions;
- issues random one-time download links that expire and deletes archives after use/expiry;
- cleans stale runtime download/archive data when the process starts;
- supports access-token authentication for download jobs;
- sends restrictive HTTP security headers, including a CSP that does not allow inline scripts;
- removes the previous analytics/third-party scripts;
- runs URL/origin/listen-policy tests, a clean-checkout check, an application-load smoke test, `npm audit`, and CodeQL in GitHub Actions.

### Important network-isolation requirement

Application-level URL validation is defense in depth, not a replacement for network isolation. DNS can change between validation and a child process making its connection. For any internet-accessible deployment, run this service in a container/VM/network namespace whose **egress firewall blocks private, loopback, link-local, cloud metadata, and other internal network ranges**. Only outbound internet HTTP/HTTPS traffic needed by the downloader should be permitted.

Do not run the service as root.

## Clean checkout guarantee

Generated content must never be part of the repository. A fresh checkout is expected to contain:

- no tracked `*.zip` archives;
- no `downloads/` runtime directory;
- no `archives/` runtime directory;
- no real `.env` files, private keys, or local editor/runtime residue.

GitHub Actions checks these conditions on the hardening branch and pull requests. `.gitignore` also excludes generated archives, runtime working data, secrets, keys, and common machine-specific files.

## Requirements

- Node.js 18 or newer (Node 20 LTS recommended)
- `wget` available on `PATH`

Install `wget` with your platform package manager, for example:

- Debian/Ubuntu: `apt install wget`
- macOS: `brew install wget`
- Windows: `winget install JernejSimoncic.Wget`

## Run

```sh
npm ci
npm test
npm start
```

Then open `http://localhost:3000/`.

## Configuration

Copy `.env.example` into your deployment configuration system. Do **not** commit the real values.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Listen address; non-loopback values require an access token |
| `PORT` | `3000` | HTTP listen port |
| `WEBSITE_DOWNLOADER_ACCESS_TOKEN` | unset | Optional on loopback; required for non-loopback binds |
| `WEBSITE_DOWNLOADER_ALLOWED_ORIGIN` | unset | Optional browser-facing origin when a reverse proxy changes the Host header |
| `DOWNLOAD_QUOTA` | `100m` | `wget` total download ceiling per job |
| `DOWNLOAD_TIMEOUT_MS` | `300000` | Maximum job runtime |
| `MAX_CONCURRENT_DOWNLOADS` | `2` | Global simultaneous job limit |
| `RATE_LIMIT_WINDOW_MS` | `600000` | Per-client rate-limit window |
| `RATE_LIMIT_MAX_DOWNLOADS` | `5` | Jobs allowed per client/window |
| `DOWNLOAD_LINK_TTL_MS` | `600000` | Lifetime of one-time archive links |
| `ALLOW_NONSTANDARD_PORTS` | `false` | Permit public website ports other than 80/443 |

For a network-accessible deployment, set `HOST=0.0.0.0`, configure a long random `WEBSITE_DOWNLOADER_ACCESS_TOKEN`, set `WEBSITE_DOWNLOADER_ALLOWED_ORIGIN` when required by your reverse proxy, and put the service behind TLS and an egress-restricted container/VM.

## Mirroring behavior

The downloader uses the equivalent of these core `wget` behaviors:

- mirror recursively;
- convert links for offline use;
- adjust file extensions;
- retrieve page requisites;
- do not ascend to parent paths;
- stay on the validated hostname;
- do not follow redirects after validation.

The redirect restriction is intentional security hardening. If a URL redirects (for example HTTP to HTTPS), enter the final HTTPS URL directly.

## Legal/use note

Only download and reuse material you are authorized to access and use. Public availability does not remove copyright, licensing, trademark, privacy, or terms-of-service obligations.

## Upstream

Originally based on Ahmad Ibrahim's Website-downloader project:
`AhmadIbrahiim/Website-downloader`.

Licensed under the repository's existing license.
