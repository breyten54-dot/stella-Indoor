// Tiny zero-dependency static file server for LOCAL E2E runs (SPA-safe, hash- or history-routing).
// Reusable: serve the built admin (dist-admin) and/or client (dist) without installing `serve`.
// Usage: node testing-tools/local-static-server.js <port> <dir> [<port> <dir> ...]
//   e.g. node testing-tools/local-static-server.js 3301 ../stella-indoor-source/dist-admin 3302 ../stella-indoor-source/dist
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.txt': 'text/plain', '.pdf': 'application/pdf',
};

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2 !== 0) {
  console.error('usage: node local-static-server.js <port> <dir> [<port> <dir> ...]');
  process.exit(1);
}

for (let i = 0; i < args.length; i += 2) {
  const port = Number(args[i]);
  const root = path.resolve(args[i + 1]);
  if (!Number.isInteger(port) || port <= 0) { console.error(`bad port: ${args[i]}`); process.exit(1); }
  if (!fs.existsSync(root)) { console.error(`dir not found: ${root}`); process.exit(1); }

  http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    let file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; } // traversal guard
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(root, 'index.html'); // SPA fallback
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
}
