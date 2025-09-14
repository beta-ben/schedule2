// Minimal no-op service worker to enable PWA install; no caching yet.
self.addEventListener('install', (event) => {
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  clients.claim()
})
