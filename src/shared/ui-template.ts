/**
 * MCP Apps HTML UI template for Orchyn tools.
 *
 * Features:
 * - Content renders when a tool result arrives (no loading screen)
 * - Idle/resource-preview state shows a branded ready view
 * - Smooth fade-in transitions when data arrives
 * - Expandable analysis sections (click to expand/collapse)
 * - Click-to-copy on hashtags, hooks, quotes
 * - Hover micro-interactions on cards
 * - Dark/light theme auto-detection
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
<div id="app"></div>
<script>
(function(){
  var nextId=1;var pending=new Map();
  var currentTool="";

  // ─── Tool-specific idle view ───
  // Read ?tool=<name> from the resource URI to show a tailored idle screen.
  var TOOL_NAMES={
    analyze_post:"Analyze Post",
    discover_social_posts:"Discover Social Posts",
    get_user_posts:"Get User Posts",
    get_social_media:"Get Social Media",
    analyze_creator_profile:"Analyze Creator Profile",
    get_post_comments:"Get Post Comments",
    search_creators:"Search Creators",
    get_similar_creators:"Similar Creators",
    discover_sounds:"Discover Sounds",
    understand_social_post:"Understand Social Post",
    check_orchyn_credits:"Check Credits",
    buy_orchyn_credits:"Buy Credits",
    compose_sequence:"Compose Sequence",
    overlay_bake:"Overlay Bake",
    spawn_variants:"Spawn Variants",
    bake_job_status:"Bake Job Status",
    enqueue_publish_job:"Enqueue Publish",
    schedule_post:"Schedule Post"
  };
  var TOOL_DESCS={
    analyze_post:"Deep analysis of any social media post — hook strength, viral triggers, why it works.",
    discover_social_posts:"Trending posts from any platform for a given niche.",
    get_user_posts:"Recent posts from a specific creator handle.",
    get_social_media:"Get post data from any social media URL.",
    analyze_creator_profile:"Full creator profile analysis — engagement, audience, content style.",
    get_post_comments:"Top comments on a post — sentiment, themes, viral threads.",
    search_creators:"Find creators in a niche by engagement, followers, and content.",
    get_similar_creators:"Find creators similar to a given handle.",
    discover_sounds:"Trending sounds and music on TikTok/Instagram.",
    understand_social_post:"Multimodal understanding of video/image content.",
    check_orchyn_credits:"View your Orchyn credit balance and free tool usage.",
    buy_orchyn_credits:"Purchase additional Orchyn credits.",
    compose_sequence:"AI-powered content composition for social posts.",
    overlay_bake:"Bake text/image overlays onto video or image.",
    spawn_variants:"Generate multiple content variants from a single seed.",
    bake_job_status:"Check the status of a rendering/baking job.",
    enqueue_publish_job:"Queue a post for publishing to a connected platform.",
    schedule_post:"Schedule a post for future publishing."
  };
  function renderIdle(){
    // Extract tool name from URI path segment (e.g. /ui://orchyn/analyze_post → analyze_post)
    // or from ?tool= param if the host passes it.
    var tool="";
    var params=new URLSearchParams(window.location.search);
    tool=params.get("tool")||"";
    if(!tool){
      var path=window.location.pathname;
      var idx=path.indexOf("ui://orchyn/");
      if(idx>=0){var rest=path.substring(idx+12);var end=rest.length;for(var ci=0;ci<rest.length;ci++){var ch=rest.charCodeAt(ci);if(ch===63||ch===35||ch===47){end=ci;break;}}tool=rest.substring(0,end);}

    }
    if(!tool){
      var hash=window.location.hash;
      var idx2=hash.indexOf("ui://orchyn/");
      if(idx2>=0){var rest2=hash.substring(idx2+12);var end2=rest2.length;for(var ci2=0;ci2<rest2.length;ci2++){var ch2=rest2.charCodeAt(ci2);if(ch2===63||ch2===35||ch2===47){end2=ci2;break;}}tool=rest2.substring(0,end2);}

    }
    var label=TOOL_NAMES[tool]||"Interactive View";
    var desc=TOOL_DESCS[tool]||"Results will appear here as soon as a tool returns.";
    var app=document.getElementById("app");
    if(!app)return;
    app.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:220px;text-align:center;padding:40px 24px;background:var(--panel, #0d1117);color:var(--fg, #e6edf3);font-family:system-ui,-apple-system,sans-serif">'
      +'<svg width="44" height="44" viewBox="0 0 48 48" fill="none"><g fill="var(--accent, #3fb950)" transform="translate(24 24)"><circle r="4.1"/><g id="ri"><path d="M-2.85 -5.2 L0 -20.6 L2.85 -5.2 L1.15 1.1 L-1.15 1.1 Z"/></g><use href="#ri" transform="rotate(45)"/><use href="#ri" transform="rotate(90)"/><use href="#ri" transform="rotate(135)"/><use href="#ri" transform="rotate(180)"/><use href="#ri" transform="rotate(225)"/><use href="#ri" transform="rotate(270)"/><use href="#ri" transform="rotate(315)"/></g></svg>'
      +'<div style="margin-top:14px;font-size:17px;font-weight:700">'+label+'</div>'
      +'<div style="margin-top:6px;font-size:13px;color:#8b949e;max-width:340px;line-height:1.5">'+desc+'</div>'
      +'</div>';
  }
  renderIdle();

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
      else p.resolve(d.result);
      return;
    }
    if(d.method==="ui/notifications/tool-result"){
      toolResultReceived=true;
      render(d.params);
      setTimeout(reportSize,50);
    }
    if(d.method==="ui/notifications/tool-input-partial"){
      currentTool=d.params&&d.params.name?d.params.name:"";
    }
  });

  // MCP Apps handshake.
  // Claude's McpUiInitializeRequestSchema requires appInfo, appCapabilities
  // and protocolVersion (legacy hosts read capabilities/clientInfo), so send
  // both shapes. Critically, ui/notifications/initialized must be sent
  // UNCONDITIONALLY — Claude keeps the widget iframe reserved-but-hidden
  // until it receives that notification, so a reply we don't recognize must
  // never deadlock the handshake.
  var initializedSent=false;
  function sendInitialized(){
    if(initializedSent)return;
    initializedSent=true;
    window.parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}},"*");
  }
  send("ui/initialize",{
    protocolVersion:"2026-01-26",
    appInfo:{name:"orchyn-view",version:"2.0.0"},
    appCapabilities:{availableDisplayModes:["inline"]},
    capabilities:{},
    clientInfo:{name:"orchyn-view",version:"2.0.0"}
  }).then(sendInitialized).catch(sendInitialized);
  // Unconditional fallback: never wait on a reply shape we don't recognize.
  setTimeout(sendInitialized, 500);

  // Report content size so flexible hosts (Claude) size the iframe correctly.
  // Params MUST be real numbers — claude.ai throws on null/missing width.
  function reportSize(){
    try{
      var h=document.documentElement.scrollHeight||document.body.scrollHeight||400;
      var w=document.documentElement.scrollWidth||document.body.scrollWidth||400;
      window.parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/size-changed",params:{height:h,width:w}},"*");
    }catch(e){}
  }
  window.addEventListener("resize",reportSize);
  setTimeout(reportSize,600);

  // ─── Helpers ───
  function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function fmtNum(n){n=Number(n)||0;return n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e3?(n/1e3).toFixed(1)+"K":String(n);}
  function pColor(p){return{tiktok:"#000",douyin:"#000",instagram:"#E4405F",youtube:"#FF0000",xiaohongshu:"#FF2442",x:"#000",twitter:"#1DA1F2",bilibili:"#00A1D6",linkedin:"#0A66C2"}[p]||"#6B7280";}
  // Official brand mark (simple-icons path) as an inline SVG that inherits
  // the current text color via fill="currentColor" — matches badge accents.
  function pSvg(p,size){
    var s=size||14,paths={
      tiktok:"M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
      instagram:"M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
      youtube:"M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
      x:"M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
      twitter:"M21.543 7.104c.015.211.015.423.015.636 0 6.507-4.954 14.01-14.01 14.01v-.003A13.94 13.94 0 0 1 0 19.539a9.88 9.88 0 0 0 7.287-2.041 4.93 4.93 0 0 1-4.6-3.42 4.916 4.916 0 0 0 2.223-.084A4.926 4.926 0 0 1 .96 9.167v-.062a4.887 4.887 0 0 0 2.235.616A4.928 4.928 0 0 1 1.67 3.148 13.98 13.98 0 0 0 11.82 8.292a4.929 4.929 0 0 1 8.39-4.49 9.868 9.868 0 0 0 3.128-1.196 4.941 4.941 0 0 1-2.165 2.724A9.828 9.828 0 0 0 24 4.555a10.019 10.019 0 0 1-2.457 2.549z",
      douyin:"M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
      xiaohongshu:"M22.405 9.879c.002.016.01.02.07.019h.725a.797.797 0 0 0 .78-.972.794.794 0 0 0-.884-.618.795.795 0 0 0-.692.794c0 .101-.002.666.001.777zm-11.509 4.808c-.203.001-1.353.004-1.685.003a2.528 2.528 0 0 1-.766-.126.025.025 0 0 0-.03.014L7.7 16.127a.025.025 0 0 0 .01.032c.111.06.336.124.495.124.66.01 1.32.002 1.981 0 .01 0 .02-.006.023-.015l.712-1.545a.025.025 0 0 0-.024-.036zM.477 9.91c-.071 0-.076.002-.076.01a.834.834 0 0 0-.01.08c-.027.397-.038.495-.234 3.06-.012.24-.034.389-.135.607-.026.057-.033.042.003.112.046.092.681 1.523.787 1.74.008.015.011.02.017.02.008 0 .033-.026.047-.044.147-.187.268-.391.371-.606.306-.635.44-1.325.486-1.706.014-.11.021-.22.03-.33l.204-2.616.022-.293c.003-.029 0-.033-.03-.034zm7.203 3.757a1.427 1.427 0 0 1-.135-.607c-.004-.084-.031-.39-.235-3.06a.443.443 0 0 0-.01-.082c-.004-.011-.052-.008-.076-.008h-1.48c-.03.001-.034.005-.03.034l.021.293c.076.982.153 1.964.233 2.946.05.4.186 1.085.487 1.706.103.215.223.419.37.606.015.018.037.051.048.049.02-.003.742-1.642.804-1.765.036-.07.03-.055.003-.112zm3.861-.913h-.872a.126.126 0 0 1-.116-.178l1.178-2.625a.025.025 0 0 0-.023-.035l-1.318-.003a.148.148 0 0 1-.135-.21l.876-1.954a.025.025 0 0 0-.023-.035h-1.56c-.01 0-.02.006-.024.015l-.926 2.068c-.085.169-.314.634-.399.938a.534.534 0 0 0-.02.191.46.46 0 0 0 .23.378.981.981 0 0 0 .46.119h.59c.041 0-.688 1.482-.834 1.972a.53.53 0 0 0-.023.172.465.465 0 0 0 .23.398c.15.092.342.12.475.12l1.66-.001c.01 0 .02-.006.023-.015l.575-1.28a.025.025 0 0 0-.024-.035zm-6.93-4.937H3.1a.032.032 0 0 0-.034.033c0 1.048-.01 2.795-.01 6.829 0 .288-.269.262-.28.262h-.74c-.04.001-.044.004-.04.047.001.037.465 1.064.555 1.263.01.02.03.033.051.033.157.003.767.009.938-.014.153-.02.3-.06.438-.132.3-.156.49-.419.595-.765.052-.172.075-.353.075-.533.002-2.33 0-4.66-.007-6.991a.032.032 0 0 0-.032-.032zm11.784 6.896c0-.014-.01-.021-.024-.022h-1.465c-.048-.001-.049-.002-.05-.049v-4.66c0-.072-.005-.07.07-.07h.863c.08 0 .075.004.075-.074V8.393c0-.082.006-.076-.08-.076h-3.5c-.064 0-.075-.006-.075.073v1.445c0 .083-.006.077.08.077h.854c.075 0 .07-.004.07.07v4.624c0 .095.008.084-.085.084-.37 0-1.11-.002-1.304 0-.048.001-.06.03-.06.03l-.697 1.519s-.014.025-.008.036c.006.01.013.008.058.008 1.748.003 3.495.002 5.243.002.03-.001.034-.006.035-.033v-1.539zm4.177-3.43c0 .013-.007.023-.02.024-.346.006-.692.004-1.037.004-.014-.002-.022-.01-.022-.024-.005-.434-.007-.869-.01-1.303 0-.072-.006-.071.07-.07l.733-.003c.041 0 .081.002.12.015.093.025.16.107.165.204.006.431.002 1.153.001 1.153zm2.67.244a1.953 1.953 0 0 0-.883-.222h-.18c-.04-.001-.04-.003-.042-.04V10.21c0-.132-.007-.263-.025-.394a1.823 1.823 0 0 0-.153-.53 1.533 1.533 0 0 0-.677-.71 2.167 2.167 0 0 0-1-.258c-.153-.003-.567 0-.72 0-.07 0-.068.004-.068-.065V7.76c0-.031-.01-.041-.046-.039H17.93s-.016 0-.023.007c-.006.006-.008.012-.008.023v.546c-.008.036-.057.015-.082.022h-.95c-.022.002-.028.008-.03.032v1.481c0 .09-.004.082.082.082h.913c.082 0 .072.128.072.128V11.19s.003.117-.06.117h-1.482c-.068 0-.06.082-.06.082v1.445s-.01.068.064.068h1.457c.082 0 .076-.006.076.079v3.225c0 .088-.007.081.082.081h1.43c.09 0 .082.007.082-.08v-3.27c0-.029.006-.035.033-.035l2.323-.003c.098 0 .191.02.28.061a.46.46 0 0 1 .274.407c.008.395.003.79.003 1.185 0 .259-.107.367-.33.367h-1.218c-.023.002-.029.008-.028.033.184.437.374.871.57 1.303a.045.045 0 0 0 .04.026c.17.005.34.002.51.003.15-.002.517.004.666-.01a2.03 2.03 0 0 0 .408-.075c.59-.18.975-.698.976-1.313v-1.981c0-.128-.01-.254-.034-.38 0 .078-.029-.641-.724-.998z",
      bilibili:"M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z",
      linkedin:"M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
      unknown:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
    };
    var d=paths[p]||paths.unknown;
    return '<svg viewBox="0 0 24 24" width="'+s+'" height="'+s+'" fill="currentColor" style="vertical-align:-2px;flex-shrink:0;display:inline-block" aria-hidden="true"><path d="'+d+'"/></svg>';
  }

  function copyText(text){
    navigator.clipboard.writeText(text).catch(function(){});
  }

  // ─── Post Card ───
  function postCard(p,wide){
    var platform=p.platform||"unknown",color=pColor(platform),brandSvg=pSvg(platform);
    var title=p.title||p.caption||"",handle=p.creatorHandle||"",url=p.externalUrl||"";
    var thumb=p.thumbnailUrl||"",ct=p.contentType||"post";
    var views=p.views||0,likes=p.likes||0,comments=p.comments||0,shares=p.shares||0;
    var cls=wide?"card card-wide":"card";
    var statsHtml=[[views,"👁️"],[likes,"❤️"],[comments,"💬"],[shares,"🔄"]]
      .filter(function(s){return s[0]>0})
      .map(function(s){return'<span class="stat-pill">'+s[1]+" "+fmtNum(s[0])+"</span>";}).join("");
    var handleHtml=handle?'<span class="handle">@'+esc(handle)+"</span>":"";
    var linkHtml=url?'<a href="'+esc(url)+'" target="_blank" class="btn" style="background:'+color+'">View on '+esc(platform)+' →</a>':"";
    // Prefer video playback over a static thumbnail when the post has one
    // (videoUrl, or a video mediaItem preview_url). Videos are proxied /
    // re-hosted to a permanent orchyn URL so they play inside the CSP.
    var video="",images=[];
    if(typeof p.videoUrl==="string"&&p.videoUrl)video=p.videoUrl;
    if(p.mediaItems&&p.mediaItems.length){
      for(var i=0;i<p.mediaItems.length;i++){
        var m=p.mediaItems[i];
        if(m.kind==="video"&&m.preview_url){if(!video)video=m.preview_url;}
        else if(m.kind==="image"&&m.preview_url&&images.length<8)images.push(m.preview_url);
      }
    }
    var mediaHtml="";
    var vh=wide?"340px":"200px";
    var bodyText=p.caption||p.text||"";
    if(video){
      mediaHtml='<video src="'+esc(video)+'" controls preload="metadata" playsinline poster="'+esc(thumb)+'" style="width:100%;height:'+vh+';object-fit:cover;display:block;background:#000">'
        +'Your browser does not support video playback.</video>';
    }else if(images.length>1){
      // Carousel / multi-image gallery — horizontally scrollable strip.
      var strip=images.map(function(u,i){
        return '<img src="'+esc(u)+'" alt="slide '+(i+1)+'" loading="lazy" style="height:'+vh+';max-width:85%;object-fit:cover;border-radius:6px;flex-shrink:0;display:block"/>';
      }).join("");
      mediaHtml='<div style="display:flex;gap:6px;overflow-x:auto;padding:8px;background:var(--border);border-bottom:1px solid var(--border)">'+strip+'</div>'
        +'<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;font-size:11px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border)">🖼 '+images.length+' images</div>';
    }else if(thumb){
      mediaHtml='<img src="'+esc(thumb)+'" alt="thumbnail" loading="lazy"/>';
    }else if(bodyText){
      // Text-only post (LinkedIn / X) — styled quote block.
      mediaHtml='<div style="padding:16px 18px;border-bottom:1px solid var(--border);background:var(--card)">'
        +'<div style="font-size:13px;line-height:1.55;color:var(--fg);white-space:pre-line">'+esc(bodyText.length>400?bodyText.slice(0,400)+"…":bodyText)+'</div></div>';
    }
    var ctTag=wide?'<span style="font-size:12px;color:var(--muted);text-transform:capitalize">'+esc(ct)+"</span>":"";
    return '<div class="'+cls+'">'+mediaHtml+'<div class="card-body">'
      +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'
      +'<span class="badge" style="background:'+color+'15;color:'+color+';display:inline-flex;align-items:center;gap:4px">'+brandSvg+" "+esc(platform)+"</span>"
      +ctTag+handleHtml+"</div>"
      +'<div class="title">'+esc(title.length>160?title.slice(0,160)+"…":title)+"</div>"
      +'<div class="stats">'+statsHtml+"</div>"
      +linkHtml+"</div></div>";
  }

  // ─── Creator Card ───
  function creatorCard(c){
    var platform=c.platform||"tiktok",color=pColor(platform),brandSvg=pSvg(platform,22);
    var username=c.username||c.uniqueId||"",nickname=c.nickname||c.displayName||username;
    var followers=c.followers||c.followerCount||0,sig=(c.signature||c.bio||"").slice(0,100);
    var verified=c.verified||false,avatar=c.avatarUrl||c.avatar_thumb||"";
    var avatarHtml=avatar
      ?'<img class="avatar" src="'+esc(avatar)+'" alt="avatar" loading="lazy"/>'
      :'<div class="avatar-placeholder" style="background:'+color+'20">'+brandSvg+"</div>";
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
  // Hosts deliver the tool result in two shapes:
  //  - { structuredContent: {...} }  (spec-optional, used when present)
  //  - { content: [ {type,text,...} ] }  (standard MCP content blocks)
  // Our results put the HTML card prefix + structured JSON inside the first
  // text content block, so decode BOTH. If the result is a primitive/string,
  // surface it as-is.
  function extractResult(result){
    if(!result||typeof result!=="object")return result;
    var sc=result.structuredContent;
    if(sc&&typeof sc==="object"&&!Array.isArray(sc))return sc;
    if(Array.isArray(result.content)){
      var textBlock=null;
      for(var i=0;i<result.content.length;i++){
        var c=result.content[i];
        if(c&&c.type==="text"&&typeof c.text==="string"){textBlock=c.text;break;}
      }
      if(typeof textBlock==="string"&&textBlock!==""){
        // Split "<html>  {json}" — if there's a JSON object after the HTML,
        // parse it; otherwise show the text itself.
        var m=new RegExp("^[\\s]*<[^>]+>[\\s\\S]*?\\n\\n(\\{.*\\})[\\s]*$","m").exec(textBlock);
        if(m){try{var parsed=JSON.parse(m[1]);if(parsed&&typeof parsed==="object")return parsed;}catch(e){}}
        // Single-line HTML (common): keep the whole block as text fallback.
        if(textBlock.indexOf("<")===0){return { _html: textBlock };}
        try{var j=JSON.parse(textBlock);if(j&&typeof j==="object")return j;}catch(e2){}
      }
    }
    return result;
  }

  function render(result){
    var app=document.getElementById("app");if(!app)return;
    var d=extractResult(result);
    if(!d||typeof d!=="object"){app.innerHTML='<div class="json-block fade-in">'+esc(JSON.stringify(d,null,2))+"</div>";return;}
    // Raw HTML-only result — inject it directly.
    if(d._html){app.innerHTML=d._html;setTimeout(reportSize,50);return;}

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
    setTimeout(reportSize,50);
  }

  // tool-input-partial — no loading UI anymore; just retain the tool name in
  // case future logic needs it. Content only appears via tool-result.
  function updateProgress(params){
    var toolName=params&&params.name?params.name:null;
    if(toolName)currentTool=toolName;
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
