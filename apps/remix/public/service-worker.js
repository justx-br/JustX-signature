// Minimal no-op service worker to avoid 404 noise in dev.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  // No-op
});

self.addEventListener('fetch', () => {
  // Let the network handle all requests.
});

