/* ════════════════════════════════════════════════
   LIVING WATERS — Worship Songs (pro build v3)
   ════════════════════════════════════════════════ */
const BAND_PIN = "1998";

/* prevent double-tap zoom (belt & braces on top of touch-action:manipulation) */
(function(){
  let last=0;
  document.addEventListener("touchend",function(e){
    const now=Date.now();
    if(now-last<=320){ e.preventDefault(); }
    last=now;
  },{passive:false});
  document.addEventListener("gesturestart",function(e){ e.preventDefault(); });
})();

/* ---------- CHORD COLOUR ---------- */
const COLORS=[{n:"Red",h:"#e23b40"},{n:"Blue",h:"#3b82f6"},{n:"Amber",h:"#f59e0b"},{n:"Green",h:"#22c55e"},{n:"Purple",h:"#a855f7"},{n:"Cyan",h:"#06b6d4"},{n:"White",h:"#f0f4f9"}];
function getColor(){try{return localStorage.getItem("lwChordColor")||"#e23b40";}catch(e){return "#e23b40";}}
function applyColor(h){
  document.documentElement.style.setProperty("--chord",h);
  document.documentElement.style.setProperty("--accent",h);
  try{
    var r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
    document.documentElement.style.setProperty("--accent-dim","rgba("+r+","+g+","+b+",0.15)");
  }catch(e){}
  try{localStorage.setItem("lwChordColor",h);}catch(e){}
}
applyColor(getColor());

/* ---------- PIN ---------- */
(function(){
  const gate=document.getElementById("pinGate"),app=document.getElementById("app");
  const dotsWrap=document.getElementById("pinDots"),pad=document.getElementById("pinPad"),err=document.getElementById("pinErr");
  let entered="";
  for(let i=0;i<4;i++){const d=document.createElement("div");d.className="pin-dot";dotsWrap.appendChild(d);}
  const dots=dotsWrap.querySelectorAll(".pin-dot");
  ["1","2","3","4","5","6","7","8","9","","0","\u232b"].forEach(function(k){
    const b=document.createElement("button");b.className="pk"+(k===""?" blank":"");b.textContent=k;
    if(k!=="")b.addEventListener("click",function(){press(k);});pad.appendChild(b);
  });
  function refresh(){dots.forEach(function(d,i){d.classList.toggle("on",i<entered.length);});}
  function press(k){err.textContent="";if(k==="\u232b"){entered=entered.slice(0,-1);refresh();return;}
    if(entered.length>=4)return;entered+=k;refresh();if(entered.length===4)setTimeout(check,120);}
  function check(){if(entered===BAND_PIN){try{localStorage.setItem("lwSongsPin",BAND_PIN);}catch(e){}unlock();}
    else{err.textContent="Incorrect PIN";entered="";refresh();}}
  function unlock(){gate.classList.add("hidden");startProfiles();}
  document.addEventListener("keydown",function(e){if(gate.classList.contains("hidden"))return;
    if(/^[0-9]$/.test(e.key))press(e.key);else if(e.key==="Backspace")press("\u232b");});
  try{if(localStorage.getItem("lwSongsPin")===BAND_PIN)unlock();}catch(e){}
})();

/* ---------- STATE ---------- */
let SONGS=[],SETLISTS=[];
let currentSong=null,tr=0,capoView=0,font=22,editingId=null,hideChords=false;
let currentSet=null,setIdx=-1,setsMode="active",scrollTimer=null,scrollSpeed=3;
let MEMBERS=[],currentMember=null,prefsSaveTimer=null,currentPrefs=null;
let metroOn=false,metroBpm=80,metroTimer=null,audioCtx=null;
let metroBeat=0,timeSigTop=4,timeSigBottom=4,accents=[true,false,false,false];

/* ---------- KEYS ---------- */
const NOTES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLATS=["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
(function(){
  const k=document.getElementById("edKey");
  // Show both sharp and flat spellings so Bb/Eb/Ab etc. can be chosen
  const KEYCHOICES=["C","C#","Db","D","D#","Eb","E","F","F#","Gb","G","G#","Ab","A","A#","Bb","B"];
  KEYCHOICES.forEach(function(n){const o=document.createElement("option");o.value=n;o.textContent=n;k.appendChild(o);});
  const c=document.getElementById("edCapo");for(let i=0;i<=11;i++){const o=document.createElement("option");o.value=i;o.textContent=i;c.appendChild(o);}
})();
function noteIdx(note){let n=note.charAt(0).toUpperCase(),r=note.slice(1),b=NOTES.indexOf(n);if(b===-1)b=FLATS.indexOf(n);
  if(r.indexOf("#")!==-1)b+=1;if(r.toLowerCase().indexOf("b")!==-1)b-=1;return (b+12)%12;}
function trChord(ch,s){return ch.replace(/([A-G])(#{1,2}|b{1,2})?/g,function(m,l,a){return NOTES[(noteIdx(l+(a||""))+s+1200)%12];});}
// keys that are conventionally written with flats
const FLAT_KEYS={"F":1,"Bb":1,"Eb":1,"Ab":1,"Db":1,"Gb":1,"Dm":1,"Gm":1,"Cm":1,"Fm":1,"Bbm":1,"Ebm":1};
function keyPrefersFlat(k){
  if(!k)return false;
  if(k.indexOf("b")!==-1)return true;      // already a flat key
  return !!FLAT_KEYS[k];
}
function shiftKey(k,s){
  if(!k)return "\u2014";
  var idx=(noteIdx(k)+s+1200)%12;
  // decide spelling from the RESULTING key, not the original
  var sharpName=NOTES[idx], flatName=FLATS[idx];
  return keyPrefersFlat(sharpName)||keyPrefersFlat(flatName)?flatName:sharpName;
}
// chords use the same spelling as the current (transposed) key
function useFlatSpelling(){
  if(!currentSong||!currentSong.song_key)return false;
  var idx=(noteIdx(currentSong.song_key)+tr+1200)%12;
  return keyPrefersFlat(NOTES[idx])||keyPrefersFlat(FLATS[idx]);
}

/* ---------- RENDER CHORDPRO ---------- */
const SEC=/^(verse|chorus|bridge|pre[- ]?chorus|intro|outro|tag|refrain|interlude|ending|instrumental|hook)(\s*\d*)\s*:?\s*$/i;
const CHORD_TOK=/^\(?[A-G](#|b)?(m|maj|min|dim|aug|sus|add|M)?[0-9]?(sus)?[0-9]?(\/[A-G](#|b)?)?\)?$/;
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function isChordOnly(line){
  const t=line.trim();
  if(!t)return false;
  if(SEC.test(t))return false;
  const toks=t.split(/\s+/);
  let c=0;
  for(const tk of toks){ if(CHORD_TOK.test(tk))c++; }
  return c>0 && c===toks.length;
}
function transposeLine(line,steps){
  if(!steps)return line;
  var arr=useFlatSpelling()?FLATS:NOTES;
  return line.replace(/\(?([A-G])(#{1,2}|b{1,2})?/g,function(m,l,a){
    var pre=m.charAt(0)==="("?"(":"";
    return pre+arr[(noteIdx(l+(a||""))+steps+1200)%12];
  });
}
/* Render: chords on their own line (red), lyrics below (white), sections red-bold.
   No [brackets] needed — chord lines are auto-detected. */
function renderCP(body,steps){
  const lines=(body||"").split("\n");
  let html="";
  lines.forEach(function(line){
    if(line.trim()===""){ html+='<div class="blank"></div>'; return; }
    if(SEC.test(line.trim())){ html+='<div class="sec">'+esc(line.trim().replace(/:$/,""))+"</div>"; return; }
    // legacy inline [chord] support -> convert on the fly to a chord row + lyric row
    if(line.indexOf("[")!==-1){
      html+=renderInline(line,steps); return;
    }
    if(isChordOnly(line)){
      html+='<div class="chordrow">'+esc(transposeLine(line,steps))+"</div>";
    }else{
      html+='<div class="lyricrow">'+esc(line)+"</div>";
    }
  });
  return html;
}
/* still support any old songs saved with [C] inline: split into chord row + lyric row */
function renderInline(line,steps){
  let re=/\[([^\]]+)\]/g,last=0,m,segs=[];
  while((m=re.exec(line))!==null){ if(m.index>last)segs.push({ch:null,ly:line.slice(last,m.index)}); segs.push({ch:m[1],ly:""}); last=re.lastIndex; }
  if(last<line.length)segs.push({ch:null,ly:line.slice(last)});
  let chordLine="",lyricLine="";
  for(let i=0;i<segs.length;i++){
    const s=segs[i];
    if(s.ch!==null){
      const chord=steps?transposeLine(s.ch,steps):s.ch;
      let ly="";
      if(segs[i+1]&&segs[i+1].ch===null){ ly=segs[i+1].ly; i++; }
      // pad chord line to align over the lyric position
      while(chordLine.length<lyricLine.length)chordLine+=" ";
      chordLine+=chord;
      lyricLine+=ly;
    }else{ lyricLine+=s.ly; }
  }
  return '<div class="chordrow">'+esc(chordLine.replace(/\s+$/,""))+"</div>"+
         '<div class="lyricrow">'+esc(lyricLine)+"</div>";
}

/* ---------- INIT + EVENT DELEGATION ---------- */
function initApp(){
  // register offline service worker
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("songs-sw.js").catch(function(){});
  }
  var _sp=document.getElementById("pfSpeed");if(_sp)_sp.textContent=scrollSpeed;
  if(!navigator.onLine) setOfflineBanner(true);
  buildSwatches();
  loadTimeSig(); buildBeats();
  var _ts=document.getElementById("timeSig");
  if(_ts)_ts.addEventListener("change",function(){setTimeSig(this.value);});
  // draw the sidebar as soon as songs + setlists finish loading
  // (on first entry nothing else calls goHome, so without this the
  //  library/sets looked empty until you switched profiles)
  showLoading(true);
  loadAll().then(function(){ goHome(); showLoading(false); startRealtime(); });
  document.getElementById("songSearch").addEventListener("input",renderSidebar);
  document.getElementById("sdSearch").addEventListener("input",renderSetDetail);
  document.getElementById("pkSearch").addEventListener("input",renderPicker);
  document.getElementById("edBody").addEventListener("input",updatePreview);
  document.getElementById("edKey").addEventListener("change",updatePreview);

  document.body.addEventListener("click",function(e){
    const el=e.target.closest("[data-act]");if(!el)return;
    const a=el.dataset.act,id=el.dataset.id;
    const A={
      settings:openSettings,closeSheets:closeSheets,lockPin:lockPin,switchProfile:switchProfile,refreshData:refreshData,
      collapse:collapse,toggleSec:function(){toggleSec(el.dataset.sec);},
      newsong:newSong,cancelEditor:closeEditor,closeEditor:closeEditor,saveSong:saveSong,deleteSong:deleteSong,
      createset:createSet,
      openset:function(){openSet(id);},opensong:function(){openSong(id);},
      "tr-1":function(){tr--;renderPerform();queueSavePrefs();},"tr1":function(){tr++;renderPerform();queueSavePrefs();},
      "cap-1":function(){capoView=Math.max(0,capoView-1);renderPerform();queueSavePrefs();},"cap1":function(){capoView=Math.min(11,capoView+1);renderPerform();queueSavePrefs();},
      "ft-1":function(){font=Math.max(11,font-1);renderPerform();queueSavePrefs();},"ft1":function(){font=Math.min(60,font+1);renderPerform();queueSavePrefs();},
      toggleChords:toggleChords,toggleScroll:toggleScroll,addToSet:addToSet,openTracks:openTracks,
      "spd-1":function(){changeSpeed(-1);},"spd1":function(){changeSpeed(1);},
      toggleMetro:toggleMetro,"bpm-1":function(){changeBpm(-1);},"bpm1":function(){changeBpm(1);},
      mbeat:function(){toggleAccent(parseInt(el.dataset.beat,10));},
      closePerform:goHome,editCurrent:editCurrent,noteSheet:openNoteSheet,saveNote:saveNote,
      stkText:function(){setStkMode("text");},stkDraw:function(){setStkMode("draw");},stkClear:function(){window.stkClear();},
      archiveToggle:archiveToggle,deleteSet:deleteSet,playSet:playSet,
      stageView:stageView,sharePdf:sharePdf,shareLink:shareLink,
      closeCtx:closeCtx,ctxDuplicate:ctxDuplicate,ctxShare:ctxShare,ctxDelete:ctxDelete,ctxVerify:ctxToggleVerified,
      closeSetCtx:closeSetCtx,setCtxDup:setCtxDup,setCtxRemove:setCtxRemove,
      openSetCtxBtn:function(){openSetCtx(id,parseInt(el.dataset.setidx,10));},
      addSongsToSet:openPicker,closePicker:closePicker,pickSong:function(){pickSong(id);},
      removeFromSet:function(){removeFromSet(id);},setPrev:setPrev,setNext:setNext,
      openFromSet:function(){openFromSet(id);},
      openImport:openImport,closeImport:closeImport,pickFiles:pickFiles,importPaste:importPaste
    };
    if(A[a]){
      e.stopPropagation();
      if((a==="opensong"||a==="openset")&&el.classList){el.classList.add("flash");setTimeout(function(){el.classList.remove("flash");},180);}
      if(a==="openFromSet"){var row=el.closest(".set-song");if(row){row.classList.add("flash");setTimeout(function(){row.classList.remove("flash");},180);}}
      A[a]();
    }
  });

  /* long-press on LIBRARY songs -> context menu (duplicate / share / delete) */
  var lpTimer=null,lpFired=false,lpStartX=0,lpStartY=0;
  function lpStart(e){
    var item=e.target.closest("[data-ctx]");
    if(!item)return; // only library items; setlist rows handle their own hold-to-drag
    lpFired=false;
    var p=e.touches?e.touches[0]:e;
    lpStartX=p.clientX;lpStartY=p.clientY;
    lpTimer=setTimeout(function(){lpFired=true;openCtx(item.dataset.ctx);},500);
  }
  function lpMove(e){
    if(!lpTimer)return;
    var p=e.touches?e.touches[0]:e;
    if(Math.abs(p.clientX-lpStartX)>8||Math.abs(p.clientY-lpStartY)>8)lpCancel();
  }
  function lpCancel(){ if(lpTimer){clearTimeout(lpTimer);lpTimer=null;} }
  document.body.addEventListener("touchstart",lpStart,{passive:true});
  document.body.addEventListener("touchend",lpCancel);
  document.body.addEventListener("touchmove",lpMove,{passive:true});
  document.body.addEventListener("mousedown",lpStart);
  document.body.addEventListener("mousemove",lpMove);
  document.body.addEventListener("mouseup",lpCancel);
  // right-click (desktop) opens the library menu too
  document.body.addEventListener("contextmenu",function(e){
    var item=e.target.closest("[data-ctx]");if(item){e.preventDefault();lpFired=true;openCtx(item.dataset.ctx);}
  });
  document.body.addEventListener("click",function(e){ if(lpFired){lpFired=false;var it=e.target.closest("[data-ctx]");if(it){e.stopPropagation();e.preventDefault();}} },true);
}

/* ---------- SONG CONTEXT MENU ---------- */
let ctxSongId=null;
function openCtx(id){
  ctxSongId=id;
  var s=SONGS.find(function(x){return x.id===id;});
  document.getElementById("ctxTitle").textContent=s?s.title:"Song";
  var vl=document.getElementById("ctxVerifyLabel"); if(vl)vl.textContent=(s&&s.verified)?"Unmark as checked":"Mark as checked";
  document.getElementById("ctxBg").classList.add("open");
  document.getElementById("ctxMenu").classList.add("open");
}
function closeCtx(){document.getElementById("ctxBg").classList.remove("open");document.getElementById("ctxMenu").classList.remove("open");}
window.closeCtx=closeCtx;
async function ctxDuplicate(){
  var s=SONGS.find(function(x){return x.id===ctxSongId;});if(!s){closeCtx();return;}
  var copy={title:(s.title||"Song")+" (copy)",artist:s.artist||"",song_key:s.song_key||"",capo:s.capo||0,bpm:s.bpm||null,time_sig:s.time_sig||null,accents:s.accents||null,body:s.body||""};
  var res=await sb.from("songs").insert(copy).select();
  if(res.error){alert("Couldn't duplicate: "+res.error.message);closeCtx();return;}
  await loadSongs();updateCounts();renderSidebar();closeCtx();
}
function ctxShare(){
  var s=SONGS.find(function(x){return x.id===ctxSongId;});if(!s){closeCtx();return;}
  var url="https://lewendew.co.za/songs/?song="+encodeURIComponent(s.id);
  if(navigator.share){navigator.share({title:s.title,text:s.title,url:url}).catch(function(){});}
  else if(navigator.clipboard){navigator.clipboard.writeText(url).then(function(){alert("Link copied!\n"+url);},function(){prompt("Copy link:",url);});}
  else{prompt("Copy link:",url);}
  closeCtx();
}
async function ctxDelete(){
  var s=SONGS.find(function(x){return x.id===ctxSongId;});if(!s){closeCtx();return;}
  if(!confirm('Delete "'+s.title+'" permanently?')){return;}
  var res=await sb.from("songs").delete().eq("id",ctxSongId);
  if(res.error){alert("Couldn't delete: "+res.error.message);closeCtx();return;}
  await loadSongs();updateCounts();renderSidebar();closeCtx();
}
async function ctxToggleVerified(){
  var s=SONGS.find(function(x){return x.id===ctxSongId;});if(!s){closeCtx();return;}
  var nv=!s.verified;
  s.verified=nv;
  if(currentSong&&currentSong.id===s.id)currentSong.verified=nv;
  try{var res=await sb.from("songs").update({verified:nv}).eq("id",ctxSongId);if(res.error)throw res.error;}
  catch(e){saveFailedToast();}
  renderSidebar();closeCtx();
}
window.openCtx=openCtx;window.ctxDuplicate=ctxDuplicate;window.ctxShare=ctxShare;window.ctxDelete=ctxDelete;window.ctxToggleVerified=ctxToggleVerified;

/* ---------- SETLIST ENTRY CONTEXT MENU ---------- */
let setCtxSongId=null,setCtxIdx=-1;
function openSetCtx(sid,idx){
  setCtxSongId=sid;setCtxIdx=idx;
  var s=SONGS.find(function(x){return x.id===sid;});
  document.getElementById("setCtxTitle").textContent=s?s.title:"Song";
  document.getElementById("setCtxBg").classList.add("open");
  document.getElementById("setCtxMenu").classList.add("open");
}
function closeSetCtx(){document.getElementById("setCtxBg").classList.remove("open");document.getElementById("setCtxMenu").classList.remove("open");}
window.closeSetCtx=closeSetCtx;
async function setCtxDup(){
  if(!currentSet){closeSetCtx();return;}
  var ids=(currentSet.song_ids||[]).slice();
  if(setCtxIdx<0||setCtxIdx>=ids.length){closeSetCtx();return;}
  // insert a copy of the entry right after it (same song appears twice in the set)
  ids.splice(setCtxIdx+1,0,setCtxSongId);
  var res=await sb.from("setlists").update({song_ids:ids}).eq("id",currentSet.id);
  if(res.error){alert("Couldn't duplicate: "+res.error.message);closeSetCtx();return;}
  currentSet.song_ids=ids;renderSetDetail();loadSetlists();closeSetCtx();
}
async function setCtxRemove(){
  if(!currentSet){closeSetCtx();return;}
  var ids=(currentSet.song_ids||[]).slice();
  if(setCtxIdx<0||setCtxIdx>=ids.length){closeSetCtx();return;}
  ids.splice(setCtxIdx,1); // remove just this occurrence
  var res=await sb.from("setlists").update({song_ids:ids}).eq("id",currentSet.id);
  if(res.error){alert("Couldn't remove: "+res.error.message);closeSetCtx();return;}
  currentSet.song_ids=ids;renderSetDetail();loadSetlists();closeSetCtx();
}
window.openSetCtx=openSetCtx;window.setCtxDup=setCtxDup;window.setCtxRemove=setCtxRemove;

/* Once set, we're on a bad/no connection — skip network reads and use the
   cache instantly, so flipping through songs never hangs. Cleared when we
   get a good response again (or the browser fires "online"). */
var _offlineMode=false;
/* Races a Supabase request against a timeout so a dead connection can't hang
   the UI. On timeout it resolves with a _timeout marker instead of waiting. */
function withTimeout(p,ms){
  return Promise.race([
    Promise.resolve(p).then(function(r){return r;}),
    new Promise(function(res){setTimeout(function(){res({data:null,error:null,_timeout:true});},ms);})
  ]);
}
async function loadAll(){await loadSongs();await loadSetlists();updateCounts();}
async function loadSongs(){
  try{
    const res=await withTimeout(sb.from("songs").select("*").order("title"),4000);
    if(!res||res._timeout||res.error)throw (res&&res.error)||"timeout";
    SONGS=res.data||[]; _offlineMode=false;
    try{localStorage.setItem("lwCacheSongs",JSON.stringify(SONGS));}catch(e){}
  }catch(err){
    // offline / dead WiFi: fall back to the last cached copy instantly
    try{SONGS=JSON.parse(localStorage.getItem("lwCacheSongs")||"[]");}catch(e){SONGS=[];}
    _offlineMode=true; setOfflineBanner(true);
  }
}
async function loadSetlists(){
  try{
    const res=await withTimeout(sb.from("setlists").select("*").order("created_at",{ascending:false}),4000);
    if(!res||res._timeout||res.error)throw (res&&res.error)||"timeout";
    SETLISTS=res.data||[]; _offlineMode=false;
    try{localStorage.setItem("lwCacheSets",JSON.stringify(SETLISTS));}catch(e){}
  }catch(err){
    try{SETLISTS=JSON.parse(localStorage.getItem("lwCacheSets")||"[]");}catch(e){SETLISTS=[];}
    _offlineMode=true; setOfflineBanner(true);
  }
}
function setOfflineBanner(on){
  var b=document.getElementById("offlineBanner");
  if(!b){
    b=document.createElement("div");b.id="offlineBanner";
    b.style.cssText="position:fixed;bottom:0;left:0;right:0;z-index:300;background:#f59e0b;color:#1a1400;"+
      "font-weight:700;font-size:0.82rem;text-align:center;padding:0.5rem;transform:translateY(100%);transition:0.3s;";
    b.textContent="\u26a1 Offline \u2014 showing saved songs. You can't save changes until you reconnect.";
    document.body.appendChild(b);
  }
  b.style.transform=on?"translateY(0)":"translateY(100%)";
}
window.addEventListener("online",function(){_offlineMode=false;setOfflineBanner(false);loadAll();});
window.addEventListener("offline",function(){setOfflineBanner(true);});
function updateCounts(){
  var a=document.getElementById("cntSongs"),b=document.getElementById("cntActive"),c=document.getElementById("cntArchived");
  if(a)a.textContent=SONGS.length;
  if(b)b.textContent=SETLISTS.filter(function(s){return !s.archived;}).length;
  if(c)c.textContent=SETLISTS.filter(function(s){return s.archived;}).length;
}

/* ---------- REFRESH (pull latest from the server) ---------- */
/* In the installed app there's no browser refresh, so this button re-pulls
   songs/sets/profiles from Supabase and redraws whatever is open. */
async function refreshData(){
  var btn=document.getElementById("refreshBtn");
  if(btn)btn.classList.add("spin");
  await loadAll();
  await loadMembers();
  if(currentSong){ var s=SONGS.find(function(x){return x.id===currentSong.id;}); if(s)currentSong=s; }
  if(currentSet){ var st=SETLISTS.find(function(x){return x.id===currentSet.id;}); if(st)currentSet=st; }
  renderSidebar();
  var perf=document.getElementById("mv-perform");
  if(perf&&!perf.classList.contains("hidden")&&currentSong)renderPerform();
  var sd=document.getElementById("mv-setdetail");
  if(sd&&!sd.classList.contains("hidden")&&currentSet)renderSetDetail();
  if(btn)setTimeout(function(){btn.classList.remove("spin");},450);
  toast("Updated — showing the latest");
}
window.refreshData=refreshData;
function toast(msg){
  var t=document.getElementById("lwToast");
  if(!t){
    t=document.createElement("div");t.id="lwToast";
    t.style.cssText="position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 22px);"+
      "transform:translateX(-50%) translateY(20px);background:var(--panel2);color:var(--text);"+
      "border:1px solid var(--line);border-radius:11px;padding:0.6rem 1.1rem;font-weight:700;"+
      "font-size:0.85rem;z-index:800;opacity:0;transition:0.25s;pointer-events:none;box-shadow:0 6px 24px rgba(0,0,0,0.5);";
    document.body.appendChild(t);
  }
  t.textContent=msg;
  requestAnimationFrame(function(){t.style.opacity="1";t.style.transform="translateX(-50%) translateY(0)";});
  clearTimeout(window._toastT);
  window._toastT=setTimeout(function(){t.style.opacity="0";t.style.transform="translateX(-50%) translateY(20px)";},1700);
}
function saveFailedToast(){ toast(navigator.onLine?"⚠ Couldn't save — please try again":"⚠ Offline — that change didn't save"); }

/* full-screen spinner for the very first load */
function showLoading(on){
  var o=document.getElementById("lwLoading");
  if(!o){
    o=document.createElement("div");o.id="lwLoading";
    o.style.cssText="position:fixed;inset:0;z-index:850;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.9rem;background:var(--bg);color:var(--muted);font-weight:700;font-size:0.9rem;";
    o.innerHTML='<div style="width:36px;height:36px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:lwspin 0.7s linear infinite;"></div><div>Loading songs…</div>';
    document.body.appendChild(o);
  }
  o.style.display=on?"flex":"none";
}

/* ---------- LIVE AUTO-UPDATE (Supabase realtime) ---------- */
var _rtTimer=null,_rtStarted=false;
function startRealtime(){
  if(_rtStarted)return; _rtStarted=true;
  try{
    sb.channel("lw-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"songs"},_rtQueue)
      .on("postgres_changes",{event:"*",schema:"public",table:"setlists"},_rtQueue)
      .subscribe();
  }catch(e){}
}
function _rtQueue(){ clearTimeout(_rtTimer); _rtTimer=setTimeout(silentRefresh,700); } // debounce bursts
async function silentRefresh(){
  if(_drag.on)return;                                     // don't yank rows mid-drag
  var ed=document.getElementById("mv-editor");
  if(ed&&!ed.classList.contains("hidden"))return;        // don't disrupt someone editing
  await loadAll();
  if(currentSong){var s=SONGS.find(function(x){return x.id===currentSong.id;});if(s)currentSong=s;}
  if(currentSet){var st=SETLISTS.find(function(x){return x.id===currentSet.id;});if(st)currentSet=st;}
  renderSidebar();
  var perf=document.getElementById("mv-perform");
  if(perf&&!perf.classList.contains("hidden")&&currentSong)renderPerform();
  var sd=document.getElementById("mv-setdetail");
  if(sd&&!sd.classList.contains("hidden")&&currentSet)renderSetDetail();
}

/* ---------- VIEW SWITCH ---------- */
const VIEWS=["empty","perform","editor","setdetail","picker","import"];
function show(v){VIEWS.forEach(function(x){document.getElementById("mv-"+x).classList.toggle("hidden",x!==v);});}
function goHome(){
  show("empty");renderSidebar();
  // if opened via a share link (?set=ID), open that setlist once
  if(!window._sharedSetHandled){
    window._sharedSetHandled=true;
    try{
      var m=(location.search||"").match(/[?&]set=([^&]+)/);
      if(m){ var sid=decodeURIComponent(m[1]); var found=SETLISTS.find(function(s){return s.id===sid;});
        if(found){ openSet(sid); } }
    }catch(e){}
  }
}
window.goHome=goHome;

/* ---------- SIDEBAR ---------- */
let secOpen={library:true,active:true,archived:false};
function toggleSec(sec){
  secOpen[sec]=!secOpen[sec];
  const map={library:"secLibrary",active:"secActive",archived:"secArchived"};
  document.getElementById(map[sec]).classList.toggle("hidden",!secOpen[sec]);
  document.querySelectorAll('.sb-sec-head[data-sec="'+sec+'"]').forEach(function(h){h.classList.toggle("closed",!secOpen[sec]);});
}
window.toggleSec=toggleSec;

function renderSidebar(){
  updateCounts();
  const q=(document.getElementById("songSearch").value||"").toLowerCase();
  // LIBRARY
  const lib=document.getElementById("secLibrary");
  const fs=SONGS.filter(function(s){return (s.title||"").toLowerCase().indexOf(q)!==-1||(s.artist||"").toLowerCase().indexOf(q)!==-1;});
  if(!fs.length){lib.innerHTML='<div class="sb-empty">'+(SONGS.length?"No songs match.":"No songs yet \u2014 tap + to add one.")+"</div>";}
  else{lib.innerHTML=fs.map(function(s){
    const cur=(currentSong&&currentSong.id===s.id&&!document.getElementById("mv-perform").classList.contains("hidden"))?" current":"";
    return '<div class="sb-item'+cur+'" data-act="opensong" data-id="'+s.id+'" data-ctx="'+s.id+'">'+
      (s.verified?'<span class="vchk" title="Checked &amp; formatted">&#10003;</span>':'')+
      '<span class="t">'+esc(s.title)+(s.song_key?' <small>&middot; '+esc(s.song_key)+'</small>':'')+(s.notes||s.sticky_draw?' &#128221;':'')+'</span></div>';
  }).join("");}
  // ACTIVE SETS
  const act=document.getElementById("secActive");
  const activeSets=SETLISTS.filter(function(s){return !s.archived;});
  if(!activeSets.length){act.innerHTML='<div class="sb-empty">No active sets \u2014 tap + to create one.</div>';}
  else{act.innerHTML=activeSets.map(function(s){
    const n=(s.song_ids||[]).length;const cur=(currentSet&&currentSet.id===s.id)?" current":"";
    return '<div class="sb-set'+cur+'" data-act="openset" data-id="'+s.id+'">'+
      '<span class="ic">&#128203;</span><span class="t">'+esc(s.name)+'<small>'+n+' song'+(n===1?'':'s')+'</small></span></div>';
  }).join("");}
  // ARCHIVED SETS
  const arc=document.getElementById("secArchived");
  const archSets=SETLISTS.filter(function(s){return s.archived;});
  if(!archSets.length){arc.innerHTML='<div class="sb-empty">No archived sets.</div>';}
  else{arc.innerHTML=archSets.map(function(s){
    const n=(s.song_ids||[]).length;const cur=(currentSet&&currentSet.id===s.id)?" current":"";
    return '<div class="sb-set'+cur+'" data-act="openset" data-id="'+s.id+'">'+
      '<span class="ic">&#128230;</span><span class="t">'+esc(s.name)+'<small>'+n+' song'+(n===1?'':'s')+'</small></span></div>';
  }).join("");}
}
/* keep old name working for any leftover callers */
function renderSongList(){renderSidebar();}
function renderSetList(){renderSidebar();}

/* collapse sidebar (mobile overlay / desktop hide) */
function collapse(){document.getElementById("app").classList.toggle("collapsed");}
window.collapse=collapse;

/* ---------- PERFORM ---------- */
async function openSong(id,fromSet){
  currentSong=SONGS.find(function(s){return s.id===id;});if(!currentSong)return;
  hideChords=false;
  if(!fromSet)setIdx=-1;
  // defaults from the song
  tr=0;capoView=currentSong.capo||0;font=font||22;
  // overlay this member's personal saved prefs (capo/key/font/notes/drawing)
  const p=await loadPrefs(currentSong.id);
  currentPrefs=p||{capo:capoView,transpose:0,font:font,notes:"",sticky_draw:""};
  if(p){ tr=p.transpose||0; capoView=(p.capo!=null?p.capo:capoView); if(p.font)font=p.font; }
  document.getElementById("pfTitle").textContent=currentSong.title;
  document.getElementById("pfArtist").textContent=currentSong.artist||"";
  document.getElementById("chordToggle").classList.remove("on");
  document.getElementById("chordToggle").innerHTML="&#9834; Chords";
  const hasNote=(currentPrefs.notes||currentPrefs.sticky_draw);
  document.getElementById("noteBtn").style.color=hasNote?"var(--amber)":"";
  // metronome: adopt this song's own BPM (or a sensible default if none saved), and stop any running click
  stopMetro();
  metroBpm = currentSong.bpm ? currentSong.bpm : 80;
  document.getElementById("metroBpm").textContent=metroBpm;
  // adopt this song's own time signature + accents (shared on the song, like BPM)
  if(currentSong.time_sig){ var _ts=(""+currentSong.time_sig).split("/"); timeSigTop=Math.max(1,Math.min(12,parseInt(_ts[0],10)||4)); timeSigBottom=parseInt(_ts[1],10)||4; }
  else { timeSigTop=4; timeSigBottom=4; }
  try{ var _ac=currentSong.accents?JSON.parse(currentSong.accents):null; accents=(_ac&&_ac.length===timeSigTop)?_ac:defaultAccents(timeSigTop); }
  catch(e){ accents=defaultAccents(timeSigTop); }
  metroBeat=0; buildBeats();
  document.getElementById("pfNav").classList.toggle("hidden",setIdx<0);
  updateNav();stopScroll();renderPerform();show("perform");
  document.getElementById("pfScroll").scrollTop=0;
}
window.openSong=openSong;
function renderPerform(){
  const body=document.getElementById("pfBody");
  body.style.fontSize=font+"px";
  body.classList.toggle("hide-chords",hideChords);
  const steps=tr-capoView;
  let html="";
  html+='<div class="songtitle">'+esc(currentSong.title)+(currentSong.bpm?' <span style="font-size:0.7em;color:var(--muted);font-weight:600;">&#9834; '+currentSong.bpm+" BPM</span>":"")+"</div>";
  html+=renderCP(currentSong.body,steps);
  body.innerHTML=html;
  // floating sticky note (personal, per profile)
  const fn=document.getElementById("floatNote");
  if(fn){
    let inner="";
    const pn=currentPrefs||{};
    if(pn.sticky_draw)inner+='<img src="'+pn.sticky_draw+'" />';
    if(pn.notes)inner+=(inner?'<div style="height:0.5rem"></div>':"")+esc(pn.notes);
    if(inner){fn.innerHTML=inner;fn.classList.remove("hidden");document.getElementById("pfScroll").classList.add("has-note");}
    else{fn.classList.add("hidden");document.getElementById("pfScroll").classList.remove("has-note");}
  }
  document.getElementById("pfKey").textContent=shiftKey(currentSong.song_key,tr);
  document.getElementById("pfCapo").textContent=capoView;
  document.getElementById("pfFont").textContent=font;
}
function toggleChords(){hideChords=!hideChords;const b=document.getElementById("chordToggle");
  b.classList.toggle("on",hideChords);b.innerHTML=hideChords?"&#9834; Show":"&#9834; Chords";renderPerform();}
function toggleScroll(){const b=document.getElementById("scrollBtn");
  if(scrollTimer){stopScroll();}else{b.classList.add("on");b.innerHTML="&#10074;&#10074; Stop";startScroll();}}
function startScroll(){
  const el=document.getElementById("pfScroll");
  const delay=Math.max(12,90-scrollSpeed*12); // higher speed => shorter delay
  scrollTimer=setInterval(function(){el.scrollTop+=1;
    if(el.scrollTop+el.clientHeight>=el.scrollHeight-1)stopScroll();},delay);
}
function changeSpeed(d){scrollSpeed=Math.max(1,Math.min(6,scrollSpeed+d));
  document.getElementById("pfSpeed").textContent=scrollSpeed;
  if(scrollTimer){clearInterval(scrollTimer);startScroll();} // apply live
  try{localStorage.setItem("lwScrollSpeed",String(scrollSpeed));}catch(e){}}
try{var _ss=parseInt(localStorage.getItem("lwScrollSpeed"),10);if(!isNaN(_ss))scrollSpeed=_ss;}catch(e){}
function stopScroll(){if(scrollTimer){clearInterval(scrollTimer);scrollTimer=null;}
  const b=document.getElementById("scrollBtn");if(b){b.classList.remove("on");b.innerHTML="&#9654; Scroll";}}
function closePerform(){stopScroll();stopMetro();goHome();}

/* ---------- CLICK TRACK (opens the separate Tracks tool for this song) ---------- */
function openTracks(){ if(currentSong) location.href="/tracks/?song="+encodeURIComponent(currentSong.id); }
window.openTracks=openTracks;

/* ---------- STAGE VIEW ---------- */
function stageView(){
  var el=document.getElementById("mv-perform");
  var entering=!el.classList.contains("stage");
  el.classList.toggle("stage");
  try{
    if(entering){
      var r=document.documentElement;
      var req=r.requestFullscreen||r.webkitRequestFullscreen||r.webkitEnterFullscreen||r.mozRequestFullScreen||r.msRequestFullscreen;
      if(req) req.call(r);
    } else {
      var ex=document.exitFullscreen||document.webkitExitFullscreen||document.mozCancelFullScreen||document.msExitFullscreen;
      if(ex && (document.fullscreenElement||document.webkitFullscreenElement||document.mozFullScreenElement||document.msFullscreenElement)) ex.call(document);
    }
  }catch(e){}
  renderPerform();
}
window.stageView=stageView;
/* keep stage class in sync if the user leaves fullscreen via swipe / back button */
function _onFsChange(){
  var fs=document.fullscreenElement||document.webkitFullscreenElement||document.mozFullScreenElement||document.msFullscreenElement;
  if(!fs){
    var el=document.getElementById("mv-perform");
    if(el && el.classList.contains("stage")){ el.classList.remove("stage"); renderPerform(); }
  }
}
document.addEventListener("fullscreenchange",_onFsChange);
document.addEventListener("webkitfullscreenchange",_onFsChange);

/* ---------- METRONOME ---------- */
/* The accented beat (the "one", shown white) gets a brighter, higher sound;
   the other beats (shown red) get a softer, lower sound. */
function metroClick(accent){
  try{
    if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type=accent?"triangle":"sine";
    o.frequency.value=accent?1760:880;
    var peak=accent?0.6:0.38;
    g.gain.setValueAtTime(0.0001,audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(peak,audioCtx.currentTime+0.001);
    g.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+(accent?0.07:0.05));
    o.connect(g);g.connect(audioCtx.destination);
    o.start();o.stop(audioCtx.currentTime+0.08);
  }catch(e){}
}
function defaultAccents(n){var a=[];for(var i=0;i<n;i++)a.push(i===0);return a;}
function loadTimeSig(){
  try{
    var t=JSON.parse(localStorage.getItem("lwMetroSig")||"null");
    if(t&&t.top){
      timeSigTop=t.top; timeSigBottom=t.bottom||4;
      accents=(t.accents&&t.accents.length===t.top)?t.accents:defaultAccents(t.top);
    }
  }catch(e){}
}
function saveTimeSig(){
  try{localStorage.setItem("lwMetroSig",JSON.stringify({top:timeSigTop,bottom:timeSigBottom,accents:accents}));}catch(e){}
}
/* Save the current time signature + accents ONTO the song (shared with the
   whole band), just like BPM. Also keeps a device default for before a song
   is open. */
function persistSongMeter(){
  saveTimeSig(); // device default fallback
  if(!currentSong)return;
  var sig=timeSigTop+"/"+timeSigBottom, acc=JSON.stringify(accents);
  currentSong.time_sig=sig; currentSong.accents=acc;
  var i=SONGS.findIndex(function(s){return s.id===currentSong.id;});
  if(i>=0){SONGS[i].time_sig=sig;SONGS[i].accents=acc;}
  sb.from("songs").update({time_sig:sig,accents:acc}).eq("id",currentSong.id).then(function(){},function(){});
}
function buildBeats(){
  var w=document.getElementById("metroBeats"); if(!w)return;
  var h="";
  for(var i=0;i<timeSigTop;i++){
    h+='<span class="mbeat'+(accents[i]?" acc":"")+'" data-act="mbeat" data-beat="'+i+'" title="Tap to set the accent (white = the one)"></span>';
  }
  w.innerHTML=h;
  var sel=document.getElementById("timeSig");
  if(sel){var v=timeSigTop+"/"+timeSigBottom; if(sel.value!==v)sel.value=v;}
}
function highlightBeat(i){
  var w=document.getElementById("metroBeats"); if(!w)return;
  var d=w.children; for(var k=0;k<d.length;k++)d[k].classList.toggle("lit",k===i);
}
function clearBeatHighlight(){
  var w=document.getElementById("metroBeats"); if(!w)return;
  var d=w.children; for(var k=0;k<d.length;k++)d[k].classList.remove("lit");
}
function toggleAccent(i){
  if(i<0||i>=accents.length)return;
  accents[i]=!accents[i];
  persistSongMeter(); buildBeats();
}
window.toggleAccent=toggleAccent;
function setTimeSig(val){
  var p=(val||"4/4").split("/");
  timeSigTop=Math.max(1,Math.min(12,parseInt(p[0],10)||4));
  timeSigBottom=parseInt(p[1],10)||4;
  accents=defaultAccents(timeSigTop);
  metroBeat=0;
  persistSongMeter(); buildBeats();
  if(metroOn)startMetro();
}
window.setTimeSig=setTimeSig;
function metroTick(){
  var acc=!!accents[metroBeat];
  metroClick(acc);
  highlightBeat(metroBeat);
  var b=document.getElementById("metroBtn");
  if(b){b.classList.add("tick");setTimeout(function(){b.classList.remove("tick");},100);}
  metroBeat=(metroBeat+1)%timeSigTop;
}
function startMetro(){
  stopMetro();
  metroOn=true;
  metroBeat=0;
  document.getElementById("metroBtn").classList.add("on");
  document.getElementById("metroBtn").innerHTML="&#10074;&#10074; Stop";
  const interval=60000/metroBpm;
  metroTick();
  metroTimer=setInterval(metroTick,interval);
}
function stopMetro(){
  metroOn=false;
  if(metroTimer){clearInterval(metroTimer);metroTimer=null;}
  clearBeatHighlight();
  const b=document.getElementById("metroBtn");if(b){b.classList.remove("on");b.innerHTML="&#9673; Metro";}
}
function toggleMetro(){ if(metroOn)stopMetro(); else startMetro(); }
function changeBpm(d){
  metroBpm=Math.max(30,Math.min(240,metroBpm+d));
  document.getElementById("metroBpm").textContent=metroBpm;
  if(metroOn)startMetro(); // restart at new tempo
}
window.toggleMetro=toggleMetro;window.changeBpm=changeBpm;


/* ---------- EDITOR ---------- */
function newSong(){editingId=null;document.getElementById("editorTitle").textContent="New Song";
  ["edTitle","edArtist","edBody","edNote","edBpm"].forEach(function(x){document.getElementById(x).value="";});
  document.getElementById("edKey").value="";document.getElementById("edCapo").value="0";
  document.getElementById("edVerified").checked=false;
  document.getElementById("delBtn").classList.add("hidden");updatePreview();show("editor");}
function editCurrent(){if(!currentSong)return;editingId=currentSong.id;
  document.getElementById("editorTitle").textContent="Edit Song";
  document.getElementById("edTitle").value=currentSong.title||"";
  document.getElementById("edArtist").value=currentSong.artist||"";
  document.getElementById("edKey").value=currentSong.song_key||"";
  document.getElementById("edCapo").value=String(currentSong.capo||0);
  document.getElementById("edBpm").value=currentSong.bpm||"";
  document.getElementById("edBody").value=currentSong.body||"";
  document.getElementById("edNote").value=currentSong.notes||"";
  document.getElementById("edVerified").checked=!!currentSong.verified;
  document.getElementById("delBtn").classList.remove("hidden");updatePreview();show("editor");}
function closeEditor(){if(currentSong&&editingId){openSong(editingId,setIdx>=0);}else{goHome();}}
function updatePreview(){document.getElementById("edPreview").innerHTML=
  renderCP(document.getElementById("edBody").value,0)||'<span style="color:var(--muted)">Preview appears here&hellip;</span>';}
async function saveSong(){
  const title=document.getElementById("edTitle").value.trim();
  if(!title){alert("Please enter a song title.");return;}
  const bpmVal=parseInt(document.getElementById("edBpm").value,10);
  const p={title:title,artist:document.getElementById("edArtist").value.trim(),
    song_key:document.getElementById("edKey").value,capo:parseInt(document.getElementById("edCapo").value,10)||0,
    bpm:isNaN(bpmVal)?null:bpmVal,
    verified:document.getElementById("edVerified").checked,
    body:document.getElementById("edBody").value,notes:document.getElementById("edNote").value.trim(),updated_at:new Date().toISOString()};
  const res=editingId?await sb.from("songs").update(p).eq("id",editingId):await sb.from("songs").insert(p).select();
  if(res.error){alert("Couldn't save: "+res.error.message);return;}
  await loadSongs();updateCounts();goHome();}
async function deleteSong(){if(!editingId)return;if(!confirm("Delete this song permanently?"))return;
  const{error}=await sb.from("songs").delete().eq("id",editingId);if(error){alert(error.message);return;}
  await loadSongs();updateCounts();goHome();}

/* ---------- STICKY NOTE (text + draw) ---------- */
let stkMode="text", stkCtx=null, stkDrawing=false, stkDirty=false;
function openNoteSheet(){
  if(!currentSong)return;
  const pn=currentPrefs||{};
  document.getElementById("stkText").value=pn.notes||"";
  setStkMode("text");
  const canvas=document.getElementById("stkCanvas");
  setupCanvas();
  if(stkCtx){stkCtx.clearRect(0,0,canvas.width,canvas.height);}
  if(pn.sticky_draw){ const img=new Image(); img.onload=function(){ stkCtx.drawImage(img,0,0,canvas.width,canvas.height); }; img.src=pn.sticky_draw; }
  document.getElementById("sheetBg").classList.add("open");
  document.getElementById("noteSheet").classList.add("open");
}
function setStkMode(m){
  stkMode=m;
  document.getElementById("stkText").classList.toggle("hidden",m!=="text");
  document.getElementById("stkCanvas").classList.toggle("hidden",m!=="draw");
  const t=document.getElementById("stkModeText"),d=document.getElementById("stkModeDraw");
  if(m==="text"){t.style.background="#1a1400";t.style.color="#f5c518";d.style.background="rgba(26,20,0,0.15)";d.style.color="#1a1400";}
  else{d.style.background="#1a1400";d.style.color="#f5c518";t.style.background="rgba(26,20,0,0.15)";t.style.color="#1a1400";setupCanvas();}
}
window.stkText=function(){setStkMode("text");};
window.stkDraw=function(){setStkMode("draw");};
function setupCanvas(){
  const canvas=document.getElementById("stkCanvas");
  if(canvas.width===0||canvas._init!==true){
    const r=canvas.getBoundingClientRect();
    canvas.width=r.width||600; canvas.height=r.height||220; canvas._init=true;
  }
  stkCtx=canvas.getContext("2d");
  stkCtx.lineWidth=3; stkCtx.lineCap="round"; stkCtx.strokeStyle="#1a1400";
  if(!canvas._bound){
    canvas._bound=true;
    const pos=function(e){const r=canvas.getBoundingClientRect();const p=e.touches?e.touches[0]:e;
      return {x:(p.clientX-r.left)*(canvas.width/r.width),y:(p.clientY-r.top)*(canvas.height/r.height)};};
    const start=function(e){e.preventDefault();stkDrawing=true;const c=pos(e);stkCtx.beginPath();stkCtx.moveTo(c.x,c.y);};
    const move=function(e){if(!stkDrawing)return;e.preventDefault();const c=pos(e);stkCtx.lineTo(c.x,c.y);stkCtx.stroke();stkDirty=true;};
    const end=function(){stkDrawing=false;};
    canvas.addEventListener("mousedown",start);canvas.addEventListener("mousemove",move);window.addEventListener("mouseup",end);
    canvas.addEventListener("touchstart",start,{passive:false});canvas.addEventListener("touchmove",move,{passive:false});canvas.addEventListener("touchend",end);
  }
}
window.stkClear=function(){
  if(stkMode==="draw"){const c=document.getElementById("stkCanvas");if(stkCtx)stkCtx.clearRect(0,0,c.width,c.height);stkDirty=true;}
  else{document.getElementById("stkText").value="";}
};
async function saveNote(){
  if(!currentMember){alert("Pick your profile first (top of the sidebar) so notes save to you.");return;}
  const t=document.getElementById("stkText").value.trim();
  let draw=(currentPrefs&&currentPrefs.sticky_draw)||"";
  try{ const c=document.getElementById("stkCanvas"); if(stkDirty||draw){ draw=isCanvasBlank(c)?"":c.toDataURL("image/png"); } }catch(e){}
  try{
    await sb.from("member_prefs").upsert({
      member_id:currentMember.id, song_id:currentSong.id,
      capo:capoView, transpose:tr, font:font, notes:t, sticky_draw:draw
    },{onConflict:"member_id,song_id"});
  }catch(err){ /* offline: still update local view */ }
  currentPrefs=currentPrefs||{};currentPrefs.notes=t;currentPrefs.sticky_draw=draw;
  stkDirty=false;closeSheets();renderPerform();
  document.getElementById("noteBtn").style.color=(t||draw)?"var(--amber)":"";
}
function isCanvasBlank(c){try{const b=c.getContext("2d").getImageData(0,0,c.width,c.height).data;for(let i=3;i<b.length;i+=4){if(b[i]!==0)return false;}return true;}catch(e){return true;}}


/* ---------- SETS ---------- */
async function createSet(){const name=(prompt("Name this setlist:")||"").trim();
  if(!name){alert("Type a setlist name in the search box, then tap +.");return;}
  const{error}=await sb.from("setlists").insert({name:name,song_ids:[],archived:false});
  if(error){alert(error.message);return;}await loadSetlists();updateCounts();renderSidebar();}
function openSet(id){currentSet=SETLISTS.find(function(s){return s.id===id;});if(!currentSet)return;
  document.getElementById("sdSearch").value="";renderSetDetail();renderSidebar();
  document.getElementById("archiveBtn").innerHTML=currentSet.archived?"&#128229;":"&#128230;";
  show("setdetail");}
function renderSetDetail(){
  document.getElementById("sdName").textContent=currentSet.name;
  const ids=currentSet.song_ids||[];
  document.getElementById("sdSub").textContent=ids.length+" song"+(ids.length===1?"":"s")+(currentSet.archived?" · archived":"");
  const q=(document.getElementById("sdSearch").value||"").toLowerCase();
  const wrap=document.getElementById("sdSongs");
  const rows=ids.map(function(sid,i){return {sid:sid,i:i,s:SONGS.find(function(x){return x.id===sid;})};})
    .filter(function(r){return r.s&&((r.s.title||"").toLowerCase().indexOf(q)!==-1);});
  if(!rows.length){wrap.innerHTML='<div class="empty">'+(ids.length?"No songs match.":"No songs yet.<br>Tap + to add from your library.")+"</div>";return;}
  const parts=rows.map(function(r){
    var out=[];
    out.push('<div class="set-song" data-id="'+r.sid+'" data-i="'+r.i+'" data-setidx="'+r.i+'" data-setsong="'+r.sid+'">');
    out.push('<span class="num">'+(r.i+1)+'</span>');
    out.push('<span class="nm" data-act="openFromSet" data-id="'+r.sid+'">'+esc(r.s.title)+(r.s.song_key?' <small>&middot; '+esc(r.s.song_key)+'</small>':'')+'</span>');
    out.push('<button class="setmenu" data-act="openSetCtxBtn" data-id="'+r.sid+'" data-setidx="'+r.i+'">&#8942;</button>');
    out.push('</div>');
    return out.join("");
  });
  wrap.innerHTML=parts.join("");
  enableDrag();
}
function openFromSet(sid){const ids=currentSet.song_ids||[];setIdx=ids.indexOf(sid);openSong(sid,true);}
function playSet(){const ids=currentSet.song_ids||[];if(!ids.length){alert("This setlist is empty.");return;}setIdx=0;openSong(ids[0],true);}

/* ---------- PDF (one song per page) ---------- */
function songPlainHtml(s){
  // render chords-above-lyrics in monospace for print
  var body=renderCP(s.body||"",0);
  return '<div class="pg">'+
    '<h2>'+esc(s.title)+(s.song_key?' <span class="k">Key of '+esc(s.song_key)+'</span>':'')+(s.bpm?' <span class="k">'+s.bpm+' BPM</span>':'')+'</h2>'+
    '<div class="cp">'+body+'</div></div>';
}
function sharePdf(){
  const ids=currentSet.song_ids||[];
  if(!ids.length){alert("This setlist is empty.");return;}
  const songs=ids.map(function(id){return SONGS.find(function(s){return s.id===id;});}).filter(Boolean);
  var inner=songs.map(songPlainHtml).join("");
  var baseCss='@page{margin:1.5cm;}body{font-family:Arial,sans-serif;color:#000;}'
    +'.pg{page-break-after:always;}'
    +'h2{font-size:20px;margin:0 0 14px;border-bottom:2px solid #000;padding-bottom:6px;}'
    +'h2 .k{font-size:13px;font-weight:normal;color:#555;float:right;}'
    +'.cp{font-family:\'Courier New\',monospace;font-size:13px;line-height:1.35;white-space:pre-wrap;}'
    +'.cp .sec{font-family:Arial;font-weight:bold;text-transform:uppercase;font-size:12px;margin:12px 0 4px;color:#000;}'
    +'.cp .chordrow{font-weight:bold;white-space:pre;}'
    +'.cp .lyricrow{white-space:pre;margin-bottom:4px;}'
    +'.cp .songtitle{display:none;}';
  var fullHtml='<html><head><meta charset="utf-8"><title>'+esc(currentSet.name)+'</title><style>'+baseCss+'</style></head><body>'+inner+'</body></html>';
  // Installed app: use native Android printing
  if(window.AndroidPrint&&window.AndroidPrint.printHtml){ try{ window.AndroidPrint.printHtml(fullHtml, currentSet.name||"Setlist"); return; }catch(e){} }
  // Browser fallback: print the page via a print-only overlay
  var oldA=document.getElementById("__printarea"); if(oldA){try{oldA.remove();}catch(e){}}
  var printCss='@media screen{#__printarea{display:none!important;}}'
    +'@media print{body>*:not(#__printarea){display:none!important;}'
    +'#__printarea{display:block!important;color:#000;background:#fff;font-family:Arial,sans-serif;}'
    +'#__printarea .pg{page-break-after:always;}'
    +'#__printarea h2{font-size:20px;margin:0 0 14px;border-bottom:2px solid #000;padding-bottom:6px;}'
    +'#__printarea h2 .k{font-size:13px;font-weight:normal;color:#555;float:right;}'
    +'#__printarea .cp{font-family:\'Courier New\',monospace;font-size:13px;line-height:1.35;white-space:pre-wrap;}'
    +'#__printarea .cp .sec{font-family:Arial;font-weight:bold;text-transform:uppercase;font-size:12px;margin:12px 0 4px;}'
    +'#__printarea .cp .chordrow{font-weight:bold;white-space:pre;}'
    +'#__printarea .cp .lyricrow{white-space:pre;margin-bottom:4px;}'
    +'#__printarea .cp .songtitle{display:none;}@page{margin:1.5cm;}}';
  var area=document.createElement("div"); area.id="__printarea";
  area.innerHTML='<style id="__printcss">'+printCss+'</style>'+inner;
  document.body.appendChild(area);
  setTimeout(function(){ try{window.print();}catch(e){} },300);
}
/* ---------- SHARE LINK (read-only view) ---------- */
function shareLink(){
  const url="https://lewendew.co.za/songs/?set="+encodeURIComponent(currentSet.id);
  const text=currentSet.name+" \u2014 Living Waters worship set:\n"+url;
  if(navigator.share){ navigator.share({title:currentSet.name,text:currentSet.name,url:url}).catch(function(){}); }
  else if(navigator.clipboard){ navigator.clipboard.writeText(url).then(function(){alert("Link copied!\n"+url);},function(){prompt("Copy this link:",url);}); }
  else { prompt("Copy this link:",url); }
}
function updateNav(){if(setIdx<0||!currentSet)return;const ids=currentSet.song_ids||[];
  document.getElementById("pfPrev").disabled=setIdx<=0;
  document.getElementById("pfNext").disabled=setIdx>=ids.length-1;
  document.getElementById("pfPos").textContent=(setIdx+1)+" / "+ids.length;}
function setPrev(){const ids=currentSet.song_ids||[];if(setIdx>0){setIdx--;openSong(ids[setIdx],true);}}
function setNext(){const ids=currentSet.song_ids||[];if(setIdx<ids.length-1){setIdx++;openSong(ids[setIdx],true);}}
async function removeFromSet(sid){const ids=(currentSet.song_ids||[]).filter(function(x){return x!==sid;});
  const{error}=await sb.from("setlists").update({song_ids:ids}).eq("id",currentSet.id);if(error){alert(error.message);return;}
  currentSet.song_ids=ids;renderSetDetail();loadSetlists();}
async function archiveToggle(){const nv=!currentSet.archived;
  const{error}=await sb.from("setlists").update({archived:nv}).eq("id",currentSet.id);if(error){alert(error.message);return;}
  currentSet.archived=nv;await loadSetlists();updateCounts();renderSidebar();openSet(currentSet.id);}
async function deleteSet(){if(!confirm('Delete "'+currentSet.name+'"? Songs stay in your library.'))return;
  const{error}=await sb.from("setlists").delete().eq("id",currentSet.id);if(error){alert(error.message);return;}
  currentSet=null;await loadSetlists();updateCounts();goHome();}

/* ---------- PICKER ---------- */
function openPicker(){document.getElementById("pkSub").textContent=currentSet.name;document.getElementById("pkSearch").value="";renderPicker();show("picker");}
function closePicker(){openSet(currentSet.id);}
function renderPicker(){
  const q=(document.getElementById("pkSearch").value||"").toLowerCase();
  const inSet=currentSet.song_ids||[];
  const f=SONGS.filter(function(s){return (s.title||"").toLowerCase().indexOf(q)!==-1||(s.artist||"").toLowerCase().indexOf(q)!==-1;});
  const list=document.getElementById("pkList");
  if(!f.length){list.innerHTML='<div class="empty">No songs found.</div>';return;}
  list.innerHTML=f.map(function(s){const added=inSet.indexOf(s.id)!==-1;
    return '<div class="card" data-act="pickSong" data-id="'+s.id+'">'+
      '<div class="idx">'+(added?"&#10003;":"+")+"</div>"+
      '<div class="meta"><strong>'+esc(s.title)+"</strong>"+(s.artist?"<span>"+esc(s.artist)+"</span>":"")+"</div>"+
      (s.song_key?'<div class="keytag">'+esc(s.song_key)+"</div>":"")+"</div>";
  }).join("");
}
async function pickSong(sid){const ids=(currentSet.song_ids||[]).slice();
  const at=ids.indexOf(sid);if(at!==-1){ids.splice(at,1);}else{ids.push(sid);}
  const{error}=await sb.from("setlists").update({song_ids:ids}).eq("id",currentSet.id);if(error){alert(error.message);return;}
  currentSet.song_ids=ids;renderPicker();loadSetlists();}

/* ---------- DRAG REORDER (hold anywhere on row, then drag) ---------- */
/* Shared drag state (one copy for the whole app) and page-level listeners that
   are bound ONCE. The old version re-added document listeners on every redraw,
   which stacked up and swallowed taps ("works on the 3rd press"). */
var _drag={timer:null,el:null,on:false,y0:0,moved:false,onName:false};
var _dragDocBound=false;
function _dragRowFromPoint(y){
  var wrap=document.getElementById("sdSongs");if(!wrap)return null;
  var rows=wrap.querySelectorAll(".set-song");
  for(var i=0;i<rows.length;i++){ var rr=rows[i]; if(rr===_drag.el)continue;
    var b=rr.getBoundingClientRect();
    if(y>=b.top&&y<=b.bottom)return {row:rr,after:y>b.top+b.height/2};
  }
  return null;
}
function _dragMoveTo(y){
  var hit=_dragRowFromPoint(y),wrap=document.getElementById("sdSongs");
  if(hit&&wrap)wrap.insertBefore(_drag.el,hit.after?hit.row.nextSibling:hit.row);
}
function _dragCancelHold(){ if(_drag.timer){clearTimeout(_drag.timer);_drag.timer=null;} }
function _dragBegin(row,y){
  _drag.y0=y;_drag.moved=false;
  _drag.timer=setTimeout(function(){
    _drag.on=true;_drag.el=row;row.classList.add("dragging");
    if(navigator.vibrate)try{navigator.vibrate(20);}catch(e){}
  },320); // hold ~1/3 sec to pick up
}
function _dragEnd(){
  _dragCancelHold();
  if(_drag.on&&_drag.el){_drag.el.classList.remove("dragging");_drag.el=null;_drag.on=false;saveOrder();}
}
function enableDrag(){
  var wrap=document.getElementById("sdSongs");if(!wrap)return;
  wrap.querySelectorAll(".set-song").forEach(function(row){
    row.addEventListener("touchstart",function(e){
      if(e.target.closest(".setmenu"))return;        // ⋮ menu handles itself
      _drag.onName=!!e.target.closest(".nm");         // was the touch on the title?
      _dragBegin(row,e.touches[0].clientY);
    },{passive:true});
    row.addEventListener("touchmove",function(e){
      var y=e.touches[0].clientY;
      if(!_drag.on){ if(Math.abs(y-_drag.y0)>10){_drag.moved=true;_dragCancelHold();} return; }
      e.preventDefault();_dragMoveTo(y);
    },{passive:false});
    row.addEventListener("touchend",function(e){
      var wasDragging=_drag.on;
      _dragEnd();
      // a clean, short tap on the title opens the song immediately
      // (don't wait for the browser's ghost click, which the drag code could cancel)
      if(!wasDragging&&!_drag.moved&&_drag.onName){
        e.preventDefault();
        var sid=row.getAttribute("data-id");
        row.classList.add("flash");setTimeout(function(){row.classList.remove("flash");},180);
        openFromSet(sid);
      }
      _drag.onName=false;
    });
    row.addEventListener("touchcancel",function(){_dragEnd();_drag.onName=false;});
    row.addEventListener("mousedown",function(e){
      if(e.target.closest(".setmenu"))return;
      _dragBegin(row,e.clientY);
    });
  });
  if(!_dragDocBound){
    _dragDocBound=true;
    document.addEventListener("mousemove",function(e){
      if(!_drag.on){ if(_drag.timer&&Math.abs(e.clientY-_drag.y0)>10)_dragCancelHold(); return; }
      e.preventDefault();_dragMoveTo(e.clientY);
    });
    document.addEventListener("mouseup",_dragEnd);
  }
}
async function saveOrder(){
  const ids=Array.prototype.map.call(document.querySelectorAll("#sdSongs .set-song"),function(r){return r.dataset.id;});
  currentSet.song_ids=ids;
  try{var _r=await sb.from("setlists").update({song_ids:ids}).eq("id",currentSet.id);if(_r&&_r.error)throw _r.error;}
  catch(e){saveFailedToast();}
  renderSetDetail();}

/* ---------- ADD CURRENT TO SET (from perform) ---------- */
async function addToSet(){if(!currentSong)return;await loadSetlists();
  const active=SETLISTS.filter(function(s){return !s.archived;});
  if(!active.length){alert("No active setlists. Create one in the Sets tab first.");return;}
  const names=active.map(function(s,i){return (i+1)+". "+s.name;}).join("\n");
  const pick=prompt('Add "'+currentSong.title+'" to which setlist?\n\n'+names+"\n\nType the number:");
  if(!pick)return;const idx=parseInt(pick,10)-1;if(isNaN(idx)||idx<0||idx>=active.length){alert("Invalid choice.");return;}
  const set=active[idx],ids=(set.song_ids||[]).slice();
  if(ids.indexOf(currentSong.id)!==-1){alert('Already in "'+set.name+'".');return;}
  ids.push(currentSong.id);const{error}=await sb.from("setlists").update({song_ids:ids}).eq("id",set.id);
  if(error){alert(error.message);return;}alert("Added to "+set.name+" \u2713");loadSetlists();}

/* ---------- SETTINGS / SHEETS ---------- */
function buildSwatches(){const wrap=document.getElementById("swatches"),cur=getColor();wrap.innerHTML="";
  COLORS.forEach(function(c){const b=document.createElement("button");b.className="sw-c"+(c.h===cur?" sel":"");
    b.style.background=c.h;b.title=c.n;b.addEventListener("click",function(){
      applyColor(c.h);buildSwatches();
      // save to this member's profile so their colour follows them
      if(currentMember){currentMember.color=c.h;sb.from("band_members").update({color:c.h}).eq("id",currentMember.id).then(function(){},function(){});}
      if(currentSong&&!document.getElementById("mv-perform").classList.contains("hidden"))renderPerform();
      updatePreview();
    });
    wrap.appendChild(b);});}
function openSettings(){document.getElementById("sheetBg").classList.add("open");document.getElementById("settingsSheet").classList.add("open");}
function closeSheets(){document.getElementById("sheetBg").classList.remove("open");
  document.getElementById("settingsSheet").classList.remove("open");document.getElementById("noteSheet").classList.remove("open");}
function lockPin(){try{localStorage.removeItem("lwSongsPin");}catch(e){}location.reload();}

/* ════════════════════════════════════════════════
   BAND PROFILES  +  per-person capo/transpose/font
   ════════════════════════════════════════════════ */
async function startProfiles(){
  await loadMembers();
  const saved=(function(){try{return localStorage.getItem("lwMember");}catch(e){return null;}})();
  const found=saved?MEMBERS.find(function(m){return m.id===saved;}):null;
  if(found){ currentMember=found; enterApp(); }
  else { renderProfileList(); document.getElementById("profileGate").classList.remove("hidden"); }
}
async function loadMembers(){
  try{
    const res=await withTimeout(sb.from("band_members").select("*").order("name"),4000);
    if(!res||res._timeout||res.error)throw (res&&res.error)||"timeout";
    MEMBERS=res.data||[];
    try{localStorage.setItem("lwCacheMembers",JSON.stringify(MEMBERS));}catch(e){}
  }catch(err){
    try{MEMBERS=JSON.parse(localStorage.getItem("lwCacheMembers")||"[]");}catch(e){MEMBERS=[];}
  }
}
function renderProfileList(){
  const list=document.getElementById("profileList");
  if(!MEMBERS.length){list.innerHTML='<div style="text-align:center;color:var(--muted);padding:1rem 0 1.4rem;">No profiles yet. Add your name below.</div>';return;}
  list.innerHTML=MEMBERS.map(function(m){
    return '<div class="card" data-pact="pickProfile" data-id="'+m.id+'" style="margin-bottom:0.55rem;">'+
      '<div class="idx" style="background:var(--accent-dim);color:var(--accent);border-color:transparent;">'+esc((m.name||"?").charAt(0).toUpperCase())+'</div>'+
      '<div class="meta"><strong>'+esc(m.name)+'</strong></div>'+
      '<span class="rm" data-pact="delProfile" data-id="'+m.id+'" style="color:var(--muted2);">Remove</span></div>';
  }).join("");
}
function enterApp(){
  document.getElementById("profileGate").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  const chip=document.getElementById("profileChipName");
  if(chip)chip.textContent=currentMember?currentMember.name:"Me";
  // apply this member's personal colour (follows them across devices)
  if(currentMember&&currentMember.color){ applyColor(currentMember.color); }
  if(window._appInited){ buildSwatches(); }
  if(!window._appInited){ initApp(); window._appInited=true; }
  else { goHome(); }
}
function switchProfile(){
  try{localStorage.removeItem("lwMember");}catch(e){}
  currentMember=null;
  loadMembers().then(function(){renderProfileList();
    document.getElementById("app").classList.add("hidden");
    document.getElementById("profileGate").classList.remove("hidden");});
}
window.switchProfile=switchProfile;

/* profile picker event delegation (separate from main app, works pre-init) */
document.body.addEventListener("click",function(e){
  const el=e.target.closest("[data-pact]");if(!el)return;
  e.stopPropagation();
  const a=el.dataset.pact,id=el.dataset.id;
  if(a==="addProfile")addProfile();
  else if(a==="pickProfile")pickProfile(id);
  else if(a==="delProfile")delProfile(id,e);
});
async function addProfile(){
  const inp=document.getElementById("newProfileName");
  const name=(inp.value||"").trim();
  if(!name){inp.focus();return;}
  const{data,error}=await sb.from("band_members").insert({name:name}).select();
  if(error){alert(error.message);return;}
  inp.value="";await loadMembers();renderProfileList();
}
function pickProfile(id){
  currentMember=MEMBERS.find(function(m){return m.id===id;});
  if(!currentMember)return;
  try{localStorage.setItem("lwMember",currentMember.id);}catch(e){}
  enterApp();
}
async function delProfile(id,e){
  if(e)e.stopPropagation();
  const m=MEMBERS.find(function(x){return x.id===id;});
  if(!m)return;
  if(!confirm('Remove profile "'+m.name+'"? Their saved capo/keys are removed too.'))return;
  await sb.from("band_members").delete().eq("id",id);
  await loadMembers();renderProfileList();
}

/* load this member's saved capo/transpose/font for a song */
function _prefKey(songId){ return "lwPref_"+(currentMember?currentMember.id:"x")+"_"+songId; }
async function loadPrefs(songId){
  if(!currentMember)return null;
  var cached=null; try{cached=JSON.parse(localStorage.getItem(_prefKey(songId))||"null");}catch(e){}
  // offline / known-bad connection: use the cached settings instantly, never hang
  if(!navigator.onLine||_offlineMode) return cached;
  try{
    const res=await withTimeout(sb.from("member_prefs").select("*").eq("member_id",currentMember.id).eq("song_id",songId).single(),2500);
    if(res&&res._timeout){ _offlineMode=true; return cached; }   // bad connection — stop trying
    if(res&&res.data){ try{localStorage.setItem(_prefKey(songId),JSON.stringify(res.data));}catch(e){} return res.data; }
    return cached;
  }catch(e){ return cached; }
}
/* save (debounced) this member's prefs for the current song */
function queueSavePrefs(){
  if(!currentMember||!currentSong)return;
  clearTimeout(prefsSaveTimer);
  prefsSaveTimer=setTimeout(async function(){
    var pr={member_id:currentMember.id, song_id:currentSong.id,
      capo:capoView, transpose:tr, font:font,
      notes:(currentPrefs&&currentPrefs.notes)||"", sticky_draw:(currentPrefs&&currentPrefs.sticky_draw)||""};
    try{localStorage.setItem(_prefKey(currentSong.id),JSON.stringify(pr));}catch(e){} // keep local copy fresh
    try{
      const{error}=await sb.from("member_prefs").upsert(pr,{onConflict:"member_id,song_id"});
      if(error)throw error;
    }catch(e){ saveFailedToast(); }
  },500);
}

/* ════════════════════════════════════════════════
   IMPORT SONGS  (files + paste, auto-detect format)
   ════════════════════════════════════════════════ */
(function(){
  const k=document.getElementById("impKey");
  if(k)NOTES.forEach(function(n){const o=document.createElement("option");o.value=n;o.textContent=n;k.appendChild(o);});
})();

function openImport(){
  ["impTitle","impArtist","impBody"].forEach(function(x){var el=document.getElementById(x);if(el)el.value="";});
  document.getElementById("impKey").value="";
  document.getElementById("importLog").innerHTML="";
  document.getElementById("impPreview").innerHTML='<span style="color:var(--muted)">Preview appears here&hellip;</span>';
  show("import");
  const ta=document.getElementById("impBody");
  ta.oninput=function(){document.getElementById("impPreview").innerHTML=renderCP(normalizeChords(ta.value),0)||'<span style="color:var(--muted)">Preview appears here&hellip;</span>';};
}
function closeImport(){goHome();}
function pickFiles(){document.getElementById("fileInput").click();}

document.getElementById("fileInput").addEventListener("change",async function(e){
  const files=Array.prototype.slice.call(e.target.files||[]);
  if(!files.length)return;
  const log=document.getElementById("importLog");
  log.innerHTML='<div style="color:var(--muted);font-size:0.85rem;">Importing '+files.length+' file'+(files.length===1?"":"s")+"&hellip;</div>";
  let ok=0,fail=0,rows=[];
  for(const f of files){
    try{
      const text=await f.text();
      const title=f.name.replace(/\.[^.]+$/,"").replace(/[_]+/g," ").trim();
      const body=normalizeChords(text);
      const key=guessKey(body);
      rows.push({title:title,artist:"",song_key:key,body:body,capo:0});
      ok++;
    }catch(err){fail++;}
  }
  if(rows.length){
    const{error}=await sb.from("songs").insert(rows);
    if(error){log.innerHTML='<div style="color:var(--accent);">Import failed: '+esc(error.message)+"</div>";return;}
  }
  await loadSongs();updateCounts();
  log.innerHTML='<div style="background:var(--accent-dim);border:1px solid var(--accent);border-radius:12px;padding:0.9rem 1rem;color:var(--text);font-size:0.9rem;">'+
    "&#10003; Imported <strong>"+ok+"</strong> song"+(ok===1?"":"s")+(fail?" &middot; "+fail+" failed":"")+
    '.<br><span style="color:var(--muted);font-size:0.82rem;">Open any song to set its key or tidy it up.</span></div>';
  e.target.value="";
});

async function importPaste(){
  const title=document.getElementById("impTitle").value.trim();
  const raw=document.getElementById("impBody").value;
  if(!title){alert("Give the song a title first.");return;}
  if(!raw.trim()){alert("Paste the lyrics/chords first.");return;}
  const body=normalizeChords(raw);
  const p={title:title,artist:document.getElementById("impArtist").value.trim(),
    song_key:document.getElementById("impKey").value||guessKey(body),body:body,capo:0};
  const{error}=await sb.from("songs").insert(p);
  if(error){alert("Couldn't import: "+error.message);return;}
  await loadSongs();updateCounts();
  document.getElementById("importLog").innerHTML='<div style="background:var(--accent-dim);border:1px solid var(--accent);border-radius:12px;padding:0.9rem 1rem;font-size:0.9rem;">&#10003; Imported "'+esc(title)+'".</div>';
  ["impTitle","impArtist","impBody"].forEach(function(x){document.getElementById(x).value="";});
  document.getElementById("impKey").value="";
  document.getElementById("impPreview").innerHTML='<span style="color:var(--muted)">Preview appears here&hellip;</span>';
}

/* ---- format auto-detect & convert ----
   If a line is "all chords" and the next line is lyrics, merge them into
   inline [chord] format positioned above the right words. If already inline, leave it. */
const CHORD_TOKEN=/^[A-G](#|b)?(m|maj|min|dim|aug|sus|add)?[0-9]?(\/[A-G](#|b)?)?$/;
function isChordLine(line){
  const t=line.trim();
  if(!t)return false;
  if(t.indexOf("[")!==-1)return false;               // already inline
  if(SEC.test(t))return false;                        // section label
  const tokens=t.split(/\s+/);
  if(tokens.length===0)return false;
  let chordCount=0;
  for(const tok of tokens){ if(CHORD_TOKEN.test(tok))chordCount++; }
  return chordCount>0 && chordCount===tokens.length;  // every token is a chord
}
function mergeChordLine(chordLine,lyricLine){
  // place each chord at its column position in the lyric line, as [chord]
  const lyric=lyricLine.replace(/\s+$/,"");
  let result="", li=0;
  // find chord positions by column
  const chords=[];
  let re=/\S+/g,m;
  while((m=re.exec(chordLine))!==null){ chords.push({col:m.index,ch:m[0]}); }
  // build output by walking lyric characters, injecting chords at their column
  const maxLen=Math.max(lyric.length,chordLine.length);
  let ci=0;
  for(let col=0;col<=maxLen;col++){
    while(ci<chords.length && chords[ci].col===col){ result+="["+chords[ci].ch+"]"; ci++; }
    if(col<lyric.length)result+=lyric[col];
  }
  return result;
}
function normalizeChords(text){
  // The app now reads chord-line format natively, so we mostly just clean up:
  // - strip {chordpro directives}
  // - normalise line endings & excess blank lines
  let lines=text.replace(/\r/g,"").split("\n");
  lines=lines.map(function(l){
    const dir=l.match(/^\{(title|t|artist|st|subtitle|key|c|comment|ci|soc|eoc|sov|eov)\s*:?\s*(.*)\}$/i);
    if(dir){
      const val=(dir[2]||"").trim();
      if(/^(verse|chorus|bridge|intro|outro|tag)/i.test(val))return val;
      return "";
    }
    if(/^\{.*\}$/.test(l))return "";
    // if a line is inline [C] ChordPro, split it into a chord row + lyric row
    if(l.indexOf("[")!==-1){ return inlineToChordLines(l); }
    return l;
  });
  return lines.join("\n").replace(/\n{3,}/g,"\n\n").trim();
}
/* convert an inline [C]word line into two lines: chords above, lyric below */
function inlineToChordLines(line){
  let re=/\[([^\]]+)\]/g,last=0,m,segs=[];
  while((m=re.exec(line))!==null){ if(m.index>last)segs.push({ch:null,ly:line.slice(last,m.index)}); segs.push({ch:m[1],ly:""}); last=re.lastIndex; }
  if(last<line.length)segs.push({ch:null,ly:line.slice(last)});
  let chordLine="",lyricLine="";
  for(let i=0;i<segs.length;i++){
    const s=segs[i];
    if(s.ch!==null){ let ly=""; if(segs[i+1]&&segs[i+1].ch===null){ ly=segs[i+1].ly; i++; }
      while(chordLine.length<lyricLine.length)chordLine+=" "; chordLine+=s.ch; lyricLine+=ly;
    }else{ lyricLine+=s.ly; }
  }
  const cl=chordLine.replace(/\s+$/,"");
  return (cl?cl+"\n":"")+lyricLine;
}
/* guess key from first chord token found */
function guessKey(body){
  const lines=(body||"").split("\n");
  for(const l of lines){ if(isChordOnly(l)){ const t=l.trim().split(/\s+/)[0]; const m=t.match(/^\(?([A-G](#|b)?)/); if(m)return m[1]; } }
  const m2=body.match(/\[([A-G](#|b)?)/); return m2?m2[1]:"";
}
