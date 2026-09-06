// Real Guacamole/guacd sharing lifecycle; no tokens are printed.
import assert from 'node:assert/strict';
import {createHmac, randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const env = Object.fromEntries(readFileSync('example-app/.env','utf8').trim().split('\n').map(l => { const i=l.indexOf('='); return [l.slice(0,i),l.slice(i+1)]; }));
const origin=process.env.DEMO_ORIGIN || `http://127.0.0.1:${env.DEMO_HTTP_PORT || 8080}`;
const now=()=>Math.floor(Date.now()/1000);
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const sign=c=>{const h=encode({alg:'HS256'})+'.'+encode(c);return h+'.'+createHmac('sha256',env.JWT_SECRET_KEY).update(h).digest('base64url');};
const sessions=[], sockets=[], signed=[];
const startedAt = new Date().toISOString();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const instr=(...args)=>args.map(s=>`${String(s).length}.${s}`).join(',')+';';
async function auth(c){const token=sign(c);signed.push(token);const r=await fetch(origin+'/guacamole/api/tokens',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Guacamole-Auth-Jwt':token},body:''});assert.equal(r.status,200,'authenticate'); const data=await r.json();sessions.push(data.authToken);return data.authToken;}
function tunnel(token){
 const q=new URLSearchParams({token,GUAC_ID:'demo',GUAC_TYPE:'c',GUAC_DATA_SOURCE:'jwt',GUAC_WIDTH:'1024',GUAC_HEIGHT:'768',GUAC_DPI:'96'});
 const ws=new WebSocket(origin.replace(/^http/,'ws')+'/guacamole/websocket-tunnel?'+q); sockets.push(ws);
 const state={ws,frame:false,closed:false,error:false,count:0}; let buffer='';
 ws.onmessage=({data})=>{buffer+=data;
  while(buffer){let pos=0,args=[]; let complete=false;
   while(pos<buffer.length){const dot=buffer.indexOf('.',pos);if(dot<0)break;const n=Number(buffer.slice(pos,dot));if(!Number.isInteger(n)||n<0)throw Error('bad protocol');const end=dot+1+n;if(end>=buffer.length)break;args.push(buffer.slice(dot+1,end));pos=end+1;if(buffer[end]===';'){complete=true;break;}}
   if(!complete)break; buffer=buffer.slice(pos);
   if(['img','png','jpeg'].includes(args[0])){state.frame=true;state.count++;}
   if(args[0]==='error')state.error=true;
   if(args[0]==='sync'&&ws.readyState===1)ws.send(instr('sync',args[1]));
   if(args[0]==='end'&&ws.readyState===1)ws.send(instr('ack',args[1],'OK',0));
  }
 };
 ws.onclose=()=>{state.closed=true;}; ws.onerror=()=>{state.error=true;};
 return state;
}
async function until(fn,message){for(let i=0;i<100;i++){if(fn())return;await pause(100);}throw Error(message);}
const hostClaims=id=>({GUAC_ID:'demo',GUAC_SHARE_ID:id,exp:now()+60,'guac.protocol':'vnc','guac.hostname':'desktop','guac.port':'5900','guac.password':env.DEMO_VNC_PASSWORD});
const guestClaims=(id,readonly=true)=>({GUAC_ID:'demo',GUAC_JOIN_ID:id,exp:now()+60,'guac.read-only':String(readonly)});
try {
 const id=randomBytes(24).toString('base64url');
 const hostGrant=hostClaims(id);
 const host=tunnel(await auth(hostGrant));await until(()=>host.frame,'owner frame missing');
 const viewer=tunnel(await auth(guestClaims(id)));await until(()=>viewer.frame,'viewer frame missing');
 const controller=tunnel(await auth(guestClaims(id,false)));await until(()=>controller.frame,'controller frame missing');
 controller.ws.send(instr('key',97,1)+instr('key',97,0));
 const before=host.count;await until(()=>host.count>before,'controller input did not reach owner display');
 // Full and valid write instructions must not tear down a read-only viewing session.
 viewer.ws.send(instr('key',98,1)+instr('key',98,0)+instr('mouse',0,0,1)+instr('clipboard',0,'text/plain')+instr('blob',0,'Yg==')+instr('end',0));
 await pause(300);assert.equal(viewer.closed,false);assert.equal(viewer.error,false);
 const duplicate=tunnel(await auth(hostClaims(id)));await until(()=>duplicate.error||duplicate.closed,'duplicate owner accepted');
 const unknown=tunnel(await auth(guestClaims(randomBytes(24).toString('base64url'))));await until(()=>unknown.error||unknown.closed,'unknown join accepted');
 const delayed=await auth({...guestClaims(id),exp:now()+2});await pause(2200);
 const expired=tunnel(delayed);await until(()=>expired.error||expired.closed,'expired exchange could still join');
 host.ws.close();await until(()=>viewer.closed&&controller.closed,'owner closure did not close visitors');
 const replay=tunnel(await auth(hostGrant));await until(()=>replay.error||replay.closed,'replayed host grant resurrected a closed generation');
 const stale=tunnel(await auth(guestClaims(id)));await until(()=>stale.error||stale.closed,'closed share remained joinable');
 console.log('PASS real owner/viewer/controller, input propagation, duplicate and absent IDs, delayed expiry, owner-close propagation');
 if(process.env.COMPOSE_PROJECT_NAME){
  const logs=execFileSync('docker',['compose','-p',process.env.COMPOSE_PROJECT_NAME,'-f','example-app/docker-compose.yaml','logs','--no-color','--since',startedAt,'guacd'],{encoding:'utf8'});
  const ids=[...logs.matchAll(/joined connection "([^"]+)" \((\d+) users? now present\)/g)];
  assert.ok(ids.some(m=>Number(m[2])>=3),'guacd did not report three users sharing one actual connection');
  console.log('PASS guacd reports host and two visitors on the same active connection');
  const allLogs=execFileSync('docker',['compose','-p',process.env.COMPOSE_PROJECT_NAME,'-f','example-app/docker-compose.yaml','logs','--no-color'],{encoding:'utf8'});
  for(const secret of [env.JWT_SECRET_KEY,env.DEMO_ACCESS_TOKEN,env.DEMO_VNC_PASSWORD,...sessions,...signed]) assert.ok(!allLogs.includes(secret),'secret in logs');
 }
} catch(e){console.error('FAIL sharing:',e.message);process.exitCode=1;}
finally{for(const ws of sockets)ws.close(); for(const token of sessions)await fetch(origin+'/guacamole/api/session',{method:'DELETE',headers:{'Guacamole-Token':token}});}
