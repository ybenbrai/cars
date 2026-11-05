import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/**
 * Create the static file server used by `npm start` and the test suite.
 *
 * @param {{ root?: string, cacheControl?: string }} [options]
 * @returns {import('node:http').Server}
 */
export function createStaticServer({ root = process.cwd(), cacheControl = 'no-cache' } = {}) {
  const rootDir = resolve(root);

  return http.createServer(async (req, res) => {
    const method = req.method || 'GET';

    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, {
        ...SECURITY_HEADERS,
        Allow: 'GET, HEAD',
        'Content-Type': 'text/plain; charset=utf-8',
      }).end('Method not allowed');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    } catch {
      res.writeHead(400, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad request');
      return;
    }

    if (!pathname || pathname === '/') pathname = '/index.html';
    if (pathname.includes('\0')) {
      res.writeHead(400, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad request');
      return;
    }

    const file = resolve(join(rootDir, pathname));
    const rel = relative(rootDir, file);

    if (rel.startsWith('..') || isAbsolute(rel)) {
      res.writeHead(403, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Forbidden');
      return;
    }

    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Not a file');

      const data = await readFile(file);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': MIME_TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': data.byteLength,
        'Cache-Control': cacheControl,
      });

      if (method === 'HEAD') res.end();
      else res.end(data);
    } catch {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  });
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const args = process.argv.slice(2);
  const rootFlag = args.indexOf('--root');
  const positional = args.find((arg, index) => !arg.startsWith('-') && args[index - 1] !== '--root');
  const root = rootFlag !== -1 ? args[rootFlag + 1] : positional || process.cwd();
  const port = Number(process.env.PORT) || 5173;
  const server = createStaticServer({ root });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n  Port ${port} is already in use. Try: PORT=5174 npm start\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  });

  server.listen(port, () => {
    console.log(`\n  Sunset Drift → http://localhost:${port}\n  Serving ${resolve(root)}\n`);
  });
}
