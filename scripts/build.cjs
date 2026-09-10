const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const browser = source.replace("const {randomUUID}=require('node:crypto');", 'const randomUUID = () => crypto.randomUUID();').replace("const P=require('./public/physics');", 'const P=window.RacePhysics;').replace('module.exports={Race};', 'window.GridShiftRace=Race;');
fs.writeFileSync(path.join(root, 'public/offline-race.js'), '(function(){\n'+browser+'\n})();\n');
new Function(fs.readFileSync(path.join(root,'public/app.js'),'utf8').replace(/^import .*;$/gm,''));
new Function(browser);
for (const file of ['connection.js', 'race-menu.js']) new Function(fs.readFileSync(path.join(root,'public',file),'utf8'));
const apiBase = (process.env.GRIDSHIFT_API_URL || '').replace(/\/$/, '');
if (apiBase) {
  const url = new URL(apiBase);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('GRIDSHIFT_API_URL must be an HTTPS origin.');
}
fs.writeFileSync(path.join(root, 'public/runtime-config.js'), 'window.GRIDSHIFT_CONFIG = ' + JSON.stringify({apiBase}) + ';\n');
// Native builds only include original SVG cars, never the legacy licensed-photo candidates.
const out = path.join(root, 'www');
fs.rmSync(out, {recursive:true, force:true});
fs.cpSync(path.join(root,'public'), out, {recursive:true, filter: file => {
  const rel = path.relative(path.join(root,'public'),file).replaceAll('\\','/');
  return !(rel.startsWith('cars/') && !rel.endsWith('.svg'));
}});
console.log('Shared offline engine built; client syntax verified.');
