# Security Policy — Dilivygo Community Edition

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email **security@dilivygo.com** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce (or a proof of concept)
- The version/commit you tested against
- Your contact details for follow-up

We aim to acknowledge reports within **3 business days** and will keep you
updated as we investigate and fix. Please give us reasonable time to address
the issue before any public disclosure (we target fixes within 30 days for
critical issues).

## Scope

This policy covers the Dilivygo Community Edition codebase in this repository:
the restaurant OS (POS, vendor, customer apps), shared packages, and the
community backend server.

Out of scope: the commercial Dilivygo Cloud hosted service and Marketplace
suite (report issues with those to support@dilivygo.com), third-party
dependencies (report upstream), and social-engineering or physical attacks.

## Supported versions

Security fixes are provided for the latest minor release of the Community
Edition. Self-hosters should keep their deployment updated; `docker compose`
users can pull the latest images/commits to stay current.

## No bounty program (yet)

We don't currently offer monetary bounties, but we credit reporters in release
notes (with your permission) and are deeply grateful — responsible disclosure
protects every restaurant running this software.
