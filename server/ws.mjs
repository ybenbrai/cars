// Minimal RFC 6455 WebSocket server endpoint (text frames only).
//
// The game server is dependency-free, so this implements just what the online
// lobby needs: the upgrade handshake, masked client frames, fragmentation,
// ping/pong keep-alive, close handshake, and hard limits on message size and
// outbound buffering.

import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const MAX_MESSAGE = 16 * 1024;
const MAX_BUFFERED = 1024 * 1024;
const PING_EVERY_MS = 15_000;

export function acceptKey(key) {
  return createHash('sha1').update(key + GUID).digest('base64');
}

/** Encode one unmasked server frame. */
export function encodeFrame(opcode, payload = Buffer.alloc(0)) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, payload]);
}

/**
 * Complete a WebSocket upgrade on `socket` and return a small connection
 * object. Returns null (after answering with an HTTP error) when the request
 * is not a valid WebSocket handshake.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:stream').Duplex} socket
 * @param {{ onMessage: (text: string) => void, onClose: () => void }} handlers
 */
export function upgrade(req, socket, head, { onMessage, onClose }) {
  const key = req.headers['sec-websocket-key'];
  if (
    req.method !== 'GET'
    || String(req.headers.upgrade || '').toLowerCase() !== 'websocket'
    || req.headers['sec-websocket-version'] !== '13'
    || typeof key !== 'string'
    || Buffer.from(key, 'base64').length !== 16
  ) {
    reject(socket, 400, 'Bad Request');
    return null;
  }

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey(key)}`,
    '', '',
  ].join('\r\n'));
  socket.setNoDelay?.(true);

  let buffer = head?.length ? Buffer.from(head) : Buffer.alloc(0);
  let fragments = [];
  let fragmentSize = 0;
  let closed = false;
  let alive = true;

  const conn = {
    get open() { return !closed; },
    send(text) {
      if (closed) return;
      if (socket.writableLength > MAX_BUFFERED) {
        // A client that cannot keep up would make memory grow without bound.
        terminate();
        return;
      }
      socket.write(encodeFrame(0x1, Buffer.from(text)));
    },
    close(code = 1000, reason = '') {
      if (closed) return;
      const body = Buffer.alloc(2 + Buffer.byteLength(reason));
      body.writeUInt16BE(code, 0);
      body.write(reason, 2);
      socket.write(encodeFrame(0x8, body));
      finish();
      socket.end();
    },
    terminate,
  };

  const pinger = setInterval(() => {
    if (!alive) {
      terminate();
      return;
    }
    alive = false;
    if (!closed) socket.write(encodeFrame(0x9));
  }, PING_EVERY_MS);
  pinger.unref?.();

  function finish() {
    if (closed) return;
    closed = true;
    clearInterval(pinger);
    onClose();
  }

  function terminate() {
    finish();
    socket.destroy();
  }

  function fail(code, reason) {
    conn.close(code, reason);
  }

  function parse() {
    while (buffer.length >= 2) {
      const b0 = buffer[0];
      const b1 = buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const rsv = b0 & 0x70;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if (rsv) return fail(1002, 'No extensions negotiated.');
      if (!masked) return fail(1002, 'Client frames must be masked.');
      if (len === 126) {
        if (buffer.length < 4) return undefined;
        len = buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buffer.length < 10) return undefined;
        const big = buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return fail(1009, 'Message too big.');
        len = Number(big);
        offset = 10;
      }
      if (len > MAX_MESSAGE) return fail(1009, 'Message too big.');
      if (buffer.length < offset + 4 + len) return undefined;
      const mask = buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buffer = buffer.subarray(offset + 4 + len);

      if (opcode >= 0x8) {
        // Control frames: never fragmented, at most 125 bytes.
        if (!fin || len > 125) return fail(1002, 'Bad control frame.');
        if (opcode === 0x8) {
          if (!closed) {
            socket.write(encodeFrame(0x8, payload.subarray(0, 2)));
            finish();
            socket.end();
          }
          return undefined;
        }
        if (opcode === 0x9) socket.write(encodeFrame(0xA, payload));
        else if (opcode === 0xA) alive = true;
        continue;
      }

      if (opcode === 0x2) return fail(1003, 'Text frames only.');
      if (opcode === 0x1) {
        if (fragments.length) return fail(1002, 'Expected a continuation frame.');
      } else if (opcode === 0x0) {
        if (!fragments.length) return fail(1002, 'Unexpected continuation frame.');
      } else {
        return fail(1002, 'Unknown opcode.');
      }
      fragments.push(payload);
      fragmentSize += payload.length;
      if (fragmentSize > MAX_MESSAGE) return fail(1009, 'Message too big.');
      if (fin) {
        const text = Buffer.concat(fragments).toString('utf8');
        fragments = [];
        fragmentSize = 0;
        alive = true;
        onMessage(text);
        if (closed) return undefined;
      }
    }
    return undefined;
  }

  socket.on('data', (chunk) => {
    if (closed) return;
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
    // Never hold more than one maximum-size frame worth of unparsed bytes.
    if (buffer.length > MAX_MESSAGE + 14) {
      parse();
      if (buffer.length > MAX_MESSAGE + 14) fail(1009, 'Message too big.');
      return;
    }
    parse();
  });
  socket.on('error', () => terminate());
  socket.on('close', () => finish());
  socket.on('end', () => finish());

  if (buffer.length) queueMicrotask(parse);
  return conn;
}

export function reject(socket, status, text) {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}
