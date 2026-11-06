const express=require('express'),http=require('http'),path=require('path'),{Server}=require('socket.io');
const db=require('./db');
const app=express();
app.use(express.static(path.join(__dirname,'public')));
app.get('/health',(q,r)=>r.send('ok'));
const srv=http.createServer(app);
const io=new Server(srv,{cors:{origin:(process.env.CORS_ORIGIN||'*').split(',').map(s=>s.trim())}});
const N=15,TURN=30000,GRACE=60000;
const rooms=new Map(),byTok=new Map();let queue=null;
const AL='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode=()=>{let s;do{s=Array.from({length:6},()=>AL[Math.random()*AL.length|0]).join('')}while(rooms.has(s));return s};
const clean=n=>String(n||'').replace(/[<>&"']/g,'').trim().slice(0,16)||'Player'+(100+Math.random()*900|0);

function winLine(b,r,c){const p=b[r][c];
 for(const[dr,dc]of[[0,1],[1,0],[1,1],[1,-1]]){const l=[[r,c]];
  for(const s of[1,-1]){let i=r+dr*s,j=c+dc*s;while(i>=0&&j>=0&&i<N&&j<N&&b[i][j]===p){l.push([i,j]);i+=dr*s;j+=dc*s}}
  if(l.length>=5)return l}return null}

function pub(r,i){return{code:r.code,status:r.status,host:r.players[0]?.tok===r.host?0:r.players[1]?.tok===r.host?1:-1,
 players:r.players.map(p=>({name:p.name,on:p.on})),you:i,turn:r.turn,moves:r.moves,winner:r.winner,line:r.line,
 reason:r.reason,left:r.status==='playing'?Math.max(0,r.deadline-Date.now()):0,rematch:r.players.map(p=>!!r.rm[p.tok])}}
function send(r){db.save(r);r.players.forEach((p,i)=>p.sock&&p.on&&p.sock.emit('state',pub(r,i)))}
function arm(r){clearTimeout(r.timer);r.deadline=Date.now()+TURN;
 r.timer=setTimeout(()=>finish(r,1-r.turn,'timeout'),TURN+300)}
function finish(r,w,reason,line){clearTimeout(r.timer);r.status='over';r.winner=w;r.reason=reason;r.line=line||null;send(r)}
function startGame(r){
 if(r.players.length<2)return;
 if(Math.random()<.5)r.players.reverse(); // players[0] = X, đi trước (ngẫu nhiên)
 r.board=Array.from({length:N},()=>Array(N).fill(null));r.moves=[];r.turn=0;r.winner=null;r.line=null;r.reason=null;r.rm={};
 r.status='playing';arm(r);send(r)}
function mkRoom(){const r={code:newCode(),players:[],host:null,status:'waiting',board:null,moves:[],turn:0,winner:null,line:null,reason:null,rm:{},timer:null,grace:{}};rooms.set(r.code,r);return r}
function add(r,tok,name,sock){r.players.push({tok,name,sock,on:true});byTok.set(tok,r)}
function leave(tok){const r=byTok.get(tok);if(!r)return;
 clearTimeout(r.grace[tok]);byTok.delete(tok);
 const i=r.players.findIndex(p=>p.tok===tok);if(i<0)return;
 const wasPlaying=r.status==='playing';
 const gone=r.players.splice(i,1)[0];
 if(!r.players.length){clearTimeout(r.timer);rooms.delete(r.code);db.del(r.code);return}
 if(wasPlaying){r.players.push(gone); // giữ để tính thắng/thua rồi bỏ
  const w=1-r.players.indexOf(gone);finish(r,w,'left');r.players.pop();
  r.players.forEach(p=>p.sock&&p.sock.emit('state',pub(r,0)));}
 else{if(r.host===tok)r.host=r.players[0].tok;r.status=r.status==='over'?'over':'waiting';send(r)}}

function dropIfOff(tok){const q=byTok.get(tok);if(q){const pp=q.players.find(x=>x.tok===tok);if(pp&&!pp.on)leave(tok)}}

process.on('uncaughtException',e=>console.error('uncaught',e));
io.on('connection',s=>{
 const _on=s.on.bind(s);s.on=(ev,fn)=>_on(ev,(...a)=>{try{fn(...a)}catch(e){console.error(ev,e.message)}});
 let tok=null;
 const me=()=>{const r=byTok.get(tok);if(!r)return null;return{r,i:r.players.findIndex(p=>p.tok===tok)}};
 const err=m=>s.emit('err',m);
 s.on('hello',({token})=>{tok=String(token||'').slice(0,64);if(!tok)return;
  const m=me();if(!m){s.emit('state',null);return}
  const p=m.r.players[m.i];clearTimeout(m.r.grace[tok]);p.sock=s;p.on=true;send(m.r)});
 s.on('create',({name})=>{if(!tok)return err('Chưa xác thực, hãy tải lại trang.');leave(tok);const r=mkRoom();r.host=tok;add(r,tok,clean(name),s);send(r)});
 s.on('join',({code,name})=>{if(!tok)return;const r=rooms.get(String(code||'').toUpperCase().trim());
  if(!r)return err('Không tìm thấy phòng.');
  if(byTok.get(tok)===r)return send(r);
  if(r.players.length>=2||r.status!=='waiting')return err('Phòng đã đủ người hoặc đang chơi.');
  leave(tok);add(r,tok,clean(name),s);send(r)});
 s.on('start',()=>{const m=me();if(!m||m.r.host!==tok||m.r.status!=='waiting'||m.r.players.length<2)return;startGame(m.r)});
 s.on('find',({name})=>{if(!tok)return;leave(tok);
  if(queue&&queue.tok!==tok&&queue.sock.connected){const q=queue;queue=null;
   const r=mkRoom();r.host=q.tok;add(r,q.tok,q.name,q.sock);add(r,tok,clean(name),s);startGame(r)}
  else queue={tok,name:clean(name),sock:s};s.emit('queued')});
 s.on('cancel',()=>{if(queue&&queue.tok===tok)queue=null});
 s.on('move',({r:y,c:x})=>{const m=me();if(!m)return;const{r}=m;
  if(r.status!=='playing'||m.i!==r.turn)return err('Chưa đến lượt bạn.');
  if(!Number.isInteger(y)||!Number.isInteger(x)||y<0||x<0||y>=N||x>=N||r.board[y][x]!==null)return err('Nước đi không hợp lệ.');
  r.board[y][x]=r.turn;r.moves.push([y,x]);
  const l=winLine(r.board,y,x);
  if(l)return finish(r,r.turn,'five',l);
  if(r.moves.length>=N*N)return finish(r,null,'draw');
  r.turn=1-r.turn;arm(r);send(r)});
 s.on('rematch',()=>{const m=me();if(!m||m.r.status!=='over'||m.r.players.length<2)return;
  m.r.rm[tok]=true;if(m.r.players.every(p=>m.r.rm[p.tok]))startGame(m.r);else send(m.r)});
 s.on('leave',()=>{leave(tok);s.emit('state',null)});
 s.on('chat',({text})=>{const m=me();if(!m)return;const t=String(text||'').replace(/[<>]/g,'').slice(0,80);if(!t)return;
  m.r.players.forEach((p,i)=>p.sock&&p.on&&p.sock.emit('chat',{from:m.i,text:t}))});
 s.on('disconnect',()=>{if(queue&&queue.sock===s)queue=null;const m=me();if(!m)return;
  const p=m.r.players[m.i];if(!p||p.sock!==s)return;p.on=false;send(m.r);
  m.r.grace[tok]=setTimeout(()=>dropIfOff(tok),GRACE)});
});
function restore(d){const r={...d,players:d.players.map(p=>({tok:p.tok,name:p.name,sock:null,on:false})),
 board:Array.from({length:N},()=>Array(N).fill(null)),timer:null,grace:{},deadline:0};
 r.moves.forEach(([y,x],k)=>{r.board[y][x]=k%2});rooms.set(r.code,r);
 r.players.forEach(p=>{byTok.set(p.tok,r);r.grace[p.tok]=setTimeout(()=>dropIfOff(p.tok),GRACE)});
 if(r.status==='playing')arm(r)}
(async()=>{try{await db.init();(await db.loadAll()).forEach(restore);console.log('DB:',db.enabled?'on, restored '+rooms.size+' rooms':'off (RAM only)')}
 catch(e){console.error('DB init failed, chạy RAM:',e.message)}
 srv.listen(process.env.PORT||3000,()=>console.log('Caro server on',process.env.PORT||3000))})();
