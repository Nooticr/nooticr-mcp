/**
 * Single unified HTML template for all Orchyn MCP tools.
 *
 * The host renders this in a sandboxed iframe. After the MCP Apps handshake,
 * the host pushes the tool result via `ui/notifications/tool-result`.
 * The template auto-detects the data shape and renders the appropriate view.
 *
 * No external dependencies — pure HTML + CSS + JS, fully inline.
 */

export const ORCHYN_UI_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Orchyn</title>
<style>
  :root {
    --bg: #ffffff; --fg: #111827; --muted: #6b7280; --border: #e5e7eb;
    --card-bg: #ffffff; --tag-bg: #f3f4f6; --accent: #14151a;
    --tiktok: #000; --instagram: #E1306C; --youtube: #FF0000;
    --douyin: #000; --xiaohongshu: #FF2442; --twitter: #1DA1F2; --bilibili: #00A1D6;
  }
  @media(prefers-color-scheme:dark){
    :root {
      --bg: #1a1a2e; --fg: #f0f0f0; --muted: #9ca3af; --border: #374151;
      --card-bg: #16213e; --tag-bg: #1f2937; --accent: #e2e8f0;
    }
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: system-ui,-apple-system,sans-serif; background:var(--bg); color:var(--fg); padding:12px; }
  .loading { color:var(--muted); font-size:14px; text-align:center; padding:40px 0; }
  .gallery { display:flex; flex-wrap:wrap; gap:10px; }
  .card {
    border:1px solid var(--border); border-radius:12px; overflow:hidden;
    width:300px; background:var(--card-bg); display:inline-block;
    vertical-align:top; box-shadow:0 1px 3px rgba(0,0,0,0.06);
    transition: box-shadow 0.2s;
  }
  .card:hover { box-shadow:0 4px 12px rgba(0,0,0,0.12); }
  .card-wide { max-width:520px; width:100%; }
  .card img { width:100%; height:200px; object-fit:cover; display:block; }
  .card-wide img { max-height:340px; }
  .card-body { padding:12px 14px; }
  .badge {
    display:inline-block; padding:2px 8px; border-radius:999px;
    font-size:11px; font-weight:700; text-transform:capitalize;
  }
  .handle { font-size:12px; color:var(--muted); }
  .title { font-size:14px; font-weight:600; line-height:1.3; margin:6px 0; }
  .card-wide .title { font-size:16px; font-weight:700; }
  .stats { display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
  .stat {
    display:inline-flex; align-items:center; gap:3px;
    font-size:12px; color:var(--muted);
  }
  .stat-pill {
    font-size:13px; color:var(--fg); background:var(--tag-bg);
    padding:4px 10px; border-radius:999px;
  }
  .dot { color:var(--border); margin:0 2px; }
  .btn {
    display:inline-block; margin-top:10px; padding:6px 14px;
    color:#fff; border-radius:999px; text-decoration:none;
    font-size:12px; font-weight:600; transition:opacity 0.2s;
  }
  .btn:hover { opacity:0.85; }
  .section { margin-bottom:12px; }
  .section-label {
    font-size:11px; font-weight:700; color:var(--muted);
    text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;
  }
  .section-text { font-size:13px; color:var(--fg); line-height:1.5; }
  .tag {
    display:inline-block; padding:3px 10px; border-radius:999px;
    font-size:12px; margin:2px;
  }
  .bar-track {
    height:8px; background:var(--tag-bg); border-radius:999px;
    overflow:hidden; flex:1;
  }
  .bar-fill { height:100%; border-radius:999px; transition:width 0.4s ease; }
  .quote-box {
    background:var(--tag-bg); padding:8px 12px; border-radius:8px;
    font-size:13px; font-weight:600; line-height:1.4; margin:4px 0;
  }
  .comment-row {
    padding:8px 0; border-bottom:1px solid var(--border);
    display:flex; justify-content:space-between; align-items:flex-start; gap:8px;
  }
  .comment-row:last-child { border-bottom:none; }
  .creator-card {
    border:1px solid var(--border); border-radius:12px; padding:14px;
    width:220px; background:var(--card-bg); display:inline-block;
    vertical-align:top; margin:4px; box-shadow:0 1px 3px rgba(0,0,0,0.05);
  }
  .avatar {
    width:48px; height:48px; border-radius:50%; object-fit:cover;
  }
  .avatar-placeholder {
    width:48px; height:48px; border-radius:50%;
    display:flex; align-items:center; justify-content:center; font-size:20px;
  }
  .verified {
    display:inline-block; width:16px; height:16px; border-radius:50%;
    color:#fff; font-size:10px; line-height:16px; text-align:center; margin-left:4px;
  }
  .sound-card {
    border:1px solid var(--border); border-radius:12px; padding:12px;
    width:260px; background:var(--card-bg); display:inline-block;
    vertical-align:top; margin:4px; box-shadow:0 1px 3px rgba(0,0,0,0.05);
  }
  .sound-cover {
    width:64px; height:64px; border-radius:8px; object-fit:cover;
  }
  .credits-card {
    border:1px solid var(--border); border-radius:14px; max-width:360px;
    background:var(--card-bg); margin:8px 0; padding:20px;
    box-shadow:0 2px 8px rgba(0,0,0,0.06);
  }
  .tier-badge {
    display:inline-block; padding:3px 10px; background:#eff6ff;
    border-radius:999px; font-size:11px; color:#1e40af; font-weight:600;
  }
  .free-tag {
    display:inline-block; padding:3px 8px; background:#d1fae5;
    border-radius:999px; font-size:11px; color:#065f46; margin:2px;
  }
  .json-block {
    background:var(--tag-bg); border:1px solid var(--border);
    border-radius:8px; padding:12px; font-size:12px;
    font-family:monospace; white-space:pre-wrap; word-break:break-all;
    max-height:300px; overflow-y:auto; margin-top:8px;
  }
</style>
</head>
<body>
<div id="app"><div class="loading">Loading…</div></div>
<script>
(function(){
  let nextId=1;
  const pending=new Map();

  function send(method,params){
    const id=nextId++;
    return new Promise((resolve,reject)=>{
      pending.set(id,{resolve,reject});
      window.parent.postMessage({jsonrpc:"2.0",id,method,params},"*");
    });
  }

  window.addEventListener("message",function(ev){
    const d=ev.data;
    if(!d||typeof d!=="object")return;
    if(d.id&&pending.has(d.id)){
      const p=pending.get(d.id);
      pending.delete(d.id);
      if(d.error)p.reject(new Error(d.error.message||JSON.stringify(d.error)));
      else p.resolve(d.result);
      return;
    }
    if(d.method==="ui/notifications/tool-result"){
      render(d.params);
    }
    if(d.method==="ui/notifications/tool-input"){
      // Tool input available — could show loading state
    }
  });

  // MCP Apps handshake
  send("ui/initialize",{
    protocolVersion:"2026-01-26",
    capabilities:{},
    clientInfo:{name:"orchyn-view",version:"1.0.0"}
  }).then(function(){
    window.parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}},"*");
  }).catch(function(){});

  function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function fmtNum(n){n=Number(n)||0;return n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e3?(n/1e3).toFixed(1)+"K":String(n);}
  function pColor(p){return{tiktok:"#000",instagram:"#E1306C",youtube:"#FF0000",douyin:"#000",xiaohongshu:"#FF2442",twitter:"#1DA1F2",x:"#1DA1F2",bilibili:"#00A1D6"}[p]||"#6B7280";}
  function pEmoji(p){return{tiktok:"🎵",instagram:"📸",youtube:"▶️",douyin:"🎶",xiaohongshu:"📕",twitter:"🐦",x:"🐦",bilibili:"📺"}[p]||"🔗";}

  function postCard(p,wide){
    var platform=p.platform||"unknown";
    var color=pColor(platform);
    var emoji=pEmoji(platform);
    var title=p.title||p.caption||"";
    var handle=p.creatorHandle||"";
    var url=p.externalUrl||"";
    var thumb=p.thumbnailUrl||"";
    var ct=p.contentType||"post";
    var views=p.views||0,likes=p.likes||0,comments=p.comments||0,shares=p.shares||0;
    var cls=wide?"card card-wide":"card";
    var statsHtml="";
    [[views,"👁️"],[likes,"❤️"],[comments,"💬"],[shares,"🔄"]].forEach(function(s){
      if(s[0]>0)statsHtml+='<span class="stat">'+s[1]+" "+fmtNum(s[0])+"</span>";
    });
    var handleHtml=handle?'<span class="handle">@'+esc(handle)+"</span>":"";
    var linkHtml=url?'<a href="'+esc(url)+'" target="_blank" class="btn" style="background:'+color+'">View on '+esc(platform)+" →</a>":"";
    var thumbHtml=thumb?'<img src="'+esc(thumb)+'" alt="thumbnail"/>':"";
    var ctTag=wide?'<span style="font-size:12px;color:var(--muted);text-transform:capitalize">'+esc(ct)+"</span>":"";
    return '<div class="'+cls+'">'+thumbHtml+'<div class="card-body">'
      +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'
      +'<span class="badge" style="background:'+color+'15;color:'+color+'">'+emoji+" "+esc(platform)+"</span>"
      +ctTag+handleHtml+"</div>"
      +'<div class="title">'+esc(title.length>160?title.slice(0,160)+"…":title)+"</div>"
      +'<div class="stats">'+statsHtml+"</div>"
      +linkHtml+"</div></div>";
  }

  function creatorCard(c){
    var platform=c.platform||"tiktok";
    var color=pColor(platform);
    var emoji=pEmoji(platform);
    var username=c.username||c.uniqueId||"";
    var nickname=c.nickname||c.displayName||username;
    var followers=c.followers||c.followerCount||0;
    var sig=(c.signature||c.bio||"").slice(0,100);
    var verified=c.verified||false;
    var avatar=c.avatarUrl||c.avatar_thumb||"";
    var avatarHtml=avatar
      ?'<img class="avatar" src="'+esc(avatar)+'" alt="avatar"/>'
      :'<div class="avatar-placeholder" style="background:'+color+'20">'+emoji+"</div>";
    var vBadge=verified?'<span class="verified" style="background:'+color+'">✓</span>':"";
    return '<div class="creator-card">'
      +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
      +avatarHtml+"<div>"
      +'<div style="display:flex;align-items:center"><span style="font-size:14px;font-weight:700">'+esc(nickname)+"</span>"+vBadge+"</div>"
      +'<div class="handle">@'+esc(username)+"</div></div></div>"
      +'<div style="font-size:12px;color:var(--fg);font-weight:600;margin-bottom:4px">'+fmtNum(followers)+" followers</div>"
      +sig?'<div style="font-size:12px;color:var(--muted);line-height:1.4">'+esc(sig)+"</div>":""
      +"</div>";
  }

  function analysisCard(d){
    var a=d.analysis||{};
    var postHtml=postCard(d.post||d,true);
    var sections="";
    if(a.summary)sections+='<div class="section"><div class="section-label">Summary</div><div class="section-text">'+esc(a.summary)+"</div></div>";
    if(a.hookStrength!=null){
      var hs=Number(a.hookStrength);
      var pct=Math.min(hs/10*100,100);
      var bc=hs>=7?"#10b981":hs>=4?"#f59e0b":"#ef4444";
      sections+='<div class="section"><div class="section-label">Hook Strength</div>'
        +'<div style="display:flex;align-items:center;gap:8px"><div class="bar-track"><div class="bar-fill" style="width:'+pct+"%;background:"+bc+'"></div></div>'
        +'<span style="font-size:13px;font-weight:700">'+hs+"/10</span></div></div>";
    }
    if(a.niche)sections+='<div class="section"><span class="tag" style="background:var(--tag-bg);color:var(--fg)">📍 '+esc(a.niche)+"</span></div>";
    if(a.whyItWorks)sections+='<div class="section"><div class="section-label">Why It Works</div><div class="section-text">'+esc((a.whyItWorks||"").slice(0,300))+"</div></div>";
    if(a.emotionalArc)sections+='<div class="section"><div class="section-label">Emotional Arc</div><div class="section-text">'+esc(a.emotionalArc)+"</div></div>";
    if(a.viralTriggers&&a.viralTriggers.length){
      var vt=a.viralTriggers.slice(0,6).map(function(t){return'<span class="tag" style="background:#fef3c7;color:#92400e">🔥 '+esc(t)+"</span>";}).join("");
      sections+='<div class="section"><div class="section-label">Viral Triggers</div>'+vt+"</div>";
    }
    if(a.suggestedHook)sections+='<div class="section"><div class="section-label">Suggested Hook</div><div class="quote-box">💡 '+esc(a.suggestedHook)+"</div></div>";
    if(a.suggestedHashtags&&a.suggestedHashtags.length){
      var sh=a.suggestedHashtags.slice(0,8).map(function(t){return'<span class="tag" style="background:#ede9fe;color:#6d28d9">#'+esc(t.replace(/^#/,""))+"</span>";}).join("");
      sections+='<div class="section"><div class="section-label">Hashtags</div>'+sh+"</div>";
    }
    if(a.formatBreakdown)sections+='<div class="section"><div class="section-label">Format</div><div class="section-text">'+esc((a.formatBreakdown||"").slice(0,250))+"</div></div>";
    if(a.negativeSignals&&a.negativeSignals.length){
      var ns=a.negativeSignals.slice(0,5).map(function(n){return'<span class="tag" style="background:#fef2f2;color:#991b1b">⚠️ '+esc(n)+"</span>";}).join("");
      sections+='<div class="section"><div class="section-label">Weaknesses</div>'+ns+"</div>";
    }
    if(a.variationIdeas&&a.variationIdeas.length){
      var vi=a.variationIdeas.slice(0,5).map(function(v){return"<li>"+esc(v)+"</li>";}).join("");
      sections+='<div class="section"><div class="section-label">Variation Ideas</div><ul style="margin:0;padding-left:18px">'+vi+"</ul></div>";
    }
    if(!sections)return postHtml;
    return postHtml+'<div class="card card-wide" style="margin-top:8px"><div class="card-body">'
      +'<div style="font-size:15px;font-weight:700;margin-bottom:14px">📊 AI Analysis</div>'
      +sections+"</div></div>";
  }

  function render(result){
    var app=document.getElementById("app");
    if(!app)return;
    var d=result&&result.structuredContent?result.structuredContent:result;
    if(!d||typeof d!=="object"){app.innerHTML='<div class="json-block">'+esc(JSON.stringify(d,null,2))+"</div>";return;}

    // Detect shape
    if(d.analysis&&(d.post||d.url))return void(app.innerHTML=analysisCard(d));
    if(d.posts&&Array.isArray(d.posts)){
      var gallery=d.posts.map(function(p){return postCard(p,false);}).join("");
      return void(app.innerHTML='<div class="gallery">'+gallery+"</div>");
    }
    if(d.creators&&Array.isArray(d.creators)){
      var cg=d.creators.map(function(c){return creatorCard(c);}).join("");
      return void(app.innerHTML='<div class="gallery">'+cg+"</div>");
    }
    if(d.comments&&Array.isArray(d.comments)){
      var ch=d.comments.slice(0,15).map(function(c){
        var user=c.username||c.user||"";
        var text=(c.text||c.comment||"").slice(0,120);
        var likes=c.likes||c.likeCount||0;
        return '<div class="comment-row"><div style="flex:1"><span style="font-size:12px;font-weight:600">@'+esc(user)+"</span>"
          +'<div style="font-size:13px;color:var(--fg);line-height:1.4;margin-top:2px">'+esc(text)+"</div></div>"
          +(likes>0?'<span style="font-size:11px;color:var(--muted);white-space:nowrap">❤️ '+fmtNum(likes)+"</span>":"")+"</div>";
      }).join("");
      return void(app.innerHTML='<div class="card card-wide"><div class="card-body">'
        +'<div style="font-size:15px;font-weight:700;margin-bottom:10px">💬 Comments</div>'+ch+"</div></div>");
    }
    if(d.sounds&&Array.isArray(d.sounds)){
      var snds=d.sounds.map(function(s){
        var color=pColor(s.platform||"tiktok");
        var cover=s.coverUrl?'<img class="sound-cover" src="'+esc(s.coverUrl)+'" alt="cover"/>'
          :'<div class="sound-cover" style="background:'+color+'15;display:flex;align-items:center;justify-content:center;font-size:24px">🎵</div>';
        var play=s.playUrl||s.url||"";
        var playBtn=play?'<a href="'+esc(play)+'" target="_blank" class="btn" style="background:'+color+';margin-top:6px;padding:4px 12px;font-size:11px">▶ Play</a>':"";
        return '<div class="sound-card"><div style="display:flex;gap:10px;align-items:center">'
          +cover+'<div style="flex:1;min-width:0">'
          +'<div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(s.title||"")+"</div>"
          +'<div style="font-size:12px;color:var(--muted)">'+esc(s.artist||s.author||"")+(s.duration?" • "+esc(s.duration):"")+"</div>"
          +playBtn+"</div></div></div>";
      }).join("");
      return void(app.innerHTML='<div class="gallery">'+snds+"</div>");
    }
    if(d.balance!=null||d.tier){
      var bal=Number(d.balance)||0;
      var tier=d.tier||"";
      var ff=d.firstFreeTools||[];
      var freeHtml="";
      if(ff.length){
        var tags=ff.map(function(t){return'<span class="free-tag">✨ '+esc(t)+" free</span>";}).join("");
        freeHtml='<div style="margin-top:10px"><div class="section-label">Free first uses remaining</div><div style="display:flex;flex-wrap:wrap;gap:4px">'+tags+"</div></div>";
      }
      return void(app.innerHTML='<div class="credits-card">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
        +'<div style="font-size:15px;font-weight:700">💰 Your Credits</div>'
        +(tier?'<span class="tier-badge">'+esc(tier)+"</span>":"")+"</div>"
        +'<div style="font-size:32px;font-weight:800;margin:8px 0">'+bal+"</div>"
        +'<div style="font-size:13px;color:var(--muted)">credits remaining</div>'
        +freeHtml+"</div>");
    }
    if(d.checkoutUrl||d.packs){
      return void(app.innerHTML='<div class="card card-wide"><div class="card-body">'
        +'<div style="font-size:15px;font-weight:700;margin-bottom:12px">🛒 Credit Packs</div>'
        +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">'
        +'<div style="border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center"><div style="font-size:13px;font-weight:600">Starter</div><div style="font-size:22px;font-weight:800;margin:4px 0">$12.50</div><div style="font-size:12px;color:var(--muted)">500 credits</div></div>'
        +'<div style="border:2px solid var(--accent);border-radius:10px;padding:14px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.08)"><div style="font-size:13px;font-weight:600">Pro</div><div style="font-size:22px;font-weight:800;margin:4px 0">$40</div><div style="font-size:12px;color:var(--muted)">2,000 credits</div></div>'
        +'<div style="border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center"><div style="font-size:13px;font-weight:600">Scale</div><div style="font-size:22px;font-weight:800;margin:4px 0">$85</div><div style="font-size:12px;color:var(--muted)">5,000 credits</div></div>'
        +"</div></div></div>");
    }
    // Single post (get_social_media)
    if(d.post||d.platform){
      return void(app.innerHTML=postCard(d.post||d,true));
    }
    // Fallback: pretty-print JSON
    app.innerHTML='<div class="json-block">'+esc(JSON.stringify(d,null,2))+"</div>";
  }
})();
</script>
</body>
</html>`;
