# Patient Zero — Multiplayer Horror MVP

A beginner-oriented real-time browser multiplayer horror game. The server is authoritative for movement, role assignment, task interactions, infection, the round timer and win conditions. Player position updates are filtered per viewer using vision radius and wall line-of-sight checks.

## Requirements
- Node.js 20+ (no external npm packages required)

## Run locally
```bash
npm test
npm start
```
Open http://localhost:3000 in two separate browser sessions (use a normal window and an incognito window). Create a room in one and join the room code in the other. Both players must click Ready before the host can start.

## Controls
- PC: WASD or arrow keys to move; hold E to interact.
- Mobile: virtual joystick and hold the INTERACT button.
- Survivors: repair all three systems and escape.
- Infected: hold near an uninfected survivor to infect; hold near a repaired system to sabotage.
- Lobby text chat is disabled during the match.

## Deployment
Deploy the Node server to a host that supports long-lived WebSocket connections. The same server serves the static frontend in this MVP, so it can be deployed as a single Node web service for initial public testing. Netlify static hosting can be introduced by moving `client/` to Netlify and configuring the client WebSocket URL to the backend origin; do not deploy the WebSocket server as an ordinary short-lived function.

## MVP notes
This first version is a working foundation and needs continued playtesting. Reconnection, host transfer, and some sabotage/exit edge cases should be verified in independent browser sessions before calling the game production-ready. The visual style is drawn procedurally; no external assets are required.

## Current verification status
Automated game-rule tests cover nickname sanitization, line-of-sight filtering, role assignment, lobby readiness, repair, infection, sabotage, escape victory, timer victory, and rematch reset. A live two-WebSocket-session smoke test also verified room creation/joining, ready/start, movement synchronization, private role assignment, filtered opponent state, and reconnecting with the same player ID and role.

## MVP implementation note
To make this first version runnable without fetching npm packages in the build environment, the client uses native Canvas and the backend includes a small WebSocket protocol implementation. This differs from the proposed Phaser/Colyseus stack. The server is authoritative, but the custom WebSocket layer is intended for this MVP only; before a public production launch, replace it with a maintained WebSocket library and add production hardening (origin checks, rate limits, connection limits, and deployment configuration).

## Publish a public playable URL (Render)

This project includes a `render.yaml` Blueprint for a single Node web service. The app serves the browser game and its WebSocket multiplayer server from the same service.

1. Create a GitHub repository and upload the contents of this folder (the `package.json`, `render.yaml`, `server/`, and `client/` should be at the repository root).
2. In Render, choose **New → Blueprint**, connect that repository, and deploy the `render.yaml` configuration.
3. Wait for the service to finish deploying. Render will provide a public `https://...onrender.com` URL.
4. Open that URL on two separate devices or browser sessions. Create a room on one, join with the room code on the other, ready both players, and start a match.
5. Test the public URL before submitting. Free services may sleep after inactivity, so the first load can take a little time.

A public URL is **not created by this project file itself**. You must complete deployment in a hosting account and use the actual URL Render gives you. Do not submit `localhost` or a guessed URL.
