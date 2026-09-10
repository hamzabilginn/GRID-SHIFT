(function () {
  'use strict';
  class GridShiftConnection {
    constructor({base, token, roomId}) {
      this.base = base; this.token = token; this.roomId = roomId;
      this.pending = new Map(); this.nextId = 0; this.failures = 0; this.closed = false;
      this.start();
    }
    start() {
      if (this.closed) return;
      if (this.failures >= 2 || !window.WebSocket) return this.startSSE();
      const url = new URL('/api/socket', this.base || location.origin);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      this.mode = 'websocket'; this.ready = false;
      const ws = this.socket = new WebSocket(url);
      this.connectTimer = setTimeout(() => ws.close(), 6000);
      ws.onopen = () => ws.send(JSON.stringify({type:'auth', token:this.token, roomId:this.roomId}));
      ws.onmessage = event => {
        if (this.closed || this.socket !== ws) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'state') {
          clearTimeout(this.connectTimer);
          if (!this.ready) { this.ready = true; this.onopen?.(); }
          this.onmessage?.({data:JSON.stringify(message.state)});
        } else if (message.id != null) {
          const pending = this.pending.get(message.id);
          if (pending) {
            clearTimeout(pending.timer); this.pending.delete(message.id);
            if (message.type === 'error') pending.reject(Error(message.error)); else pending.resolve({ok:true});
          }
        }
      };
      ws.onerror = () => {}; // close drives one reconnection path.
      ws.onclose = event => {
        clearTimeout(this.connectTimer);
        if (this.closed || this.socket !== ws) return;
        this.ready = false;
        this.rejectPending();
        if (event.code === 4001) { this.close(); this.onexpired?.(); return; }
        this.onerror?.();
        this.failures++;
        this.retryTimer = setTimeout(() => this.start(), Math.min(1000 * this.failures, 5000));
      };
    }
    startSSE() {
      this.mode = 'sse';
      this.source = new EventSource(this.base + '/api/events?token=' + encodeURIComponent(this.token) + '&room=' + encodeURIComponent(this.roomId));
      this.source.onmessage = event => { if (!this.closed) this.onmessage?.(event); };
      this.source.onopen = () => { this.ready = true; this.onopen?.(); };
      this.source.onerror = () => { this.ready = false; this.onerror?.(); };
    }
    send(data) {
      if (!this.ready || this.socket?.readyState !== 1) return Promise.reject(Error('Bağlantı bekleniyor…'));
      if (this.socket.bufferedAmount > 65536) return Promise.reject(Error('Bağlantı yavaş; tekrar dene.'));
      if (data.action === 'input') {
        this.socket.send(JSON.stringify({...data, type:'action'}));
        return Promise.resolve({ok:true});
      }
      const id = ++this.nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.pending.delete(id); reject(Error('Sunucu yanıt vermedi.')); }, 5000);
        this.pending.set(id, {resolve, reject, timer});
        this.socket.send(JSON.stringify({...data, type:'action', id}));
      });
    }
    rejectPending() {
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(Error('Bağlantı kesildi.')); }
      this.pending.clear();
    }
    close() {
      this.closed = true; this.ready = false;
      clearTimeout(this.connectTimer); clearTimeout(this.retryTimer);
      this.source?.close(); this.socket?.close(); this.rejectPending();
    }
  }
  window.GridShiftConnection = GridShiftConnection;
})();
