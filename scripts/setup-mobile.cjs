const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const platform=process.argv[2];
if(!['android','ios'].includes(platform))throw Error('Use android or ios');
execFileSync(process.execPath,['scripts/build.cjs'],{stdio:'inherit'});
const cli='node_modules/@capacitor/cli/bin/capacitor';
if(!fs.existsSync(platform))execFileSync(process.execPath,[cli,'add',platform],{stdio:'inherit'});
execFileSync(process.execPath,[cli,'sync',platform],{stdio:'inherit'});
if(platform==='android'){
 const file='android/variables.gradle';
 let source=fs.readFileSync(file,'utf8').replace(/compileSdkVersion\s*=\s*\d+/,'compileSdkVersion = 36').replace(/targetSdkVersion\s*=\s*\d+/,'targetSdkVersion = 36');
 fs.writeFileSync(file,source);
}
console.log('Native project prepared. Open it with Capacitor and configure release signing.');
