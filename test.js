const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Race}=require('./game');
const {Room}=require('./rooms');
test('practice race starts with bots, accepts input and returns to lobby',()=>{
 const r=new Race(),p=r.join('Pilot');r.connection(p.token,true);
 r.action(p.token,'start',{},10000);assert.equal(r.phase,'countdown');assert.equal(r.players.size,4);
 r.tick(1/60,15000);assert.equal(r.phase,'race');
 r.action(p.token,'input',{seq:1,throttle:1},15000);
 for(let i=0;i<15;i++)r.tick(1/60,15000+i*16);
 assert.ok(Number.isFinite(p.x));assert.ok(p.speed>0);
 r.action(p.token,'finish');assert.equal(r.phase,'results');r.action(p.token,'rematch');assert.equal(r.phase,'lobby');
});
test('room secrets never appear in public state',()=>{
 const r=new Room('private','Private','secret');const p=r.race.join('Pilot');
 assert.equal(r.checkPassword('bad'),false);assert.equal(r.checkPassword('secret'),true);
 assert.ok(!JSON.stringify(r.state(p.token)).includes('secret'));
});
test('malformed upgrades cannot crash a race silently',()=>{
 const r=new Race();assert.throws(()=>r.join('Pilot',null,'jesko','bad'));
});
test('browser offline engine shares the server race implementation',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const ctx={window:{RacePhysics:require('./public/physics')},crypto:require('node:crypto'),Date,Math};
 vm.runInNewContext(fs.readFileSync('public/offline-race.js','utf8'),ctx);
 const r=new ctx.window.GridShiftRace();const p=r.join('Mobile');r.connection(p.token,true);r.action(p.token,'start');
 assert.equal(r.state(p.token).phase,'countdown');
});
test('HTTP password gate rejects forged reconnect tokens',async()=>{
 const {spawn}=require('node:child_process');
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'13879',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout')),6000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('error',reject);});
  const post=(route,body)=>fetch('http://127.0.0.1:13879/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const created=await post('rooms/create',{name:'Private',playerName:'Owner',password:'test-secret'});assert.equal(created.status,200);
  const data=await created.json();
  const denied=await post('rooms/join',{roomId:data.roomId,name:'Intruder',token:'invented-token'});assert.equal(denied.status,403);
  const allowed=await post('rooms/join',{roomId:data.roomId,token:data.token});assert.equal(allowed.status,200);
  const page=await fetch('http://127.0.0.1:13879/');assert.equal(page.status,200);assert.match(await page.text(),/offline-race.js/);
 } finally {child.kill();}
});
