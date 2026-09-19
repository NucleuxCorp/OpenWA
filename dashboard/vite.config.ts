import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Single source of truth for the version shown in the dashboard: the ROOT package.json, which is
// what a release bumps and what `npm run check:versions` gates. Resolved relative to this config
// file (not process.cwd()), because the dashboard is normally built from inside `dashboard/` — where
// cwd-relative resolution picks up `dashboard/package.json` instead. That file is not touched by a
// release, so the Login screen kept rendering whatever version it happened to be pinned at while the
// gateway moved on. The sidebar hid the drift by replacing the build-time value with the live
// version from the API (see Layout.tsx); the Login screen has no session yet, so it shows this
// constant verbatim. APP_VERSION env still overrides if explicitly provided.
const { version: pkgVersion } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
) as {
  version: string;
};

// Host to bind the dev server to. Defaults to 127.0.0.1 (fail-closed) so an unset
// variable never re-exposes the LAN/VPN surface; set MASIVO_DASH_HOST to the DHCP
// lease address to reach the dashboard from another machine.
const devHost = process.env.MASIVO_DASH_HOST || '127.0.0.1';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  appType: 'spa', // Enable SPA fallback for client-side routing
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || pkgVersion),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 2886,
    // Bound to a single interface, driven by MASIVO_DASH_HOST (default 127.0.0.1).
    // '0.0.0.0' also bound a VPN tunnel, the host-only virtual networks and the
    // lab switch. Because the proxy below forwards /api and
    // /socket.io to the OpenWA backend, anything reaching this port reaches the
    // WhatsApp gateway API -- so the surface is narrowed to the one interface that
    // actually needs it.
    //
    // NOTE: the LAN address comes from DHCP. If the lease changes, set
    // MASIVO_DASH_HOST to the new address rather than editing this file.
    host: devHost,
    // An explicit list instead of `true`: allowedHosts: true disables Vite's
    // Host-header allowlist, which is the defence against DNS rebinding.
    //
    // 'openwa.local' is the project's custom domain, mapped to 127.0.0.1 in the
    // Windows hosts file and used throughout docs/openwa-instalacion.md. Binding
    // to 127.0.0.1 does NOT cover it: the bind decides which interface accepts the
    // connection, while allowedHosts checks the Host header the browser sends -- so
    // http://OpenWA.local:2886 needs the name listed here or Vite answers 403.
    //
    // It MUST be spelled in lowercase. The hosts file, the docs and the browser's
    // address bar all say 'OpenWA.local', but Vite lowercases the incoming Host
    // header and then compares it case-sensitively against this list -- so the
    // mixed-case spelling silently fails to match and Vite answers 403 with
    // 'This host ("openwa.local") is not allowed'. Verified at runtime on Vite 8.1.4;
    // an entry that merely looks right is not the same as one that matches.
    //
    // This is a Host-header allowlist, not a CORS list. The dashboard calls the API
    // as '/api' through the proxy below, i.e. same-origin, so it never issues a
    // cross-origin request and needs no CORS_ORIGINS entry.
    allowedHosts: ['localhost', '127.0.0.1', 'openwa.local', devHost],
    proxy: {
      '/api': {
        target: 'http://localhost:2785',
        changeOrigin: true,
        secure: false,
      },
      // Proxy the WebSocket (socket.io) transport so the dashboard's real-time
      // chats/sessions streams work against the dev backend.
      '/socket.io': {
        target: 'http://localhost:2785',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
