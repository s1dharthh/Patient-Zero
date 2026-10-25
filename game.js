const crypto = require('node:crypto');
const { randomInt } = require('node:crypto');
const ROUND_MS = 7 * 60 * 1000;
const RECONNECT_MS = 45_000;
const TASK_MS = 3_000;
const INFECT_MS = 2_000;
const SABOTAGE_COOLDOWN_MS = 15_000;
const WORLD = 50;
const VISION = 8.2;

// Map geometry uses world units. Rectangle entries are solid walls.
const WALLS = [
  {x:0,y:0,w:50,h:1.2},{x:0,y:48.8,w:50,h:1.2},{x:0,y:0,w:1.2,h:50},{x:48.8,y:0,w:1.2,h:50},
  {x:8,y:1.2,w:1,h:5.2},{x:16,y:1.2,w:1,h:7},{x:1.2,y:8,w:5.2,h:1},
  {x:25,y:1.2,w:1,h:7},{x:34,y:1.2,w:1,h:5.2},{x:26,y:8,w:5.2,h:1},
  {x:1.2,y:17,w:8,h:1},{x:1.2,y:25,w:8,h:1},{x:8,y:18,w:1,h:7},
  {x:17,y:14,w:1,h:9},{x:17,y:14,w:7,h:1},{x:24,y:14,w:1,h:9},
  {x:31,y:17,w:17.8,h:1},{x:31,y:25,w:17.8,h:1},{x:31,y:18,w:1,h:7},
  {x:8,y:33,w:1,h:2.3},{x:8,y:37.5,w:1,h:2.5},{x:1.2,y:32,w:5.2,h:1},{x:1.2,y:40,w:5.2,h:1},
  {x:17,y:29,w:1,h:8},{x:17,y:29,w:7,h:1},{x:24,y:29,w:1,h:8},
  {x:31,y:33,w:1,h:2.3},{x:31,y:37.5,w:1,h:2.5},{x:31,y:32,w:7.8,h:1},{x:31,y:40,w:3,h:1},
  {x:41,y:33,w:1,h:7},{x:41,y:33,w:7.8,h:1},{x:41,y:40,w:7.8,h:1}
];
const TASKS = [
  {id:'generator',name:'Generator',x:5.1,y:5.2},
  {id:'communications',name:'Communications',x:29.8,y:5.2},
  {id:'security',name:'Security system',x:37.3,y:36.3}
];
const EXIT = {x:45.5,y:45.3};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const safeName=(v)=>String(v||'').normalize('NFKC').replace(/[\u0000-\u001F\u007F<>]/g,'').trim().slice(0,16);
function circleRect(x,y,r,rect){const cx=clamp(x,rect.x,rect.x+rect.w),cy=clamp(y,rect.y,rect.y+rect.h);return (x-cx)**2+(y-cy)**2<r*r;}
function lineHitsRect(a,b,r){const minX=r.x,maxX=r.x+r.w,minY=r.y,maxY=r.y+r.h;let t0=0,t1=1,dx=b.x-a.x,dy=b.y-a.y;const p=[-dx,dx,-dy,dy],q=[a.x-minX,maxX-a.x,a.y-minY,maxY-a.y];for(let i=0;i<4;i++){if(p[i]===0){if(q[i]<0)return false;}else{const t=q[i]/p[i];if(p[i]<0){if(t>t1)return false;t0=Math.max(t0,t);}else{if(t<t0)return false;t1=Math.min(t1,t);}}}return t0<t1&&t1>0.002&&t0<0.998;}
function canSee(a,b){if(distance(a,b)>VISION)return false;return !WALLS.some(w=>lineHitsRect(a,b,w));}

class GameRoom {
  constructor(code){this.code=code;this.players=new Map();this.phase='lobby';this.hostId=null;this.patientZeroId=null;this.startedAt=0;this.endsAt=0;this.winner=null;this.outcome='';this.chat=[];this.taskStates={};this.sabotaged={};this.lastTick=Date.now();this.closed=false;}
  addPlayer(socket,name,sessionToken){
    const id=crypto.randomUUID();const player={id,name,socket,sessionToken,connected:true,ready:false,role:'survivor',infected:false,x:4+Math.random()*2,y:11+Math.random()*4,dirX:0,dirY:0,input:{up:false,down:false,left:false,right:false},taskAction:null,taskStarted:0,taskProgress:0,lastSabotageAt:0,lastInfectAt:0,lastInfectCancelAt:0,disconnectedAt:0,canReconnect:true};
    this.players.set(id,player);if(!this.hostId)this.hostId=id;return player;
  }
  get connected(){return [...this.players.values()].filter(p=>p.connected);}
  start(requester){if(this.phase!=='lobby'||requester!==this.hostId||this.connected.length<2||this.connected.length>8||this.connected.some(p=>!p.ready))return false;
    const roster=this.connected;this.patientZeroId=roster[randomInt(roster.length)].id;for(const p of this.players.values()){p.role=p.id===this.patientZeroId?'infected':'survivor';p.infected=p.role==='infected';p.x= p.role==='infected'?25:4+Math.random()*2;p.y=p.role==='infected'?24:11+Math.random()*4;p.taskAction=null;p.taskProgress=0;}
    this.phase='playing';this.startedAt=Date.now();this.endsAt=this.startedAt+ROUND_MS;this.winner=null;this.outcome='';return true;}
  send(p,msg){if(p?.connected&&p.socket?.readyState===1)p.socket.send(JSON.stringify(msg));}
  broadcast(msg){for(const p of this.connected)this.send(p,msg);}
  privateRole(p){this.send(p,{type:'private_role',role:p.role});}
  publicLobby(){return {type:'lobby',code:this.code,phase:this.phase,hostId:this.hostId,players:this.connected.map(p=>({id:p.id,name:p.name,ready:p.ready,isHost:p.id===this.hostId})),chat:this.chat.slice(-30)};}
  lobbyUpdate(){const s=this.publicLobby();this.broadcast(s);}
  say(p,text){if(this.phase!=='lobby')return;const msg=String(text||'').replace(/[\u0000-\u001F\u007F<>]/g,'').trim().slice(0,180);if(!msg)return;this.chat.push({name:p.name,text:msg,at:Date.now()});this.chat=this.chat.slice(-50);this.lobbyUpdate();}
  leave(p,voluntary=false){if(!this.players.has(p.id))return;
    if(voluntary&&this.phase==='playing'){
      if(p.id===this.patientZeroId){this.end('infected','Patient Zero abandoned the match.');return;}
      this.players.delete(p.id);p.connected=false;
      const survivors=[...this.players.values()].filter(q=>q.connected&&!q.infected);
      if(survivors.length===0){this.end('infected','The last uninfected survivor abandoned the match.');return;}
      this.broadcast({type:'notice',text:`${p.name} left the match.`});return;
    }
    p.connected=false;p.input={up:false,down:false,left:false,right:false};p.taskAction=null;p.disconnectedAt=Date.now();
    if(this.phase==='lobby'&&p.id===this.hostId){const next=this.connected[0];this.hostId=next?.id||null;if(next)next.ready=false;}
    if(this.phase==='lobby')this.lobbyUpdate();
    setTimeout(()=>{if(!p.connected&&this.players.get(p.id)===p&&Date.now()-p.disconnectedAt>=RECONNECT_MS){this.players.delete(p.id);if(this.phase==='lobby'){if(this.hostId===p.id)this.hostId=this.connected[0]?.id||null;this.lobbyUpdate();}else if(this.phase==='playing'){if(p.id===this.patientZeroId){this.end('infected','Patient Zero disconnected and did not return in time.');return;}const survivors=[...this.players.values()].filter(q=>!q.infected);if(!survivors.length)this.end('infected','No uninfected survivors remain.');}}},RECONNECT_MS+50);
  }
  end(winner,outcome){if(this.phase!=='playing')return;this.phase='results';this.winner=winner;this.outcome=outcome;this.patientZeroId=null;if(!this.players.get(this.hostId)?.connected)this.hostId=this.connected[0]?.id||null;for(const p of this.connected)this.send(p,{type:'results',winner,outcome,hostId:this.hostId,roles:[...this.players.values()].map(q=>({name:q.name,role:q.role}))});}
  reset(requester){if(this.phase!=='results')return false;if(!this.players.get(this.hostId)?.connected)this.hostId=this.connected[0]?.id||null;if(requester!==this.hostId)return false;this.phase='lobby';this.patientZeroId=null;this.winner=null;this.outcome='';this.startedAt=0;this.endsAt=0;this.chat=[];this.taskStates={};this.sabotaged={};for(const p of this.players.values()){p.ready=false;p.role='survivor';p.infected=false;p.x=4+Math.random()*2;p.y=11+Math.random()*4;p.taskAction=null;p.taskProgress=0;p.lastSabotageAt=0;p.input={up:false,down:false,left:false,right:false};}this.lobbyUpdate();return true;}
  move(p,dt){if(!p.connected||this.phase!=='playing')return;const speed=5.4;let dx=(p.input.right?1:0)-(p.input.left?1:0),dy=(p.input.down?1:0)-(p.input.up?1:0);const len=Math.hypot(dx,dy)||1;dx=dx/len*speed*dt;dy=dy/len*speed*dt;if(dx||dy){p.dirX=dx;p.dirY=dy;if(p.taskAction==='infect')p.lastInfectCancelAt=Date.now();p.taskAction=null;p.taskStarted=0;p.taskProgress=0;}
    const r=.34;let nx=clamp(p.x+dx,r, WORLD-r),ny=clamp(p.y+dy,r,WORLD-r);if(!WALLS.some(w=>circleRect(nx,p.y,r,w)))p.x=nx;if(!WALLS.some(w=>circleRect(p.x,ny,r,w)))p.y=ny;
  }
  action(p,actionId,holding){if(this.phase!=='playing'||!p.connected)return;const task=TASKS.find(t=>t.id===actionId);if(!task&&actionId!=='exit'&&actionId!=='infect')return;
    if(!holding){if(p.taskAction===actionId){if(actionId==='infect')p.lastInfectCancelAt=Date.now();p.taskAction=null;p.taskStarted=0;p.taskProgress=0;}return;}
    if(p.taskAction!==actionId){p.taskAction=actionId;p.taskStarted=Date.now();p.taskProgress=0;}
  }
  update(dt){if(this.phase!=='playing')return;const now=Date.now();if(now>=this.endsAt){this.end('infected','Time ran out before a survivor escaped.');return;}
    const tasks=TASKS.map(t=>({...t,done:!!this.taskStates?.[t.id]}));if(!this.taskStates)this.taskStates={};if(!this.sabotaged)this.sabotaged={};
    for(const p of this.players.values())if(p.connected){this.move(p,dt);if(!p.taskAction)continue;const task=TASKS.find(t=>t.id===p.taskAction);if(p.taskAction==='infect'){
        const target=[...this.players.values()].find(q=>q.id===p.targetId&&q.connected&&!q.infected);
        if(!p.infected||!target||distance(p,target)>1.35||!canSee(p,target)){p.lastInfectCancelAt=now;p.taskAction=null;continue;}p.taskProgress=(now-p.taskStarted)/INFECT_MS;
        if(p.taskProgress>=1){p.lastInfectAt=now;target.infected=true;target.role='infected';target.taskAction=null;p.taskAction=null;this.send(target,{type:'infected_private'});for(const q of this.connected)if(q.id!==target.id&&canSee(q,target))this.send(q,{type:'local_effect',kind:'infection',x:target.x,y:target.y});}
      }else if(task){if(distance(p,task)>1.35||!canSee(p,task)){p.taskAction=null;p.taskProgress=0;continue;}p.taskProgress=(now-p.taskStarted)/TASK_MS;
        if(p.infected){if(this.taskStates[task.id]&&now-p.lastSabotageAt>=SABOTAGE_COOLDOWN_MS&&p.taskProgress>=1){this.taskStates[task.id]=false;this.sabotaged[task.id]=true;p.lastSabotageAt=now;p.taskAction=null;p.taskProgress=0;this.broadcast({type:'notice',text:`A hospital system was sabotaged.`});}}
        else if(!p.infected&&!this.taskStates[task.id]&&p.taskProgress>=1){this.taskStates[task.id]=true;this.sabotaged[task.id]=false;p.taskAction=null;p.taskProgress=0;this.broadcast({type:'task_update',tasks:this.taskStates});}
      }else if(p.taskAction==='exit'){if(!p.infected&&distance(p,EXIT)<1.6&&TASKS.every(t=>this.taskStates[t.id])){this.end('survivors',`${p.name} escaped the hospital.`);return;}p.taskAction=null;}
    }
    const living=[...this.players.values()].filter(p=>!p.infected);if(!living.length){this.end('infected','Every survivor has been infected.');return;}
    this.broadcastState();
  }
  broadcastState(){const now=Date.now();for(const viewer of this.connected){const visible=[];for(const p of this.connected){if(p.id===viewer.id)continue;if(canSee(viewer,p)){visible.push({id:p.id,name:p.name,x:p.x,y:p.y,infected:viewer.infected&&p.infected,redOutline:viewer.infected&&p.infected});}}
      this.send(viewer,{type:'state',phase:this.phase,me:{id:viewer.id,x:viewer.x,y:viewer.y,infected:viewer.infected,role:viewer.role},players:visible,tasks:TASKS.map(t=>({id:t.id,name:t.name,x:t.x,y:t.y,status:this.taskStates?.[t.id]?'completed':this.sabotaged?.[t.id]?'sabotaged':'incomplete'})).map(t=>{if(viewer.taskAction===t.id)t.status=viewer.infected?'sabotaging':'repairing';return t;}),exit:EXIT,remainingMs:Math.max(0,this.endsAt-now),wallData:WALLS,vision:VISION,canExit:!viewer.infected&&TASKS.every(t=>this.taskStates?.[t.id])});
    }}
}
module.exports={GameRoom,TASKS,WALLS,EXIT,WORLD,VISION,ROUND_MS,RECONNECT_MS,TASK_MS,INFECT_MS,SABOTAGE_COOLDOWN_MS,safeName,canSee,distance};
