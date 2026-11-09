# ZraCore Website Lab

A standalone demo site with public pages, a login form, authenticated pages, and a harmless GET search form. It does not contain exploit payloads or real user data and is not connected to the mobile Website UI.

## Run locally

Requires Node.js 20 or newer.

```sh
cd website-lab
npm start
```

Open `http://localhost:3000`. Local demo credentials are `labuser` / `lab-only-change-me`. The process binds to `127.0.0.1` by default.

## Deploy online with Docker

This lab can be deployed on a Docker-compatible host. Configure these environment variables in the host dashboard before deploying:

- `LAB_USERNAME`: a new lab-only username
- `LAB_PASSWORD`: a unique password with at least 16 characters
- `PORT`: use the port assigned by the hosting provider, if required
- `NODE_ENV=production`

Build and run locally as a deployment preview:

```sh
docker build -t zracore-website-lab .
docker run --rm -p 3000:3000 \
  -e LAB_USERNAME=labuser \
  -e LAB_PASSWORD='replace-with-a-unique-16-plus-character-password' \
  -e PORT=3000 \
  zracore-website-lab
```

In production the app requires credentials from environment variables, uses secure session cookies, applies security headers, and rate-limits login attempts. Use HTTPS at the hosting provider. This is a demo with in-memory sessions and no persistent storage; run one instance and do not use real accounts or sensitive data.

## Preview through Cloudflare Tunnel

Keep `npm start` running, then in a second terminal create a temporary HTTPS URL:

```sh
cloudflared tunnel --url http://localhost:3000
```

Open the `https://...trycloudflare.com` URL printed by `cloudflared` to preview the standalone lab. Quick Tunnels are temporary; anyone with the URL can open the public demo pages. Do not put real data or accounts in this lab.
