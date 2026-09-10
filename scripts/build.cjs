const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const uuidReplacement = 'const randomUUID = () => (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); });';
const browser = source.replace("const {randomUUID}=require('node:crypto');", uuidReplacement).replace("const P=require('./public/physics');", 'const P=window.RacePhysics;').replace('module.exports={Race};', 'window.GridShiftRace=Race;');
fs.writeFileSync(path.join(root, 'public/offline-race.js'), '(function(){\n'+browser+'\n})();\n');
new Function(fs.readFileSync(path.join(root,'public/app.js'),'utf8').replace(/^import .*;$/gm,''));
new Function(browser);
for (const file of ['connection.js', 'race-menu.js']) new Function(fs.readFileSync(path.join(root,'public',file),'utf8'));
const apiBase = (process.env.GRIDSHIFT_API_URL || '').replace(/\/$/, '');
if (apiBase) {
  const url = new URL(apiBase);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('GRIDSHIFT_API_URL must be an HTTPS origin.');
}
const runtimeConfig = `window.GRIDSHIFT_CONFIG = ${JSON.stringify({apiBase})};
window.addEventListener('DOMContentLoaded', () => {
  for (const id of ['garage-hero-img', 'cockpit-car-img']) document.getElementById(id)?.setAttribute('src', '/cars/grid-car.svg');
  const brand = document.getElementById('garage-hero-brand'); if (brand) brand.textContent = 'GRID WORKS';
  const name = document.getElementById('garage-hero-name'); if (name) name.textContent = 'Apex Vortex';
  const cockpit = document.getElementById('cockpit-car-name'); if (cockpit) cockpit.textContent = 'VORTEX';
});\n`;
fs.writeFileSync(path.join(root, 'public/runtime-config.js'), runtimeConfig);
// Native builds only include original SVG cars, never the legacy licensed-photo candidates.
const out = path.join(root, 'www');
try { fs.rmSync(out, {recursive:true, force:true, maxRetries:10, retryDelay:100}); } catch (error) {
  // Windows can briefly hold generated assets open. Reusing the directory is safe because copy is forced below.
  if (error.code !== 'ENOTEMPTY' && error.code !== 'EPERM') throw error;
}
fs.cpSync(path.join(root,'public'), out, {recursive:true, filter: file => {
  const rel = path.relative(path.join(root,'public'),file).replaceAll('\\','/');
  return !(rel.startsWith('cars/') && !rel.endsWith('.svg'));
}});
for (const file of fs.readdirSync(path.join(out, 'cars'))) {
  if (!file.endsWith('.svg')) { try { fs.rmSync(path.join(out, 'cars', file), {force:true}); } catch {} }
}
const nativeIndex = path.join(out, 'index.html');
fs.writeFileSync(nativeIndex, fs.readFileSync(nativeIndex, 'utf8').replace('<script src="/connection.js', '<script src="/runtime-config.js"></script><script src="/connection.js'));
console.log('Shared offline engine built; client syntax verified.');
