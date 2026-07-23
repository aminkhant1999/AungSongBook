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

const worker = `const songs=${JSON.stringify(songs)};
const ok=data=>Response.json({data});
const fail=(status,message)=>Response.json({error:{message}},{status});
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
const worker={
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/api/health")return ok({status:"healthy"});
    if(url.pathname==="/api/auth/session")return ok({authenticated:false,username:null});
    if(url.pathname==="/api/auth/logout")return ok({loggedOut:true});
    if(url.pathname==="/api/auth/login"||url.pathname.startsWith("/api/admin/"))
      return fail(403,"The public portfolio demo is read-only.");
    if(url.pathname==="/api/filters"){
      const unique=key=>[...new Set(songs.map(song=>song[key]).filter(value=>value!==null&&value!==""))].sort();
      return ok({languages:unique("language"),genres:unique("genre"),keys:unique("key"),bpms:unique("bpm")});
    }
    if(url.pathname==="/api/songs"){
      const query=text(url.searchParams.get("q"));
      let result=songs.filter(song=>{
        if(url.searchParams.get("language")&&song.language!==url.searchParams.get("language"))return false;
        if(url.searchParams.get("genre")&&song.genre!==url.searchParams.get("genre"))return false;
        if(url.searchParams.get("key")&&song.key!==url.searchParams.get("key"))return false;
        return !query||[song.title,song.artist,song.genre,song.language,song.plainLyrics].some(value=>text(value).includes(query));
      });
      const sorter=sorters[url.searchParams.get("sort")]||((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
      return ok([...result].sort(sorter));
    }
    const songMatch=url.pathname.match(/^\\/api\\/songs\\/([^/]+)$/);
    if(songMatch&&request.method==="GET"){
      const song=songs.find(item=>item.slug===decodeURIComponent(songMatch[1]));
      return song?ok(song):fail(404,"Song not found.");
    }
    if(/^\\/api\\/songs\\/\\d+\\/open$/.test(url.pathname)&&request.method==="POST")return ok({recorded:true});
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

console.log(`Sites build created with ${songs.length} published songs.`);
