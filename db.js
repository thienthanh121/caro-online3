// Lưu snapshot phòng vào PostgreSQL (Supabase/Neon/Render Postgres). Không có DATABASE_URL -> chạy RAM, các hàm là no-op.
const url=process.env.DATABASE_URL;let pool=null;const pend=new Map();
if(url){const{Pool}=require('pg');pool=new Pool({connectionString:url,max:3,ssl:process.env.PGSSL==='disable'?false:{rejectUnauthorized:false}})}
exports.enabled=!!pool;
exports.init=async()=>{if(!pool)return;
 await pool.query('create table if not exists rooms(code text primary key,data jsonb not null,updated_at timestamptz default now())');
 await pool.query("delete from rooms where updated_at<now()-interval '1 day'")};
exports.save=r=>{if(!pool)return;
 const d={code:r.code,host:r.host,players:r.players.map(p=>({tok:p.tok,name:p.name})),status:r.status,moves:r.moves,turn:r.turn,winner:r.winner,line:r.line,reason:r.reason,rm:r.rm};
 clearTimeout(pend.get(r.code));
 pend.set(r.code,setTimeout(()=>{pend.delete(r.code);
  pool.query('insert into rooms(code,data) values($1,$2) on conflict(code) do update set data=$2,updated_at=now()',[r.code,d]).catch(e=>console.error('db save',e.message))},200))};
exports.del=code=>{if(!pool)return;clearTimeout(pend.get(code));pend.delete(code);pool.query('delete from rooms where code=$1',[code]).catch(e=>console.error('db del',e.message))};
exports.loadAll=async()=>pool?(await pool.query('select data from rooms')).rows.map(x=>x.data):[];
