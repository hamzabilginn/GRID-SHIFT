(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RacePhysics=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const TAU=Math.PI*2, clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), wrap=(x,n)=>(x%n+n)%n, angle=x=>wrap(x+Math.PI,TAU)-Math.PI;
  const TRACKS=[
    {name:'Liman Turu',tag:'HIZLI DÜZLÜKLER · TEKNİK VİRAJLAR',points:[[420,230],[920,210],[1430,250],[1700,470],[1690,860],[1420,1080],[1150,1040],[1030,770],[810,690],[670,980],[380,1060],[220,820],[240,480]]},
    {name:'Gece Vardiyası',tag:'DAR VİRAJLAR · DRİFT HATTI',points:[[400,240],[950,230],[1500,260],[1720,470],[1630,690],[1310,610],[1170,780],[1480,1000],[1220,1120],[860,1060],[760,800],[470,780],[280,1020],[190,730],[240,440]]},
    {name:'Çevre Yolu',tag:'UZUN DÜZLÜK · SON SANİYE NİTROSU',points:[[420,230],[1000,210],[1560,270],[1730,520],[1660,950],[1320,1100],[1010,1010],[840,820],[590,920],[300,1040],[180,760],[200,430]]}
  ];

  const CARS = [
    {
      id: 'jesko',
      name: 'Koenigsegg Jesko Attack',
      shortName: 'Jesko Attack',
      brand: 'Koenigsegg',
      class: 'MEGACAR · 1600 HP',
      price: 70,
      hp: '1600 HP',
      zeroToHundred: '2.5s',
      torque: '1500 Nm',
      weight: '1390 kg',
      engine: '5.0L V8 Twin-Turbo',
      topSpeed: 310,
      accel: 215,
      grip: 6.8,
      driftMul: 1.25,
      steer: 1.0,
      nitroBoost: 325,
      nitroRate: 11,
      color: '#f0f4f8',
      accentColor: '#ff6a1a',
      image: '/cars/koenigsegg.jpg',
      desc: '310 km/h ile pistin en yüksek son hızına ve megawatt nitro patlamasına sahip hafif siklet rekor arabası.'
    },
    {
      id: 'chiron',
      name: 'Bugatti Chiron Pur Sport',
      shortName: 'Chiron Sport',
      brand: 'Bugatti',
      class: 'HYPERCAR · 1500 HP',
      price: 60,
      hp: '1500 HP',
      zeroToHundred: '2.3s',
      torque: '1600 Nm',
      weight: '1980 kg',
      engine: '8.0L W16 Quad-Turbo',
      topSpeed: 295,
      accel: 220,
      grip: 8.2,
      driftMul: 1.1,
      steer: 0.94,
      nitroBoost: 300,
      nitroRate: 10,
      color: '#0055cc',
      accentColor: '#1a1f2c',
      image: '/cars/bugatti.jpg',
      desc: 'W16 dört turbolu motor, yüksek hızda kaya gibi gövde stabilitesi ve devasa aerodinamik aktif rüzgarlık.'
    },
    {
      id: 'sf90',
      name: 'Ferrari SF90 Stradale',
      shortName: 'SF90 Stradale',
      brand: 'Ferrari',
      class: 'HYBRID SUPERCAR · 1000 HP',
      price: 55,
      hp: '1000 HP',
      zeroToHundred: '2.1s',
      torque: '800 Nm',
      weight: '1570 kg',
      engine: '4.0L V8 Twin-Turbo PHEV',
      topSpeed: 280,
      accel: 260,
      grip: 7.4,
      driftMul: 1.25,
      steer: 1.12,
      nitroBoost: 285,
      nitroRate: 15,
      color: '#e60012',
      accentColor: '#ffd500',
      image: '/cars/ferrari.jpg',
      desc: 'Elektrik + V8 çift turbo desteğiyle oyundaki en patlayıcı 0-100 ivmesi ve viraj çıkış tepkisi.'
    },
    {
      id: 'aventador',
      name: 'Lamborghini Aventador SVJ',
      shortName: 'Aventador SVJ',
      brand: 'Lamborghini',
      class: 'V12 SUPER SPORTS · 770 HP',
      price: 50,
      hp: '770 HP',
      zeroToHundred: '2.8s',
      torque: '720 Nm',
      weight: '1525 kg',
      engine: '6.5L V12 Atmosferik',
      topSpeed: 285,
      accel: 230,
      grip: 6.4,
      driftMul: 1.6,
      steer: 1.15,
      nitroBoost: 295,
      nitroRate: 11,
      color: '#ff9900',
      accentColor: '#161920',
      image: '/cars/lamborghini.jpg',
      desc: 'Geniş açılı kesintisiz drift yapabilen, V12 kükremesi ve alev atan yüksek egzozlu pist canavarı.'
    },
    {
      id: 'gtr',
      name: 'Nissan GT-R Nismo R35',
      shortName: 'GT-R Nismo',
      brand: 'Nissan',
      class: 'AWD GODZILLA · 600 HP',
      price: 40,
      hp: '600 HP',
      zeroToHundred: '2.7s',
      torque: '652 Nm',
      weight: '1725 kg',
      engine: '3.8L V6 Twin-Turbo VR38',
      topSpeed: 275,
      accel: 245,
      grip: 8.6,
      driftMul: 1.15,
      steer: 1.05,
      nitroBoost: 282,
      nitroRate: 13,
      color: '#c8d0db',
      accentColor: '#ff2040',
      image: '/cars/gtr.jpg',
      desc: 'Dört çeker üstün zemin tutuşu, kalkışta brutal mekanik tork ve hata affeden gövde geometrisi.'
    },
    {
      id: 'gt3rs',
      name: 'Porsche 911 GT3 RS',
      shortName: '911 GT3 RS',
      brand: 'Porsche',
      class: 'TRACK WEAPON · 525 HP',
      price: 35,
      hp: '525 HP',
      zeroToHundred: '3.0s',
      torque: '465 Nm',
      weight: '1450 kg',
      engine: '4.0L Boxer-6 Atmosferik',
      topSpeed: 270,
      accel: 225,
      grip: 9.2,
      driftMul: 1.05,
      steer: 1.22,
      nitroBoost: 278,
      nitroRate: 10,
      color: '#00e676',
      accentColor: '#12161f',
      image: '/cars/porsche.jpg',
      desc: 'Maksimum yere basma gücü (downforce) ve kusursuz viraj tutuşu; virajları rayda gider gibi keskin döner.'
    }
  ];

  const UPGRADES = [
    /* Weapons & Defense */
    {
      id: 'shield',
      category: 'defense',
      categoryName: 'SİLAH & SAVUNMA',
      name: 'Aegis Enerji Kalkanı',
      shortName: 'Kalkan',
      price: 25,
      icon: '🛡️',
      desc: 'Mayın patlaması veya gökten düşen füze saldırısını 1 kez hasarsız savuşturur. 18 sn sonra yeniden şarj olur.',
      tag: 'SAVUNMA · RECHARGE'
    },
    {
      id: 'rockets',
      category: 'weapon',
      categoryName: 'SİLAH & SAVUNMA',
      name: 'Güdümlü Roket Kiti',
      shortName: 'Roket',
      price: 20,
      icon: '🚀',
      ammo: 3,
      desc: 'Öndeki rakibe kilitlenip hızla vuran 3 adet füze atışı sağlar. [F] tuşu veya dokunmatik ekran butonuyla ateşlenir.',
      tag: '3 ADET CEPHANE'
    },
    {
      id: 'mines',
      category: 'weapon',
      categoryName: 'SİLAH & SAVUNMA',
      name: 'Taktik Mayın Bırakıcı',
      shortName: 'Mayın',
      price: 15,
      icon: '💣',
      ammo: 2,
      desc: 'Arkanızdaki takipçileri havaya uçurmak için piste anlık 2 adet patlayıcı mayın bırakır. [E] tuşuyla tetiklenir.',
      tag: '2 ADET CEPHANE'
    },
    /* Performance & Tuning */
    {
      id: 'turbo',
      category: 'perf',
      categoryName: 'PERFORMANS & TUNING',
      name: 'Twin-Turbo Aşırı Besleme',
      shortName: 'Stage 2 Turbo',
      price: 20,
      icon: '⚡',
      topSpeedBonus: 15,
      accelBonus: 28,
      desc: '+15 km/h son hız ve +12% motor ivmelenmesi ekler.',
      tag: '+15 KM/H · +12% İVME'
    },
    {
      id: 'cryo_nitro',
      category: 'perf',
      categoryName: 'PERFORMANS & TUNING',
      name: 'Kriyojenik Nitro Süperşarj',
      shortName: 'Cryo Nitro',
      price: 15,
      icon: '❄️',
      nitroBoostBonus: 20,
      nitroRateBonus: 5,
      desc: 'Nitro patlama hızını +20 km/h artırır ve saniyedeki dolum hızını yükseltir.',
      tag: '+20 KM/H NİTRO · HIZLI DOLUM'
    },
    {
      id: 'aero',
      category: 'perf',
      categoryName: 'PERFORMANS & TUNING',
      name: 'Karbon Zemin Basma Paketi',
      shortName: 'Aero Downforce',
      price: 10,
      icon: '🏎️',
      gripBonus: 1.2,
      steerBonus: 0.08,
      desc: '+1.2 Yol tutuşu (Grip) kazandırır; yüksek süratte viraj kaymasını engeller.',
      tag: '+1.2 GRIP · VİRAJ KARARLILIĞI'
    },
    {
      id: 'chassis',
      category: 'perf',
      categoryName: 'PERFORMANS & TUNING',
      name: 'Hafif Titanyum Şasi',
      shortName: 'Titanyum Şasi',
      price: 10,
      icon: '⚖️',
      jumpBonus: 1.25,
      desc: 'Gövde ağırlığını hafifletir; rampa zıplamalarını %25 uzatır ve çarpışma sürtünmesini azaltır.',
      tag: '-180 KG · +25% HAVALANMA'
    }
  ];

  function makeTrack(index=0){
    const def=TRACKS[index%TRACKS.length], nodes=def.points, pts=[];
    for(let i=0;i<nodes.length;i++)for(let j=0;j<28;j++){
      const t=j/28,t2=t*t,t3=t2*t,p0=nodes[wrap(i-1,nodes.length)],p1=nodes[i],p2=nodes[(i+1)%nodes.length],p3=nodes[(i+2)%nodes.length];
      const f=k=>.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3);
      pts.push({x:f(0),y:f(1)});
    }
    let length=0;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];a.s=length;a.len=Math.hypot(b.x-a.x,b.y-a.y);a.angle=Math.atan2(b.y-a.y,b.x-a.x);length+=a.len;}

    /* Bridge elevation profile (climb up to 28m on a scenic bridge) */
    const bridge = { start: length * 0.16, end: length * 0.34, height: 28 };
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.s >= bridge.start && p.s <= bridge.end) {
        p.elev = Math.sin((p.s - bridge.start) / (bridge.end - bridge.start) * Math.PI) * bridge.height;
      } else {
        p.elev = 0;
      }
    }

    /* Jump Ramps */
    const ramps = [];
    const rampRatios = [0.44, 0.82];
    for (let r = 0; r < rampRatios.length; r++) {
      const s = length * rampRatios[r];
      let lo = 0, hi = pts.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (pts[mid].s <= s) lo = mid; else hi = mid - 1;
      }
      const p = pts[lo], b = pts[(lo + 1) % pts.length], t = (s - p.s) / p.len;
      ramps.push({
        id: r + 1,
        s,
        x: p.x + (b.x - p.x) * t,
        y: p.y + (b.y - p.y) * t,
        elev: (p.elev || 0) + ((b.elev || 0) - (p.elev || 0)) * t,
        angle: p.angle,
        width: 48,
        length: 28
      });
    }

    /* Landmines (explosive hazards in different lanes) */
    const mines = [];
    const mineRatios = [0.08, 0.39, 0.53, 0.66, 0.75, 0.92];
    const mineLanes = [-34, 34, 0, -32, 32, 0];
    for (let m = 0; m < mineRatios.length; m++) {
      const s = length * mineRatios[m];
      let lo = 0, hi = pts.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (pts[mid].s <= s) lo = mid; else hi = mid - 1;
      }
      const p = pts[lo], b = pts[(lo + 1) % pts.length], t = (s - p.s) / p.len;
      const px = p.x + (b.x - p.x) * t, py = p.y + (b.y - p.y) * t;
      const lane = mineLanes[m % mineLanes.length];
      const nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
      mines.push({
        id: m + 1,
        s,
        lane,
        x: px + nx * lane,
        y: py + ny * lane,
        elev: (p.elev || 0) + ((b.elev || 0) - (p.elev || 0)) * t,
        radius: 15,
        active: true,
        respawnAt: 0
      });
    }

    /* Road barricades / obstacles */
    const obstacles = [];
    const numObs = 7;
    const interval = length / (numObs + 1);
    const lanes = [-40, 38, 0, -38, 40, 0, -38];
    for (let k = 0; k < numObs; k++) {
      const s = (k + 1) * interval;
      let lo = 0, hi = pts.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (pts[mid].s <= s) lo = mid; else hi = mid - 1;
      }
      const p = pts[lo], b = pts[(lo + 1) % pts.length], t = (s - p.s) / p.len;
      const px = p.x + (b.x - p.x) * t, py = p.y + (b.y - p.y) * t;
      const lane = lanes[k % lanes.length];
      const nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
      obstacles.push({
        id: k + 1,
        s,
        lane,
        x: px + nx * lane,
        y: py + ny * lane,
        elev: (p.elev || 0) + ((b.elev || 0) - (p.elev || 0)) * t,
        angle: p.angle,
        radius: 18,
        width: 38
      });
    }

    return {id:index,name:def.name,tag:def.tag,pts,length,width:160,worldW:1940,worldH:1290,bridge,ramps,mines,obstacles};
  }

  function at(track,s){s=wrap(s,track.length);let lo=0,hi=track.pts.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(track.pts[mid].s<=s)lo=mid;else hi=mid-1;}const p=track.pts[lo],b=track.pts[(lo+1)%track.pts.length],t=(s-p.s)/p.len;return{x:p.x+(b.x-p.x)*t,y:p.y+(b.y-p.y)*t,elev:(p.elev||0)+((b.elev||0)-(p.elev||0))*t,angle:p.angle,s};}
  function nearest(track,x,y){let best={d2:Infinity};for(let i=0;i<track.pts.length;i++){const p=track.pts[i],b=track.pts[(i+1)%track.pts.length],dx=b.x-p.x,dy=b.y-p.y,t=clamp(((x-p.x)*dx+(y-p.y)*dy)/(p.len*p.len),0,1),px=p.x+t*dx,py=p.y+t*dy,d2=(x-px)**2+(y-py)**2;if(d2<best.d2)best={x:px,y:py,d2,s:p.s+t*p.len,elev:(p.elev||0)+((b.elev||0)-(p.elev||0))*t,angle:p.angle};}best.d=Math.sqrt(best.d2);return best;}
  function spawn(track, index, carId = 'jesko', upgrades = []) {
    const progress = -25 - Math.floor(index / 2) * 48, p = at(track, progress), lane = index % 2 ? 28 : -28;
    const upg = Array.isArray(upgrades) ? upgrades : [];
    const hasShield = upg.includes('shield');
    return {
      x: p.x - Math.sin(p.angle) * lane,
      y: p.y + Math.cos(p.angle) * lane,
      elev: p.elev || 0,
      carId,
      upgrades: upg,
      shield: hasShield,
      shieldReady: hasShield,
      shieldCooldownUntil: 0,
      rocketAmmo: upg.includes('rockets') ? 3 : 0,
      mineAmmo: upg.includes('mines') ? 2 : 0,
      jumpY: 0,
      jumpVy: 0,
      angle: p.angle,
      vx: 0,
      vy: 0,
      progress,
      lastS: p.s,
      nitro: upg.includes('cryo_nitro') ? 130 : 100,
      drifting: false,
      boosting: false,
      speed: 0,
      offroad: false,
      completed: 0,
      lastLapAt: 0,
      bestLap: null,
      finishTime: null,
      freezeUntil: 0,
      mineHit: null
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     ARCADE PHYSICS — velocity vector + grip (kart-like, forgiving)
     Car turns smoothly and slides a little instead of snapping.
     ═══════════════════════════════════════════════════════════════ */
  function step(car, input, track, dt) {
    const spec = CARS.find(c => c.id === car.carId) || CARS[0];
    const upgrades = car.upgrades || [];

    let topSpeedBonus = 0, accelBonus = 0, gripBonus = 0, steerBonus = 0, nitroBoostBonus = 0, nitroRateBonus = 0, jumpBonus = 1;
    for (const upId of upgrades) {
      const up = UPGRADES.find(u => u.id === upId);
      if (up) {
        if (up.topSpeedBonus) topSpeedBonus += up.topSpeedBonus;
        if (up.accelBonus) accelBonus += up.accelBonus;
        if (up.gripBonus) gripBonus += up.gripBonus;
        if (up.steerBonus) steerBonus += up.steerBonus;
        if (up.nitroBoostBonus) nitroBoostBonus += up.nitroBoostBonus;
        if (up.nitroRateBonus) nitroRateBonus += up.nitroRateBonus;
        if (up.jumpBonus) jumpBonus *= up.jumpBonus;
      }
    }

    /* Shield recharge timer */
    if (car.shield && !car.shieldReady) {
      if (Date.now() >= (car.shieldCooldownUntil || 0)) {
        car.shieldReady = true;
      }
    }

    const throttle = clamp(Number(input.throttle) || 0, -1, 1);
    const steer = clamp(Number(input.steer) || 0, -1, 1);

    let vx = car.vx || 0, vy = car.vy || 0;
    const hx = Math.cos(car.angle), hy = Math.sin(car.angle);
    let fwd = vx * hx + vy * hy;                        // forward speed (signed)
    const latx = vx - hx * fwd, laty = vy - hy * fwd;   // lateral velocity (world space)

    const drift = !!input.drift && Math.abs(fwd) > 45;

    /* Steering — responsive even at low speed, smooth at speed */
    const steerFactor = clamp(Math.abs(fwd) / 130, 0.42, 1);
    const turnRate = steer * 2.35 * steerFactor * (drift ? (1.35 * spec.driftMul) : 1) * (spec.steer + steerBonus);
    if (Math.abs(fwd) > 1.5) car.angle = angle(car.angle + turnRate * Math.sign(fwd) * dt);

    /* Boost */
    const maxNitro = upgrades.includes('cryo_nitro') ? 130 : 100;
    const boosting = !!input.boost && car.nitro > 1 && throttle > 0 && !car.offroad;
    if (boosting) car.nitro = Math.max(0, car.nitro - 22 * dt);
    else car.nitro = Math.min(maxNitro, car.nitro + (spec.nitroRate + nitroRateBonus) * dt);

    const maxFwd = boosting ? (spec.nitroBoost + nitroBoostBonus) : (spec.topSpeed + topSpeedBonus);
    const maxRev = -55;

    /* Engine / brake */
    const effectiveAccel = spec.accel + accelBonus;
    if (throttle > 0) fwd += throttle * (boosting ? (effectiveAccel * 1.35) : effectiveAccel) * dt;
    else if (throttle < 0) {
      if (fwd > 8) fwd -= 300 * dt;                    // brake
      else fwd += throttle * 75 * dt;                  // reverse
    } else fwd *= Math.exp(-1.2 * dt);

    if (car.offroad) fwd *= Math.exp(-1.6 * dt);       // soft off-road drag

    fwd = clamp(fwd, maxRev, maxFwd);

    /* Grip — velocity gradually follows the (new) heading, lateral bleeds off */
    const effectiveGrip = spec.grip + gripBonus;
    const grip = drift ? (effectiveGrip * 0.32 * spec.driftMul) : effectiveGrip;
    const keep = Math.exp(-grip * dt);
    const nhx = Math.cos(car.angle), nhy = Math.sin(car.angle);
    vx = nhx * fwd + latx * keep;
    vy = nhy * fwd + laty * keep;

    car.x += vx * dt;
    car.y += vy * dt;

    /* Track boundary — gentle bounce instead of a hard stop */
    const n = nearest(track, car.x, car.y);
    car.elev = n.elev || 0;
    car.offroad = n.d > track.width / 2 - 10;
    if (n.d > track.width / 2 + 8) {
      const nx = (car.x - n.x) / n.d, ny = (car.y - n.y) / n.d;
      car.x = n.x + nx * (track.width / 2 + 8);
      car.y = n.y + ny * (track.width / 2 + 8);
      const pdot = vx * nx + vy * ny;
      if (pdot < 0) { vx -= 1.5 * pdot * nx; vy -= 1.5 * pdot * ny; vx *= 0.6; vy *= 0.6; }
      car.hit = Math.min(1, (car.hit || 0) + 0.25);
    }

    /* Road Obstacle / Barricade collision */
    if (track.obstacles) {
      for (const obs of track.obstacles) {
        const dx = car.x - obs.x, dy = car.y - obs.y;
        const d = Math.hypot(dx, dy);
        if (d < obs.radius + 12) {
          const overlap = (obs.radius + 12 - d);
          const pushX = (d > 0.01 ? dx / d : 1) * overlap;
          const pushY = (d > 0.01 ? dy / d : 0) * overlap;
          car.x += pushX * 1.1;
          car.y += pushY * 1.1;
          vx *= 0.35;
          vy *= 0.35;
          fwd *= 0.35;
          car.hit = 1.0;
        }
      }
    }

    /* Airborne Jump Physics */
    if ((car.jumpY || 0) > 0 || (car.jumpVy || 0) > 0) {
      car.jumpVy = (car.jumpVy || 0) - 52 * dt;
      car.jumpY = Math.max(0, (car.jumpY || 0) + car.jumpVy * dt);
      if (car.jumpY <= 0) {
        car.jumpY = 0;
        car.jumpVy = 0;
      }
    }

    /* Jump Ramps Trigger */
    if (track.ramps && (!car.jumpY || car.jumpY < 0.5) && Math.abs(fwd) > 35) {
      for (const ramp of track.ramps) {
        const dx = car.x - ramp.x, dy = car.y - ramp.y;
        if (Math.hypot(dx, dy) < 24) {
          car.jumpVy = Math.min(38, Math.max(22, Math.abs(fwd) * 0.16)) * jumpBonus;
          car.jumpY = 1.2;
          car.nitro = Math.min(maxNitro, (car.nitro || 0) + 30);
          fwd = Math.min(285, fwd + 25);
          car.hit = 0.5;
        }
      }
    }

    /* Landmines (instant detonation flag) */
    if (track.mines) {
      for (const m of track.mines) {
        if (m.active) {
          const dx = car.x - m.x, dy = car.y - m.y;
          if (Math.hypot(dx, dy) < m.radius + 10) {
            car.mineHit = m.id;
            m.active = false;
            m.respawnAt = Date.now() + 3500;
          }
        }
      }
    }

    const sp = Math.hypot(vx, vy);
    const sgn = (vx * nhx + vy * nhy) < 0 ? -1 : 1;
    car.speed = sp < 0.5 ? 0 : sgn * sp;
    car.vx = vx; car.vy = vy;
    car.drifting = drift;
    car.boosting = boosting;
    car.hit = Math.max(0, (car.hit || 0) - dt * 2);

    let delta = angle((n.s - car.lastS) / track.length * TAU) / TAU * track.length;
    if (Math.abs(delta) < 75) car.progress += delta;
    car.lastS = n.s;
  }

  function collide(a, b) {
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d >= 32) return false;
    if (d < .001) { dx = 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d, overlap = (32 - d) / 2;
    a.x -= nx * overlap; a.y -= ny * overlap;
    b.x += nx * overlap; b.y += ny * overlap;
    const aSpd = a.speed || 0, bSpd = b.speed || 0;
    a.speed = aSpd * 0.7 + bSpd * 0.15;
    b.speed = bSpd * 0.7 + aSpd * 0.15;
    a.vx = Math.cos(a.angle) * a.speed; a.vy = Math.sin(a.angle) * a.speed;
    b.vx = Math.cos(b.angle) * b.speed; b.vy = Math.sin(b.angle) * b.speed;
    a.hit = b.hit = 0.7;
    return true;
  }

  /* AI is tuned to be beatable — a bit slower and more cautious on curves */
  function botInput(car, track, index = 0) {
    const speed = Math.abs(car.speed || 0);
    const look = 55 + speed * 0.28;
    const target = at(track, car.progress + look);
    let lane = (index % 3 - 1) * 18;

    /* Obstacle avoidance */
    if (track.obstacles) {
      for (const obs of track.obstacles) {
        const deltaS = wrap(obs.s - car.progress, track.length);
        if (deltaS > 15 && deltaS < 100) {
          if (Math.abs(lane - obs.lane) < 25) {
            lane = obs.lane > 0 ? -38 : 38;
          }
        }
      }
    }

    const tx = target.x - Math.sin(target.angle) * lane;
    const ty = target.y + Math.cos(target.angle) * lane;
    const err = angle(Math.atan2(ty - car.y, tx - car.x) - car.angle);

    const future = at(track, car.progress + 110 + speed * 0.35);
    const curve = Math.abs(angle(future.angle - target.angle));
    const desired = clamp(165 - curve * 80, 70, 165);

    return {
      steer: clamp(err * 2.2, -1, 1),
      throttle: speed > desired + 15 ? -1 : speed > desired ? 0 : 1,
      boost: Math.abs(err) < 0.11 && curve < 0.15 && car.nitro > 40,
      drift: false
    };
  }

  function relocateMine(mine, track) {
    const s = Math.random() * track.length;
    const p = at(track, s);
    const lanes = [-36, -20, 0, 20, 36];
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    const nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
    mine.s = s;
    mine.lane = lane;
    mine.x = p.x + nx * lane;
    mine.y = p.y + ny * lane;
    mine.elev = p.elev || 0;
    mine.active = true;
    mine.respawnAt = 0;
  }

  return { TRACKS, CARS, UPGRADES, makeTrack, at, nearest, spawn, step, collide, botInput, relocateMine, clamp, wrap, angle };
});