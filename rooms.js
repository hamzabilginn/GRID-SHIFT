const { randomUUID } = require('node:crypto');
const { Race } = require('./game');
const P = require('./public/physics');

class Room {
  constructor(id, name, password = '', options = {}) {
    this.id = id;
    this.name = name || 'Yarış Odası';
    this.password = password ? String(password).trim() : '';
    this.race = new Race();
    if (options.trackId != null && options.trackId >= 0 && options.trackId < P.TRACKS.length) {
      this.race.trackId = Number(options.trackId);
      this.race.track = P.makeTrack(this.race.trackId);
    }
    if (options.laps != null) {
      this.race.laps = Math.max(1, Math.min(10, Number(options.laps) || 3));
    }
    if (options.bots != null) {
      this.race.bots = !!options.bots;
    }
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.streams = new Map(); // token -> Set(res)
    this.sockets = new Map(); // token -> Set(WebSocket)
  }

  hasPassword() {
    return !!this.password;
  }

  checkPassword(pass) {
    if (!this.password) return true;
    return String(pass || '').trim() === this.password;
  }

  broadcast() {
    this.race.inputNow = Date.now();
    for (const [token, sockets] of this.sockets) {
      const data = JSON.stringify({type: 'state', state: this.state(token)});
      for (const socket of sockets) {
        if (socket.readyState === 1 && socket.bufferedAmount < 65536) socket.send(data);
      }
    }
    for (const [token, set] of this.streams) {
      const data = 'data: ' + JSON.stringify(this.state(token)) + '\n\n';
      for (const res of set) {
        if (!res.destroyed && res.writableLength < 65536) {
          res.write(data);
        }
      }
    }
  }

  state(token) {
    const s = this.race.state(token);
    s.roomId = this.id;
    s.roomName = this.name;
    s.hasPassword = this.hasPassword();
    return s;
  }

  summary() {
    const track = P.TRACKS[this.race.trackId] || P.TRACKS[0];
    const connected = this.race.connected();
    return {
      id: this.id,
      name: this.name,
      hasPassword: this.hasPassword(),
      playersCount: connected.length,
      maxPlayers: 8,
      phase: this.race.phase,
      trackId: this.race.trackId,
      trackName: track.name,
      laps: this.race.laps,
      bots: this.race.bots,
      createdAt: this.createdAt
    };
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
    // Default public room
    this.createRoom('genel', 'Genel Pist (Herkese Açık)', '', { trackId: 0, laps: 3, bots: true });
  }

  get(roomId) {
    return this.rooms.get(roomId);
  }

  findRoomByToken(token) {
    if (!token) return null;
    for (const r of this.rooms.values()) {
      if (r.race.players.has(token)) return r;
    }
    return null;
  }

  list() {
    const now = Date.now();
    // Cleanup empty custom rooms older than 10 minutes
    for (const [id, room] of this.rooms) {
      if (id === 'genel') continue;
      if (room.race.connected().length === 0 && room.streams.size === 0 && room.sockets.size === 0 && (now - room.lastActivity) > 600000) {
        this.rooms.delete(id);
      }
    }
    return [...this.rooms.values()].map(r => r.summary());
  }

  createRoom(id, name, password = '', options = {}) {
    id = id || ('ODA-' + Math.random().toString(36).substring(2, 6).toUpperCase());
    const room = new Room(id, name, password, options);
    this.rooms.set(id, room);
    return room;
  }
}

module.exports = { Room, RoomManager };
