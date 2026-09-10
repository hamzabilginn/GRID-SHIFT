(function(){
const randomUUID = () => crypto.randomUUID();
const P=window.RacePhysics;
const COLORS=['#ff6638','#69e3ff','#d7f66a','#c099ff','#ff7bb1','#ffe091','#9effc7','#eef2ff'];

function calcCost(carId, upgrades=[]){
 if(!Array.isArray(upgrades))throw Error('Geçersiz donanım listesi.');
 const c=P.CARS.find(x=>x.id===carId)||P.CARS[0];
 const uCost=(upgrades||[]).reduce((sum,upId)=>{
  const u=P.UPGRADES.find(x=>x.id===upId);
  return sum+(u?u.price:0);
 },0);
 return (c.price||0)+uCost;
}

class Race {
 constructor(){
  this.players=new Map();this.phase='lobby';this.host=null;this.trackId=0;this.track=P.makeTrack(0);this.bots=true;this.laps=3;this.deadline=0;this.raceStart=0;this.raceId=0;this.inputNow=Date.now();this.scored=false;
  this.missiles=[];this.nextMissileAt=0;this.missileMsg='';this.missileMsgUntil=0;this.missileId=0;this.lastMineShuffleAt=0;
  this.playerMissiles=[];this.playerMissileId=0;this.shieldMsg='';this.shieldMsgUntil=0;
 }
 humans(){return [...this.players.values()].filter(p=>!p.bot);}
 connected(){return this.humans().filter(p=>p.connected);}
 join(name,token,carId,upgrades=[]){
  if(!Array.isArray(upgrades))throw Error('Geçersiz donanım listesi.');
  upgrades=[...new Set(upgrades)];
  if(token&&this.players.has(token)){
   const existing=this.players.get(token);
   if(carId&&P.CARS.some(c=>c.id===carId)){
    const cost=calcCost(carId,upgrades);
    if(cost<=100){
     const spec=P.CARS.find(c=>c.id===carId);
     existing.carId=carId;
     existing.color=spec.color;
     existing.upgrades=Array.isArray(upgrades)?upgrades:[];
    }
   }
   return existing;
  }
  if(this.phase!=='lobby')throw Error('Yarış sürüyor. Sonraki yarışın lobisinde katılabilirsin.');
  name=String(name||'').trim().replace(/[\u0000-\u001f]/g,'').slice(0,18);
  if(!name)throw Error('Sürücü adını yaz.');
  if(this.humans().length>=8)throw Error('Oda dolu. En fazla 8 sürücü.');
  if(this.humans().some(p=>p.name.toLocaleLowerCase('tr')===name.toLocaleLowerCase('tr')))throw Error('Bu sürücü adı kullanılıyor.');
  const validCar=P.CARS.find(c=>c.id===carId)||P.CARS[this.players.size%P.CARS.length];
  const validUpgrades=Array.isArray(upgrades)?upgrades.filter(id=>P.UPGRADES.some(u=>u.id===id)):[];
  if(calcCost(validCar.id,validUpgrades)>100)throw Error('Toplam harcama 100 Kredi bütçesini aşamaz!');
  const p={token:randomUUID(),id:randomUUID(),name,connected:false,bot:false,carId:validCar.id,color:validCar.color||COLORS[this.players.size%8],upgrades:validUpgrades,points:0,wins:0,input:{},inputAt:0,inputSeq:0};
  this.players.set(p.token,p);
  if(!this.host)this.host=p.id;
  return p;
 }
 connection(token,on){const p=this.players.get(token);if(!p)return;p.connected=on;if(!on)p.input={};if(!this.connected().some(x=>x.id===this.host))this.host=this.connected()[0]?.id||p.id;}
 action(token,action,data={},now=Date.now()){
  const p=this.players.get(token);if(!p||p.bot)throw Error('Odaya yeniden katıl.');
  if(action==='update_loadout'||action==='select_car'){
   if(this.phase!=='lobby')throw Error('Donanım sadece lobide değiştirilebilir.');
   const carId=data.carId||p.carId;
   const upgrades=Array.isArray(data.upgrades)?data.upgrades.filter(id=>P.UPGRADES.some(u=>u.id===id)):(p.upgrades||[]);
   if(calcCost(carId,upgrades)>100)throw Error('Toplam harcama 100 Kredi bütçesini aşamaz!');
   const spec=P.CARS.find(c=>c.id===carId);
   if(spec){
    p.carId=spec.id;
    p.color=spec.color;
    p.upgrades=upgrades;
    if(this.track){
     const updated=P.spawn(this.track,0,p.carId,p.upgrades);
     p.maxSpeed=updated.maxSpeed;
     p.accel=updated.accel;
     p.grip=updated.grip;
     p.boostMul=updated.boostMul;
     p.boostRecharge=updated.boostRecharge;
    }
   }
   return;
  }
  if(action==='fire_missile'){
   if(this.phase!=='race'||p.finishTime!=null||now<p.freezeUntil)return;
   if((p.rocketAmmo||0)<=0)return;
   p.rocketAmmo--;
   const activeRacers=[...this.players.values()].filter(q=>q.id!==p.id&&q.finishTime==null&&q.progress>p.progress);
   let target=null;
   if(activeRacers.length>0){activeRacers.sort((a,b)=>a.progress-b.progress);target=activeRacers[0];}
   this.playerMissiles.push({
    id:++this.playerMissileId,
    ownerId:p.id,
    ownerName:p.name,
    targetId:target?.id||null,
    startX:p.x,
    startY:p.y,
    startElev:p.elev||0,
    x:p.x,
    y:p.y,
    elev:(p.elev||0)+2,
    angle:p.angle,
    fireTime:now,
    impactTime:now+1600,
    targetX:target?target.x:(p.x+Math.cos(p.angle)*220),
    targetY:target?target.y:(p.y+Math.sin(p.angle)*220),
    targetElev:target?(target.elev||0):(p.elev||0),
    exploded:false
   });
   return;
  }
  if(action==='drop_mine'){
   if(this.phase!=='race'||p.finishTime!=null||now<p.freezeUntil)return;
   if((p.mineAmmo||0)<=0)return;
   p.mineAmmo--;
   const dropX=p.x-Math.cos(p.angle)*22, dropY=p.y-Math.sin(p.angle)*22;
   if(!this.track.mines)this.track.mines=[];
   this.track.mines.push({
    id:1000+Math.floor(Math.random()*9000),
    x:dropX,
    y:dropY,
    elev:p.elev||0,
    radius:16,
    active:true,
    playerDropped:true,
    droppedBy:p.name,
    respawnAt:0
   });
   return;
  }
  if(action==='input'){if(this.phase!=='race')return;if(!Number.isSafeInteger(data.seq)||data.seq<=p.inputSeq)return;p.inputSeq=data.seq;p.input={throttle:P.clamp(Number(data.throttle)||0,-1,1),steer:P.clamp(Number(data.steer)||0,-1,1),drift:!!data.drift,boost:!!data.boost};p.inputAt=now;return;}
  if(action==='reset'){if(this.phase!=='race'||p.finishTime!==null||now<p.freezeUntil)return;const checkpoint=Math.max(0,Math.floor(p.progress/(this.track.length/16))-1)*(this.track.length/16),pos=P.at(this.track,checkpoint);Object.assign(p,{x:pos.x,y:pos.y,elev:pos.elev||0,angle:pos.angle,vx:0,vy:0,speed:0,progress:checkpoint,lastS:pos.s,freezeUntil:now+1700});return;}
  if(p.id!==this.host)throw Error('Bu düğme oda sahibinde.');
  if(action==='settings'){if(this.phase!=='lobby')throw Error('Ayarlar lobide değişir.');if(Number.isInteger(data.trackId)&&data.trackId>=0&&data.trackId<P.TRACKS.length){this.trackId=data.trackId;this.track=P.makeTrack(this.trackId);}if(typeof data.bots==='boolean')this.bots=data.bots;return;}
  if(action==='remove'){if(this.phase!=='lobby')throw Error('Yarış sırasında çıkarılamaz.');for(const [key,q]of this.players)if(!q.connected&&q.id===data.id)this.players.delete(key);return;}
  if(action==='start'){
   if(this.phase!=='lobby')throw Error('Yarış zaten başladı.');if(!this.bots&&this.connected().length<2)throw Error('En az 2 sürücü veya açık antrenman rakipleri gerekli.');
   for(const [key,q]of this.players)if(!q.connected)this.players.delete(key);
   const BOT_LOADOUTS=[
    {carId:'gt3rs',upgrades:['shield','rockets','aero','chassis']},
    {carId:'gtr',upgrades:['shield','turbo','mines']},
    {carId:'sf90',upgrades:['rockets','cryo_nitro']},
    {carId:'jesko',upgrades:['cryo_nitro','aero']}
   ];
   if(this.bots)while(this.players.size<4){
    const i=this.players.size, botPreset=BOT_LOADOUTS[i%BOT_LOADOUTS.length], botCar=P.CARS.find(c=>c.id===botPreset.carId)||P.CARS[0];
    const b={token:'bot-'+i,id:'bot-'+i,name:['APEX','GHOST','TURBO','NOVA'][i%4]+' · AI',bot:true,connected:true,carId:botCar.id,color:botCar.color||COLORS[i],upgrades:botPreset.upgrades,points:0,wins:0,input:{},inputAt:0};
    this.players.set(b.token,b);
   }
   [...this.players.values()].forEach((q,i)=>{
    const spec=P.CARS.find(c=>c.id===q.carId)||P.CARS[i%P.CARS.length];
    q.carId=spec.id;
    q.color=spec.color;
    Object.assign(q,P.spawn(this.track,i,q.carId,q.upgrades||[]),{input:{},inputAt:0,inputSeq:0});
   });
   this.phase='countdown';this.deadline=now+4000;this.raceStart=this.deadline;this.raceId++;this.scored=false;this.missiles=[];this.playerMissiles=[];this.nextMissileAt=now+8000;this.lastMineShuffleAt=now;return;
  }
  if(action==='restart'){
   if(this.phase==='lobby')return;
   [...this.players.values()].forEach((q,i)=>{
    const spec=P.CARS.find(c=>c.id===q.carId)||P.CARS[i%P.CARS.length];
    q.carId=spec.id;
    q.color=spec.color;
    Object.assign(q,P.spawn(this.track,i,q.carId,q.upgrades||[]),{input:{},inputAt:0,inputSeq:0});
   });
   this.phase='countdown';this.deadline=now+4000;this.raceStart=this.deadline;this.raceId++;this.scored=false;this.missiles=[];this.playerMissiles=[];this.nextMissileAt=now+8000;this.lastMineShuffleAt=now;return;
  }
  if(action==='finish'){if(this.phase==='lobby'||this.phase==='results')return;this.phase='results';this.award();return;}
  if(action==='rematch'){if(this.phase==='lobby')return;for(const [key,q]of this.players)if(q.bot||!q.connected)this.players.delete(key);this.phase='lobby';return;}
  throw Error('Geçersiz işlem.');
 }
 ranking(){return[...this.players.values()].sort((a,b)=>(a.finishTime!=null?0:1)-(b.finishTime!=null?0:1)||(a.finishTime!=null?a.finishTime-b.finishTime:(b.progress||0)-(a.progress||0)));}
 tick(dt,now=Date.now()){
  this.inputNow=now;
  if(this.phase==='countdown'){if(now>=this.deadline){this.phase='race';this.raceStart=now;this.deadline=now+210000;for(const p of this.players.values())p.lastLapAt=now;}return;}
  if(this.phase!=='race')return;

  /* Continuous Mine Respawns & Dynamic Relocations */
  if(this.track.mines){
   for(const m of this.track.mines){
    if(!m.active&&now>=m.respawnAt){P.relocateMine(m,this.track);}
   }
   if(now-this.lastMineShuffleAt>8500){
    this.lastMineShuffleAt=now;
    const actMines=this.track.mines.filter(m=>m.active);
    if(actMines.length>0){const pick=actMines[Math.floor(Math.random()*actMines.length)];P.relocateMine(pick,this.track);}
   }
  }

  /* Random Airstrike Missiles Falling from the Sky */
  if(!this.nextMissileAt)this.nextMissileAt=now+7000;
  if(now>=this.nextMissileAt){
   this.nextMissileAt=now+6500+Math.random()*5500;
   const activeRacers=[...this.players.values()].filter(p=>p.finishTime==null&&p.progress>0);
   let targetS;
   if(activeRacers.length>0&&Math.random()>0.25){
    const r=activeRacers[Math.floor(Math.random()*activeRacers.length)];
    targetS=P.wrap(r.progress+40+Math.random()*90,this.track.length);
   }else{
    targetS=Math.random()*this.track.length;
   }
   const pt=P.at(this.track,targetS);
   const lane=(Math.random()-0.5)*60;
   const nx=-Math.sin(pt.angle),ny=Math.cos(pt.angle);
   this.missiles.push({
    id:++this.missileId,
    x:pt.x+nx*lane,
    y:pt.y+ny*lane,
    elev:pt.elev||0,
    spawnTime:now,
    impactTime:now+2300,
    radius:34,
    exploded:false
   });
  }

  /* Missile Impact Detonation & Blast Wave */
  for(const m of this.missiles){
   if(!m.exploded&&now>=m.impactTime){
    m.exploded=true;
    this.explosion={x:m.x,y:m.y,elev:m.elev,time:now,driver:'Gökten Füze',isMissile:true};
    for(const p of this.players.values()){
     if(p.finishTime!=null)continue;
     const dist=Math.hypot(p.x-m.x,p.y-m.y);
     if(dist<m.radius){
      if(p.shield&&p.shieldReady){
       p.shieldReady=false;
       p.shieldCooldownUntil=now+18000;
       this.shieldMsg='🛡️ '+p.name+' KALKANI FÜZEYİ SAVUŞTURDU!';
       this.shieldMsgUntil=now+4000;
      }else{
       p.hit=2.0;
       p.speed=Math.max(0,p.speed*0.15);
       p.vx*=0.15;p.vy*=0.15;
       p.jumpVy=34;
       p.jumpY=2.4;
       p.nitro=Math.max(0,(p.nitro||0)-35);
       p.freezeUntil=now+1200;
       this.missileMsg='🚀 GÖKTEN FÜZE İNDİ! '+p.name+' vuruldu!';
       this.missileMsgUntil=now+4200;
      }
     }
    }
   }
  }
  this.missiles=this.missiles.filter(m=>now<m.impactTime+1600);

  /* Player Fired Seeker Missiles */
  if(this.playerMissiles){
   for(const pm of this.playerMissiles){
    if(!pm.exploded){
     const elapsed=now-pm.fireTime;
     const dur=pm.impactTime-pm.fireTime;
     const t=Math.min(1,elapsed/dur);
     let tgtX=pm.targetX, tgtY=pm.targetY, tgtElev=pm.targetElev;
     if(pm.targetId){
      const tgt=[...this.players.values()].find(q=>q.id===pm.targetId);
      if(tgt){tgtX=tgt.x;tgtY=tgt.y;tgtElev=tgt.elev||0;}
     }
     pm.x=pm.startX+(tgtX-pm.startX)*t;
     pm.y=pm.startY+(tgtY-pm.startY)*t;
     pm.elev=(pm.startElev+(tgtElev-pm.startElev)*t)+Math.sin(t*Math.PI)*12;
     pm.angle=Math.atan2(tgtY-pm.y,tgtX-pm.x);

     if(now>=pm.impactTime){
      pm.exploded=true;
      this.explosion={x:pm.x,y:pm.y,elev:pm.elev,time:now,driver:pm.ownerName+' [ROKET]'};
      for(const victim of this.players.values()){
       if(victim.id===pm.ownerId||victim.finishTime!=null)continue;
       const dist=Math.hypot(victim.x-pm.x,victim.y-pm.y);
       if(dist<34){
        if(victim.shield&&victim.shieldReady){
         victim.shieldReady=false;
         victim.shieldCooldownUntil=now+18000;
         this.shieldMsg='🛡️ '+victim.name+' KALKANI ROKETİ SAVUŞTURDU!';
         this.shieldMsgUntil=now+4000;
        }else{
         victim.hit=2.0;
         victim.speed=Math.max(0,victim.speed*0.18);
         victim.vx*=0.18;victim.vy*=0.18;
         victim.jumpVy=28;
         victim.jumpY=2.0;
         victim.freezeUntil=now+1300;
         this.missileMsg='🎯 '+pm.ownerName+', '+victim.name+' sürücüsünü füzeyle vurdu!';
         this.missileMsgUntil=now+4000;
        }
       }
      }
     }
    }
   }
   this.playerMissiles=this.playerMissiles.filter(pm=>now<pm.impactTime+1200);
  }

  let index=0;
  for(const p of this.players.values()){
   if(p.finishTime!=null||now<p.freezeUntil){index++;continue;}
   const input=p.bot?P.botInput(p,this.track,index):p.connected&&now-p.inputAt<400?p.input:{};
   P.step(p,input,this.track,dt);
   if(p.mineHit){
    const mineId=p.mineHit;p.mineHit=null;
    if(p.shield&&p.shieldReady){
     p.shieldReady=false;
     p.shieldCooldownUntil=now+18000;
     this.explosion={x:p.x,y:p.y,elev:p.elev||0,time:now,driver:p.name+' [Kalkan Korudu]'};
     this.shieldMsg='🛡️ '+p.name+' KALKANI MAYINI SAVUŞTURDU!';
     this.shieldMsgUntil=now+4500;
    }else{
     const startPos=P.at(this.track,0),startLane=(index%2?28:-28);
     this.explosion={x:p.x,y:p.y,elev:p.elev||0,time:now,driver:p.name,mineId};
     this.mineMsg='💥 '+p.name+' MAYINA BASTI! Başa döndü!';this.mineMsgUntil=now+4500;
     p.x=startPos.x-Math.sin(startPos.angle)*startLane;p.y=startPos.y+Math.cos(startPos.angle)*startLane;
     p.elev=startPos.elev||0;
     p.angle=startPos.angle;p.vx=0;p.vy=0;p.speed=0;p.progress=0;p.jumpY=0;p.jumpVy=0;p.freezeUntil=now+1600;
    }
   }
   index++;
   if(p.progress>=(p.completed+1)*this.track.length){const lap=now-p.lastLapAt;p.completed++;p.bestLap=p.bestLap==null?lap:Math.min(p.bestLap,lap);p.lastLapAt=now;if(p.completed>=this.laps){p.finishTime=now-this.raceStart;p.boosting=false;p.vx=p.vy=0;this.deadline=Math.min(this.deadline,now+15000);}}
  }
  const racers=[...this.players.values()].filter(p=>p.finishTime==null&&now>=p.freezeUntil);
  for(let a=0;a<racers.length;a++)for(let b=a+1;b<racers.length;b++)P.collide(racers[a],racers[b]);
  if(now>=this.deadline||(this.connected().length>0&&this.connected().every(p=>p.finishTime!=null))){this.phase='results';this.award();}
 }
 award(){if(this.scored)return;this.scored=true;this.ranking().forEach((p,i)=>{p.earned=[10,7,5,3,2,1,1,1][i]||0;p.points+=p.earned;if(i===0&&p.finishTime!=null)p.wins++;});}
 state(token){
  return {
   phase:this.phase,host:this.host,trackId:this.trackId,bots:this.bots,laps:this.laps,deadline:this.deadline,raceStart:this.raceStart,raceId:this.raceId,serverTime:this.inputNow,
   explosion:this.explosion,
   mineMsg:this.inputNow<this.mineMsgUntil?this.mineMsg:'',
   missileMsg:this.inputNow<this.missileMsgUntil?this.missileMsg:'',
   shieldMsg:this.inputNow<this.shieldMsgUntil?this.shieldMsg:'',
   missiles:this.missiles.map(m=>({id:m.id,x:m.x,y:m.y,elev:m.elev,spawnTime:m.spawnTime,impactTime:m.impactTime,exploded:m.exploded})),
   playerMissiles:this.playerMissiles.map(pm=>({id:pm.id,x:pm.x,y:pm.y,elev:pm.elev,angle:pm.angle,ownerId:pm.ownerId,exploded:pm.exploded})),
   mines:this.track.mines?.map(m=>({id:m.id,x:m.x,y:m.y,elev:m.elev||0,active:m.active,playerDropped:m.playerDropped})),
   selfId:this.players.get(token)?.id,
   cars:P.CARS,
   upgrades:P.UPGRADES,
   players:this.ranking().map(p=>({
    id:p.id,name:p.name,bot:p.bot,connected:p.connected,carId:p.carId||'jesko',color:p.color,upgrades:p.upgrades||[],
    shield:p.shield,shieldReady:p.shieldReady,rocketAmmo:p.rocketAmmo||0,mineAmmo:p.mineAmmo||0,shieldCooldownUntil:p.shieldCooldownUntil||0,
    points:p.points,wins:p.wins,earned:p.earned||0,x:p.x,y:p.y,elev:p.elev||0,jumpY:p.jumpY||0,angle:p.angle,vx:p.vx,vy:p.vy,speed:p.speed,nitro:p.nitro,progress:p.progress,completed:p.completed,bestLap:p.bestLap,finishTime:p.finishTime,freezeUntil:p.freezeUntil,drifting:p.drifting,boosting:p.boosting,hit:p.hit,inputSeq:p.inputSeq
   }))
  };
 }
}
window.GridShiftRace=Race;

})();
