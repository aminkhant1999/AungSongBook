import "dotenv/config";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "client");
const target = path.join(root, "dist", "client");
const serverTarget = path.join(root, "dist", "server");
const databaseUrl = process.env.DATABASE_URL || path.join(root, "data", "songbook.db");

if (!fs.existsSync(databaseUrl)) throw new Error(`Song database not found: ${databaseUrl}`);

const db = new Database(databaseUrl, { readonly: true });
const rows = db.prepare(`SELECT id,slug,title,artist,language,song_key AS key,display_key AS displayKey,bpm,
  time_signature AS timeSignature,capo,genre,vibe_intensity AS vibeIntensity,
  lyrics_chord_data AS lyricsChordData,plain_lyrics AS plainLyrics,status,
  created_at AS createdAt,updated_at AS updatedAt,last_opened_at AS lastOpenedAt
  FROM songs WHERE status='published' AND deleted_at IS NULL ORDER BY created_at DESC`).all();
db.close();

const songs = rows.map(row => ({
  ...row,
  lyricsChordData: JSON.parse(row.lyricsChordData || '{"sections":[]}')
}));

const worker = `const seedSongs=${JSON.stringify(songs)};
const ok=data=>Response.json({data});
const fail=(status,message,fields)=>Response.json({error:{message,fields}},{status});
const text=value=>String(value??"").toLowerCase();
const sorters={
  title_asc:(a,b)=>a.title.localeCompare(b.title),
  title_desc:(a,b)=>b.title.localeCompare(a.title),
  artist_asc:(a,b)=>a.artist.localeCompare(b.artist),
  artist_desc:(a,b)=>b.artist.localeCompare(a.artist),
  added_old:(a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)),
  opened_new:(a,b)=>String(b.lastOpenedAt||"").localeCompare(String(a.lastOpenedAt||"")),
  opened_old:(a,b)=>String(a.lastOpenedAt||"").localeCompare(String(b.lastOpenedAt||"")),
  intensity_high:(a,b)=>b.vibeIntensity-a.vibeIntensity,
  intensity_low:(a,b)=>a.vibeIntensity-b.vibeIntensity,
  genre:(a,b)=>String(a.genre||"").localeCompare(String(b.genre||""))
};
const schemaSql="CREATE TABLE IF NOT EXISTS songs (id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT NOT NULL UNIQUE,title TEXT NOT NULL,artist TEXT NOT NULL,language TEXT,song_key TEXT,display_key TEXT,bpm INTEGER,time_signature TEXT,capo INTEGER,genre TEXT,vibe_intensity INTEGER NOT NULL DEFAULT 5 CHECK (vibe_intensity BETWEEN 1 AND 10),lyrics_chord_data TEXT NOT NULL DEFAULT '{\\"sections\\":[]}',plain_lyrics TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','needs_review','published')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_opened_at TEXT,deleted_at TEXT)";
const indexSql="CREATE INDEX IF NOT EXISTS songs_status_idx ON songs (status,deleted_at,created_at)";
const insertSql="INSERT OR IGNORE INTO songs (id,slug,title,artist,language,song_key,display_key,bpm,time_signature,capo,genre,vibe_intensity,lyrics_chord_data,plain_lyrics,status,created_at,updated_at,last_opened_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
const rowSql="SELECT * FROM songs WHERE id=? AND deleted_at IS NULL";
async function ensureDb(db){
  await db.batch([db.prepare(schemaSql),db.prepare(indexSql)]);
  const count=await db.prepare("SELECT COUNT(*) AS count FROM songs").first();
  if(Number(count?.count||0)>0)return;
  await db.batch(seedSongs.map(song=>db.prepare(insertSql).bind(song.id,song.slug,song.title,song.artist,song.language,song.key,song.displayKey,song.bpm,song.timeSignature,song.capo,song.genre,song.vibeIntensity,JSON.stringify(song.lyricsChordData||{sections:[]}),song.plainLyrics||"",song.status||"published",song.createdAt||new Date().toISOString(),song.updatedAt||song.createdAt||new Date().toISOString(),song.lastOpenedAt)));
}
function hydrate(row){
  if(!row)return row;
  return {id:row.id,slug:row.slug,title:row.title,artist:row.artist,language:row.language,key:row.song_key,displayKey:row.display_key,bpm:row.bpm,timeSignature:row.time_signature,capo:row.capo,genre:row.genre,vibeIntensity:row.vibe_intensity,lyricsChordData:JSON.parse(row.lyrics_chord_data||'{"sections":[]}'),plainLyrics:row.plain_lyrics||"",status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,lastOpenedAt:row.last_opened_at};
}
async function allSongs(db,admin=false){
  const result=await db.prepare("SELECT * FROM songs WHERE deleted_at IS NULL"+(admin?"":" AND status='published'")).all();
  return (result.results||[]).map(hydrate);
}
function filterAndSort(songs,url){
  const query=text(url.searchParams.get("q"));
  const result=songs.filter(song=>{
    if(url.searchParams.get("language")&&song.language!==url.searchParams.get("language"))return false;
    if(url.searchParams.get("genre")&&song.genre!==url.searchParams.get("genre"))return false;
    if(url.searchParams.get("key")&&song.key!==url.searchParams.get("key"))return false;
    if(url.searchParams.get("bpm")&&Number(song.bpm)!==Number(url.searchParams.get("bpm")))return false;
    return !query||[song.title,song.artist,song.genre,song.language,song.plainLyrics].some(value=>text(value).includes(query));
  });
  const sorter=sorters[url.searchParams.get("sort")]||((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  return result.sort(sorter).slice(0,100);
}
function signedInEmail(request){return (request.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase()}
function isAdmin(request,env){const email=signedInEmail(request);return Boolean(email&&env.ADMIN_EMAIL&&email===String(env.ADMIN_EMAIL).trim().toLowerCase())}
function adminName(request){
  const encoded=request.headers.get("oai-authenticated-user-full-name");
  const encoding=request.headers.get("oai-authenticated-user-full-name-encoding");
  if(encoded&&encoding==="percent-encoded-utf-8"){try{return decodeURIComponent(encoded)}catch{}}
  return signedInEmail(request).split("@")[0]||"Administrator";
}
function sameOrigin(request,url){const origin=request.headers.get("Origin");return !origin||origin===url.origin}
function slugify(title,artist){return (title+"-"+artist).normalize("NFKD").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase().slice(0,180)||("song-"+Date.now())}
function clean(value,max=200){return value==null?null:String(value).replace(/<[^>]*>/g,"").trim().slice(0,max)||null}
function parseSong(input){
  const fields={};
  const title=clean(input.title,160),artist=clean(input.artist,160);
  if(!title)fields.title="Required";
  if(!artist)fields.artist="Required";
  const bpm=input.bpm==null||input.bpm===""?null:Number(input.bpm);
  const capo=input.capo==null||input.capo===""?null:Number(input.capo);
  const vibeIntensity=Number(input.vibeIntensity||5);
  if(bpm!==null&&(!Number.isInteger(bpm)||bpm<20||bpm>300))fields.bpm="Enter 20–300.";
  if(capo!==null&&(!Number.isInteger(capo)||capo<0||capo>12))fields.capo="Enter 0–12.";
  if(!Number.isInteger(vibeIntensity)||vibeIntensity<1||vibeIntensity>10)fields.vibeIntensity="Enter 1–10.";
  const status=["draft","needs_review","published"].includes(input.status)?input.status:"draft";
  let lyricsChordData=input.lyricsChordData||{sections:[]};
  if(typeof lyricsChordData==="string"){try{lyricsChordData=JSON.parse(lyricsChordData)}catch{fields.lyricsChordData="Invalid JSON"}}
  if(Object.keys(fields).length)return {fields};
  return {song:{title,artist,language:clean(input.language),key:clean(input.key),displayKey:clean(input.displayKey),bpm,timeSignature:clean(input.timeSignature),capo,genre:clean(input.genre),vibeIntensity,lyricsChordData,plainLyrics:String(input.plainLyrics||"").replace(/<[^>]*>/g,"").slice(0,200000),status}};
}
async function uniqueSlug(db,title,artist){
  const base=slugify(title,artist);let slug=base,n=2;
  while(await db.prepare("SELECT id FROM songs WHERE slug=?").bind(slug).first())slug=base+"-"+n++;
  return slug;
}
async function getById(db,id){return hydrate(await db.prepare(rowSql).bind(id).first())}
async function jsonBody(request){try{return await request.json()}catch{return {}}}
const worker={
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/api/health")return ok({status:"healthy",storage:"d1"});
    if(url.pathname==="/api/auth/session"){
      const email=signedInEmail(request),authenticated=isAdmin(request,env);
      return ok({authenticated,signedIn:Boolean(email),username:authenticated?adminName(request):null});
    }
    if(url.pathname==="/api/auth/logout")return ok({loggedOut:true});
    if(url.pathname==="/api/auth/login")return fail(410,"Use Admin sign in with ChatGPT.");
    if(!env.DB&&url.pathname.startsWith("/api/"))return fail(503,"The song database is not available.");
    if(env.DB)await ensureDb(env.DB);
    if(url.pathname.startsWith("/api/admin/")&&!isAdmin(request,env))return fail(401,"Administrator sign-in required.");
    if(url.pathname.startsWith("/api/admin/")&&!sameOrigin(request,url))return fail(403,"Request origin was rejected.");
    if(url.pathname==="/api/filters"){
      const songs=await allSongs(env.DB);
      const unique=key=>[...new Set(songs.map(song=>song[key]).filter(value=>value!==null&&value!==""))].sort();
      return ok({languages:unique("language"),genres:unique("genre"),keys:unique("key"),bpms:unique("bpm")});
    }
    if(url.pathname==="/api/songs"&&request.method==="GET")return ok(filterAndSort(await allSongs(env.DB),url));
    const songMatch=url.pathname.match(/^\\/api\\/songs\\/([^/]+)$/);
    if(songMatch&&request.method==="GET"){
      const row=await env.DB.prepare("SELECT * FROM songs WHERE slug=? AND status='published' AND deleted_at IS NULL").bind(decodeURIComponent(songMatch[1])).first();
      return row?ok(hydrate(row)):fail(404,"Song not found.");
    }
    const openedMatch=url.pathname.match(/^\\/api\\/songs\\/(\\d+)\\/open$/);
    if(openedMatch&&request.method==="POST"){
      await env.DB.prepare("UPDATE songs SET last_opened_at=CURRENT_TIMESTAMP WHERE id=? AND (last_opened_at IS NULL OR last_opened_at < datetime('now','-30 minutes'))").bind(Number(openedMatch[1])).run();
      return ok({recorded:true});
    }
    if(url.pathname==="/api/admin/dashboard"&&request.method==="GET"){
      const songs=filterAndSort(await allSongs(env.DB,true),new URL(url.origin+"/?sort=added_new"));
      return ok({published:songs.filter(song=>song.status==="published").length,drafts:songs.filter(song=>song.status==="draft").length,review:songs.filter(song=>song.status==="needs_review").length,failed:0,recent:songs.slice(0,6)});
    }
    if(url.pathname==="/api/admin/songs"&&request.method==="GET")return ok(filterAndSort(await allSongs(env.DB,true),url));
    if(url.pathname==="/api/admin/songs"&&request.method==="POST"){
      const parsed=parseSong(await jsonBody(request));
      if(parsed.fields)return fail(400,"Please correct the highlighted fields.",parsed.fields);
      const song=parsed.song,slug=await uniqueSlug(env.DB,song.title,song.artist);
      const result=await env.DB.prepare("INSERT INTO songs (slug,title,artist,language,song_key,display_key,bpm,time_signature,capo,genre,vibe_intensity,lyrics_chord_data,plain_lyrics,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(slug,song.title,song.artist,song.language,song.key,song.displayKey,song.bpm,song.timeSignature,song.capo,song.genre,song.vibeIntensity,JSON.stringify(song.lyricsChordData),song.plainLyrics,song.status).run();
      return new Response(JSON.stringify({data:await getById(env.DB,result.meta.last_row_id)}),{status:201,headers:{"content-type":"application/json"}});
    }
    const adminSongMatch=url.pathname.match(/^\\/api\\/admin\\/songs\\/(\\d+)$/);
    if(adminSongMatch&&request.method==="PUT"){
      const id=Number(adminSongMatch[1]),current=await getById(env.DB,id);
      if(!current)return fail(404,"Song not found.");
      const parsed=parseSong(await jsonBody(request));
      if(parsed.fields)return fail(400,"Please correct the highlighted fields.",parsed.fields);
      const song=parsed.song;
      await env.DB.prepare("UPDATE songs SET title=?,artist=?,language=?,song_key=?,display_key=?,bpm=?,time_signature=?,capo=?,genre=?,vibe_intensity=?,lyrics_chord_data=?,plain_lyrics=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(song.title,song.artist,song.language,song.key,song.displayKey,song.bpm,song.timeSignature,song.capo,song.genre,song.vibeIntensity,JSON.stringify(song.lyricsChordData),song.plainLyrics,song.status,id).run();
      return ok(await getById(env.DB,id));
    }
    if(adminSongMatch&&request.method==="DELETE"){
      await env.DB.prepare("UPDATE songs SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(Number(adminSongMatch[1])).run();
      return ok({deleted:true});
    }
    const publishMatch=url.pathname.match(/^\\/api\\/admin\\/songs\\/(\\d+)\\/(publish|unpublish)$/);
    if(publishMatch&&request.method==="POST"){
      await env.DB.prepare("UPDATE songs SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(publishMatch[2]==="publish"?"published":"draft",Number(publishMatch[1])).run();
      return ok(await getById(env.DB,Number(publishMatch[1])));
    }
    if(url.pathname==="/api/admin/songs/generate"&&request.method==="POST"){
      const input=await jsonBody(request);
      return ok({suggestion:{title:clean(input.title,160)||"",artist:clean(input.artist,160)||"",language:clean(input.language)}});
    }
    if(url.pathname==="/api/admin/jobs"&&request.method==="GET")return ok([]);
    if(url.pathname.startsWith("/api/"))return fail(404,"Not found.");
    const assetUrl=new URL(url.pathname==="/"?"/index.html":url.pathname,request.url);
    let response=await env.ASSETS.fetch(new Request(assetUrl,request));
    if(response.status===404)response=await env.ASSETS.fetch(new Request(new URL("/index.html",request.url),request));
    return response;
  }
};
export default worker;
`;

fs.rmSync(path.join(root, "dist"), { recursive: true, force: true });
fs.mkdirSync(serverTarget, { recursive: true });
fs.cpSync(source, target, { recursive: true });
fs.writeFileSync(path.join(serverTarget, "index.js"), worker);

console.log(`Sites build created with D1 persistence and ${songs.length} seed songs.`);
