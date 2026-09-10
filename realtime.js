const { WebSocketServer } = require('ws');

// Authentication happens in the first frame, keeping reconnect tokens out of URLs.
function attachRealtime(server, rooms) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin;
    let sameHost = false;
    try { sameHost = new URL(origin).host === req.headers.host; } catch {}
    if (req.url !== '/api/socket' || (origin && !sameHost && !['https://localhost', 'capacitor://localhost'].includes(origin))) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    let room, token, alive = true, windowStart = Date.now(), count = 0;
    const timeout = setTimeout(() => ws.close(4001, 'Authentication required'), 5000);
    ws.on('error', () => {});
    ws.on('pong', () => { alive = true; });
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 15000);
    ws.on('message', (raw, binary) => {
      if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); count = 0; }
      if (binary || ++count > 80) return ws.close(1008, 'Invalid traffic');
      try {
        const data = JSON.parse(raw.toString());
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Geçersiz mesaj.');
        if (!room) {
          const candidate = rooms.get(data.roomId);
          if (data.type !== 'auth' || typeof data.token !== 'string' || !candidate?.race.players.has(data.token)) {
            return ws.close(4001, 'Odaya yeniden katıl.');
          }
          room = candidate; token = data.token;
          clearTimeout(timeout);
          if (!room.sockets.has(token)) room.sockets.set(token, new Set());
          room.sockets.get(token).add(ws);
          room.race.connection(token, true);
          room.lastActivity = Date.now();
          room.broadcast();
          return;
        }
        if (data.type !== 'action') throw Error('Geçersiz mesaj.');
        // The connection identity wins over any token/roomId supplied by a client.
        room.race.action(token, data.action, data);
        room.lastActivity = Date.now();
        if (data.action !== 'input') room.broadcast();
        if (data.id != null) ws.send(JSON.stringify({type: 'ack', id: data.id}));
      } catch (error) {
        let id;
        try { id = JSON.parse(raw.toString())?.id; } catch {}
        ws.send(JSON.stringify({type: 'error', id, error: error.message}));
      }
    });
    ws.on('close', () => {
      clearTimeout(timeout); clearInterval(heartbeat);
      if (!room) return;
      room.sockets.get(token)?.delete(ws);
      if (!room.sockets.get(token)?.size) room.sockets.delete(token);
      if (!room.sockets.has(token) && !room.streams.has(token)) room.race.connection(token, false);
      room.lastActivity = Date.now();
      room.broadcast();
    });
  });
  return wss;
}
module.exports = { attachRealtime };
