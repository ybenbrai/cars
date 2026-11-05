# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | ✅ |

Sunset Drift is a client-side browser game. It has no backend, no accounts and
no server-side persistence. The only stored data is the driver profile, car
looks and best lap kept in the browser's `localStorage`.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include the affected file or URL, browser and version, reproduction steps
   and the potential impact.

If private reporting is unavailable, contact the maintainer through the
[ybenbrai GitHub profile](https://github.com/ybenbrai) and ask for a private
channel.

## What to include

- A clear description of the issue and its impact.
- Steps to reproduce, ideally with a minimal proof of concept.
- The browser, operating system and commit/version where it occurs.
- Whether the issue requires a malicious profile, URL, dependency or local
  access.

## Scope

In scope:

- Cross-site scripting or DOM injection in the game UI.
- Path traversal or unexpected file disclosure in `server.mjs`.
- Dependency or CDN compromise that the project can mitigate.
- Unsafe handling of imported profile data.

Out of scope:

- Cheating in local single-player time trials.
- Issues that require an already-compromised browser or machine.
- Denial of service against your own local development server.
- Third-party CDN or font provider outages.

## Response

Maintainers aim to acknowledge reports within a few days, validate the issue,
prepare a fix and coordinate disclosure. Credit will be given unless the
reporter prefers to remain anonymous.
