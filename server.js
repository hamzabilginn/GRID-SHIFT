const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { RoomManager } = require('./rooms');
const { attachRealtime } = require('./realtime');
const rooms = new RoomManager();
const port = Number(process.env.PORT || 80);

const addresses = () => Object.values(os.networkInterfaces()).flat().filter(x => x.family === 'IPv4' && !x.internal).map(x => `http://${x.address}${port === 80 ? '' : ':' + port}`);

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json'
};

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (['https://localhost', 'capacitor://localhost'].includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; img-src 'self' data: blob:; connect-src 'self' blob: data:; frame-ancestors 'none'");

  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, {ok: true, service: 'grid-shift', protocol: 'websocket-v1'});
  }

  if (req.method === 'GET' && url.pathname === '/api/info') {
    return json(res, 200, { addresses: addresses() });
  }

  if (req.method === 'GET' && url.pathname === '/api/rooms') {
    return json(res, 200, { rooms: rooms.list() });
  }

  if (req.method === 'GET' && url.pathname === '/api/events') {
    const token = url.searchParams.get('token');
    const roomId = url.searchParams.get('room');
    let room = (roomId && rooms.get(roomId)) || rooms.findRoomByToken(token) || rooms.get('genel');

    if (!token || !room || !room.race.players.has(token)) {
      return json(res, 401, { error: 'Odaya yeniden katıl.' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    });
    res.write('retry: 1000\n\n');
    req.socket.setNoDelay(true);

    if (!room.streams.has(token)) room.streams.set(token, new Set());
    room.streams.get(token).add(res);
    room.race.connection(token, true);
    room.lastActivity = Date.now();
    room.broadcast();

    req.on('close', () => {
      room.streams.get(token)?.delete(res);
      if (!room.streams.get(token)?.size) {
        room.streams.delete(token);
        if (!room.sockets.has(token)) room.race.connection(token, false);
        room.lastActivity = Date.now();
        room.broadcast();
      }
    });
    return;
  }

  if (req.method === 'POST' && ['/api/join', '/api/action', '/api/rooms/create', '/api/rooms/join'].includes(url.pathname)) {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
      return json(res, 415, { error: 'JSON gerekli.' });
    }

    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 8192) return json(res, 413, { error: 'İstek çok büyük.' });
      }
      const data = JSON.parse(raw);

      if (url.pathname === '/api/rooms/create') {
        const roomName = String(data.name || 'Yeni Yarış Odası').trim().slice(0, 24);
        const roomPass = data.password ? String(data.password).trim() : '';
        const room = rooms.createRoom(null, roomName, roomPass, {
          trackId: data.trackId,
          laps: data.laps,
          bots: data.bots
        });
        const p = room.race.join(data.playerName || data.name, null, data.carId, data.upgrades);
        room.broadcast();
        return json(res, 200, {
          roomId: room.id,
          token: p.token,
          state: room.state(p.token)
        });
      }

      if (url.pathname === '/api/rooms/join' || url.pathname === '/api/join') {
        const roomId = data.roomId || 'genel';
        let room = rooms.get(roomId);
        if (!room) {
          if (roomId === 'genel') {
            room = rooms.createRoom('genel', 'Genel Pist (Herkese Açık)', '', { trackId: 0, laps: 3, bots: true });
          } else {
            return json(res, 404, { error: 'Oda bulunamadı veya kapandı.' });
          }
        }

        if (room.hasPassword() && !room.race.players.has(data.token)) {
          if (!room.checkPassword(data.password)) {
            return json(res, 403, { error: 'Hatalı oda şifresi!' });
          }
        }

        const p = room.race.join(data.name, data.token, data.carId, data.upgrades);
        room.lastActivity = Date.now();
        room.broadcast();
        return json(res, 200, {
          roomId: room.id,
          token: p.token,
          state: room.state(p.token)
        });
      }

      if (url.pathname === '/api/action') {
        const roomId = data.roomId;
        let room = (roomId && rooms.get(roomId)) || rooms.findRoomByToken(data.token);
        if (!room) return json(res, 404, { error: 'Oda bulunamadı.' });

        room.race.action(data.token, data.action, data);
        room.lastActivity = Date.now();
        if (data.action !== 'input') room.broadcast();
        return json(res, 200, { ok: true });
      }
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const relPath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const pubDir = path.resolve(__dirname, 'public');
    const filePath = path.resolve(pubDir, relPath);
    if (filePath.startsWith(pubDir + path.sep) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const type = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store, no-cache, must-revalidate' });
      if (req.method === 'HEAD') return res.end();
      return res.end(fs.readFileSync(filePath));
    }
  }

  json(res, 404, { error: 'Bulunamadı.' });
});
attachRealtime(server, rooms);

let previous = performance.now(), accumulator = 0;
setInterval(() => {
  const current = performance.now();
  accumulator += Math.min(0.1, (current - previous) / 1000);
  previous = current;
  while (accumulator >= 1 / 60) {
    for (const room of rooms.rooms.values()) {
      room.race.tick(1 / 60);
    }
    accumulator -= 1 / 60;
  }
}, 8);

setInterval(() => {
  for (const room of rooms.rooms.values()) {
    if ((room.streams.size || room.sockets.size) && ['race', 'countdown'].includes(room.race.phase)) {
      room.broadcast();
    }
  }
}, 50);

setInterval(() => {
  for (const room of rooms.rooms.values()) {
    if (room.streams.size || room.sockets.size) {
      room.broadcast();
    }
  }
}, 1000);

server.on('error', err => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} kullanımda.` : err.message);
  process.exit(1);
});

server.listen(port, process.env.HOST || '0.0.0.0', () => {
  const urlDisplay = port === 80 ? 'http://localhost' : `http://localhost:${port}`;
  console.log(`🏁 GRID SHIFT ONLINE SUNUCUSU HAZIR!\nWeb Adresi: ${urlDisplay}\nDurdur: Ctrl+C`);
  if (port === 80) {
    const altServer = http.createServer(server.listeners('request')[0]);
    attachRealtime(altServer, rooms);
    altServer.on('error', () => {});
    altServer.listen(3001, '0.0.0.0', () => {
      console.log(`(Ayrıca port 3001 üzerinden de açık: http://localhost:3001)`);
    });
  }
});
