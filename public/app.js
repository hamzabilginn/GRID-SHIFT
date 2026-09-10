import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

(function () {
  'use strict';
  const P = window.RacePhysics;
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── State ── */
  let token = sessionStorage.getItem('gs-token');
  let state = null;
  let trackData = null;
  let events = null;
  let online = false;
  let seq = 0;
  let offset = 0;
  let sound = false;
  let audioCtx = null;
  let engineOsc = null;
  let engineGain = null;
  let shareAddr = location.origin;
  let lastPhase = '';
  const practice = new URLSearchParams(location.search).has('practice');
  const nativeApp = window.Capacitor?.isNativePlatform?.() || false;
  const apiBase = nativeApp ? (window.GRIDSHIFT_CONFIG?.apiBase || '') : '';
  let localRace = null;
  let practiceClock = Date.now();
  if (practice) token = null;
  let selectedCarId = localStorage.getItem('gs-car') || 'jesko';
  let selectedUpgrades = [];
  try {
    selectedUpgrades = JSON.parse(localStorage.getItem('gs-upgrades') || '[]');
  } catch (e) { selectedUpgrades = []; }

  function calcLoadoutCost(carId = selectedCarId, upgrades = selectedUpgrades) {
    const cars = (state && state.cars) || P.CARS;
    const allUpgrades = (state && state.upgrades) || P.UPGRADES;
    const car = cars.find(c => c.id === carId) || cars[0];
    let cost = car.price || 0;
    for (const uid of upgrades) {
      const up = allUpgrades.find(u => u.id === uid);
      if (up) cost += up.price || 0;
    }
    return { cost, remaining: 100 - cost, car };
  }

  function selfPlayer() { return state?.players?.find(p => p.id === state.selfId); }
  function isHost() { return state?.host === state?.selfId; }
  function sNow() { return Date.now() + offset; }

  async function api(route, body) {
    body = { roomId: currentRoomId, ...body };
    if (practice && localRace) {
      if (route === 'action') { localRace.action(token, body.action, body, practiceClock); state = localRace.state(token); if (body.action !== 'input') renderUI(); }
      return { token, roomId: 'practice', state: localRace.state(token) };
    }
    if (nativeApp && !apiBase) throw Error('Çevrimiçi servis henüz ayarlanmadı. Antrenmanı çevrimdışı oynayabilirsin.');
    if (route === 'action' && events?.mode === 'websocket') return events.send(body);
    const r = await fetch(apiBase + '/api/' + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  }

  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, 4200);
  }

  /* ── Sound Synthesizer ── */
  function initAudio() {
    if (audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
      engineOsc = audioCtx.createOscillator();
      engineGain = audioCtx.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.setValueAtTime(45, audioCtx.currentTime);
      engineGain.gain.setValueAtTime(0, audioCtx.currentTime);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, audioCtx.currentTime);

      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(audioCtx.destination);
      engineOsc.start();
    } catch (e) {}
  }

  function updateEngineSound(speed, boosting) {
    if (!sound || !audioCtx || !engineGain) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const isRacing = state && ['race', 'countdown'].includes(state.phase);
    if (!isRacing) {
      engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
      return;
    }
    const ratio = Math.min(1, Math.max(0, (speed || 0) / 290));
    const targetFreq = 55 + ratio * 200 + (boosting ? 65 : 0);
    const targetGain = 0.04 + ratio * 0.04 + (boosting ? 0.03 : 0);
    engineOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.06);
    engineGain.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.08);
  }

  function beep(freq = 600) {
    if (!sound) return;
    try {
      initAudio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g);
      g.connect(audioCtx.destination);
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.06, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      o.start();
      o.stop(audioCtx.currentTime + 0.13);
    } catch (e) {}
  }

  function playExplosionSound() {
    if (!sound) return;
    try {
      initAudio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;

      /* White noise explosion burst */
      const bufferSize = Math.floor(audioCtx.sampleRate * 0.65);
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * 0.14));
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, t);
      filter.frequency.exponentialRampToValueAtTime(50, t + 0.55);

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      noise.start(t);

      /* Sub-bass dive oscillator */
      const osc = audioCtx.createOscillator();
      const oscGain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(24, t + 0.5);
      oscGain.gain.setValueAtTime(0.22, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

      osc.connect(oscGain);
      oscGain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    } catch (e) {}
  }

  function playJumpSound() {
    if (!sound) return;
    try {
      initAudio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(280, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.22);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    } catch (e) {}
  }

  function playMissileWhistleSound() {
    if (!sound) return;
    try {
      initAudio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1400, t);
      osc.frequency.exponentialRampToValueAtTime(320, t + 1.2);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 1.2);
    } catch (e) {}
  }

  for (const btn of [$('#sound'), $('#race-sound')]) {
    if (btn) btn.onclick = () => {
      sound = !sound;
      if (sound) initAudio();
      $$('#sound, #race-sound').forEach(b => {
        b.textContent = sound ? 'SES AÇIK' : 'SES KAPALI';
        b.setAttribute('aria-pressed', sound);
        b.classList.toggle('quiet', !sound);
      });
      beep(700);
    };
  }
  const urlParams = new URLSearchParams(window.location.search);
  let currentRoomId = urlParams.get('room') || localStorage.getItem('gs-room') || 'genel';
  let activeLobbyTab = 'rooms'; // 'rooms' or 'create'
  let cachedRooms = [];

  shareAddr = location.origin + (currentRoomId !== 'genel' ? `/?room=${encodeURIComponent(currentRoomId)}` : '');

  function updateConnection() {
    const el = $('#connection-text');
    if (el) el.textContent = practice ? 'ÇEVRİMDIŞI ANTRENMAN' : token ? (online ? 'ONLINE · CANLI' : 'YENİDEN BAĞLANIYOR…') : 'ONLINE SUNUCU';
  }

  function connect() {
    events?.close();
    if (practice) {
      online = true;
      let previous = performance.now(), accumulator = 0;
      const timer = setInterval(() => {
        const now = performance.now();
        accumulator += document.hidden ? 0 : Math.min(.1, (now - previous) / 1000);
        previous = now;
        while (accumulator >= 1 / 60) {
          practiceClock += 1000 / 60;
          localRace.tick(1 / 60, practiceClock);
          accumulator -= 1 / 60;
        }
        state = localRace.state(token);
        offset = practiceClock - Date.now();
        state.roomName = 'Çevrimdışı Antrenman';
        if (!trackData || trackData.id !== state.trackId) {
          trackData = P.makeTrack(state.trackId); build3DTrack(trackData);
        }
        const phaseKey = state.raceId + '/' + state.phase;
        if (lastPhase !== phaseKey) { lastPhase = phaseKey; renderUI(); }
      }, 16);
      events = { close() { clearInterval(timer); } };
      updateConnection();
      return;
    }
    events = new window.GridShiftConnection({base:apiBase, token, roomId:currentRoomId || 'genel'});
    events.onexpired = () => {
      online = false; token = null; state = null;
      sessionStorage.removeItem('gs-token');
      document.body.classList.remove('racing');
      $('#race-hud').hidden = true;
      updateConnection(); renderPanel(); toast('Oturum sona erdi. Odaya yeniden katıl.');
    };
    events.onmessage = e => {
      online = true;
      state = JSON.parse(e.data);
      offset = state.serverTime - Date.now();
      if (state.roomId) currentRoomId = state.roomId;
      shareAddr = (apiBase || location.origin) + (currentRoomId !== 'genel' ? `/?room=${encodeURIComponent(currentRoomId)}` : '');
      if (!trackData || trackData.id !== state.trackId) {
        trackData = P.makeTrack(state.trackId);
        build3DTrack(trackData);
      }
      updateConnection();
      const phaseKey = state.raceId + '/' + state.phase;
      if (phaseKey !== lastPhase) {
        if (state.phase === 'race') beep(1100);
        if (state.phase === 'results') beep(880);
        lastPhase = phaseKey;
      }
      renderUI();
    };
    events.onopen = () => { online = true; updateConnection(); };
    events.onerror = async () => {
      online = false;
      releaseControls();
      updateConnection();
      if (events?.mode !== 'sse') return;
      try {
        await api('rooms/join', { roomId: currentRoomId, token });
      } catch (err) {
        if (/adını|katıl|bulunamadı/i.test(err.message)) {
          events.close();
          sessionStorage.removeItem('gs-token');
          token = null;
          state = null;
          renderPanel();
        }
      }
    };
  }

  async function act(action, data = {}) {
    if (!online) return toast('Bağlantı bekleniyor…');
    try {
      await api('action', { token, roomId: currentRoomId, action, ...data });
    } catch (err) {
      toast(err.message);
    }
  }

  /* ── Ultra-Fast High Performance 3D Setup (60 FPS) ── */
  const canvas = $('#track');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    depth: true
  });
  /* Cap pixel ratio at 1.5 to guarantee buttery 60 FPS on any laptop or phone */
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  const scene = new THREE.Scene();
  /* Bright twilight night sky */
  scene.background = new THREE.Color(0x101a2e);
  scene.fog = new THREE.FogExp2(0x101a2e, 0.0007);

  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 6000);

  /* Exactly 2 Global Lights = Zero GPU Overhead, Bright & Clear Scene */
  const ambLight = new THREE.AmbientLight(0x8ba6c9, 2.8);
  scene.add(ambLight);

  const dirLight = new THREE.DirectionalLight(0xeaf2ff, 2.5);
  dirLight.position.set(300, 600, 250);
  scene.add(dirLight);

  /* Distant Starfield in the Night Sky */
  const starGeo = new THREE.BufferGeometry();
  const starCount = 500;
  const starPos = [];
  for (let i = 0; i < starCount; i++) {
    starPos.push(
      (Math.random() - 0.5) * 5000,
      350 + Math.random() * 1800,
      (Math.random() - 0.5) * 5000
    );
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xaad4ff, size: 4, transparent: true, opacity: 0.85 });
  scene.add(new THREE.Points(starGeo, starMat));

  /* Ground Plane */
  const groundGeo = new THREE.PlaneGeometry(9000, 9000, 4, 4);
  const groundMat = new THREE.MeshBasicMaterial({ color: 0x0a101a });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -0.5;
  scene.add(groundMesh);

  /* Track Container */
  let trackGroup = new THREE.Group();
  scene.add(trackGroup);

  /* Cars & Mines Maps */
  const carMeshes = new Map();
  const mineMeshes = new Map();

  /* Explosion FX System */
  const activeExplosions = [];
  const expGeo = new THREE.SphereGeometry(1, 10, 10);
  const ringGeo = new THREE.RingGeometry(0.8, 1.0, 20);
  ringGeo.rotateX(-Math.PI / 2);
  const fragGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  let lastExplosionTime = 0;

  function triggerExplosion(x, y, elev, driver) {
    playExplosionSound();

    const group = new THREE.Group();
    group.position.set(x, elev, y);

    const fireMat = new THREE.MeshBasicMaterial({ color: 0xff3b14, transparent: true, opacity: 0.95 });
    const fireball = new THREE.Mesh(expGeo, fireMat);
    group.add(fireball);

    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 });
    const innerCore = new THREE.Mesh(expGeo, coreMat);
    innerCore.scale.set(0.6, 0.6, 0.6);
    group.add(innerCore);

    const waveMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const wave = new THREE.Mesh(ringGeo, waveMat);
    wave.position.y = 0.5;
    group.add(wave);

    const frags = [];
    const fragMat = new THREE.MeshBasicMaterial({ color: 0xff7b22 });
    for (let i = 0; i < 8; i++) {
      const fr = new THREE.Mesh(fragGeo, fragMat);
      const ang = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const spd = 25 + Math.random() * 35;
      frags.push({
        mesh: fr,
        vx: Math.cos(ang) * spd,
        vy: 18 + Math.random() * 26,
        vz: Math.sin(ang) * spd
      });
      group.add(fr);
    }

    scene.add(group);
    activeExplosions.push({ group, fireball, innerCore, wave, frags, fireMat, waveMat, coreMat, age: 0, maxAge: 1.1 });
    toast(`💥 ${driver || 'Sürücü'} MAYINA BASTI! Başa döndü!`);
  }

  /* 3D Missile & Target Reticle Meshes */
  const missileMeshes = new Map();
  const missileBodyGeo = new THREE.CylinderGeometry(1.6, 1.6, 16, 8);
  const missileNoseGeo = new THREE.ConeGeometry(1.6, 5.0, 8);
  const missileFinGeo = new THREE.BoxGeometry(0.4, 4.0, 4.0);
  const missileFlameGeo = new THREE.ConeGeometry(1.8, 9, 6);
  missileFlameGeo.rotateX(Math.PI);

  const missileMat = new THREE.MeshLambertMaterial({ color: 0x3d4b60 });
  const missileNoseMat = new THREE.MeshBasicMaterial({ color: 0xff1744 });
  const missileFlameMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.95 });
  const targetRingMat = new THREE.MeshBasicMaterial({ color: 0xff1744, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const targetCrossMat = new THREE.MeshBasicMaterial({ color: 0xffe259 });

  function createMissileMesh() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(missileBodyGeo, missileMat);
    group.add(body);

    const nose = new THREE.Mesh(missileNoseGeo, missileNoseMat);
    nose.position.y = -9.5;
    nose.rotation.x = Math.PI;
    group.add(nose);

    for (let f = 0; f < 4; f++) {
      const fin = new THREE.Mesh(missileFinGeo, missileMat);
      fin.position.y = 6.0;
      fin.rotation.y = (f * Math.PI) / 2;
      group.add(fin);
    }

    const flame = new THREE.Mesh(missileFlameGeo, missileFlameMat);
    flame.position.y = 12.0;
    group.add(flame);

    const reticle = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(18, 22, 24), targetRingMat);
    ring.rotation.x = -Math.PI / 2;
    reticle.add(ring);

    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(44, 0.4, 1.2), targetCrossMat);
    reticle.add(cross1);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 44), targetCrossMat);
    reticle.add(cross2);

    scene.add(reticle);

    return { group, reticle, flame, whistlePlayed: false };
  }

  /* 3D Player Seeker Missiles (Fired by cars with [F]) */
  const playerMissileMeshes = new Map();
  const pMissileBodyGeo = new THREE.CylinderGeometry(1.2, 1.2, 10, 8);
  pMissileBodyGeo.rotateX(Math.PI / 2);
  const pMissileNoseGeo = new THREE.ConeGeometry(1.3, 3.5, 8);
  pMissileNoseGeo.rotateX(Math.PI / 2);
  const pMissileFinGeo = new THREE.BoxGeometry(0.3, 2.5, 2.5);
  const pMissileFlameGeo = new THREE.ConeGeometry(1.5, 7, 6);
  pMissileFlameGeo.rotateX(-Math.PI / 2);
  const pMissileMat = new THREE.MeshLambertMaterial({ color: 0x223048 });
  const pMissileNoseMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const pMissileFlameMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.9 });

  function createPlayerMissileMesh() {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(pMissileBodyGeo, pMissileMat);
    grp.add(body);
    const nose = new THREE.Mesh(pMissileNoseGeo, pMissileNoseMat);
    nose.position.z = 6.2;
    grp.add(nose);
    for (let f = 0; f < 4; f++) {
      const fin = new THREE.Mesh(pMissileFinGeo, pMissileMat);
      fin.position.z = -3.5;
      fin.rotation.z = (f * Math.PI) / 2;
      grp.add(fin);
    }
    const flame = new THREE.Mesh(pMissileFlameGeo, pMissileFlameMat);
    flame.position.z = -7.5;
    grp.add(flame);
    return grp;
  }

  /* Procedural Lit Skyscraper Windows Texture */
  const winCanvas = document.createElement('canvas');
  winCanvas.width = 128;
  winCanvas.height = 256;
  const winCtx = winCanvas.getContext('2d');
  winCtx.fillStyle = '#141c2c';
  winCtx.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 246; y += 18) {
    for (let x = 8; x < 120; x += 15) {
      if (Math.random() > 0.40) {
        const r = Math.random();
        winCtx.fillStyle = r > 0.65 ? '#ffe985' : r > 0.35 ? '#00e5ff' : '#ff7e35';
        winCtx.fillRect(x, y, 9, 11);
      }
    }
  }
  const winTex = new THREE.CanvasTexture(winCanvas);
  winTex.wrapS = THREE.RepeatWrapping;
  winTex.wrapT = THREE.RepeatWrapping;

  /* Shared Materials (Reused to minimize draw calls) */
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x252b3a });
  const leftEdgeMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
  const rightEdgeMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const centerLineMat = new THREE.MeshBasicMaterial({ color: 0xffe259 });
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x3a455a });
  const neonBeamMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
  const lampPostMat = new THREE.MeshLambertMaterial({ color: 0x505c75 });
  const lampLightMat = new THREE.MeshBasicMaterial({ color: 0xffeb99 });
  const bldgMat = new THREE.MeshLambertMaterial({ map: winTex, color: 0x3d4b66 });

  /* ── 3D Track Builder ── */
  function build3DTrack(tk) {
    while (trackGroup.children.length > 0) {
      const obj = trackGroup.children[0];
      trackGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
    }
    mineMeshes.clear();

    const pts = tk.pts;
    const N = pts.length;
    const hw = tk.width / 2; // ~85

    /* Road Geometry */
    const roadVerts = [];
    const roadUVs = [];
    const leftEdgeVerts = [];
    const rightEdgeVerts = [];
    const centerVerts = [];
    const guardrailVerts = [];

    for (let i = 0; i < N; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % N];
      const e1 = p1.elev || 0;
      const e2 = p2.elev || 0;

      const norm1X = -Math.sin(p1.angle), norm1Z = Math.cos(p1.angle);
      const norm2X = -Math.sin(p2.angle), norm2Z = Math.cos(p2.angle);

      const l1X = p1.x - norm1X * hw, l1Z = p1.y - norm1Z * hw;
      const r1X = p1.x + norm1X * hw, r1Z = p1.y + norm1Z * hw;
      const l2X = p2.x - norm2X * hw, l2Z = p2.y - norm2Z * hw;
      const r2X = p2.x + norm2X * hw, r2Z = p2.y + norm2Z * hw;

      /* Road Quads with elevation */
      roadVerts.push(l1X, e1, l1Z, r1X, e1, r1Z, l2X, e2, l2Z);
      roadUVs.push(0, i / N * 20, 1, i / N * 20, 0, (i + 1) / N * 20);

      roadVerts.push(r1X, e1, r1Z, r2X, e2, r2Z, l2X, e2, l2Z);
      roadUVs.push(1, i / N * 20, 1, (i + 1) / N * 20, 0, (i + 1) / N * 20);

      /* Left Neon Edge Curb */
      leftEdgeVerts.push(l1X, e1 + 0.5, l1Z, l1X - norm1X * 4.5, e1 + 0.5, l1Z - norm1Z * 4.5, l2X, e2 + 0.5, l2Z);
      leftEdgeVerts.push(l1X - norm1X * 4.5, e1 + 0.5, l1Z - norm1Z * 4.5, l2X - norm2X * 4.5, e2 + 0.5, l2Z - norm2Z * 4.5, l2X, e2 + 0.5, l2Z);

      /* Right Neon Edge Curb */
      rightEdgeVerts.push(r1X, e1 + 0.5, r1Z, r1X + norm1X * 4.5, e1 + 0.5, r1Z + norm1Z * 4.5, r2X, e2 + 0.5, r2Z);
      rightEdgeVerts.push(r1X + norm1X * 4.5, e1 + 0.5, r1Z + norm1Z * 4.5, r2X + norm2X * 4.5, e2 + 0.5, r2Z + norm2Z * 4.5, r2X, e2 + 0.5, r2Z);

      /* Center dashed line */
      if (i % 2 === 0) {
        centerVerts.push(p1.x - norm1X * 1.5, e1 + 0.25, p1.y - norm1Z * 1.5);
        centerVerts.push(p1.x + norm1X * 1.5, e1 + 0.25, p1.y + norm1Z * 1.5);
        centerVerts.push(p2.x - norm2X * 1.5, e2 + 0.25, p2.y - norm2Z * 1.5);

        centerVerts.push(p1.x + norm1X * 1.5, e1 + 0.25, p1.y + norm1Z * 1.5);
        centerVerts.push(p2.x + norm2X * 1.5, e2 + 0.25, p2.y + norm2Z * 1.5);
        centerVerts.push(p2.x - norm2X * 1.5, e2 + 0.25, p2.y - norm2Z * 1.5);
      }

      /* Bridge Support Pillars under elevated road */
      if (e1 > 5 && i % 4 === 0) {
        const pL = new THREE.Mesh(new THREE.BoxGeometry(6, e1, 6), pillarMat);
        pL.position.set(l1X, e1 / 2, l1Z);
        trackGroup.add(pL);

        const pR = new THREE.Mesh(new THREE.BoxGeometry(6, e1, 6), pillarMat);
        pR.position.set(r1X, e1 / 2, r1Z);
        trackGroup.add(pR);

        const crossGirder = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 12, 3.5, 5), pillarMat);
        crossGirder.position.set(p1.x, e1 - 2, p1.y);
        crossGirder.rotation.y = -p1.angle + Math.PI / 2;
        trackGroup.add(crossGirder);
      }

      /* Bridge Neon Safety Guardrails */
      if (e1 > 4) {
        guardrailVerts.push(l1X, e1, l1Z, l1X, e1 + 4.5, l1Z, l2X, e2, l2Z);
        guardrailVerts.push(l1X, e1 + 4.5, l1Z, l2X, e2 + 4.5, l2Z, l2X, e2, l2Z);

        guardrailVerts.push(r1X, e1, r1Z, r2X, e2, r2Z, r1X, e1 + 4.5, r1Z);
        guardrailVerts.push(r1X, e1 + 4.5, r1Z, r2X, e2, r2Z, r2X, e2 + 4.5, r2Z);
      }
    }

    /* Road Mesh */
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadVerts, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUVs, 2));
    roadGeo.computeVertexNormals();
    trackGroup.add(new THREE.Mesh(roadGeo, roadMat));

    /* Glowing Neon Left Edge (Orange) */
    const leftGeo = new THREE.BufferGeometry();
    leftGeo.setAttribute('position', new THREE.Float32BufferAttribute(leftEdgeVerts, 3));
    trackGroup.add(new THREE.Mesh(leftGeo, leftEdgeMat));

    /* Glowing Neon Right Edge (Cyan) */
    const rightGeo = new THREE.BufferGeometry();
    rightGeo.setAttribute('position', new THREE.Float32BufferAttribute(rightEdgeVerts, 3));
    trackGroup.add(new THREE.Mesh(rightGeo, rightEdgeMat));

    /* Bright Center Line */
    const centerGeo = new THREE.BufferGeometry();
    centerGeo.setAttribute('position', new THREE.Float32BufferAttribute(centerVerts, 3));
    trackGroup.add(new THREE.Mesh(centerGeo, centerLineMat));

    /* Bridge Guardrails Mesh */
    if (guardrailVerts.length > 0) {
      const guardGeo = new THREE.BufferGeometry();
      guardGeo.setAttribute('position', new THREE.Float32BufferAttribute(guardrailVerts, 3));
      guardGeo.computeVertexNormals();
      const guardMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
      trackGroup.add(new THREE.Mesh(guardGeo, guardMat));
    }

    /* Bridge Cable Suspension Arch at peak */
    let maxElev = 0, peakIdx = -1;
    for (let i = 0; i < N; i++) {
      if ((pts[i].elev || 0) > maxElev) {
        maxElev = pts[i].elev;
        peakIdx = i;
      }
    }
    if (maxElev > 15 && peakIdx !== -1) {
      const peakPt = pts[peakIdx];
      const arch = new THREE.Group();
      arch.position.set(peakPt.x, maxElev, peakPt.y);
      arch.rotation.y = -peakPt.angle + Math.PI / 2;

      const tL = new THREE.Mesh(new THREE.BoxGeometry(6, 62, 6), pillarMat);
      tL.position.set(-hw - 4, 31, 0);
      arch.add(tL);

      const tR = new THREE.Mesh(new THREE.BoxGeometry(6, 62, 6), pillarMat);
      tR.position.set(hw + 4, 31, 0);
      arch.add(tR);

      const topBeam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 16, 5, 6), pillarMat);
      topBeam.position.set(0, 60, 0);
      arch.add(topBeam);

      const cableMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
      const cableL = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 75, 4), cableMat);
      cableL.position.set(-hw / 2, 30, 0);
      cableL.rotation.z = 0.28;
      arch.add(cableL);

      const cableR = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 75, 4), cableMat);
      cableR.position.set(hw / 2, 30, 0);
      cableR.rotation.z = -0.28;
      arch.add(cableR);

      trackGroup.add(arch);
    }

    /* Start / Finish Arch */
    const sp = pts[0];
    const sa = sp.angle;
    const archGroup = new THREE.Group();
    archGroup.position.set(sp.x, sp.elev || 0, sp.y);
    archGroup.rotation.y = -sa + Math.PI / 2;

    const pLeft = new THREE.Mesh(new THREE.BoxGeometry(5, 32, 5), pillarMat);
    pLeft.position.set(-hw - 5, 16, 0);
    archGroup.add(pLeft);

    const pRight = new THREE.Mesh(new THREE.BoxGeometry(5, 32, 5), pillarMat);
    pRight.position.set(hw + 5, 16, 0);
    archGroup.add(pRight);

    const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 14, 5, 6), pillarMat);
    crossBeam.position.set(0, 30, 0);
    archGroup.add(crossBeam);

    const neonSign = new THREE.Mesh(new THREE.BoxGeometry(hw * 1.5, 3, 0.5), neonBeamMat);
    neonSign.position.set(0, 30, 3.2);
    archGroup.add(neonSign);

    trackGroup.add(archGroup);

    /* Street Light Posts (Unlit MeshBasicMaterial Bulbs = Zero GPU Lighting Overhead!) */
    const lampPostGeo = new THREE.CylinderGeometry(0.8, 1.0, 30, 6);
    const bulbGeo = new THREE.SphereGeometry(2.2, 6, 6);

    for (let i = 0; i < N; i += 12) {
      const pt = pts[i];
      const side = (i % 2 === 0 ? 1 : -1);
      const nx = -Math.sin(pt.angle), nz = Math.cos(pt.angle);
      const lx = pt.x + nx * (hw + 9) * side;
      const lz = pt.y + nz * (hw + 9) * side;
      const elev = pt.elev || 0;

      const post = new THREE.Mesh(lampPostGeo, lampPostMat);
      post.position.set(lx, elev + 15, lz);
      trackGroup.add(post);

      const bulb = new THREE.Mesh(bulbGeo, lampLightMat);
      bulb.position.set(lx, elev + 30, lz);
      trackGroup.add(bulb);
    }

    /* Road Barricades / Obstacles */
    if (tk.obstacles) {
      /* Procedural Hazard Stripe Texture */
      const stripeCanvas = document.createElement('canvas');
      stripeCanvas.width = 128;
      stripeCanvas.height = 32;
      const sCtx = stripeCanvas.getContext('2d');
      sCtx.fillStyle = '#ff6a1a';
      sCtx.fillRect(0, 0, 128, 32);
      sCtx.fillStyle = '#ffffff';
      for (let x = -32; x < 160; x += 32) {
        sCtx.beginPath();
        sCtx.moveTo(x, 32);
        sCtx.lineTo(x + 14, 32);
        sCtx.lineTo(x + 28, 0);
        sCtx.lineTo(x + 14, 0);
        sCtx.closePath();
        sCtx.fill();
      }
      const stripeTex = new THREE.CanvasTexture(stripeCanvas);
      const barrierMat = new THREE.MeshBasicMaterial({ map: stripeTex });
      const standMat = new THREE.MeshLambertMaterial({ color: 0x1a202c });
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });

      for (const obs of tk.obstacles) {
        const obsGroup = new THREE.Group();
        obsGroup.position.set(obs.x, obs.elev || 0, obs.y);
        obsGroup.rotation.y = -obs.angle + Math.PI / 2;

        /* Horizontal striped barrier */
        const bar = new THREE.Mesh(new THREE.BoxGeometry(obs.width, 5.5, 2.2), barrierMat);
        bar.position.y = 4.5;
        obsGroup.add(bar);

        /* 2 support legs */
        const legL = new THREE.Mesh(new THREE.BoxGeometry(2.2, 9, 2.2), standMat);
        legL.position.set(-obs.width / 2 + 3, 4.5, 0);
        obsGroup.add(legL);

        const legR = new THREE.Mesh(new THREE.BoxGeometry(2.2, 9, 2.2), standMat);
        legR.position.set(obs.width / 2 - 3, 4.5, 0);
        obsGroup.add(legR);

        /* Flashing beacon light on top */
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 6), beaconMat);
        beacon.position.set(0, 8.2, 0);
        obsGroup.add(beacon);

        trackGroup.add(obsGroup);
      }
    }

    /* Jump Ramps */
    if (tk.ramps) {
      const rampCanvas = document.createElement('canvas');
      rampCanvas.width = 128;
      rampCanvas.height = 128;
      const rCtx = rampCanvas.getContext('2d');
      rCtx.fillStyle = '#ffaa00';
      rCtx.fillRect(0, 0, 128, 128);
      rCtx.fillStyle = '#111722';
      rCtx.fillRect(6, 6, 116, 116);
      rCtx.fillStyle = '#00e5ff';
      for (let y = 18; y < 112; y += 30) {
        rCtx.beginPath();
        rCtx.moveTo(64, y);
        rCtx.lineTo(96, y + 20);
        rCtx.lineTo(82, y + 20);
        rCtx.lineTo(64, y + 8);
        rCtx.lineTo(46, y + 20);
        rCtx.lineTo(32, y + 20);
        rCtx.closePath();
        rCtx.fill();
      }
      const rampTex = new THREE.CanvasTexture(rampCanvas);
      const rampTopMat = new THREE.MeshBasicMaterial({ map: rampTex });
      const rampSideMat = new THREE.MeshLambertMaterial({ color: 0x222a38 });
      const rampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe259 });

      for (const ramp of tk.ramps) {
        const rampGroup = new THREE.Group();
        rampGroup.position.set(ramp.x, ramp.elev || 0, ramp.y);
        rampGroup.rotation.y = -ramp.angle + Math.PI / 2;

        const rw = ramp.width || 46;
        const rl = ramp.length || 28;
        const rh = 6.2;
        const hw2 = rw / 2, hl2 = rl / 2;

        /* Wedge Top Slope */
        const wedgeGeo = new THREE.BufferGeometry();
        const vTop = [
          -hw2, 0.2, -hl2,   hw2, 0.2, -hl2,   -hw2, rh, hl2,
           hw2, 0.2, -hl2,   hw2, rh, hl2,    -hw2, rh, hl2
        ];
        const uTop = [0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1];
        wedgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(vTop, 3));
        wedgeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uTop, 2));
        wedgeGeo.computeVertexNormals();
        rampGroup.add(new THREE.Mesh(wedgeGeo, rampTopMat));

        /* Wedge Back Drop Face */
        const backGeo = new THREE.BufferGeometry();
        const vBack = [
          -hw2, 0, hl2,   hw2, 0, hl2,   -hw2, rh, hl2,
           hw2, 0, hl2,   hw2, rh, hl2,  -hw2, rh, hl2
        ];
        backGeo.setAttribute('position', new THREE.Float32BufferAttribute(vBack, 3));
        backGeo.computeVertexNormals();
        rampGroup.add(new THREE.Mesh(backGeo, rampSideMat));

        /* Glowing Launch Lip */
        const lip = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.8, 1.2), rampGlowMat);
        lip.position.set(0, rh, hl2);
        rampGroup.add(lip);

        /* Side Rails */
        const borderL = new THREE.Mesh(new THREE.BoxGeometry(1.5, rh / 2, rl), rampGlowMat);
        borderL.position.set(-hw2, rh / 4, 0);
        rampGroup.add(borderL);
        const borderR = new THREE.Mesh(new THREE.BoxGeometry(1.5, rh / 2, rl), rampGlowMat);
        borderR.position.set(hw2, rh / 4, 0);
        rampGroup.add(borderR);

        trackGroup.add(rampGroup);
      }
    }

    /* Landmines (Pulsing Red Sci-Fi Mines) */
    if (tk.mines) {
      const mineBaseMat = new THREE.MeshLambertMaterial({ color: 0x18202d });
      const mineGlowMat = new THREE.MeshBasicMaterial({ color: 0xff1744 });
      const mineRingMat = new THREE.MeshBasicMaterial({ color: 0xff2a55, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
      const spikeGeo = new THREE.ConeGeometry(0.8, 3.5, 4);
      spikeGeo.rotateX(Math.PI / 2);

      for (const m of tk.mines) {
        const mGroup = new THREE.Group();
        mGroup.position.set(m.x, m.elev || 0, m.y);

        /* Warning Circle on Ground */
        const ring = new THREE.Mesh(new THREE.RingGeometry(8, 14, 18), mineRingMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.18;
        mGroup.add(ring);

        /* Base */
        const base = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6.5, 1.6, 8), mineBaseMat);
        base.position.y = 0.8;
        mGroup.add(base);

        /* Glowing Red Core */
        const core = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 8), mineGlowMat);
        core.position.y = 2.2;
        mGroup.add(core);

        /* 4 Spikes */
        for (let a = 0; a < 4; a++) {
          const sp = new THREE.Mesh(spikeGeo, mineBaseMat);
          const ang = (a / 4) * Math.PI * 2;
          sp.position.set(Math.cos(ang) * 4.5, 1.8, Math.sin(ang) * 4.5);
          sp.rotation.y = -ang + Math.PI / 2;
          sp.rotation.x = -0.3;
          mGroup.add(sp);
        }

        mGroup.userData.core = core;
        mGroup.userData.ring = ring;

        trackGroup.add(mGroup);
        mineMeshes.set(m.id, mGroup);
      }
    }

    /* Illuminated City Skyline (with strict road overlap collision avoidance) */
    const bldgGeo = new THREE.BoxGeometry(1, 1, 1);
    const bldgGroup = new THREE.Group();

    let placed = 0;
    for (let i = 0; i < N && placed < 36; i += Math.max(1, Math.floor(N / 45))) {
      const pt = pts[i];
      const side = (placed % 2 === 0 ? 1 : -1);
      const w = 48 + ((placed * 11) % 45);
      const h = 80 + ((placed * 23) % 190);
      const d = 48 + ((placed * 13) % 45);
      const dist = hw + Math.max(w, d) / 2 + 40;

      const bx = pt.x + (-Math.sin(pt.angle)) * dist * side;
      const bz = pt.y + (Math.cos(pt.angle)) * dist * side;

      /* STRICT ROAD COLLISION CHECK: Check distance to entire track */
      const check = P.nearest(tk, bx, bz);
      if (check.d < hw + Math.max(w, d) / 2 + 30) {
        // Too close to a curved section of the road, skip!
        continue;
      }

      const bldg = new THREE.Mesh(bldgGeo, bldgMat);
      bldg.position.set(bx, h / 2, bz);
      bldg.scale.set(w, h, d);
      bldgGroup.add(bldg);

      /* Glowing Neon Roof Outline */
      const glowCol = (placed % 3 === 0) ? 0x00e5ff : (placed % 3 === 1) ? 0xff6a1a : 0xc8ff00;
      const roofLight = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.9, 2.5, d * 0.9),
        new THREE.MeshBasicMaterial({ color: glowCol })
      );
      roofLight.position.set(bx, h + 1.2, bz);
      bldgGroup.add(roofLight);

      placed++;
    }
    trackGroup.add(bldgGroup);
  }

  /* ═══════════════════════════════════════════════════════════
     ULTRA-REALISTIC 3D SUPERCARS (MATCAP AUTOMOTIVE SHADERS)
     60 FPS Studio Reflections, Brake Calipers & Carbon Aero
     ═══════════════════════════════════════════════════════════ */

  /* 1. Procedural Automotive Studio Clearcoat MatCap */
  const autoMatcapCanvas = document.createElement('canvas');
  autoMatcapCanvas.width = 256;
  autoMatcapCanvas.height = 256;
  const mctx = autoMatcapCanvas.getContext('2d');
  const radG = mctx.createRadialGradient(118, 110, 8, 128, 128, 128);
  radG.addColorStop(0.0, '#ffffff');
  radG.addColorStop(0.18, '#eaf2fa');
  radG.addColorStop(0.5, '#7b8ba2');
  radG.addColorStop(0.82, '#232a36');
  radG.addColorStop(1.0, '#0a0d13');
  mctx.fillStyle = radG;
  mctx.beginPath();
  mctx.arc(128, 128, 128, 0, Math.PI * 2);
  mctx.fill();

  mctx.save();
  mctx.beginPath();
  mctx.arc(128, 128, 128, 0, Math.PI * 2);
  mctx.clip();

  // Studio overhead softbox light reflection
  const softbox = mctx.createLinearGradient(60, 20, 190, 130);
  softbox.addColorStop(0.0, 'rgba(255,255,255,0.85)');
  softbox.addColorStop(0.25, 'rgba(255,255,255,0.4)');
  softbox.addColorStop(0.7, 'rgba(255,255,255,0)');
  mctx.fillStyle = softbox;
  mctx.fillRect(40, 15, 180, 90);

  // Ground horizon reflection (giving realistic depth and horizon reflection)
  const horizonG = mctx.createLinearGradient(0, 120, 0, 200);
  horizonG.addColorStop(0.0, 'rgba(0,0,0,0)');
  horizonG.addColorStop(0.4, 'rgba(12,18,28,0.65)');
  horizonG.addColorStop(1.0, 'rgba(5,7,11,0.9)');
  mctx.fillStyle = horizonG;
  mctx.fillRect(0, 120, 256, 136);

  // Subtle ambient rim reflection
  const rimG = mctx.createRadialGradient(128, 128, 112, 128, 128, 128);
  rimG.addColorStop(0.0, 'rgba(0,229,255,0)');
  rimG.addColorStop(0.85, 'rgba(0,229,255,0.22)');
  rimG.addColorStop(1.0, 'rgba(255,255,255,0.5)');
  mctx.fillStyle = rimG;
  mctx.beginPath();
  mctx.arc(128, 128, 128, 0, Math.PI * 2);
  mctx.fill();
  mctx.restore();

  const autoMatcapTex = new THREE.CanvasTexture(autoMatcapCanvas);

  /* 2. Procedural Twill Carbon Fiber Texture */
  const carbonCanvas = document.createElement('canvas');
  carbonCanvas.width = 64;
  carbonCanvas.height = 64;
  const cctx = carbonCanvas.getContext('2d');
  cctx.fillStyle = '#13151a';
  cctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x += 8) {
      if ((x / 8 + y / 8) % 2 === 0) {
        cctx.fillStyle = '#262a34';
        cctx.fillRect(x, y, 7, 7);
        cctx.fillStyle = '#39404e';
        cctx.fillRect(x + 1, y + 1, 5, 2);
      }
    }
  }
  const carbonTex = new THREE.CanvasTexture(carbonCanvas);
  carbonTex.wrapS = THREE.RepeatWrapping;
  carbonTex.wrapT = THREE.RepeatWrapping;
  carbonTex.repeat.set(4, 4);

  /* 3. Procedural Drilled Brake Rotor Disc Texture */
  const rotorCanvas = document.createElement('canvas');
  rotorCanvas.width = 128;
  rotorCanvas.height = 128;
  const rctx = rotorCanvas.getContext('2d');
  const bRotorGrad = rctx.createRadialGradient(64, 64, 12, 64, 64, 64);
  bRotorGrad.addColorStop(0.0, '#3a414d');
  bRotorGrad.addColorStop(0.3, '#8b96a5');
  bRotorGrad.addColorStop(0.75, '#d4dce6');
  bRotorGrad.addColorStop(1.0, '#4a5568');
  rctx.fillStyle = bRotorGrad;
  rctx.beginPath();
  rctx.arc(64, 64, 63, 0, Math.PI * 2);
  rctx.fill();
  rctx.strokeStyle = 'rgba(255,255,255,0.25)';
  rctx.lineWidth = 1;
  for (let r = 24; r < 58; r += 4) {
    rctx.beginPath();
    rctx.arc(64, 64, r, 0, Math.PI * 2);
    rctx.stroke();
  }
  rctx.fillStyle = '#111827';
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    for (let d = 30; d < 55; d += 9) {
      const hx = 64 + Math.cos(a + (d * 0.05)) * d;
      const hy = 64 + Math.sin(a + (d * 0.05)) * d;
      rctx.beginPath();
      rctx.arc(hx, hy, 1.8, 0, Math.PI * 2);
      rctx.fill();
    }
  }
  rctx.fillStyle = '#1e293b';
  rctx.beginPath();
  rctx.arc(64, 64, 20, 0, Math.PI * 2);
  rctx.fill();
  const rotorTex = new THREE.CanvasTexture(rotorCanvas);

  /* 4. Soft Ambient Occlusion Contact Shadow Texture */
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const sctx = shadowCanvas.getContext('2d');
  const sGrad = sctx.createRadialGradient(128, 128, 20, 128, 128, 120);
  sGrad.addColorStop(0.0, 'rgba(0,0,0,0.88)');
  sGrad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
  sGrad.addColorStop(0.85, 'rgba(0,0,0,0.15)');
  sGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
  sctx.fillStyle = sGrad;
  sctx.fillRect(0, 0, 256, 256);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);

  /* 5. Headlight Projector Glass Texture */
  const headCanvas = document.createElement('canvas');
  headCanvas.width = 128;
  headCanvas.height = 64;
  const hctx = headCanvas.getContext('2d');
  hctx.fillStyle = '#080d14';
  hctx.fillRect(0, 0, 128, 64);
  for (const lx of [38, 90]) {
    const lg = hctx.createRadialGradient(lx, 32, 2, lx, 32, 22);
    lg.addColorStop(0.0, '#ffffff');
    lg.addColorStop(0.35, '#cce7ff');
    lg.addColorStop(0.8, '#00e5ff');
    lg.addColorStop(1.0, 'rgba(0,229,255,0)');
    hctx.fillStyle = lg;
    hctx.beginPath();
    hctx.arc(lx, 32, 22, 0, Math.PI * 2);
    hctx.fill();
  }
  hctx.strokeStyle = '#ffffff';
  hctx.lineWidth = 4;
  hctx.beginPath();
  hctx.moveTo(10, 12);
  hctx.lineTo(118, 12);
  hctx.stroke();
  const headTex = new THREE.CanvasTexture(headCanvas);

  /* Shared Materials for 60 FPS Performance */
  const carbonMat = new THREE.MeshLambertMaterial({ map: carbonTex, color: 0x485160 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x060c14, transparent: true, opacity: 0.9 });
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.8, depthWrite: false });
  const rotorMat = new THREE.MeshLambertMaterial({ map: rotorTex });
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x14161c });
  const rimAlloyMat = new THREE.MeshMatcapMaterial({ matcap: autoMatcapTex, color: 0x8e98a8 });
  const rimDarkMat = new THREE.MeshLambertMaterial({ color: 0x101318 });
const chromeMat = new THREE.MeshMatcapMaterial({ matcap: autoMatcapTex, color: 0xe5ecf5 });
  const headMat = new THREE.MeshBasicMaterial({ map: headTex });
  const tailGlowMat = new THREE.MeshBasicMaterial({ color: 0xff1640 });
  const blackTrimMat = new THREE.MeshLambertMaterial({ color: 0x0a0c10 });

  /* ── Authentic High-Poly 3D Supercar Loader ── */
  let carMasterModel = null;
  let carModelLoading = false;

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('/draco/');

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  function loadMasterCarModel() {
    if (carModelLoading || carMasterModel) return;
    carModelLoading = true;
    gltfLoader.load('/cars/ferrari.glb', function (gltf) {
      const root = gltf.scene.children[0] || gltf.scene;
      root.rotation.y = Math.PI; // Face +Z forward
      root.scale.set(5.8, 5.8, 5.8);
      root.position.set(0, 0, 0);
      carMasterModel = root;
      console.log('🏎️ Authentic 3D supercar model loaded successfully!');

      // Rebuild all active car meshes on track with the real high-poly model
      if (carMeshes && carMeshes.size > 0) {
        for (const [id, oldCar] of carMeshes) {
          const carId = oldCar.userData.carId || 'jesko';
          const colorHex = oldCar.userData.colorHex || '#ff6a1a';
          const pos = oldCar.position.clone();
          const rotY = oldCar.rotation.y;
          const rotX = oldCar.rotation.x;
          scene.remove(oldCar);
          const newCar = createCarMesh(carId, colorHex);
          newCar.position.copy(pos);
          newCar.rotation.y = rotY;
          newCar.rotation.x = rotX;
          scene.add(newCar);
          carMeshes.set(id, newCar);
        }
      }
    }, undefined, function (err) {
      console.warn('Could not load glb car, fallback in use:', err);
    });
  }

  // Procedural cars keep the same visual language and avoid a heavy model on mobile.

  /* ── 3D Sports Car Builder with Authentic Supercar Body & Aerodynamics ── */
  function createCarMesh(carId, colorHex) {
    const car = new THREE.Group();
    const spec = P.CARS.find(c => c.id === carId) || P.CARS[0];
    const primaryColor = new THREE.Color(colorHex || spec.color);
    const accentColor = new THREE.Color(spec.accentColor || '#111315');

    /* Glossy Clearcoat Metallic Car Paint (MatCap Studio Reflection) */
    const bodyMat = new THREE.MeshMatcapMaterial({ matcap: autoMatcapTex, color: primaryColor });
    const accentMat = new THREE.MeshLambertMaterial({ color: accentColor });
    const neonMat = new THREE.MeshBasicMaterial({ color: primaryColor, transparent: true, opacity: 0.85 });

    /* Determine Brake Caliper Accent Color by Model */
    let caliperColor = 0xff1744; // Brembo Red
    if (spec.id === 'sf90' || spec.id === 'jesko') caliperColor = 0xffea00; // Modena / Acid Yellow
    else if (spec.id === 'aventador') caliperColor = 0xff6a1a; // Arancio Orange
    else if (spec.id === 'gt3rs') caliperColor = 0xff2200; // Guards Red
    const caliperMat = new THREE.MeshLambertMaterial({ color: caliperColor });

    /* 1. Soft Ambient Occlusion Contact Shadow directly under car floor */
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(18, 32), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.08;
    car.add(shadow);

    if (carMasterModel) {
      /* ── Authentic High-Poly 3D Supercar Architecture ── */
      const model = carMasterModel.clone(true);
      car.add(model);
      car.userData.isRealGltf = true;

      // Body Paint
      const bodyMesh = model.getObjectByName('body');
      if (bodyMesh) bodyMesh.material = bodyMat;

      // Carbon Fiber & Trim
      const carbon1 = model.getObjectByName('carbon fibre');
      if (carbon1) carbon1.material = carbonMat;
      const carbon2 = model.getObjectByName('carbon_fibre_trim');
      if (carbon2) carbon2.material = carbonMat;
      const trim = model.getObjectByName('trim');
      if (trim) trim.material = blackTrimMat;

      // Tinted Glass
      const glass = model.getObjectByName('glass');
      if (glass) glass.material = glassMat;

      // Projector Headlights & Taillights
      const lights = model.getObjectByName('lights');
      if (lights) lights.material = headMat;
      const leds = model.getObjectByName('leds');
      if (leds) leds.material = new THREE.MeshBasicMaterial({ color: 0xcce7ff });
      const lightsRed = model.getObjectByName('lights_red');
      if (lightsRed) lightsRed.material = tailGlowMat;

      // Rims Styling per Supercar
      let rimColor = 0xc0c8d4; // High metallic silver
      if (spec.id === 'jesko') rimColor = 0x14181f; // Satin Carbon Black
      else if (spec.id === 'chiron') rimColor = 0x222b3d; // Midnight Gunmetal
      else if (spec.id === 'aventador') rimColor = 0xd4af37; // Forged Gold
      else if (spec.id === 'gt3rs') rimColor = 0xbb1122; // Guards Pyro Red
      const curRimMat = new THREE.MeshMatcapMaterial({ matcap: autoMatcapTex, color: rimColor });
      ['rim_fl', 'rim_fr', 'rim_rl', 'rim_rr'].forEach(nm => {
        const r = model.getObjectByName(nm);
        if (r) r.material = curRimMat;
      });

      // Calipers
      ['brake', 'brakes'].forEach(nm => {
        model.traverse(child => {
          if (child.isMesh && (child.name.includes('brake') || child.name === nm)) {
            child.material = caliperMat;
          }
        });
      });

      // 4 Wheels Collection for Live Speed Rotation
      const wheels = [];
      ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].forEach(nm => {
        const w = model.getObjectByName(nm);
        if (w) wheels.push(w);
      });
      car.userData.wheels = wheels;

      // Bespoke Aerodynamics & Body Kits
      if (spec.id === 'jesko') {
        const wingPylonL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.8, 1.8), carbonMat);
        wingPylonL.position.set(-3.6, 5.8, -12.2); car.add(wingPylonL);
        const wingPylonR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.8, 1.8), carbonMat);
        wingPylonR.position.set(3.6, 5.8, -12.2); car.add(wingPylonR);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(17.5, 0.55, 4.2), carbonMat);
        wing.position.set(0, 7.6, -12.4); car.add(wing);
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 8.5), carbonMat);
        fin.position.set(0, 6.0, -6.5); car.add(fin);
        const canardL = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 2.8), carbonMat);
        canardL.position.set(-7.2, 1.6, 12.0); canardL.rotation.z = -0.25; car.add(canardL);
        const canardR = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 2.8), carbonMat);
        canardR.position.set(7.2, 1.6, 12.0); canardR.rotation.z = 0.25; car.add(canardR);
      } else if (spec.id === 'chiron') {
        const horseshoe = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.6, 0.8), chromeMat);
        horseshoe.position.set(0, 1.9, 13.5); car.add(horseshoe);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.6, 4.0), carbonMat);
        wing.position.set(0, 6.8, -12.4); car.add(wing);
        const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.8, 2.0), carbonMat);
        strutL.position.set(-4.6, 5.2, -12.0); car.add(strutL);
        const strutR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.8, 2.0), carbonMat);
        strutR.position.set(4.6, 5.2, -12.0); car.add(strutR);
      } else if (spec.id === 'gt3rs') {
        const swanL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 2.4), carbonMat);
        swanL.position.set(-4.2, 6.0, -11.6); car.add(swanL);
        const swanR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 2.4), carbonMat);
        swanR.position.set(4.2, 6.0, -11.6); car.add(swanR);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.7, 4.2), carbonMat);
        wing.position.set(0, 8.0, -12.0); car.add(wing);
        const roofFins = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.35, 5.0), carbonMat);
        roofFins.position.set(0, 6.2, -2.5); car.add(roofFins);
      } else if (spec.id === 'aventador') {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(16.8, 0.6, 3.8), carbonMat);
        wing.position.set(0, 7.2, -12.4); car.add(wing);
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.6, 2.0), carbonMat);
        pylon.position.set(0, 5.5, -12.0); car.add(pylon);
      } else if (spec.id === 'gtr') {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.5, 3.6), carbonMat);
        wing.position.set(0, 6.4, -12.0); car.add(wing);
        const nismoF = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.4, 0.8), accentMat);
        nismoF.position.set(0, 0.9, 13.2); car.add(nismoF);
      }

    } else {
      /* Fallback Procedural Body (while GLTF is loading initial milliseconds) */
      car.userData.isFallback = true;
      const wheelPositions = [
        [-6.6, 2.5, 7.8],  // Front Left
        [6.6, 2.5, 7.8],   // Front Right
        [-6.7, 2.7, -7.8], // Rear Left
        [6.7, 2.7, -7.8]   // Rear Right
      ];
      const wheels = [];
      const caliperGeo = new THREE.BoxGeometry(1.2, 1.8, 1.8);
      const rimSpokeGeo = new THREE.BoxGeometry(0.35, 4.2, 0.4);

      for (const pos of wheelPositions) {
        const isRear = pos[2] < 0;
        const isLeft = pos[0] < 0;
        const rRadius = isRear ? 3.3 : 3.0;

        const caliper = new THREE.Mesh(caliperGeo, caliperMat);
        caliper.position.set(pos[0] * 0.94, pos[1] + 0.6, pos[2] + (isRear ? 0.8 : -0.8));
        car.add(caliper);

        const wGroup = new THREE.Group();
        wGroup.position.set(pos[0], pos[1], pos[2]);

        const tireGeo = new THREE.CylinderGeometry(rRadius, rRadius, 2.4, 16);
        tireGeo.rotateZ(Math.PI / 2);
        wGroup.add(new THREE.Mesh(tireGeo, tireMat));

        const rotorGeo = new THREE.CylinderGeometry(2.3, 2.3, 2.44, 16);
        rotorGeo.rotateZ(Math.PI / 2);
        wGroup.add(new THREE.Mesh(rotorGeo, rotorMat));

        const rimLipGeo = new THREE.CylinderGeometry(rRadius * 0.72, rRadius * 0.72, 2.46, 12, 1, true);
        rimLipGeo.rotateZ(Math.PI / 2);
        wGroup.add(new THREE.Mesh(rimLipGeo, rimAlloyMat));

        for (let s = 0; s < 3; s++) {
          const spoke = new THREE.Mesh(rimSpokeGeo, rimAlloyMat);
          spoke.rotation.x = (s * Math.PI) / 3;
          spoke.position.x = isLeft ? -0.05 : 0.05;
          wGroup.add(spoke);
        }

        car.add(wGroup);
        wheels.push(wGroup);
      }
      car.userData.wheels = wheels;

      const chassis = new THREE.Mesh(new THREE.BoxGeometry(13.4, 2.3, 25.5), bodyMat);
      chassis.position.y = 2.0;
      car.add(chassis);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(9.0, 2.7, 12.5), glassMat);
      cabin.position.set(0, 3.8, -1.2);
      car.add(cabin);
    }

    /* 6. Underglow Neon Light */
    const underGlow = new THREE.Mesh(new THREE.PlaneGeometry(16, 28), neonMat);
    underGlow.rotation.x = -Math.PI / 2;
    underGlow.position.y = 0.35;
    car.add(underGlow);

    /* 7. Nitro Thruster Flame */
    const flameGeo = new THREE.ConeGeometry(1.8, 8, 6);
    flameGeo.rotateX(-Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.95 });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(0, 1.8, -14.5);
    flame.visible = false;
    car.add(flame);
    car.userData.flame = flame;

    /* 8. 3D Aegis Shield Bubble */
    const shieldBubbleGeo = new THREE.SphereGeometry(15.5, 16, 12);
    const shieldBubbleMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.28,
      wireframe: true
    });
    const shieldBubble = new THREE.Mesh(shieldBubbleGeo, shieldBubbleMat);
    shieldBubble.position.y = 3.5;
    shieldBubble.visible = false;
    car.add(shieldBubble);
    car.userData.shieldBubble = shieldBubble;

    /* 9. Opponent Nameplate Sprite */
    const canvasLabel = document.createElement('canvas');
    canvasLabel.width = 256;
    canvasLabel.height = 64;
    const ctx = canvasLabel.getContext('2d');
    const labelTex = new THREE.CanvasTexture(canvasLabel);
    const spriteMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(0, 12, 0);
    sprite.scale.set(22, 5.5, 1);
    car.add(sprite);
    car.userData.sprite = sprite;
    car.userData.labelCtx = ctx;
    car.userData.labelTex = labelTex;
    car.userData.lastLabel = '';

    car.userData.carId = spec.id;
    car.userData.colorHex = colorHex;

    return car;
  }

  function updateCarSprite(car, name, isSelf) {
    /* Hide nameplate for self player so camera view is never obstructed */
    if (isSelf) {
      if (car.userData.sprite) car.userData.sprite.visible = false;
      return;
    }
    if (car.userData.sprite) car.userData.sprite.visible = true;

    if (car.userData.lastLabel === name) return;
    car.userData.lastLabel = name;
    const ctx = car.userData.labelCtx;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(10, 16, 28, 0.82)';
    ctx.roundRect(8, 8, 240, 48, 8);
    ctx.fill();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 14), 128, 32);
    car.userData.labelTex.needsUpdate = true;
  }

  /* ── Smooth Camera Follow Targets ── */
  const currentCamPos = new THREE.Vector3();
  const currentLookAt = new THREE.Vector3();
  let firstCameraFrame = true;
  let lastSelfJumpY = 0;

  /* ── Camera Modes (POV Sürüş / Kokpit / Kaput / Takip) ── */
  const CAMERA_MODES = [
    { id: 'chase', name: '3. ŞAHIS', title: 'Geniş Takip Kamerası' },
    { id: 'pov_hood', name: 'POV KAPUT', title: 'Kaput & Yol Görüşü (Gran Turismo)' },
    { id: 'pov_bumper', name: 'POV TAMPON', title: 'Asfalt Hızı (Pro Simülasyon)' },
    { id: 'pov_cockpit', name: 'POV KOKPİT', title: 'Direksiyon & Kokpit İçi' }
  ];
  let cameraModeIndex = parseInt(localStorage.getItem('gs-cam-mode') || '0', 10);
  if (isNaN(cameraModeIndex) || cameraModeIndex < 0 || cameraModeIndex >= CAMERA_MODES.length) {
    cameraModeIndex = 0;
  }

  function cycleCameraMode(targetIndex = null) {
    if (targetIndex !== null) {
      cameraModeIndex = targetIndex % CAMERA_MODES.length;
    } else {
      cameraModeIndex = (cameraModeIndex + 1) % CAMERA_MODES.length;
    }
    localStorage.setItem('gs-cam-mode', cameraModeIndex);
    const mode = CAMERA_MODES[cameraModeIndex];
    toast(`📹 Kamera: ${mode.name} (${mode.title})`);
    firstCameraFrame = true;
    updateCameraUI();
  }

  function updateCameraUI() {
    const mode = CAMERA_MODES[cameraModeIndex];
    const hudTxt = $('#hud-cam-text');
    if (hudTxt) hudTxt.textContent = mode.name;
    const topTxt = $('#top-cam-text');
    if (topTxt) topTxt.textContent = mode.name;
    const povHud = $('#pov-hud');
    if (povHud) povHud.hidden = !mode.id.startsWith('pov');
  }

  /* ── 3D Render / Tick Loop ── */
  function update3D(dt) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    const isRacing = state && ['race', 'countdown', 'results'].includes(state.phase);
    const me = selfPlayer();

    /* Sync Car Meshes */
    if (state && state.players) {
      const activeIds = new Set();
      for (const p of state.players) {
        activeIds.add(p.id);
        let carObj = carMeshes.get(p.id);
        const carId = (p.id === state?.selfId ? (selectedCarId || p.carId) : p.carId) || 'jesko';
        if (!carObj || carObj.userData.carId !== carId || carObj.userData.colorHex !== p.color) {
          if (carObj) scene.remove(carObj);
          carObj = createCarMesh(carId, p.color || '#ff6a1a');
          scene.add(carObj);
          carMeshes.set(p.id, carObj);
        }

        /* Update Position & Orientation with Bridge Elevation + Slope Pitch */
        if (p.x != null && p.y != null) {
          const trackElev = trackData ? (P.nearest(trackData, p.x, p.y).elev || 0) : 0;
          const elev = Math.max(p.elev || 0, trackElev) + (p.jumpY || 0);
          carObj.position.set(p.x, elev, p.y);
          carObj.rotation.y = -p.angle + Math.PI / 2;

          /* Airborne Jump or Road Slope Pitch Tilt */
          if ((p.jumpY || 0) > 0.2) {
            carObj.rotation.x = -Math.min(0.28, (p.jumpVy || 0) * 0.012);
          } else if (trackData) {
            const fwdDist = 14;
            const fx = p.x + Math.cos(p.angle) * fwdDist;
            const fy = p.y + Math.sin(p.angle) * fwdDist;
            const fElev = P.nearest(trackData, fx, fy).elev || 0;
            const slope = (fElev - trackElev) / fwdDist;
            carObj.rotation.x = -Math.atan(slope);
          } else {
            carObj.rotation.x = 0;
          }

          /* Wheels Spin */
          const spd = p.speed || 0;
          if (carObj.userData.wheels) {
            const rotFactor = carObj.userData.isRealGltf ? -0.04 : 0.04;
            for (const w of carObj.userData.wheels) {
              w.rotation.x += spd * dt * rotFactor;
            }
          }

          /* Nitro Flame */
          if (carObj.userData.flame) {
            carObj.userData.flame.visible = !!p.boosting;
            if (p.boosting) {
              const s = 0.8 + Math.random() * 0.4;
              carObj.userData.flame.scale.set(s, s, s);
            }
          }

          /* Shield Bubble Glow */
          if (carObj.userData.shieldBubble) {
            const shieldActive = !!(p.shield && p.shieldReady);
            const isSelf = p.id === state.selfId;
            const currentMode = CAMERA_MODES[cameraModeIndex].id;
            carObj.userData.shieldBubble.visible = shieldActive && !(isSelf && isRacing && currentMode.startsWith('pov'));
            if (carObj.userData.shieldBubble.visible) {
              carObj.userData.shieldBubble.rotation.y += dt * 1.5;
              carObj.userData.shieldBubble.rotation.x += dt * 0.9;
            }
          }

          /* Name Sprite */
          updateCarSprite(carObj, p.name || 'Racer', p.id === state.selfId);

          /* Self Car Mesh Visibility for POV (100% Unobstructed Road View) */
          if (p.id === state.selfId) {
            const currentMode = CAMERA_MODES[cameraModeIndex].id;
            if (currentMode.startsWith('pov') && isRacing) {
              carObj.visible = false;
            } else {
              carObj.visible = true;
              carObj.traverse(child => {
                if (child !== carObj.userData.sprite && child !== carObj.userData.shieldBubble) {
                  child.visible = true;
                }
              });
            }
          } else {
            carObj.visible = true;
          }
        }
      }

      /* Clean removed cars */
      for (const [id, mesh] of carMeshes) {
        if (!activeIds.has(id)) {
          scene.remove(mesh);
          carMeshes.delete(id);
        }
      }
    }

    /* Jump Audio Launch Trigger for Self Player */
    if (me && (me.jumpY || 0) > 0.8 && lastSelfJumpY <= 0.2) {
      playJumpSound();
    }
    lastSelfJumpY = me ? (me.jumpY || 0) : 0;

    /* Update Landmines (Continuous relocation & Pulsing Glow) */
    const mPulse = 1.0 + Math.sin(performance.now() * 0.007) * 0.25;
    if (state && state.mines) {
      for (const m of state.mines) {
        let mGroup = mineMeshes.get(m.id);
        if (mGroup) {
          mGroup.position.set(m.x, m.elev || 0, m.y);
          mGroup.visible = !!m.active;
          if (m.active) {
            if (mGroup.userData.core) mGroup.userData.core.scale.set(mPulse, mPulse, mPulse);
            if (mGroup.userData.ring) mGroup.userData.ring.rotation.z += dt * 1.5;
          }
        }
      }
    }

    /* Update Falling Airstrike Missiles & Ground Reticles */
    if (state && state.missiles) {
      const activeMissileIds = new Set();
      const curTime = sNow();

      for (const m of state.missiles) {
        activeMissileIds.add(m.id);
        let mVisual = missileMeshes.get(m.id);
        if (!mVisual) {
          mVisual = createMissileMesh();
          scene.add(mVisual.group);
          missileMeshes.set(m.id, mVisual);
        }

        if (m.exploded) {
          mVisual.group.visible = false;
          mVisual.reticle.visible = false;
        } else {
          // Warning Target Reticle on the asphalt
          mVisual.reticle.visible = true;
          mVisual.reticle.position.set(m.x, (m.elev || 0) + 0.35, m.y);
          const rPulse = 1.0 + Math.sin(curTime * 0.012) * 0.18;
          mVisual.reticle.scale.set(rPulse, 1, rPulse);
          mVisual.reticle.rotation.y += dt * 2.2;

          // Warning whistle sound 1.5s before impact
          if (!mVisual.whistlePlayed && (m.impactTime - curTime) < 1600) {
            mVisual.whistlePlayed = true;
            playMissileWhistleSound();
          }

          // Descending Missile from sky
          const totalDuration = m.impactTime - m.spawnTime;
          const remaining = Math.max(0, m.impactTime - curTime);
          const tProgress = 1 - Math.min(1, Math.max(0, remaining / totalDuration)); // 0 to 1

          mVisual.group.visible = true;
          const missileAltitude = (m.elev || 0) + (1 - tProgress) * 420;
          mVisual.group.position.set(m.x, missileAltitude, m.y);
          mVisual.flame.scale.set(1.0 + Math.random() * 0.5, 1.0 + Math.random() * 0.5, 1.0 + Math.random() * 0.5);
        }
      }

      /* Clean removed missiles */
      for (const [id, mVisual] of missileMeshes) {
        if (!activeMissileIds.has(id)) {
          scene.remove(mVisual.group);
          scene.remove(mVisual.reticle);
          missileMeshes.delete(id);
        }
      }
    }

    /* Update Player Seeker Missiles (Launched with [F]) */
    if (state && state.playerMissiles) {
      const activePMIds = new Set();
      for (const pm of state.playerMissiles) {
        activePMIds.add(pm.id);
        let pMesh = playerMissileMeshes.get(pm.id);
        if (!pMesh) {
          pMesh = createPlayerMissileMesh();
          scene.add(pMesh);
          playerMissileMeshes.set(pm.id, pMesh);
        }
        pMesh.visible = !pm.exploded;
        if (!pm.exploded) {
          pMesh.position.set(pm.x, (pm.elev || 0) + 2.4, pm.y);
          pMesh.rotation.y = -pm.angle + Math.PI / 2;
        }
      }
      for (const [id, m] of playerMissileMeshes) {
        if (!activePMIds.has(id)) {
          scene.remove(m);
          playerMissileMeshes.delete(id);
        }
      }
    }

    /* Trigger Explosion Broadcast */
    if (state && state.explosion && state.explosion.time > lastExplosionTime) {
      lastExplosionTime = state.explosion.time;
      triggerExplosion(state.explosion.x, state.explosion.y, state.explosion.elev || 0, state.explosion.driver);
    }

    /* Update Active Explosions FX (Expanding Fireball + Shockwave) */
    for (let i = activeExplosions.length - 1; i >= 0; i--) {
      const ex = activeExplosions[i];
      ex.age += dt;
      const prg = ex.age / ex.maxAge;
      if (prg >= 1.0) {
        scene.remove(ex.group);
        ex.fireMat.dispose();
        ex.waveMat.dispose();
        ex.coreMat.dispose();
        activeExplosions.splice(i, 1);
        continue;
      }
      const fScale = 4.0 + prg * 28.0;
      ex.fireball.scale.set(fScale, fScale * 0.85, fScale);
      ex.fireMat.opacity = Math.max(0, 1.0 - prg);

      const cScale = fScale * 0.45;
      ex.innerCore.scale.set(cScale, cScale, cScale);
      ex.coreMat.opacity = Math.max(0, 1.0 - prg * 2.2);

      const wScale = 2.0 + prg * 68.0;
      ex.wave.scale.set(wScale, 1, wScale);
      ex.waveMat.opacity = Math.max(0, 0.9 * (1.0 - prg));

      for (const fr of ex.frags) {
        fr.vy -= 70 * dt;
        fr.mesh.position.x += fr.vx * dt;
        fr.mesh.position.y = Math.max(0, fr.mesh.position.y + fr.vy * dt);
        fr.mesh.position.z += fr.vz * dt;
        fr.mesh.rotation.x += dt * 8;
        fr.mesh.rotation.y += dt * 10;
      }
    }

    /* ── Camera Control ── */
    if (isRacing && me && me.x != null) {
      const trackElev = trackData ? (P.nearest(trackData, me.x, me.y).elev || 0) : 0;
      const carElev = Math.max(me.elev || 0, trackElev) + (me.jumpY || 0);
      const carPos = new THREE.Vector3(me.x, carElev, me.y);
      const carObj = carMeshes.get(me.id);

      // 3D Pitch / Slope accounting for ramps, bridges, and airborne jumps
      const pitch = carObj ? (carObj.rotation.x || 0) : 0;
      const pitchAngle = -pitch; // positive when climbing uphill

      const cosYaw = Math.cos(me.angle);
      const sinYaw = Math.sin(me.angle);
      const cosPitch = Math.cos(pitchAngle);
      const sinPitch = Math.sin(pitchAngle);

      // True 3D forward vector matching car direction and elevation tilt
      const forward3D = new THREE.Vector3(cosYaw * cosPitch, sinPitch, sinYaw * cosPitch).normalize();
      const flatForward = new THREE.Vector3(cosYaw, 0, sinYaw);
      const right = new THREE.Vector3(-sinYaw, 0, cosYaw);
      const upVector = new THREE.Vector3(-cosYaw * sinPitch, cosPitch, -sinYaw * sinPitch).normalize();

      // Steering Apex Look-Ahead
      const isSteerL = pressed.has('KeyA') || pressed.has('ArrowLeft') || pressed.has('touch-left');
      const isSteerR = pressed.has('KeyD') || pressed.has('ArrowRight') || pressed.has('touch-right');
      const steerVal = (isSteerR ? 1 : 0) - (isSteerL ? 1 : 0);

      const camMode = CAMERA_MODES[cameraModeIndex].id;
      let targetPos, targetLook;
      let lerpPosRate = 0.12;
      let lerpLookRate = 0.14;
      let baseFov = 65;
      let boostFov = 78;

      if (camMode === 'pov_hood') {
        /* POV KAPUT (Hood / Bonnet View - Gran Turismo & Forza Style) */
        targetPos = carPos.clone()
          .add(flatForward.clone().multiplyScalar(10.5))
          .add(new THREE.Vector3(0, 4.0, 0));

        targetLook = targetPos.clone()
          .add(forward3D.clone().multiplyScalar(95))
          .add(new THREE.Vector3(0, -1.2, 0))
          .add(right.clone().multiplyScalar(steerVal * 3.5));

        baseFov = 75;
        boostFov = 90;

      } else if (camMode === 'pov_bumper') {
        /* POV TAMPON & HIZ (Bumper / Track Surface View - Pure Speed Adrenaline) */
        targetPos = carPos.clone()
          .add(flatForward.clone().multiplyScalar(14.5))
          .add(new THREE.Vector3(0, 1.8, 0));

        targetLook = targetPos.clone()
          .add(forward3D.clone().multiplyScalar(100))
          .add(new THREE.Vector3(0, -0.3, 0))
          .add(right.clone().multiplyScalar(steerVal * 3.0));

        baseFov = 80;
        boostFov = 96;

      } else if (camMode === 'pov_cockpit') {
        /* POV KOKPİT & SÜRÜCÜ (Driver's Eye Position - Crystal Clear Road) */
        targetPos = carPos.clone()
          .add(flatForward.clone().multiplyScalar(4.5))
          .add(right.clone().multiplyScalar(-1.2))
          .add(new THREE.Vector3(0, 5.2, 0));

        targetLook = targetPos.clone()
          .add(forward3D.clone().multiplyScalar(90))
          .add(new THREE.Vector3(0, -1.8, 0))
          .add(right.clone().multiplyScalar(steerVal * 3.5));

        baseFov = 76;
        boostFov = 92;

      } else {
        /* Standard 3rd-Person Chase Cam */
        targetPos = carPos.clone()
          .sub(flatForward.clone().multiplyScalar(50))
          .add(new THREE.Vector3(0, 22, 0));

        targetLook = carPos.clone()
          .add(flatForward.clone().multiplyScalar(45))
          .add(new THREE.Vector3(0, 5, 0));

        baseFov = 65;
        boostFov = 78;
      }

      /* Micro road vibration at high speed */
      const speedRatio = Math.min(1, (me.speed || 0) / 280);
      if (camMode.startsWith('pov') && speedRatio > 0.1) {
        const t = performance.now() * 0.04;
        const jitter = speedRatio * 0.03;
        targetPos.y += Math.sin(t) * jitter;
        targetPos.x += Math.cos(t * 1.3) * (jitter * 0.5);
      }

      /* Collision or Explosion Shake (Damped & Controlled) */
      let shakeAmount = me.hit > 0.05 ? (me.hit * 1.8) : 0;
      if (state.explosion && (sNow() - state.explosion.time) < 800) {
        const edist = Math.hypot(me.x - state.explosion.x, me.y - state.explosion.y);
        if (edist < 300) shakeAmount += (1 - edist / 300) * 2.5;
      }
      if (shakeAmount > 0.05) {
        const maxShake = Math.min(shakeAmount, 2.2);
        targetPos.x += (Math.random() - 0.5) * maxShake;
        targetPos.y += (Math.random() - 0.5) * (maxShake * 0.6);
        targetPos.z += (Math.random() - 0.5) * maxShake;
      }

      if (camMode.startsWith('pov')) {
        /* 100% RIGID CHASSIS LOCK IN POV (ZERO DRIFT, ZERO SLIDING, ZERO LAG) */
        camera.position.copy(targetPos);
        camera.up.copy(upVector);
        camera.lookAt(targetLook);
        currentCamPos.copy(targetPos);
        currentLookAt.copy(targetLook);
      } else {
        /* 3rd-Person Chase Cam (Smooth Spring-Arm Lerp behind car) */
        if (firstCameraFrame) {
          currentCamPos.copy(targetPos);
          currentLookAt.copy(targetLook);
          firstCameraFrame = false;
        } else {
          currentCamPos.lerp(targetPos, 0.12);
          currentLookAt.lerp(targetLook, 0.14);
        }
        camera.position.copy(currentCamPos);
        camera.lookAt(currentLookAt);
        camera.up.set(0, 1, 0);
      }

      /* Animated Cockpit Steering Wheel in POV Cockpit Mode */
      const wheelEl = $('#pov-cockpit-wheel');
      if (wheelEl) {
        if (camMode === 'pov_cockpit') {
          wheelEl.hidden = false;
          const steerDeg = steerVal * 38;
          wheelEl.style.transform = `rotate(${steerDeg}deg)`;
        } else {
          wheelEl.hidden = true;
        }
      }

      /* Dynamic Speed FOV */
      const targetFov = me.boosting ? boostFov : baseFov;
      camera.fov += (targetFov - camera.fov) * 0.08;
      camera.updateProjectionMatrix();

      updateEngineSound(me.speed, me.boosting);
    } else {
      /* Lobby / Menu: Cinematic Orbit Camera around Start Line */
      firstCameraFrame = true;
      const sp = (trackData?.pts?.[0]) || { x: 420, y: 230 };
      const time = Date.now() * 0.00035;
      camera.position.set(
        sp.x + Math.sin(time) * 150,
        60,
        sp.y + Math.cos(time) * 150
      );
      camera.lookAt(sp.x, 8, sp.y);
      camera.fov = 60;
      camera.updateProjectionMatrix();
      updateEngineSound(0, false);
    }

    renderer.render(scene, camera);
  }

  /* ── 2D Radar Minimap ── */
  function drawMinimap() {
    const mini = $('#minimap');
    if (!mini || !trackData || !state) return;
    const ctx = mini.getContext('2d');
    const W = mini.width, H = mini.height;
    ctx.clearRect(0, 0, W, H);

    const pts = trackData.pts;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const tw = maxX - minX + 60, th = maxY - minY + 60;
    const scale = Math.min(W / tw, H / th);
    const ox = (W - tw * scale) / 2, oy = (H - th * scale) / 2;
    const tx = x => ox + (x - minX + 30) * scale;
    const ty = y => oy + (y - minY + 30) * scale;

    ctx.strokeStyle = '#283347';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx(pts[0].x), ty(pts[0].y));
    for (let i = 1; i <= pts.length; i++) ctx.lineTo(tx(pts[i % pts.length].x), ty(pts[i % pts.length].y));
    ctx.closePath();
    ctx.stroke();

    /* Glowing Center line */
    ctx.strokeStyle = '#ff6a1a66';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    /* Bridge elevated section on radar */
    if (trackData.bridge) {
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      let bStarted = false;
      for (const p of pts) {
        if (p.s >= trackData.bridge.start && p.s <= trackData.bridge.end) {
          if (!bStarted) { ctx.moveTo(tx(p.x), ty(p.y)); bStarted = true; }
          else ctx.lineTo(tx(p.x), ty(p.y));
        }
      }
      ctx.stroke();
    }

    /* Jump Ramps on radar */
    if (trackData.ramps) {
      ctx.fillStyle = '#ffe259';
      for (const r of trackData.ramps) {
        ctx.beginPath();
        ctx.arc(tx(r.x), ty(r.y), 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* Active Landmines on radar */
    if (state.mines) {
      const nowMs = performance.now() * 0.006;
      const mRad = 2.8 + Math.sin(nowMs) * 0.9;
      for (const m of state.mines) {
        if (!m.active) continue;
        ctx.fillStyle = '#ff1744';
        ctx.beginPath();
        ctx.arc(tx(m.x), ty(m.y), mRad, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    /* Incoming Airstrike Missiles on radar */
    if (state.missiles) {
      for (const mis of state.missiles) {
        if (mis.exploded) continue;
        const misTime = performance.now() * 0.01;
        const misRad = 4.5 + Math.sin(misTime) * 1.5;
        ctx.strokeStyle = '#ff1133';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tx(mis.x), ty(mis.y), misRad, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.arc(tx(mis.x), ty(mis.y), 2.0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* Road Obstacles / Barricades on radar */
    if (trackData.obstacles) {
      ctx.fillStyle = '#ff6a1a';
      for (const obs of trackData.obstacles) {
        ctx.beginPath();
        ctx.arc(tx(obs.x), ty(obs.y), 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const p of state.players) {
      if (p.x == null) continue;
      const isSelf = p.id === state.selfId;
      ctx.fillStyle = isSelf ? '#ffffff' : (p.color || '#888');
      ctx.beginPath();
      ctx.arc(tx(p.x), ty(p.y), isSelf ? 5.0 : 3.0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── Fullscreen Garage & 100 Credit Customization Controller ── */
  let garageActiveTab = 'cars';

  function openGarage() {
    const overlay = $('#garage-overlay');
    if (!overlay) return;
    overlay.hidden = false;
    updateGarageUI();
  }

  function closeGarage() {
    const overlay = $('#garage-overlay');
    if (overlay) overlay.hidden = true;
  }

  function selectCarInGarage(carId) {
    while (calcLoadoutCost(carId, selectedUpgrades).remaining < 0 && selectedUpgrades.length > 0) {
      selectedUpgrades.pop();
    }
    selectedCarId = carId;
    localStorage.setItem('gs-car', selectedCarId);
    localStorage.setItem('gs-upgrades', JSON.stringify(selectedUpgrades));
    if (token) act('update_loadout', { carId: selectedCarId, upgrades: selectedUpgrades });
    updateGarageUI();
    renderPanel();
  }

  function toggleUpgradeInGarage(upgradeId) {
    const idx = selectedUpgrades.indexOf(upgradeId);
    if (idx >= 0) {
      selectedUpgrades.splice(idx, 1);
    } else {
      const allUpgrades = (state && state.upgrades) || P.UPGRADES;
      const up = allUpgrades.find(u => u.id === upgradeId);
      const { remaining } = calcLoadoutCost(selectedCarId, selectedUpgrades);
      if (up && remaining < (up.price || 0)) {
        toast(`⚠️ Yetersiz Kredi! Kalan: ${remaining} CR, Gereken: ${up.price} CR`);
        return;
      }
      selectedUpgrades.push(upgradeId);
    }
    localStorage.setItem('gs-upgrades', JSON.stringify(selectedUpgrades));
    if (token) act('update_loadout', { carId: selectedCarId, upgrades: selectedUpgrades });
    updateGarageUI();
    renderPanel();
  }

  function resetLoadoutInGarage() {
    selectedUpgrades = [];
    localStorage.setItem('gs-upgrades', JSON.stringify(selectedUpgrades));
    if (token) act('update_loadout', { carId: selectedCarId, upgrades: selectedUpgrades });
    updateGarageUI();
    renderPanel();
    toast('Tüm yükseltmeler sıfırlandı.');
  }

  function updateGarageHero() {
    const cars = (state && state.cars) || P.CARS;
    const car = cars.find(c => c.id === selectedCarId) || cars[0];

    let topSpeed = car.topSpeed;
    let accel = car.accel;
    let grip = car.grip;
    let nitroRate = car.nitroRate;

    if (selectedUpgrades.includes('turbo')) {
      topSpeed += 15;
      accel += 28;
    }
    if (selectedUpgrades.includes('cryo_nitro')) {
      nitroRate += 5;
    }
    if (selectedUpgrades.includes('aero')) {
      grip = Number((grip + 1.2).toFixed(1));
    }
    if (selectedUpgrades.includes('chassis')) {
      accel += 12;
    }

    const heroImg = $('#garage-hero-img'); if (heroImg) heroImg.src = car.image;
    const heroName = $('#garage-hero-name'); if (heroName) heroName.textContent = car.name;
    const heroBrand = $('#garage-hero-brand'); if (heroBrand) heroBrand.textContent = (car.brand || car.name.split(' ')[0]).toLocaleUpperCase('tr');
    const heroClass = $('#garage-hero-class'); if (heroClass) heroClass.textContent = `${car.class} · ${car.hp || '1000+'} HP`;
    const heroPrice = $('#garage-hero-price'); if (heroPrice) heroPrice.textContent = `${car.price || 50} CR`;
    const heroTag = $('#garage-hero-tagline'); if (heroTag) heroTag.textContent = car.shortName || car.class;
    const heroDesc = $('#garage-hero-desc'); if (heroDesc) heroDesc.textContent = car.desc;

    const spEngine = $('#spec-engine'); if (spEngine) spEngine.textContent = car.engine || 'V8 Twin-Turbo';
    const spHp = $('#spec-hp'); if (spHp) spHp.textContent = (car.hp || 1000) + (selectedUpgrades.includes('turbo') ? ' (+Turbo)' : '');
    const spAccel = $('#spec-accel'); if (spAccel) spAccel.textContent = car.zeroToHundred || '2.8s';
    const spTorque = $('#spec-torque'); if (spTorque) spTorque.textContent = car.torque || '1000 Nm';
    const spWeight = $('#spec-weight'); if (spWeight) spWeight.textContent = (car.weight || '1450 kg') + (selectedUpgrades.includes('chassis') ? ' (-Ti)' : '');

    const maxSpeed = 340, maxAccel = 300, maxGrip = 11, maxNitro = 20;
    const bSpeed = $('#bar-fill-speed'); if (bSpeed) bSpeed.style.width = Math.min(100, Math.round((topSpeed / maxSpeed) * 100)) + '%';
    const vSpeed = $('#bar-val-speed'); if (vSpeed) vSpeed.textContent = topSpeed + ' KM/H';

    const bAccel = $('#bar-fill-accel'); if (bAccel) bAccel.style.width = Math.min(100, Math.round((accel / maxAccel) * 100)) + '%';
    const vAccel = $('#bar-val-accel'); if (vAccel) vAccel.textContent = accel + ' M/S²';

    const bGrip = $('#bar-fill-grip'); if (bGrip) bGrip.style.width = Math.min(100, Math.round((grip / maxGrip) * 100)) + '%';
    const vGrip = $('#bar-val-grip'); if (vGrip) vGrip.textContent = grip.toString();

    const bNitro = $('#bar-fill-nitro'); if (bNitro) bNitro.style.width = Math.min(100, Math.round((nitroRate / maxNitro) * 100)) + '%';
    const vNitro = $('#bar-val-nitro'); if (vNitro) vNitro.textContent = '+' + nitroRate + '/s';
  }

  function renderGarageTabs() {
    const cars = (state && state.cars) || P.CARS;
    const allUpgrades = (state && state.upgrades) || P.UPGRADES;
    const { remaining } = calcLoadoutCost();

    $$('.garage-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === garageActiveTab);
    });

    const pageCars = $('#tab-content-cars');
    const pageWeapons = $('#tab-content-weapons');
    const pagePerf = $('#tab-content-perf');

    if (pageCars) {
      pageCars.hidden = (garageActiveTab !== 'cars');
      if (garageActiveTab === 'cars') {
        const currentCar = cars.find(c => c.id === selectedCarId) || cars[0];
        pageCars.innerHTML = cars.map(c => {
          const isEquipped = c.id === selectedCarId;
          const costDiff = (c.price || 0) - (currentCar.price || 0);
          const canAfford = isEquipped || (remaining - costDiff >= 0);
          return `
            <div class="garage-item-card ${isEquipped ? 'equipped' : ''} ${!canAfford ? 'locked' : ''}" data-select-car="${c.id}">
              <img src="${c.image}" alt="${esc(c.name)}" class="item-thumb">
              <div class="item-details">
                <div class="item-header">
                  <span class="item-title">${esc(c.name)}</span>
                  <span class="item-pill">${esc(c.hp)} · ${c.topSpeed} KM/H</span>
                </div>
                <p class="item-desc">${esc(c.desc)}</p>
              </div>
              <div class="item-action">
                <span class="item-price">${c.price} CR</span>
                <button type="button" class="equip-btn ${isEquipped ? 'equipped' : ''}" ${isEquipped ? 'disabled' : (!canAfford ? 'disabled' : '')}>
                  ${isEquipped ? 'SEÇİLDİ ✓' : (!canAfford ? 'YETERSİZ CR' : 'SEÇ ↗')}
                </button>
              </div>
            </div>
          `;
        }).join('');

        pageCars.querySelectorAll('[data-select-car]').forEach(card => {
          card.onclick = () => selectCarInGarage(card.dataset.selectCar);
        });
      }
    }

    if (pageWeapons) {
      pageWeapons.hidden = (garageActiveTab !== 'weapons');
      if (garageActiveTab === 'weapons') {
        const weaponList = allUpgrades.filter(u => u.category === 'weapon' || u.category === 'defense');
        pageWeapons.innerHTML = weaponList.map(u => {
          const isEquipped = selectedUpgrades.includes(u.id);
          const canAfford = isEquipped || (remaining >= u.price);
          return `
            <div class="garage-item-card ${isEquipped ? 'equipped' : ''} ${!canAfford ? 'locked' : ''}" data-toggle-upgrade="${u.id}">
              <div class="item-icon-box">${u.icon}</div>
              <div class="item-details">
                <div class="item-header">
                  <span class="item-title">${esc(u.name)}</span>
                  <span class="item-pill">${esc(u.tag)}</span>
                </div>
                <p class="item-desc">${esc(u.desc)}</p>
              </div>
              <div class="item-action">
                <span class="item-price">${u.price} CR</span>
                <button type="button" class="equip-btn ${isEquipped ? 'equipped' : ''}" ${(!isEquipped && !canAfford) ? 'disabled' : ''}>
                  ${isEquipped ? 'KUŞANILDI ✓' : (!canAfford ? 'YETERSİZ CR' : 'KUŞAN +')}
                </button>
              </div>
            </div>
          `;
        }).join('');

        pageWeapons.querySelectorAll('[data-toggle-upgrade]').forEach(card => {
          card.onclick = () => toggleUpgradeInGarage(card.dataset.toggleUpgrade);
        });
      }
    }

    if (pagePerf) {
      pagePerf.hidden = (garageActiveTab !== 'perf');
      if (garageActiveTab === 'perf') {
        const perfList = allUpgrades.filter(u => u.category === 'perf');
        pagePerf.innerHTML = perfList.map(u => {
          const isEquipped = selectedUpgrades.includes(u.id);
          const canAfford = isEquipped || (remaining >= u.price);
          return `
            <div class="garage-item-card ${isEquipped ? 'equipped' : ''} ${!canAfford ? 'locked' : ''}" data-toggle-upgrade="${u.id}">
              <div class="item-icon-box">${u.icon}</div>
              <div class="item-details">
                <div class="item-header">
                  <span class="item-title">${esc(u.name)}</span>
                  <span class="item-pill">${esc(u.tag)}</span>
                </div>
                <p class="item-desc">${esc(u.desc)}</p>
              </div>
              <div class="item-action">
                <span class="item-price">${u.price} CR</span>
                <button type="button" class="equip-btn ${isEquipped ? 'equipped' : ''}" ${(!isEquipped && !canAfford) ? 'disabled' : ''}>
                  ${isEquipped ? 'KUŞANILDI ✓' : (!canAfford ? 'YETERSİZ CR' : 'KUŞAN +')}
                </button>
              </div>
            </div>
          `;
        }).join('');

        pagePerf.querySelectorAll('[data-toggle-upgrade]').forEach(card => {
          card.onclick = () => toggleUpgradeInGarage(card.dataset.toggleUpgrade);
        });
      }
    }
  }

  function updateGarageUI() {
    const { cost, remaining } = calcLoadoutCost();
    const crVal = $('#garage-credits-val');
    if (crVal) crVal.textContent = `${remaining} / 100 CR`;
    const bBar = $('#garage-budget-bar');
    if (bBar) {
      bBar.style.width = Math.max(0, Math.min(100, remaining)) + '%';
      bBar.classList.toggle('warning', remaining <= 15);
    }
    const totCost = $('#summary-total-cost');
    if (totCost) totCost.textContent = `${cost} CR`;

    updateGarageHero();
    renderGarageTabs();
  }

  /* ── Garage Vehicle Selector UI Component ── */
  function renderGarageHTML(currentCarId) {
    const cars = (state && state.cars) || P.CARS;
    const allUpgrades = (state && state.upgrades) || P.UPGRADES;
    const car = cars.find(c => c.id === currentCarId) || cars[0];
    const { cost, remaining } = calcLoadoutCost(currentCarId, selectedUpgrades);

    const equippedBadges = selectedUpgrades.map(uid => {
      const u = allUpgrades.find(x => x.id === uid);
      return u ? `<span style="font:8px monospace;background:rgba(0,229,255,0.12);color:var(--cyan);border:1px solid rgba(0,229,255,0.25);padding:2px 6px;border-radius:3px">${u.icon} ${esc(u.shortName || u.name)}</span>` : '';
    }).join(' ');

    return `
      <div class="garage-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span class="section-label" style="margin:0">GARAJ & MODİFİYE</span>
          <span style="font:9px monospace;font-weight:900;color:var(--cyan)">${remaining} / 100 CR</span>
        </div>
        <div class="garage-card active">
          <div class="garage-preview">
            <img src="${car.image}" alt="${esc(car.name)}" class="garage-img">
            <span class="garage-class">${esc(car.class)}</span>
            <span class="garage-top-stat">${car.price} CR</span>
          </div>
          <div class="garage-info">
            <div class="garage-title" style="color:${car.color}">
              <span>${esc(car.name)}</span>
              <small style="font:9px monospace;color:var(--orange)">${car.topSpeed} KM/H</small>
            </div>
            <p class="garage-desc">${esc(car.desc)}</p>
            ${equippedBadges ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${equippedBadges}</div>` : ''}
            <button type="button" class="primary" data-open-garage style="padding:10px 14px;font-size:11px;margin-top:4px">
              ⚙️ Garaj & Modifiye Atölyesi (${remaining} CR) <span>↗</span>
            </button>
          </div>
        </div>
        <div class="car-thumbs-row">
          ${cars.map(c => `
            <button type="button" class="car-thumb-btn ${c.id === currentCarId ? 'active' : ''}" data-car-select="${c.id}" title="${esc(c.name)} (${c.price} CR)">
              <img src="${c.image}" alt="${esc(c.shortName || c.name)}">
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  /* ── UI Rendering (Lobby, HUD, Countdown, Results) ── */
  /* ── Multi-Room Online Lobby Functions ── */
  let selectedTrackForNewRoom = 0;
  let selectedLapsForNewRoom = 3;
  let roomsError = false;

  async function loadRooms() {
    try {
      if (nativeApp && !apiBase) throw Error('Online service not configured');
      const res = await fetch(apiBase + '/api/rooms', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw Error('Room service unavailable');
      const data = await res.json();
      cachedRooms = data.rooms || [];
      roomsError = false;
    } catch (err) {
      roomsError = true;
    }
  }

  async function joinSelectedRoom(roomId, password = '') {
    const nameInput = $('#name');
    const name = (nameInput ? nameInput.value : localStorage.getItem('gs-name') || '').trim();
    if (!name) {
      toast('Lütfen önce bir sürücü adı girin!');
      if (nameInput) nameInput.focus();
      return;
    }
    localStorage.setItem('gs-name', name);

    try {
      const d = await api('rooms/join', {
        roomId,
        password,
        name,
        carId: selectedCarId,
        upgrades: selectedUpgrades
      });
      token = d.token;
      currentRoomId = d.roomId;
      sessionStorage.setItem('gs-token', token);
      localStorage.setItem('gs-room', currentRoomId);
      state = d.state;
      history.replaceState(null, '', `/?room=${encodeURIComponent(currentRoomId)}`);
      if (!trackData || trackData.id !== state.trackId) {
        trackData = P.makeTrack(state.trackId);
        build3DTrack(trackData);
      }
      connect();
      renderUI();
      toast(`🏁 ${state.roomName || 'Odaya'} başarıyla katıldınız!`);
    } catch (err) {
      toast('⚠️ ' + err.message);
    }
  }

  function leaveCurrentRoom() {
    if (practice) { location.href = '/'; return; }
    events?.close();
    sessionStorage.removeItem('gs-token');
    token = null;
    state = null;
    currentRoomId = 'genel';
    localStorage.setItem('gs-room', 'genel');
    history.replaceState(null, '', '/');
    updateConnection();
    renderPanel();
    toast('Odadan ayrıldınız.');
  }

  /* ── UI Rendering (Multi-Room Lobby, HUD, Countdown, Results) ── */
  async function renderPanel() {
    const panel = $('#panel');
    if (!panel) return;

    if (!token || !state) {
      if (cachedRooms.length === 0) {
        await loadRooms();
      }

      const currentName = esc(localStorage.getItem('gs-name') || '');

      let roomsHtml = '';
      if (cachedRooms.length === 0) {
        roomsHtml = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:11px">' + (roomsError ? 'Sunucuya ulaşılamıyor. Bağlantını kontrol et veya çevrimdışı antrenmana çık.' : 'Şu anda aktif oda bulunamadı. Yeni bir oda kurabilirsiniz!') + '</div>';
      } else {
        roomsHtml = cachedRooms.map(r => `
          <div class="room-card" data-room-id="${esc(r.id)}">
            <div class="room-card-main">
              <div class="room-card-title">
                ${r.hasPassword ? '<span title="Şifreli Özel Oda">🔒</span>' : ''}
                <span>${esc(r.name)}</span>
              </div>
              <div class="room-card-meta">
                <span>🛣️ ${esc(r.trackName)}</span>
                <span>🏁 ${r.laps} Tur</span>
                <span class="room-badge ${r.hasPassword ? 'lock' : 'open'}">${r.hasPassword ? 'ŞİFRELİ' : 'AÇIK'}</span>
                <span class="room-badge live" data-room-phase>${r.phase === 'lobby' ? 'LOBİ' : r.phase === 'results' ? 'SONUÇLAR' : 'YARIŞTA'}</span>
                <span data-room-count style="color:var(--cyan);font-weight:bold">● ${r.playersCount}/${r.maxPlayers}</span>
              </div>
            </div>
            <button type="button" class="room-join-btn" ${r.phase !== 'lobby' || r.playersCount >= r.maxPlayers ? 'disabled' : ''} data-join-room="${esc(r.id)}" data-locked="${r.hasPassword ? '1' : '0'}">
              ${r.hasPassword ? 'KİLİT 🔑' : 'KATIL ↗'}
            </button>
          </div>
        `).join('');
      }

      panel.innerHTML = `
        <span class="kicker">01 / ONLINE ÇOK OYUNCULU</span>
        <h2>Makinanı seç.</h2>
        <a class="practice-card" href="/?practice=1"><small>İNTERNET GEREKTİRMEZ</small><strong>Antrenmana çık <span>↗</span></strong><span>3 pist · Yapay zekâ rakipler · Kendi tempon</span></a>
        <p class="muted">Bir takma ad yaz, odaya katıl veya kendi odanı kur.</p>

        <label class="name-label">SÜRÜCÜ ADI</label>
        <input id="name" maxlength="18" autocomplete="nickname" placeholder="Örn. Turbo Karınca" required value="${currentName}">
        ${renderGarageHTML(selectedCarId)}

        <div class="lobby-tabs">
          <button type="button" class="lobby-tab-btn ${activeLobbyTab === 'rooms' ? 'active' : ''}" id="tab-btn-rooms">
            🏎️ AKTİF ODALAR (${cachedRooms.length})
          </button>
          <button type="button" class="lobby-tab-btn ${activeLobbyTab === 'create' ? 'active' : ''}" id="tab-btn-create">
            ➕ YENİ ODA KUR
          </button>
        </div>

        ${activeLobbyTab === 'rooms' ? `
          <div class="room-list-container">
            ${roomsHtml}
          </div>
          <button type="button" class="primary" id="quick-play-btn" style="margin-top:4px">
            ⚡ HIZLI OYNA (Genel Odaya Katıl) <span>↗</span>
          </button>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
            <button type="button" id="refresh-rooms-btn" class="quiet" style="font-size:8.5px">↻ Odaları Yenile</button>
            <span class="minor" id="room-refresh-status" role="status">Oyuncu sayıları otomatik güncellenir</span>
          </div>
        ` : `
          <form id="create-room-form" class="room-create-box">
            <div>
              <label class="room-field-label">ODA ADI</label>
              <input id="new-room-name" class="room-input-sm" maxlength="24" placeholder="Örn. Ofis Turnuvası" required value="Yarış Odası">
            </div>
            <div>
              <label class="room-field-label">ODA ŞİFRESİ (İSTEĞE BAĞLI)</label>
              <input id="new-room-pass" class="room-input-sm" type="password" maxlength="16" placeholder="Boş bırakılırsa herkese açık olur">
            </div>
            <div>
              <label class="room-field-label">PİST</label>
              <div class="track-picker">
                ${P.TRACKS.map((t, i) => `<button type="button" class="${selectedTrackForNewRoom === i ? 'active' : ''}" data-new-track="${i}">${t.name}</button>`).join('')}
              </div>
            </div>
            <div class="room-select-row">
              <div>
                <label class="room-field-label">TUR SAYISI</label>
                <div class="track-picker">
                  ${[1, 3, 5].map(l => `<button type="button" class="${selectedLapsForNewRoom === l ? 'active' : ''}" data-new-laps="${l}">${l} TUR</button>`).join('')}
                </div>
              </div>
              <div>
                <label class="room-field-label">AI BOTLAR</label>
                <label class="bot-setting" style="margin-top:6px">
                  <input type="checkbox" id="new-room-bots" checked> Antrenman botları
                </label>
              </div>
            </div>
            <button class="primary" type="submit" style="margin-top:8px">
              🚀 Odayı Kur ve Başla <span>↗</span>
            </button>
          </form>
        `}

        <div class="panel-foot">Doğrudan tarayıcıdan · İndirme yok · Gerçek zamanlı online yarış</div>
      `;

      // Event handlers
      $$('[data-open-garage]').forEach(b => { b.onclick = () => openGarage(); });
      $$('[data-car-select]').forEach(b => {
        b.onclick = () => { selectCarInGarage(b.dataset.carSelect); };
      });

      const tabBtnRooms = $('#tab-btn-rooms');
      if (tabBtnRooms) tabBtnRooms.onclick = () => { activeLobbyTab = 'rooms'; renderPanel(); };
      const tabBtnCreate = $('#tab-btn-create');
      if (tabBtnCreate) tabBtnCreate.onclick = () => { activeLobbyTab = 'create'; renderPanel(); };

      const refreshBtn = $('#refresh-rooms-btn');
      if (refreshBtn) refreshBtn.onclick = async () => {
        refreshBtn.textContent = 'Yenileniyor…';
        await loadRooms();
        renderPanel();
      };

      const quickPlayBtn = $('#quick-play-btn');
      if (quickPlayBtn) quickPlayBtn.onclick = () => {
        const firstOpen = cachedRooms.find(r => !r.hasPassword && r.phase === 'lobby' && r.playersCount < r.maxPlayers) || { id: 'genel' };
        joinSelectedRoom(firstOpen.id);
      };

      // Room join click
      $$('[data-join-room]').forEach(b => {
        b.onclick = () => {
          const rId = b.dataset.joinRoom;
          const isLocked = b.dataset.locked === '1';
          if (isLocked) {
            const pass = prompt('🔒 Bu oda şifrelidir. Lütfen oda şifresini girin:');
            if (pass === null) return;
            joinSelectedRoom(rId, pass);
          } else {
            joinSelectedRoom(rId);
          }
        };
      });

      // Track selection in create form
      $$('[data-new-track]').forEach(b => {
        b.onclick = () => {
          selectedTrackForNewRoom = Number(b.dataset.newTrack);
          renderPanel();
        };
      });

      // Laps selection in create form
      $$('[data-new-laps]').forEach(b => {
        b.onclick = () => {
          selectedLapsForNewRoom = Number(b.dataset.newLaps);
          renderPanel();
        };
      });

      // Create room submit
      const createForm = $('#create-room-form');
      if (createForm) {
        createForm.onsubmit = async e => {
          e.preventDefault();
          const nameInput = $('#name');
          const pName = (nameInput ? nameInput.value : localStorage.getItem('gs-name') || '').trim();
          if (!pName) {
            toast('Lütfen önce bir sürücü adı girin!');
            if (nameInput) nameInput.focus();
            return;
          }
          localStorage.setItem('gs-name', pName);

          const rName = $('#new-room-name').value.trim() || 'Yarış Odası';
          const rPass = $('#new-room-pass').value.trim();
          const botsCheck = $('#new-room-bots')?.checked ?? true;

          const submitBtn = createForm.querySelector('button[type="submit"]');
          submitBtn.disabled = true;

          try {
            const d = await api('rooms/create', {
              name: rName,
              password: rPass,
              trackId: selectedTrackForNewRoom,
              laps: selectedLapsForNewRoom,
              bots: botsCheck,
              playerName: pName,
              carId: selectedCarId,
              upgrades: selectedUpgrades
            });
            token = d.token;
            currentRoomId = d.roomId;
            sessionStorage.setItem('gs-token', token);
            localStorage.setItem('gs-room', currentRoomId);
            state = d.state;
            history.replaceState(null, '', `/?room=${encodeURIComponent(currentRoomId)}`);
            if (!trackData || trackData.id !== state.trackId) {
              trackData = P.makeTrack(state.trackId);
              build3DTrack(trackData);
            }
            connect();
            renderUI();
            toast(`🎉 "${rName}" odanız kuruldu!`);
          } catch (err) {
            toast('⚠️ ' + err.message);
            submitBtn.disabled = false;
          }
        };
      }
      return;
    }

    if (state.phase !== 'lobby') return;

    const connected = state.players.filter(p => !p.bot && p.connected);
    const me = selfPlayer();
    const myCarId = me?.carId || selectedCarId;

    panel.innerHTML = `
      <div class="panel-top">
        <span class="kicker">ODA: ${esc(state.roomName || 'Yarış')}</span>
        <span class="live-pill">● ${connected.length} BAĞLI</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0 12px">
        <span class="room-tag-pill">KOD: ${esc(state.roomId || '')} ${state.hasPassword ? '🔒 ŞİFRELİ' : 'AÇIK'}</span>
        <button type="button" id="leave-room-btn" class="room-leave-btn">🚪 Odadan Çık</button>
      </div>

      <h2>${isHost() ? 'Sen oda sahibisin' : 'Oda sahibi bekleniyor'}</h2>
      <p class="muted">${isHost() ? 'Ekip toplandığında başlat.' : esc(state.players.find(p => p.id === state.host)?.name || '') + ' başlatacak.'}</p>
      <div class="driver-list">${state.players.filter(p => !p.bot).map(p => {
        const carSpec = (state.cars || P.CARS).find(c => c.id === p.carId) || (state.cars || P.CARS)[0];
        const upCount = p.upgrades?.length || 0;
        return `
        <div class="driver ${p.connected ? '' : 'offline'}">
          <div class="driver-avatar" style="background:${p.color}">${esc([...p.name][0]?.toLocaleUpperCase('tr'))}</div>
          <div class="driver-info" style="flex:1;min-width:0">
            <span class="driver-name">${esc(p.name)}${p.id === state.selfId ? '<small>SEN</small>' : ''}</span>
            <small style="display:block;font-size:9px;color:var(--muted);font-family:monospace">${esc(carSpec.shortName || carSpec.name)}${upCount ? ' · +' + upCount + ' Mod' : ''}</small>
          </div>
          <span class="score">${p.points} PTS${p.wins ? ' · ' + p.wins + 'W' : ''}</span>
          ${!p.connected && isHost() ? `<button data-remove="${p.id}" style="background:none;border:1px solid var(--line);color:var(--muted);padding:4px 8px;font-size:10px;border-radius:3px;cursor:pointer">×</button>` : ''}
        </div>`;
      }).join('')}
      </div>
      ${renderGarageHTML(myCarId)}
      ${isHost() ? `
        <span class="section-label">PİST</span>
        <div class="track-picker">${P.TRACKS.map((t, i) => `<button class="${state.trackId === i ? 'active' : ''}" data-track="${i}">${t.name}</button>`).join('')}</div>
        <label class="bot-setting"><input type="checkbox" id="bots" ${state.bots ? 'checked' : ''}> Antrenman rakipleri (AI bot)</label>
        <button class="primary" id="start-btn" ${connected.length < 1 ? 'disabled' : ''}>
          ${connected.length < 1 ? 'Sürücü bekleniyor…' : 'Yarışı başlat →'}
        </button>
      ` : '<div style="margin-top:16px;padding:13px;background:#ffffff05;border:1px solid var(--line);font-size:12px;color:var(--muted);border-radius:4px">Oda sahibinin başlatması bekleniyor…</div>'}
      <div class="share"><code id="share-url" style="font-size:10px;flex:1;overflow-wrap:anywhere;color:var(--cyan)">${esc(shareAddr)}</code><button id="copy-btn" style="background:none;border:0;color:var(--orange);font-size:10px;cursor:pointer">Kopyala</button></div>
      <div class="panel-foot"><div class="specs"><div><b>${state.laps}</b><span>TUR</span></div><div><b>8</b><span>MAK. SÜRÜCÜ</span></div></div></div>`;

    $$('[data-open-garage]').forEach(b => { b.onclick = () => openGarage(); });
    $$('[data-car-select]').forEach(b => {
      b.onclick = () => {
        selectCarInGarage(b.dataset.carSelect);
      };
    });
    $$('[data-track]').forEach(b => b.onclick = () => act('settings', { trackId: Number(b.dataset.track) }));
    $$('[data-remove]').forEach(b => b.onclick = () => act('remove', { id: b.dataset.remove }));
    const botsEl = $('#bots'); if (botsEl) botsEl.onchange = () => act('settings', { bots: botsEl.checked });
    const startBtn = $('#start-btn'); if (startBtn) startBtn.onclick = () => act('start');
    const copyBtn = $('#copy-btn'); if (copyBtn) copyBtn.onclick = () => { navigator.clipboard?.writeText(shareAddr).then(() => toast('🔗 Oda linki kopyalandı!')); };
    const leaveBtn = $('#leave-room-btn'); if (leaveBtn) leaveBtn.onclick = () => leaveCurrentRoom();
  }

  function updateHUD() {
    if (!state) return;
    const me = selfPlayer();
    if (!me) return;
    const total = state.players.length;
    const rank = state.players.findIndex(p => p.id === state.selfId) + 1;
    const myCar = (state.cars || P.CARS).find(c => c.id === me.carId) || (state.cars || P.CARS)[0];

    const carBadge = $('#car-badge');
    if (carBadge) {
      carBadge.innerHTML = `<span style="color:${myCar.color};font-weight:900;">🏎 ${esc(myCar.shortName || myCar.name)}</span> <small>${esc(myCar.class)}</small>`;
    }

    /* Update Cockpit Widget (Selected Car Photo & Tactical Weapons) */
    const cockpitCarImg = $('#cockpit-car-img');
    if (cockpitCarImg && cockpitCarImg.getAttribute('src') !== myCar.image) cockpitCarImg.src = myCar.image;
    const cockpitCarName = $('#cockpit-car-name');
    if (cockpitCarName) cockpitCarName.textContent = esc(myCar.shortName || myCar.name);

    /* Shield Slot */
    const shieldSlot = $('#cockpit-shield');
    const shieldText = $('#cockpit-shield-status');
    if (shieldSlot && shieldText) {
      if (me.shield) {
        if (me.shieldReady) {
          shieldSlot.className = 'weapon-slot ready active';
          shieldText.textContent = 'AKTİF';
        } else {
          const cdSec = Math.max(1, Math.ceil(((me.shieldCooldownUntil || 0) - sNow()) / 1000));
          shieldSlot.className = 'weapon-slot recharging';
          shieldText.textContent = cdSec + 's';
        }
      } else {
        shieldSlot.className = 'weapon-slot empty';
        shieldText.textContent = 'YOK';
      }
    }

    /* Rocket Slot */
    const rocketSlot = $('#cockpit-rocket');
    const rocketText = $('#cockpit-rocket-ammo');
    if (rocketSlot && rocketText) {
      if (me.upgrades?.includes('rockets') || (me.rocketAmmo || 0) > 0) {
        const ammo = me.rocketAmmo || 0;
        rocketText.textContent = ammo > 0 ? ammo + 'x' : 'BİTTİ';
        rocketSlot.className = 'weapon-slot ' + (ammo > 0 ? 'ready active' : 'empty');
      } else {
        rocketSlot.className = 'weapon-slot empty';
        rocketText.textContent = '—';
      }
    }

    /* Mine Slot */
    const mineSlot = $('#cockpit-mine');
    const mineText = $('#cockpit-mine-ammo');
    if (mineSlot && mineText) {
      if (me.upgrades?.includes('mines') || (me.mineAmmo || 0) > 0) {
        const ammo = me.mineAmmo || 0;
        mineText.textContent = ammo > 0 ? ammo + 'x' : 'BİTTİ';
        mineSlot.className = 'weapon-slot ' + (ammo > 0 ? 'ready active' : 'empty');
      } else {
        mineSlot.className = 'weapon-slot empty';
        mineText.textContent = '—';
      }
    }

    const posEl = $('#position');
    if (posEl) posEl.innerHTML = `${rank}<span>/ ${total}</span>`;

    const lapEl = $('#lap');
    if (lapEl) lapEl.innerHTML = `${Math.min((me.completed || 0) + 1, state.laps)}<span>/ ${state.laps}</span>`;

    const timeEl = $('#race-time');
    if (timeEl) {
      const elapsed = state.phase === 'race' ? Math.max(0, sNow() - state.raceStart) : 0;
      const s = elapsed / 1000;
      timeEl.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
    }

    const speedEl = $('#speed');
    if (speedEl) speedEl.textContent = String(Math.round(me.speed || 0)).padStart(3, '0');

    const nitroFill = $('#nitro-fill');
    if (nitroFill) nitroFill.style.width = (me.nitro || 0) + '%';
    const nitroNum = $('#nitro-number');
    if (nitroNum) nitroNum.textContent = Math.round(me.nitro || 0) + '%';

    const revBars = $('#rev-bars');
    if (revBars) {
      if (!revBars.children.length) revBars.innerHTML = Array.from({ length: 16 }, () => '<i></i>').join('');
      const fill = Math.round(((me.speed || 0) / 290) * 16);
      [...revBars.children].forEach((bar, i) => bar.classList.toggle('on', i < fill));
    }

    const tn = $('#race-track');
    if (tn && trackData) tn.textContent = trackData.name;
    const tmn = $('#track-name');
    if (tmn && trackData) tmn.textContent = `0${trackData.id + 1} / ${trackData.name.toLocaleUpperCase('tr')}`;

    const leadersEl = $('#leaders');
    if (leadersEl) {
      leadersEl.innerHTML = state.players.map((p, i) => {
        const isSelf = p.id === state.selfId;
        let gap = '';
        if (i > 0 && p.finishTime != null && state.players[0].finishTime != null)
          gap = '+' + ((p.finishTime - state.players[0].finishTime) / 1000).toFixed(1) + 's';
        else if (i > 0 && (state.players[0].progress || 0) > 0)
          gap = Math.max(0, Math.round(state.players[0].progress - (p.progress || 0))) + 'm';
        return `<div class="board-row ${isSelf ? 'mine' : ''}"><span class="rank">${i + 1}</span><span class="color-dot" style="background:${p.color}"></span><span class="name">${esc(p.name)}</span><span class="gap">${gap}</span></div>`;
      }).join('');
    }

    drawMinimap();
  }

  let lastCountNum = -1;
  function updateCountdown() {
    const el = $('#countdown');
    if (!el || !state) return;
    if (state.phase === 'countdown') {
      el.hidden = false;
      const remaining = Math.max(0, (state.deadline - sNow()) / 1000);
      const num = Math.ceil(remaining);
      if (num >= 1 && num <= 3) {
        el.innerHTML = `<strong>${num}</strong><span>YARIŞ BAŞLIYOR</span>`;
        if (num !== lastCountNum) { beep(400 + num * 100); lastCountNum = num; }
      } else if (remaining <= 0) {
        el.innerHTML = `<strong style="color:var(--lime)">GİT!</strong>`;
        if (lastCountNum !== 0) { beep(1200); lastCountNum = 0; }
      }
    } else {
      el.hidden = true;
      lastCountNum = -1;
    }
  }

  function updateResults() {
    const el = $('#results');
    if (!el || !state) return;
    if (state.phase !== 'results') {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const winner = state.players[0];
    el.innerHTML = `<div class="result-card">
      <span style="font-size:10px;color:var(--cyan);font-family:monospace;letter-spacing:2px">FİNİŞ HATTI</span>
      <h1>${esc(winner?.name)} <span>kazandı!</span></h1>
      <p>${trackData?.name || ''} · ${state.laps} tur</p>
      <table class="result-table"><thead><tr><th>SIRA</th><th>SÜRÜCÜ</th><th>SÜRE</th><th>EN İYİ TUR</th><th>PUAN</th></tr></thead>
      <tbody>${state.players.map((p, i) => `
        <tr class="${p.id === state.selfId ? 'mine' : ''}">
          <td>${i + 1}</td>
          <td>${esc(p.name)}${p.bot ? ' <small style="color:var(--muted)">AI</small>' : ''}</td>
          <td>${p.finishTime != null ? (p.finishTime / 1000).toFixed(1) + 's' : 'DNF'}</td>
          <td>${p.bestLap != null ? (p.bestLap / 1000).toFixed(1) + 's' : '—'}</td>
          <td>${p.earned || 0}</td>
        </tr>`).join('')}</tbody></table>
      ${isHost() ? '<button class="primary" id="rematch-btn">Tekrar yarış ↻</button>' : '<p style="color:var(--muted);font-size:12px">Oda sahibi rövanş başlatabilir.</p>'}
    </div>`;

    const rm = $('#rematch-btn');
    if (rm) {
      rm.onclick = async () => {
        rm.disabled = true;
        rm.textContent = 'Lobiye dönülüyor…';
        try {
          await act('rematch');
        } catch (err) {
          rm.disabled = false;
          rm.textContent = 'Tekrar yarış ↻';
        }
      };
    }
  }

  function updateRaceMessage() {
    const el = $('#race-message');
    if (!el || !state) return;
    const me = selfPlayer();
    if (state.shieldMsg) {
      el.innerHTML = `<span style="color:#00e5ff;font-weight:900;text-shadow:0 0 16px rgba(0,229,255,0.95);">${esc(state.shieldMsg)}</span>`;
      return;
    }
    if (state.missileMsg) {
      el.innerHTML = `<span style="color:#ff2a55;font-weight:900;text-shadow:0 0 16px rgba(255,42,85,0.9);">${esc(state.missileMsg)}</span>`;
      return;
    }
    if (state.mineMsg) {
      el.innerHTML = `<span style="color:#ff3355;font-weight:900;text-shadow:0 0 14px rgba(255,23,68,0.9);">${esc(state.mineMsg)}</span>`;
      return;
    }
    if (!me) { el.textContent = ''; return; }
    if (me.finishTime != null) {
      const rank = state.players.findIndex(p => p.id === state.selfId) + 1;
      el.textContent = `Finiş! ${rank}. sıra · ${(me.finishTime / 1000).toFixed(1)}s`;
    } else if (me.freezeUntil && me.freezeUntil > sNow()) {
      el.innerHTML = `<span style="color:#ffaa00;font-weight:bold;">↻ SIFIRLANDI! Piste dönülüyor…</span>`;
    } else {
      el.textContent = '';
    }
  }

  function renderUI() {
    if (!state) return;
    const isRace = ['race', 'countdown'].includes(state.phase);

    document.body.classList.toggle('racing', isRace || state.phase === 'results');
    $('#race-hud').hidden = !isRace && state.phase !== 'results';

    const resEl = $('#results');
    if (resEl) resEl.hidden = (state.phase !== 'results');

    const cdEl = $('#countdown');
    if (cdEl && state.phase !== 'countdown') cdEl.hidden = true;

    if (state.phase === 'lobby') renderPanel();
    if (isRace) {
      updateHUD();
      updateCountdown();
      updateRaceMessage();
    }
    const hostRestart = $('#host-restart');
    if (hostRestart) hostRestart.hidden = !isHost() || !isRace;
    const hostFinish = $('#host-finish');
    if (hostFinish) hostFinish.hidden = !isHost() || !isRace;

    if (state.phase === 'results') updateResults();
  }

  /* ── Input Handlers ── */
  const pressed = new Set();
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select, dialog')) return;
    pressed.add(e.code);
    if (e.code === 'KeyR' && state?.phase === 'race') act('reset');
    if (e.code === 'KeyF' && state?.phase === 'race') act('fire_missile');
    if (e.code === 'KeyE' && state?.phase === 'race') act('drop_mine');
    if (e.code === 'KeyC' || e.code === 'KeyV') cycleCameraMode();
    if (e.code === 'KeyG') {
      const overlay = $('#garage-overlay');
      if (overlay) {
        if (overlay.hidden) openGarage(); else closeGarage();
      }
    }
  });
  document.addEventListener('keyup', e => pressed.delete(e.code));
  function releaseControls() {
    pressed.clear();
    $$('#touch-controls button').forEach(button => button.classList.remove('held'));
    if (online && state?.phase === 'race') api('action', {token, action:'input', seq:++seq, throttle:0, steer:0, drift:false, boost:false}).catch(() => {});
  }
  window.addEventListener('blur', releaseControls);
  document.addEventListener('race-menu-open', releaseControls);
  document.addEventListener('visibilitychange', () => { releaseControls(); if (document.hidden) audioCtx?.suspend(); else if (sound) audioCtx?.resume(); });

  $$('#touch-controls button').forEach(btn => {
    const ctrl = btn.dataset.control;
    const on = e => {
      e.preventDefault();
      btn.classList.add('held');
      pressed.add('touch-' + ctrl);
      if (ctrl === 'cam') cycleCameraMode();
      if (ctrl === 'rocket' && state?.phase === 'race') act('fire_missile');
      if (ctrl === 'mine' && state?.phase === 'race') act('drop_mine');
    };
    const off = e => { if (e) e.preventDefault(); btn.classList.remove('held'); pressed.delete('touch-' + ctrl); };
    btn.addEventListener('pointerdown', e => { btn.setPointerCapture(e.pointerId); on(e); });
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('lostpointercapture', off);
  });

  const resetBtn = $('#reset');
  if (resetBtn) resetBtn.onclick = () => act('reset');

  const hostRestartBtn = $('#host-restart');
  if (hostRestartBtn) hostRestartBtn.onclick = () => act('restart');

  const hostFinishBtn = $('#host-finish');
  if (hostFinishBtn) hostFinishBtn.onclick = () => act('finish');

  const topCamBtn = $('#top-cam-btn');
  if (topCamBtn) topCamBtn.onclick = () => cycleCameraMode();

  const camToggleBtn = $('#cam-toggle-btn');
  if (camToggleBtn) camToggleBtn.onclick = () => cycleCameraMode();

  /* Garage Overlay Buttons Wiring */
  const garageOpenBtn = $('#garage-open-btn');
  if (garageOpenBtn) garageOpenBtn.onclick = () => openGarage();
  const garageCloseBtn = $('#garage-close-btn');
  if (garageCloseBtn) garageCloseBtn.onclick = () => closeGarage();
  const garageSaveBtn = $('#garage-save-btn');
  if (garageSaveBtn) garageSaveBtn.onclick = () => closeGarage();
  const garageResetBtn = $('#garage-reset-btn');
  if (garageResetBtn) garageResetBtn.onclick = () => resetLoadoutInGarage();
  $$('.garage-tab-btn').forEach(btn => {
    btn.onclick = () => {
      garageActiveTab = btn.dataset.tab;
      renderGarageTabs();
    };
  });

  function getInput() {
    let throttle = 0, steer = 0, drift = false, boost = false;
    if (pressed.has('KeyW') || pressed.has('ArrowUp') || pressed.has('touch-gas')) throttle = 1;
    if (pressed.has('KeyS') || pressed.has('ArrowDown') || pressed.has('touch-brake')) throttle = throttle > 0 ? 0 : -1;
    if (pressed.has('KeyA') || pressed.has('ArrowLeft') || pressed.has('touch-left')) steer = -1;
    if (pressed.has('KeyD') || pressed.has('ArrowRight') || pressed.has('touch-right')) steer = 1;
    if (pressed.has('Space') || pressed.has('touch-drift')) drift = true;
    if (pressed.has('ShiftLeft') || pressed.has('ShiftRight') || pressed.has('touch-boost')) boost = true;
    return { throttle, steer, drift, boost };
  }

  /* Input send loop (20Hz) */
  setInterval(() => {
    if (!token || !state || state.phase !== 'race') return;
    const inp = getInput();
    seq++;
    api('action', { token, action: 'input', seq, ...inp }).catch(() => {});
  }, 50);

  /* Animation Frame Loop (Strict 60 FPS) */
  let lastFrameTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    update3D(dt);

    if (state && ['race', 'countdown'].includes(state.phase)) {
      updateHUD();
      updateCountdown();
      updateRaceMessage();
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* Initial Load */
  if (practice) {
    localRace = new window.GridShiftRace();
    const player = localRace.join(localStorage.getItem('gs-name') || 'Sürücü', null, selectedCarId, selectedUpgrades);
    token = player.token;
    currentRoomId = 'practice';
    localRace.connection(token, true);
    state = localRace.state(token);
    connect();
    renderUI();
  } else if (token) {
    api('join', { token }).then(d => {
      state = d.state;
      if (!trackData || trackData.id !== state.trackId) {
        trackData = P.makeTrack(state.trackId);
        build3DTrack(trackData);
      }
      connect();
      renderUI();
    }).catch(() => {
      sessionStorage.removeItem('gs-token');
      token = null;
      renderPanel();
    });
  } else {
    renderPanel();
  }

  trackData = P.makeTrack(0);
  build3DTrack(trackData);
  updateCameraUI();
})();
