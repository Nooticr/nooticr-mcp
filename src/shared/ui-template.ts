/**
 * MCP Apps HTML UI template for Orchyn tools.
 *
 * Features:
 * - Skeleton loading shimmer while tool executes
 * - Smooth fade-in transitions when data arrives
 * - Expandable analysis sections (click to expand/collapse)
 * - Click-to-copy on hashtags, hooks, quotes
 * - Hover micro-interactions on cards
 * - Dark/light theme auto-detection
 * - Progress indicator for multi-step tools
 * - Responsive layout
 */

export const ORCHYN_UI_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Orchyn</title>
<style>
:root{
  --bg:#fafbfc;--fg:#111827;--muted:#6b7280;--border:#e5e7eb;
  --card:#fff;--card-hover:#f9fafb;--tag:#f3f4f6;--accent:#14151a;
  --shadow-sm:0 1px 2px rgba(0,0,0,.05);--shadow-md:0 4px 12px rgba(0,0,0,.08);
  --shadow-lg:0 8px 24px rgba(0,0,0,.12);--radius:12px;--radius-sm:8px;
  --transition:all .25s cubic-bezier(.4,0,.2,1);
  --green:#10b981;--amber:#f59e0b;--red:#ef4444;--blue:#3b82f6;
}
@media(prefers-color-scheme:dark){:root{
  --bg:#0f172a;--fg:#f1f5f9;--muted:#94a3b8;--border:#1e293b;
  --card:#1e293b;--card-hover:#273548;--tag:#1e293b;--accent:#e2e8f0;
  --shadow-sm:0 1px 2px rgba(0,0,0,.2);--shadow-md:0 4px 12px rgba(0,0,0,.3);
  --shadow-lg:0 8px 24px rgba(0,0,0,.4);
}}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--bg);color:var(--fg);padding:16px;line-height:1.5;}

/* ─── Loading / Skeleton ─── */
.loading-container{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;gap:12px;}
.orchyn-logo{animation:logoSpin 3s ease-in-out infinite;}
@keyframes logoSpin{0%,100%{transform:rotate(0deg) scale(1)}50%{transform:rotate(180deg) scale(1.1)}}
.loading-brand{font-size:18px;font-weight:700;letter-spacing:-0.02em;color:var(--fg);}
.loading-spinner{width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
.loading-text{font-size:13px;color:var(--muted);animation:pulse 1.5s ease-in-out infinite;}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}

.skeleton{background:var(--tag);border-radius:var(--radius-sm);overflow:hidden;position:relative;}
.skeleton::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent);animation:shimmer 1.5s infinite;}
@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.skeleton-thumb{width:100%;height:180px;border-radius:var(--radius) var(--radius) 0 0;}
.skeleton-line{height:14px;margin:8px 14px;border-radius:4px;}
.skeleton-line.short{width:60%;}
.skeleton-line.medium{width:80%;}
.skeleton-badge{width:80px;height:20px;border-radius:999px;margin:12px 14px 0;}
.skeleton-gallery{display:flex;flex-wrap:wrap;gap:10px;}
.skeleton-card{width:300px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--card);}
.skeleton-creator{width:220px;border:1px solid var(--border);border-radius:var(--radius);padding:14px;background:var(--card);}
.skeleton-avatar{width:48px;height:48px;border-radius:50%;margin-bottom:8px;}

/* ─── Content entrance ─── */
.fade-in{animation:fadeIn .4s ease-out;}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.stagger>*{opacity:0;animation:fadeIn .4s ease-out forwards;}
.stagger>*:nth-child(1){animation-delay:.05s}
.stagger>*:nth-child(2){animation-delay:.1s}
.stagger>*:nth-child(3){animation-delay:.15s}
.stagger>*:nth-child(4){animation-delay:.2s}
.stagger>*:nth-child(5){animation-delay:.25s}
.stagger>*:nth-child(6){animation-delay:.3s}
.stagger>*:nth-child(7){animation-delay:.35s}
.stagger>*:nth-child(8){animation-delay:.4s}

/* ─── Cards ─── */
.gallery{display:flex;flex-wrap:wrap;gap:10px;}
.card{border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;width:300px;background:var(--card);display:inline-block;vertical-align:top;box-shadow:var(--shadow-sm);transition:var(--transition);cursor:default;}
.card:hover{box-shadow:var(--shadow-md);transform:translateY(-2px);border-color:var(--muted);}
.card-wide{width:100%;}
.card img{width:100%;height:200px;object-fit:cover;display:block;transition:transform .3s ease;}
.card:hover img{transform:scale(1.02);}
.card-wide img{max-height:340px;}
.card-body{padding:14px 16px;}

/* ─── Badges & Tags ─── */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:capitalize;transition:var(--transition);}
.handle{font-size:12px;color:var(--muted);margin-left:auto;}
.tag{display:inline-flex;align-items:center;gap:3px;padding:4px 10px;border-radius:999px;font-size:12px;margin:2px;transition:var(--transition);cursor:default;}
.tag.clickable{cursor:pointer;user-select:none;}
.tag.clickable:hover{filter:brightness(.9);transform:scale(1.05);}
.tag.clickable:active{transform:scale(.97);}
.tag.copied{background:var(--green)!important;color:#fff!important;}

/* ─── Typography ─── */
.title{font-size:14px;font-weight:600;line-height:1.35;margin:6px 0;}
.card-wide .title{font-size:16px;font-weight:700;}
.caption{font-size:13px;color:var(--muted);line-height:1.5;margin:6px 0 0;}

/* ─── Stats ─── */
.stats{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;}
.stat-pill{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--fg);background:var(--tag);padding:5px 12px;border-radius:999px;transition:var(--transition);}
.stat-pill:hover{background:var(--border);}

/* ─── Buttons ─── */
.btn{display:inline-flex;align-items:center;gap:6px;margin-top:12px;padding:8px 18px;color:#fff;border-radius:999px;text-decoration:none;font-size:13px;font-weight:600;transition:var(--transition);border:none;cursor:pointer;}
.btn:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:var(--shadow-sm);}
.btn:active{transform:translateY(0);filter:brightness(.95);}
.btn-sm{padding:5px 12px;font-size:11px;margin-top:8px;}

/* ─── Sections (expandable) ─── */
.section{margin-bottom:14px;border-radius:var(--radius-sm);overflow:hidden;}
.section-header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--tag);border-radius:var(--radius-sm);cursor:pointer;transition:var(--transition);user-select:none;}
.section-header:hover{background:var(--border);}
.section-label{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;}
.section-chevron{font-size:12px;color:var(--muted);transition:transform .2s ease;}
.section-header.open .section-chevron{transform:rotate(180deg);}
.section-content{padding:10px 12px;max-height:0;overflow:hidden;transition:max-height .3s ease,padding .3s ease;}
.section-content.open{max-height:600px;padding:10px 12px;}
.section-text{font-size:13px;color:var(--fg);line-height:1.6;}

/* ─── Progress bar ─── */
.progress-bar{height:6px;background:var(--tag);border-radius:999px;overflow:hidden;margin:6px 0;}
.progress-fill{height:100%;border-radius:999px;transition:width .6s cubic-bezier(.4,0,.2,1);background:linear-gradient(90deg,var(--blue),var(--green));}

/* ─── Hook strength ─── */
.hook-bar-track{display:flex;align-items:center;gap:10px;margin-top:6px;}
.hook-bar{flex:1;height:10px;background:var(--tag);border-radius:999px;overflow:hidden;}
.hook-bar-fill{height:100%;border-radius:999px;transition:width .8s cubic-bezier(.4,0,.2,1);}
.hook-score{font-size:15px;font-weight:800;min-width:40px;text-align:right;}

/* ─── Quote box ─── */
.quote-box{background:var(--tag);padding:10px 14px;border-radius:var(--radius-sm);font-size:13px;font-weight:600;line-height:1.45;margin:6px 0;border-left:3px solid var(--blue);position:relative;}
.quote-box .copy-btn{position:absolute;top:8px;right:8px;background:var(--card);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:10px;color:var(--muted);cursor:pointer;transition:var(--transition);opacity:0;}
.quote-box:hover .copy-btn{opacity:1;}
.copy-btn:hover{background:var(--accent);color:#fff;}

/* ─── Comments ─── */
.comment-row{padding:10px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;gap:10px;transition:var(--transition);}
.comment-row:last-child{border-bottom:none;}
.comment-row:hover{background:var(--tag);margin:0 -6px;padding:10px 6px;border-radius:var(--radius-sm);}

/* ─── Creator cards ─── */
.creator-card{border:1px solid var(--border);border-radius:var(--radius);padding:16px;width:230px;background:var(--card);display:inline-block;vertical-align:top;margin:4px;box-shadow:var(--shadow-sm);transition:var(--transition);}
.creator-card:hover{box-shadow:var(--shadow-md);transform:translateY(-2px);}
.avatar{width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid var(--border);}
.avatar-placeholder{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;}
.verified{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;color:#fff;font-size:10px;margin-left:4px;}

/* ─── Sound cards ─── */
.sound-card{border:1px solid var(--border);border-radius:var(--radius);padding:14px;width:270px;background:var(--card);display:inline-block;vertical-align:top;margin:4px;box-shadow:var(--shadow-sm);transition:var(--transition);}
.sound-card:hover{box-shadow:var(--shadow-md);transform:translateY(-2px);}
.sound-cover{width:68px;height:68px;border-radius:var(--radius-sm);object-fit:cover;}

/* ─── Credits ─── */
.credits-card{border:1px solid var(--border);border-radius:16px;max-width:380px;background:var(--card);margin:8px 0;padding:24px;box-shadow:var(--shadow-md);}
.tier-badge{display:inline-flex;align-items:center;padding:4px 12px;background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:999px;font-size:12px;color:#1e40af;font-weight:700;}
.free-tag{display:inline-flex;align-items:center;gap:3px;padding:4px 10px;background:linear-gradient(135deg,#d1fae5,#a7f3d0);border-radius:999px;font-size:11px;color:#065f46;font-weight:600;margin:2px;transition:var(--transition);}
.free-tag:hover{transform:scale(1.05);}

/* ─── JSON fallback ─── */
.json-block{background:var(--tag);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;font-size:12px;font-family:'SF Mono',Monaco,monospace;white-space:pre-wrap;word-break:break-all;max-height:320px;overflow-y:auto;margin-top:10px;}

/* ─── Empty state ─── */
.empty-state{text-align:center;padding:48px 24px;color:var(--muted);}
.empty-state .icon{font-size:48px;margin-bottom:12px;}
.empty-state .text{font-size:14px;}
</style>
</head>
<body>
<div id="app">
  <div class="loading-container">
    <div class="orchyn-logo">
      <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
        <g fill="var(--accent)" transform="translate(24 24)">
          <circle r="4.1"/>
          <g id="r"><path d="M-2.85 -5.2 L0 -20.6 L2.85 -5.2 L1.15 1.1 L-1.15 1.1 Z"/></g>
          <use href="#r" transform="rotate(45)"/>
          <use href="#r" transform="rotate(90)"/>
          <use href="#r" transform="rotate(135)"/>
          <use href="#r" transform="rotate(180)"/>
          <use href="#r" transform="rotate(225)"/>
          <use href="#r" transform="rotate(270)"/>
          <use href="#r" transform="rotate(315)"/>
        </g>
      </svg>
    </div>
    <div class="loading-brand">Orchyn</div>
    <div class="loading-text">Analyzing…</div>
  </div>
</div>
<script>
(function(){
  var nextId=1;var pending=new Map();
  var loadingTimer=null;
  var currentTool="";

  function send(method,params){
    var id=nextId++;
    return new Promise(function(resolve,reject){
      pending.set(id,{resolve:resolve,reject:reject});
      window.parent.postMessage({jsonrpc:"2.0",id:id,method:method,params:params},"*");
    });
  }

  var toolResultReceived=false;
  window.addEventListener("message",function(ev){
    var d=ev.data;if(!d||typeof d!=="object")return;
    if(d.id&&pending.has(d.id)){
      var p=pending.get(d.id);pending.delete(d.id);
      if(d.error)p.reject(new Error(d.error.message||JSON.stringify(d.error)));
      else p.resolve(d.result);return;
    }
    if(d.method==="ui/notifications/tool-result"){
      toolResultReceived=true;
      clearTimeout(loadingTimer);
      clearTimeout(fallbackTimer);
      render(d.params);
    }
    if(d.method==="ui/notifications/tool-input-partial"){
      currentTool=d.params&&d.params.name?d.params.name:"";
      updateProgress(d.params);
    }
  });

  // Show skeleton after 300ms of waiting (feels instant but shows loading for slow tools)
  loadingTimer=setTimeout(function(){
    var app=document.getElementById("app");
    if(app)app.innerHTML=renderSkeleton(currentTool);
  },300);

  // Fallback: if no tool-result arrives within 3s, check if data is embedded
  // in the page (some hosts pass structuredContent via URL hash or postMessage)
  var fallbackTimer=setTimeout(function(){
    if(toolResultReceived)return;
    // Try to extract data from URL hash (host may pass structuredContent here)
    try{
      var hash=window.location.hash.slice(1);
      if(hash){
        var decoded=JSON.parse(decodeURIComponent(hash));
        if(decoded&&typeof decoded==="object"){render(decoded);return;}
      }
    }catch(e){}
    // Try to extract from URL search params
    try{
      var params=new URLSearchParams(window.location.search);
      var dataParam=params.get("data");
      if(dataParam){
        var decoded=JSON.parse(decodeURIComponent(dataParam));
        if(decoded&&typeof decoded==="object"){render(decoded);return;}
      }
    }catch(e){}
    // Last resort: show a branded card indicating results are available
    var app=document.getElementById("app");
    if(app)app.innerHTML='<div class="card card-wide fade-in"><div class="card-body" style="text-align:center;padding:24px">'
      +'<svg width="28" height="28" viewBox="0 0 48 48" fill="none" style="margin-bottom:8px"><g fill="var(--accent)" transform="translate(24 24)"><circle r="4.1"/><g id="rf"><path d="M-2.85 -5.2 L0 -20.6 L2.85 -5.2 L1.15 1.1 L-1.15 1.1 Z"/></g><use href="#rf" transform="rotate(45)"/><use href="#rf" transform="rotate(90)"/><use href="#rf" transform="rotate(135)"/><use href="#rf" transform="rotate(180)"/><use href="#rf" transform="rotate(225)"/><use href="#rf" transform="rotate(270)"/><use href="#rf" transform="rotate(315)"/></g></svg>'
      +'<div style="font-size:14px;font-weight:600;margin-bottom:4px">✅ Results ready</div>'
      +'<div style="font-size:12px;color:var(--muted)">Orchyn analysis complete — see the full response in the chat.</div>'
      +'</div></div>';
  },3000);

  // MCP Apps handshake
  send("ui/initialize",{
    protocolVersion:"2026-01-26",
    capabilities:{},
    clientInfo:{name:"orchyn-view",version:"2.0.0"}
  }).then(function(){
    window.parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}},"*");
  }).catch(function(){});

  // ─── Helpers ───
  function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function fmtNum(n){n=Number(n)||0;return n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e3?(n/1e3).toFixed(1)+"K":String(n);}
  function pColor(p){return{tiktok:"#000",instagram:"#E1306C",youtube:"#FF0000",douyin:"#000",xiaohongshu:"#FF2442",twitter:"#1DA1F2",x:"#1DA1F2",bilibili:"#00A1D6"}[p]||"#6B7280";}
  function pEmoji(p){return{tiktok:"🎵",instagram:"📸",youtube:"▶️",douyin:"🎶",xiaohongshu:"📕",twitter:"🐦",x:"🐦",bilibili:"📺"}[p]||"🔗";}

  function copyText(text){
    navigator.clipboard.writeText(text).catch(function(){});
  }

  // ─── Skeleton ───
  // Tools that analyze/fetch a single URL: show 1 wide card skeleton
  var SINGLE_URL_TOOLS={analyze_post:1,get_social_media:1,understand_social_post:1,get_post_comments:1,analyze_creator_profile:1};
  // Tools that return galleries: show multiple small card skeletons
  var GALLERY_TOOLS={discover_social_posts:1,get_user_posts:1,search_creators:1,get_similar_creators:1,discover_sounds:1};
  // Tools that return credits/checkout: show 1 credit card skeleton
  var CREDIT_TOOLS={check_orchyn_credits:1,buy_orchyn_credits:1};

  function renderSkeleton(toolName){
    // Branded header above skeletons
    var brandHeader='<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;justify-content:center">'
      +'<svg width="20" height="20" viewBox="0 0 48 48" fill="none"><g fill="var(--accent)" transform="translate(24 24)"><circle r="4.1"/><g id="sb"><path d="M-2.85 -5.2 L0 -20.6 L2.85 -5.2 L1.15 1.1 L-1.15 1.1 Z"/></g><use href="#sb" transform="rotate(45)"/><use href="#sb" transform="rotate(90)"/><use href="#sb" transform="rotate(135)"/><use href="#sb" transform="rotate(180)"/><use href="#sb" transform="rotate(225)"/><use href="#sb" transform="rotate(270)"/><use href="#sb" transform="rotate(315)"/></g></svg>'
      +'<span style="font-size:13px;font-weight:600;color:var(--muted)">Orchyn</span></div>';
    // Single URL tools → 1 wide card skeleton
    if(SINGLE_URL_TOOLS[toolName]){
      return brandHeader+'<div class="fade-in">'
        +'<div class="skeleton-card" style="width:100%">'
        +'<div class="skeleton skeleton-thumb" style="height:220px"></div>'
        +'<div style="padding:14px 16px">'
        +'<div class="skeleton skeleton-badge"></div>'
        +'<div class="skeleton skeleton-line" style="width:90%"></div>'
        +'<div class="skeleton skeleton-line medium"></div>'
        +'<div style="display:flex;gap:6px;margin-top:10px">'
        +'<div class="skeleton" style="width:70px;height:28px;border-radius:999px"></div>'
        +'<div class="skeleton" style="width:60px;height:28px;border-radius:999px"></div>'
        +'<div class="skeleton" style="width:65px;height:28px;border-radius:999px"></div>'
        +'</div></div></div></div>';
    }
    // Credit tools → credit card skeleton
    if(CREDIT_TOOLS[toolName]){
      return brandHeader+'<div class="fade-in" style="max-width:380px">'
        +'<div class="credits-card" style="margin:0">'
        +'<div class="skeleton" style="width:120px;height:20px;margin-bottom:14px"></div>'
        +'<div class="skeleton" style="width:80px;height:40px;margin-bottom:8px"></div>'
        +'<div class="skeleton" style="width:140px;height:14px"></div>'
        +'</div></div>';
    }
    // Gallery tools → multiple small card skeletons
    // Unknown tool → default to 1 wide card (most common case: single URL tools)
    if(!toolName||SINGLE_URL_TOOLS[toolName]||CREDIT_TOOLS[toolName]){
      // Already handled above, but catch unknown tools with single card
      if(!toolName){
        return brandHeader+'<div class="fade-in" style="max-width:520px">'
          +'<div class="skeleton-card" style="width:100%">'
          +'<div class="skeleton skeleton-thumb" style="height:220px"></div>'
          +'<div style="padding:14px 16px">'
          +'<div class="skeleton skeleton-badge"></div>'
          +'<div class="skeleton skeleton-line" style="width:90%"></div>'
          +'<div class="skeleton skeleton-line medium"></div>'
          +'</div></div></div>';
      }
    }
    var count=toolName==='discover_sounds'?4:toolName==='search_creators'||toolName==='get_similar_creators'?3:6;
    return brandHeader+'<div class="skeleton-gallery stagger">'
      +Array(count).fill(0).map(function(){
        return '<div class="skeleton-card">'
          +'<div class="skeleton skeleton-thumb"></div>'
          +'<div class="skeleton skeleton-badge"></div>'
          +'<div class="skeleton skeleton-line medium"></div>'
          +'<div class="skeleton skeleton-line short"></div>'
          +'</div>';
      }).join("")+'</div>';
  }

  // ─── Post Card ───
  function postCard(p,wide){
    var platform=p.platform||"unknown",color=pColor(platform),emoji=pEmoji(platform);
    var title=p.title||p.caption||"",handle=p.creatorHandle||"",url=p.externalUrl||"";
    var thumb=p.thumbnailUrl||"",ct=p.contentType||"post";
    var views=p.views||0,likes=p.likes||0,comments=p.comments||0,shares=p.shares||0;
    var cls=wide?"card card-wide":"card";
    var statsHtml=[[views,"👁️"],[likes,"❤️"],[comments,"💬"],[shares,"🔄"]]
      .filter(function(s){return s[0]>0})
      .map(function(s){return'<span class="stat-pill">'+s[1]+" "+fmtNum(s[0])+"</span>";}).join("");
    var handleHtml=handle?'<span class="handle">@'+esc(handle)+"</span>":"";
    var linkHtml=url?'<a href="'+esc(url)+'" target="_blank" class="btn" style="background:'+color+'">View on '+esc(platform)+' →</a>':"";
    var thumbHtml=thumb?'<img src="'+esc(thumb)+'" alt="thumbnail" loading="lazy"/>':"";
    var ctTag=wide?'<span style="font-size:12px;color:var(--muted);text-transform:capitalize">'+esc(ct)+"</span>":"";
    return '<div class="'+cls+'">'+thumbHtml+'<div class="card-body">'
      +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'
      +'<span class="badge" style="background:'+color+'15;color:'+color+'">'+emoji+" "+esc(platform)+"</span>"
      +ctTag+handleHtml+"</div>"
      +'<div class="title">'+esc(title.length>160?title.slice(0,160)+"…":title)+"</div>"
      +'<div class="stats">'+statsHtml+"</div>"
      +linkHtml+"</div></div>";
  }

  // ─── Creator Card ───
  function creatorCard(c){
    var platform=c.platform||"tiktok",color=pColor(platform),emoji=pEmoji(platform);
    var username=c.username||c.uniqueId||"",nickname=c.nickname||c.displayName||username;
    var followers=c.followers||c.followerCount||0,sig=(c.signature||c.bio||"").slice(0,100);
    var verified=c.verified||false,avatar=c.avatarUrl||c.avatar_thumb||"";
    var avatarHtml=avatar
      ?'<img class="avatar" src="'+esc(avatar)+'" alt="avatar" loading="lazy"/>'
      :'<div class="avatar-placeholder" style="background:'+color+'20">'+emoji+"</div>";
    var vBadge=verified?'<span class="verified" style="background:'+color+'">✓</span>':"";
    return '<div class="creator-card">'
      +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">'
      +avatarHtml+"<div>"
      +'<div style="display:flex;align-items:center"><span style="font-size:14px;font-weight:700">'+esc(nickname)+"</span>"+vBadge+"</div>"
      +'<div class="handle">@'+esc(username)+"</div></div></div>"
      +'<div style="font-size:13px;color:var(--fg);font-weight:600;margin-bottom:6px">'+fmtNum(followers)+" followers</div>"
      +sig?'<div style="font-size:12px;color:var(--muted);line-height:1.4">'+esc(sig)+"</div>":""
      +"</div>";
  }

  // ─── Expandable Section ───
  function section(label,contentHtml,openByDefault){
    var id="sec_"+Math.random().toString(36).slice(2,8);
    return '<div class="section">'
      +'<div class="section-header'+(openByDefault?" open":"")+'" onclick="toggleSection(this)">'
      +'<span class="section-label">'+esc(label)+'</span>'
      +'<span class="section-chevron">▼</span></div>'
      +'<div class="section-content'+(openByDefault?" open":"")+'">'+contentHtml+'</div></div>';
  }

  // ─── Analysis Card ───
  function analysisCard(d){
    var a=d.analysis||{},postHtml=postCard(d.post||d,true);var sections="";
    if(a.summary)sections+=section("Summary",'<div class="section-text">'+esc(a.summary)+"</div>",true);
    if(a.hookStrength!=null){
      var hs=Number(a.hookStrength),pct=Math.min(hs/10*100,100);
      var bc=hs>=7?"var(--green)":hs>=4?"var(--amber)":"var(--red)";
      sections+='<div class="section" style="margin-bottom:14px"><div style="padding:10px 12px">'
        +'<div class="section-label" style="margin-bottom:8px">Hook Strength</div>'
        +'<div class="hook-bar-track">'
        +'<div class="hook-bar"><div class="hook-bar-fill" style="width:'+pct+"%;background:"+bc+'"></div></div>'
        +'<span class="hook-score" style="color:'+bc+'">'+hs+"/10</span></div></div></div>";
    }
    if(a.niche||a.visualStyle){
      var tags="";
      if(a.niche)tags+='<span class="tag clickable" onclick="copyText(this.dataset.v)" data-v="'+esc(a.niche)+'">📍 '+esc(a.niche)+"</span>";
      if(a.visualStyle)tags+='<span class="tag">🎨 '+esc((a.visualStyle||"").slice(0,60))+"</span>";
      sections+='<div style="margin-bottom:12px;display:flex;flex-wrap:wrap;gap:4px">'+tags+"</div>";
    }
    if(a.whyItWorks)sections+=section("Why It Works",'<div class="section-text">'+esc((a.whyItWorks||"").slice(0,400))+"</div>");
    if(a.emotionalArc)sections+=section("Emotional Arc",'<div class="section-text">'+esc(a.emotionalArc)+"</div>");
    if(a.viralTriggers&&a.viralTriggers.length){
      var vt=a.viralTriggers.slice(0,8).map(function(t){return'<span class="tag clickable" onclick="copyText(this.dataset.v)" data-v="'+esc(t)+'">🔥 '+esc(t)+"</span>";}).join("");
      sections+=section("Viral Triggers",vt);
    }
    if(a.suggestedHook)sections+=section("Suggested Hook",'<div class="quote-box">'+esc(a.suggestedHook)+'<button class="copy-btn" onclick="copyText(\\''+esc(a.suggestedHook).replace(/'/g,"\\\\'")+'\\')">Copy</button></div>',true);
    if(a.suggestedHashtags&&a.suggestedHashtags.length){
      var sh=a.suggestedHashtags.slice(0,10).map(function(t){var clean=t.replace(/^#/,"");return'<span class="tag clickable" onclick="copyText(this.dataset.v)" data-v="#'+esc(clean)+'" style="background:#ede9fe;color:#6d28d9">#'+esc(clean)+"</span>";}).join("");
      sections+=section("Hashtags",sh);
    }
    if(a.formatBreakdown)sections+=section("Format Breakdown",'<div class="section-text">'+esc((a.formatBreakdown||"").slice(0,300))+"</div>");
    if(a.negativeSignals&&a.negativeSignals.length){
      var ns=a.negativeSignals.slice(0,6).map(function(n){return'<span class="tag" style="background:#fef2f2;color:#991b1b">⚠️ '+esc(n)+"</span>";}).join("");
      sections+=section("Weaknesses",ns);
    }
    if(a.variationIdeas&&a.variationIdeas.length){
      var vi=a.variationIdeas.slice(0,6).map(function(v){return'<li style="font-size:13px;color:var(--fg);margin:3px 0;padding-left:4px">'+esc(v)+"</li>";}).join("");
      sections+=section("Variation Ideas",'<ul style="margin:0;padding-left:18px">'+vi+"</ul>");
    }
    if(!sections)return postHtml;
    return postHtml+'<div class="card card-wide fade-in" style="margin-top:10px"><div class="card-body">'
      +'<div style="font-size:16px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px">📊 AI Analysis</div>'
      +sections+"</div></div>";
  }

  // ─── Render ───
  function render(result){
    var app=document.getElementById("app");if(!app)return;
    var d=result&&result.structuredContent?result.structuredContent:result;
    if(!d||typeof d!=="object"){app.innerHTML='<div class="json-block fade-in">'+esc(JSON.stringify(d,null,2))+"</div>";return;}

    // Analysis
    if(d.analysis&&(d.post||d.url)){app.innerHTML=analysisCard(d);return;}
    // Posts gallery
    if(d.posts&&Array.isArray(d.posts)){
      if(!d.posts.length){app.innerHTML='<div class="empty-state fade-in"><div class="icon">🔍</div><div class="text">No posts found</div></div>';return;}
      app.innerHTML='<div class="gallery stagger">'+d.posts.map(function(p){return postCard(p,false);}).join("")+"</div>";return;}
    // Creators
    if(d.creators&&Array.isArray(d.creators)){
      if(!d.creators.length){app.innerHTML='<div class="empty-state fade-in"><div class="icon">👤</div><div class="text">No creators found</div></div>';return;}
      app.innerHTML='<div class="gallery stagger">'+d.creators.map(function(c){return creatorCard(c);}).join("")+"</div>";return;}
    // Comments
    if(d.comments&&Array.isArray(d.comments)){
      var ch=d.comments.slice(0,15).map(function(c){
        var user=c.username||c.user||"",text=(c.text||c.comment||"").slice(0,140),likes=c.likes||c.likeCount||0;
        return '<div class="comment-row"><div style="flex:1"><span style="font-size:12px;font-weight:600">@'+esc(user)+"</span>"
          +'<div style="font-size:13px;color:var(--fg);line-height:1.45;margin-top:3px">'+esc(text)+"</div></div>"
          +(likes>0?'<span style="font-size:11px;color:var(--muted);white-space:nowrap">❤️ '+fmtNum(likes)+"</span>":"")+"</div>";
      }).join("");
      app.innerHTML='<div class="card card-wide fade-in"><div class="card-body">'
        +'<div style="font-size:16px;font-weight:700;margin-bottom:12px">💬 Comments ('+d.comments.length+')</div>'+ch+"</div></div>";return;}
    // Sounds
    if(d.sounds&&Array.isArray(d.sounds)){
      app.innerHTML='<div class="gallery stagger">'+d.sounds.map(function(s){
        var color=pColor(s.platform||"tiktok");
        var cover=s.coverUrl?'<img class="sound-cover" src="'+esc(s.coverUrl)+'" alt="cover" loading="lazy"/>'
          :'<div class="sound-cover" style="background:'+color+'15;display:flex;align-items:center;justify-content:center;font-size:26px">🎵</div>';
        var play=s.playUrl||s.url||"";
        var playBtn=play?'<a href="'+esc(play)+'" target="_blank" class="btn btn-sm" style="background:'+color+'">▶ Play</a>':"";
        return '<div class="sound-card"><div style="display:flex;gap:12px;align-items:center">'
          +cover+'<div style="flex:1;min-width:0">'
          +'<div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(s.title||"")+"</div>"
          +'<div style="font-size:12px;color:var(--muted)">'+esc(s.artist||s.author||"")+(s.duration?" • "+esc(s.duration):"")+"</div>"
          +playBtn+"</div></div></div>";
      }).join("")+"</div>";return;}
    // Credits
    if(d.balance!=null||d.tier){
      var bal=Number(d.balance)||0,tier=d.tier||"",ff=d.firstFreeTools||[];
      var freeHtml="";
      if(ff.length){var tags=ff.map(function(t){return'<span class="free-tag">✨ '+esc(t)+" free</span>";}).join("");
        freeHtml='<div style="margin-top:12px"><div class="section-label" style="margin-bottom:6px">Free first uses remaining</div><div style="display:flex;flex-wrap:wrap;gap:4px">'+tags+"</div></div>";}
      app.innerHTML='<div class="credits-card fade-in">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
        +'<div style="font-size:16px;font-weight:700">💰 Your Credits</div>'
        +(tier?'<span class="tier-badge">'+esc(tier)+"</span>":"")+"</div>"
        +'<div style="font-size:36px;font-weight:800;margin:10px 0;letter-spacing:-1px">'+bal+"</div>"
        +'<div style="font-size:13px;color:var(--muted)">credits remaining</div>'+freeHtml+"</div>";return;}
    // Checkout
    if(d.checkoutUrl||d.packs){
      app.innerHTML='<div class="card card-wide fade-in"><div class="card-body">'
        +'<div style="font-size:16px;font-weight:700;margin-bottom:14px">🛒 Credit Packs</div>'
        +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">'
        +'<div style="border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center;transition:var(--transition);cursor:pointer" onmouseover="this.style.borderColor=var(--muted)" onmouseout="this.style.borderColor=var(--border)"><div style="font-size:13px;font-weight:600">Starter</div><div style="font-size:24px;font-weight:800;margin:6px 0">$12.50</div><div style="font-size:12px;color:var(--muted)">500 credits</div></div>'
        +'<div style="border:2px solid var(--accent);border-radius:10px;padding:16px;text-align:center;box-shadow:var(--shadow-md)"><div style="font-size:13px;font-weight:600">Pro ⭐</div><div style="font-size:24px;font-weight:800;margin:6px 0">$40</div><div style="font-size:12px;color:var(--muted)">2,000 credits</div></div>'
        +'<div style="border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center;transition:var(--transition);cursor:pointer" onmouseover="this.style.borderColor=var(--muted)" onmouseout="this.style.borderColor=var(--border)"><div style="font-size:13px;font-weight:600">Scale</div><div style="font-size:24px;font-weight:800;margin:6px 0">$85</div><div style="font-size:12px;color:var(--muted)">5,000 credits</div></div>'
        +"</div></div></div>";return;}
    // Single post
    if(d.post||d.platform){app.innerHTML=postCard(d.post||d,true);return;}
    // Fallback
    app.innerHTML='<div class="json-block fade-in">'+esc(JSON.stringify(d,null,2))+"</div>";
  }

  function updateProgress(params){
    var app=document.getElementById("app");
    if(!app)return;
    // Learn the tool name and re-render skeleton if wrong
    var toolName=params&&params.name?params.name:currentTool;
    if(toolName&&toolName!==currentTool){
      currentTool=toolName;
      // Re-render with the correct skeleton type if still loading
      if(app.querySelector(".loading-spinner")||app.querySelector(".skeleton")){
        app.innerHTML=renderSkeleton(currentTool);
      }
    }
    // Add a progress bar below the existing skeleton (don't replace it)
    var existing=app.innerHTML;
    if(existing.indexOf("progress-bar")===-1){
      app.innerHTML=existing+'<div style="text-align:center;margin-top:12px"><div class="progress-bar" style="width:200px;margin:0 auto"><div class="progress-fill" style="width:60%"></div></div></div>';
    }
  }

  // Global helpers
  window.copyText=copyText;
  window.toggleSection=function(header){
    header.classList.toggle("open");
    var content=header.nextElementSibling;
    if(content)content.classList.toggle("open");
  };
})();
</script>
</body>
</html>`;
