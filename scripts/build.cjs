const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const browser = source.replace("const {randomUUID}=require('node:crypto');", 'const randomUUID = () => crypto.randomUUID();').replace("const P=require('./public/physics');", 'const P=window.RacePhysics;').replace('module.exports={Race};', 'window.GridShiftRace=Race;');
fs.writeFileSync(path.join(root, 'public/offline-race.js'), '(function(){\n'+browser+'\n})();\n');
new Function(fs.readFileSync(path.join(root,'public/app.js'),'utf8').replace(/^import .*;$/gm,''));
new Function(browser);
console.log('Shared offline engine built; client syntax verified.');
