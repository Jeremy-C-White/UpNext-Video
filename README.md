# NextUp

A modern streaming dashboard that aggregates your library and resolves video streams via AIOStreams.

## NEXTUP VIDEO 3D Store

Authenticated desktop users can choose **Enter Video Store** from the header to open a walkable, nostalgic rental-store view of the same NextUp catalog. The store does not replace Firebase, library state, episode history, details, or playback; it is a code-split presentation layer over those existing systems.

The MVP targets current desktop browsers with WebGL 2 and a viewport at least 960px wide.

| Control | Action |
| --- | --- |
| WASD | Walk |
| Mouse | Look around |
| Shift | Move faster |
| E / left click | Pick up a highlighted case |
| Right click / Esc | Return a held case |
| F | Open the in-store title finder |
| M | Open the store map |
| Esc | Release the mouse and pause |

The 3D implementation lives in `src/store/`. Static case bodies are instanced, while each poster uses its own artwork-capable front surface. Shelf posters are requested at TMDB `w185`, held cases upgrade to `w500`, and a reference-counted texture cache explicitly disposes unused GPU textures. Movement uses authored static collision boxes rather than a physics engine. Video playback suspends the store render loop and ambience until the player closes.

Store ambience is generated with the Web Audio API after the user enters, so no copyrighted audio assets are required. The sound control in the store header can mute it at any time.

## Prerequisites

- Node.js (v18+)
- A provisioned Firebase project (for authentication and database)
- TMDB API Key
- AIOStreams service endpoint

## Browser Configuration

For public static deployments, open **Settings** in NextUp and enter the TMDB API key and AIOStreams/Torrentio manifest URL there. These values are stored only in that browser's local storage and are not synced to Firebase or GitHub.

The GitHub Pages workflow intentionally does not inject either value into the build. Vite environment variables become part of the public JavaScript bundle and must not contain a private, credential-bearing stream-provider URL.

## Environment Variables (private/self-hosted deployments)

For local development or a controlled self-hosted deployment, copy `.env.example` to `.env`:

```env
VITE_TMDB_API_KEY=your_tmdb_key
VITE_AIOSTREAMS_BASE_URL=https://your-aiostreams-instance.com
```

You must also configure Firebase credentials. The deployment process requires a `firebase-applet-config.json` file.

## Setup & Development

```sh
npm install
npm run dev
```

The application will start in development mode on port 3000.

## Production Build

To build the static SPA and the Node server entry:

```sh
npm run build
npm run start
```

Run the full verification suite with:

```sh
npm run lint
npm test
npm run build
```

## Deployment

The application is structured to be deployed as a static Single Page Application (SPA).
The `server.ts` file serves the production SPA and provides the existing `/api/debrid/stream` proxy used by playback. 

On GitHub Pages, the app falls back to requesting the configured stream provider directly because Pages cannot run the Node proxy. The provider must permit browser requests with appropriate CORS headers. Use the Node deployment when a provider requires server-side proxying.
