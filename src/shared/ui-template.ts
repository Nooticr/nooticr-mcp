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
  /* No background is painted on the body: the card sits inside the host's
     chat transcript, so it inherits whatever colour the user's client uses
     rather than stamping its own rectangle over it. --bg stays defined for
     the few places that need a solid fill behind media. */
  /* Without this the browser paints the iframe canvas white, so on a phone in
     dark mode the card sat in a white box inside a dark chat. Declaring both
     schemes lets the UA canvas follow the user's theme instead. */
  color-scheme:light dark;
  --bg:#fafbfc;--fg:#111827;--muted:#5f6773;--border:#e5e7eb;
  --card:#fff;--card-hover:#f9fafb;--tag:#f3f4f6;--accent:#14151a;
  --brand:#ff4d23;--brand-2:#ff8a3d;--brand-soft:rgba(255,77,35,.13);
  --shimmer:rgba(255,77,35,.10);--shimmer-hi:rgba(255,77,35,.24);
  --shadow-sm:0 1px 2px rgba(0,0,0,.05);--shadow-md:0 4px 12px rgba(0,0,0,.08);
  --shadow-lg:0 8px 24px rgba(0,0,0,.12);--radius:12px;--radius-sm:8px;
  --transition:all .25s cubic-bezier(.4,0,.2,1);
  --green:#047857;--amber:#b45309;--red:#dc2626;--blue:#2563eb;
}
@media(prefers-color-scheme:dark){:root{
  --bg:#0f172a;--fg:#f1f5f9;--muted:#a8b8cc;--border:#334155;
  /* Accents are lifted in dark mode: the light-mode values sat at about
     3:1 on the dark card, which is under the 4.5:1 needed for body text. */
  --green:#34d399;--amber:#fbbf24;--red:#f87171;--blue:#60a5fa;
  --card:#1e293b;--card-hover:#273548;--tag:#1e293b;--accent:#e2e8f0;
  --brand:#ff5c33;--brand-2:#ff9351;--brand-soft:rgba(255,92,51,.16);
  --shimmer:rgba(255,255,255,.05);--shimmer-hi:rgba(255,255,255,.13);
  --shadow-sm:0 1px 2px rgba(0,0,0,.2);--shadow-md:0 4px 12px rgba(0,0,0,.3);
  --shadow-lg:0 8px 24px rgba(0,0,0,.4);
}}
html{overflow-x:hidden;overflow-y:auto}
*{margin:0;padding:0;box-sizing:border-box;}
/* An author display rule beats the UA's [hidden] rule, so any hidden
   overlay (buffering, error) would stay painted and keep swallowing clicks.
   Make the attribute win outright. */
[hidden]{display:none !important;}
/* An unstyled anchor falls back to the UA's default link blue, which failed
   contrast on the dark card - the trending-hashtag rows were near-unreadable.
   Every link here is styled by its container, so inherit the local colour. */
a{color:inherit;text-decoration:none;}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:transparent;color:var(--fg);padding:10px;line-height:1.5;overflow-x:hidden;max-width:100vw;}

/* ─── Loading state ─── */
/* An indeterminate bar that sweeps back and forth, plus skeletons shaped like
   whatever the tool is about to return — so the space the answer will occupy
   is reserved and the card does not jump when the result lands. */
.load-bar{position:relative;height:3px;border-radius:999px;background:var(--shimmer);
  overflow:hidden;margin-bottom:14px}
.load-bar::after{content:"";position:absolute;top:0;bottom:0;width:42%;border-radius:999px;
  background:linear-gradient(90deg,transparent,var(--brand),var(--brand-2),transparent);
  animation:sweep 1.35s cubic-bezier(.45,0,.55,1) infinite}
@keyframes sweep{0%{left:-45%}50%{left:58%}100%{left:-45%}}

.load-head{display:flex;align-items:center;gap:8px;margin-bottom:11px;
  font-size:12.5px;font-weight:600;color:var(--muted)}
.load-head .dot{width:7px;height:7px;border-radius:50%;background:var(--brand);
  animation:pulse 1.2s ease-in-out infinite;flex-shrink:0}
@keyframes pulse{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}

.sk{background:var(--shimmer);border-radius:6px;position:relative;overflow:hidden}
.sk::after{content:"";position:absolute;inset:0;
  background:linear-gradient(90deg,transparent,var(--shimmer-hi),transparent);
  transform:translateX(-100%);animation:shine 1.5s ease-in-out infinite}
@keyframes shine{to{transform:translateX(100%)}}
.sk-media{width:100%;aspect-ratio:9/16;max-height:var(--stage-max,420px);border-radius:0}
.sk-media.h{aspect-ratio:16/9}
.sk-line{height:11px;margin-top:8px}
.sk-line.w40{width:40%}.sk-line.w60{width:60%}.sk-line.w80{width:80%}
.sk-pill{height:22px;width:76px;border-radius:999px;display:inline-block;margin:0 5px 5px 0}
.sk-card{border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;
  background:var(--card);width:min(340px,86vw);min-width:min(340px,86vw);flex-shrink:0}
.sk-body{padding:13px 14px}
.sk-row{display:flex;gap:12px;align-items:center;padding:11px 0;border-bottom:1px solid var(--border)}
.sk-avatar{width:44px;height:44px;border-radius:10px;flex-shrink:0}
.sk-strip{display:flex;gap:12px;overflow:hidden;padding:2px 0 8px}
@media(prefers-reduced-motion:reduce){
  .load-bar::after,.sk::after,.load-head .dot{animation:none}
  .load-bar::after{left:0;width:100%;opacity:.5}
}

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
.gallery-wrap{position:relative;overflow:hidden;max-width:100%}
.gallery{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;padding:2px 0 8px;scrollbar-width:none;width:100%;max-width:100%;}
.gallery::-webkit-scrollbar{display:none}
.gallery-dots{display:flex;justify-content:center;gap:6px;margin-top:10px;flex-wrap:wrap}
.gallery-dots .dot{width:8px;height:8px;border-radius:50%;background:var(--border);border:none;cursor:pointer;transition:var(--transition);padding:0}
.gallery-dots .dot.active{background:var(--accent);transform:scale(1.3)}
.gallery-nav{position:absolute;top:50%;transform:translateY(-50%);width:32px;height:32px;border-radius:50%;background:var(--card);border:1px solid var(--border);box-shadow:var(--shadow-md);cursor:pointer;z-index:2;display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--fg);transition:var(--transition);opacity:0}
.gallery-wrap:hover .gallery-nav{opacity:1}
.gallery-nav:hover{background:var(--accent);color:#fff}
.gallery-nav.prev{left:2px}
.gallery-nav.next{right:2px}
.card{border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;width:min(380px,100%);min-width:min(380px,100%);max-width:100%;background:var(--card);display:block;box-shadow:var(--shadow-sm);transition:var(--transition);cursor:default;scroll-snap-align:center;flex-shrink:0}
/* A media card is the player plus a footer — no metadata column, the chrome
   lives on the media itself. */
/* Two classes so this outranks .card-wide's width:100%. The card derives its
   width from the player's aspect ratio, so the footer sits under the media
   instead of stretching away from it on a wide screen. */
.card.card-media{--ar-w:9;--ar-h:16;
  width:min(100%,calc(var(--stage-max,520px) * var(--ar-w) / var(--ar-h)));
  min-width:0;margin:0 auto;background:transparent;border-color:transparent;box-shadow:none;}
.card.card-media.h{--ar-w:16;--ar-h:9}
.card.card-media.sq{--ar-w:1;--ar-h:1}
.card-media .card-foot{padding:8px 4px 0;background:transparent;display:flex;justify-content:flex-end;}
.card-media .btn-sm{margin-top:0;}
.card:hover{box-shadow:var(--shadow-md);transform:translateY(-2px);border-color:var(--muted);}
.card-wide{width:100%;}
/* Thumbnail styling for plain (non-player) cards only. The player owns the
   sizing of its own media — letting this rule reach .mp-slide cropped every
   slide to a 260px letterbox and scaled it on hover. */
.card img:not(.mp-slide){width:100%;height:260px;object-fit:cover;display:block;transition:transform .3s ease;}
.card:hover img:not(.mp-slide){transform:scale(1.02);}
.card-wide img:not(.mp-slide){max-height:340px;}
.card video{width:100%;min-height:220px;max-height:520px;display:block;background:#000;border:none;outline:none;object-fit:contain;}
.card-wide video{max-height:520px;}

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
.stat-pill{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--fg);background:var(--tag);padding:5px 12px;border-radius:999px;transition:var(--transition);display:inline-flex;align-items:center;gap:4px;}
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
.section-content{padding:0 12px;max-height:0;overflow:hidden;
  transition:max-height .28s ease,padding .28s ease;}
.section-content.open{max-height:2400px;padding:11px 12px;}
.section-text{font-size:13px;color:var(--fg);line-height:1.6;}

/* ─── AI action buttons ─── */
/* Every button that spends credits says so on its face: the sparkle marks it
   as an AI action, the price sits next to it. Nothing here charges silently. */
.ai-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.ai-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:999px;
  border:1px solid var(--border);background:var(--card);color:var(--fg);font:inherit;
  font-size:13px;font-weight:600;cursor:pointer;transition:var(--transition)}
.ai-btn:hover:not(:disabled){border-color:var(--brand);
  background:color-mix(in srgb,var(--brand) 8%,transparent);transform:translateY(-1px)}
.ai-btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
.ai-btn .spark{color:var(--brand);display:inline-flex;flex-shrink:0}
.ai-btn .price{display:inline-flex;align-items:center;font-size:11px;font-weight:700;
  color:var(--brand);background:var(--brand-soft);border-radius:999px;padding:2px 7px;
  white-space:nowrap}
.ai-btn.busy .spark{animation:spin 1.1s linear infinite}
.ai-note{font-size:11.5px;color:var(--muted);margin-top:8px}

/* ─── AI analysis ─── */
.an-title{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700;margin-bottom:14px}
.verdict{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:12px}
@media(min-width:420px){.verdict{grid-template-columns:1fr 1fr}}
.meter{background:var(--tag);border-radius:var(--radius-sm);padding:9px 11px}
.meter-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px;
  font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
.meter-top b{font-size:14px;letter-spacing:0}
.meter-track{height:5px;border-radius:999px;background:var(--border);overflow:hidden;margin-top:6px}
.meter-track>i{display:block;height:100%;border-radius:999px}
.chiprow{display:flex;flex-wrap:wrap;gap:5px}
.tag.copyable{cursor:pointer;border:1px solid var(--border);font:inherit;font-size:12px;
  display:inline-flex;align-items:center;gap:5px}
.tag.copyable:hover{border-color:var(--accent)}
.tag.warn{background:color-mix(in srgb,var(--red) 12%,transparent);
  color:var(--red);border:1px solid color-mix(in srgb,var(--red) 35%,transparent)}
.lede-box{font-size:13.5px;line-height:1.6;padding:11px 13px;background:var(--tag);
  border-radius:var(--radius-sm);margin-bottom:12px}
.steps-list{display:flex;flex-direction:column;gap:8px}
.step-row{display:grid;grid-template-columns:78px 1fr;gap:10px;align-items:start}
.step-k{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  color:var(--muted);padding-top:2px}
.step-v{font-size:13px;line-height:1.5}
.an-list{margin:0;padding-left:18px;font-size:13px;line-height:1.55}
.an-list li{margin:4px 0}
.clamp6{display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}

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
.theme-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:var(--tag);
  border:1px solid var(--border);border-radius:999px;font-size:12px;color:var(--fg);margin:0 4px 5px 0}
.theme-chip b{color:var(--brand,var(--blue));font-variant-numeric:tabular-nums}
.sec-label{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  color:var(--muted);margin-bottom:7px}
.cbadge{font-size:10px;font-weight:700;border-radius:4px;padding:1px 5px;white-space:nowrap}
.cbadge.pin{color:#b45309;background:#fef3c7}
.cbadge.liked{color:#be185d;background:#fce7f3}
.cmeta{font-size:11px;color:var(--muted);margin-top:5px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ctext{font-size:13px;color:var(--fg);line-height:1.45}
.ctext.clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cmore{background:none;border:none;color:var(--blue);font-size:11.5px;font-weight:600;
  cursor:pointer;padding:3px 0 0;font-family:inherit}
.comment-row{padding:10px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;gap:10px;transition:var(--transition);}
.comment-row:last-child{border-bottom:none;}
.comment-row:hover{background:var(--tag);margin:0 -6px;padding:10px 6px;border-radius:var(--radius-sm);}

/* ─── Creator cards ─── */
.creator-card{border:1px solid var(--border);border-radius:var(--radius);padding:16px;width:min(240px,80vw);min-width:min(240px,80vw);background:var(--card);display:block;box-shadow:var(--shadow-sm);transition:var(--transition);scroll-snap-align:start;flex-shrink:0}
.creator-card:hover{box-shadow:var(--shadow-md);transform:translateY(-2px);}
.avatar{width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid var(--border);}
.avatar-placeholder{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;}
.verified{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;color:#fff;font-size:10px;margin-left:4px;}

/* ─── Sound cards ─── */
.sound-card{border:1px solid var(--border);border-radius:var(--radius);padding:14px;width:min(300px,88vw);min-width:min(300px,88vw);background:var(--card);display:block;box-shadow:var(--shadow-sm);transition:var(--transition);scroll-snap-align:start;flex-shrink:0}
.sound-card:hover{box-shadow:var(--shadow-md);transform:translateY(-2px);}
.sound-cover{width:68px;height:68px;border-radius:var(--radius-sm);object-fit:cover;}

/* ─── Media player ─── */
/* ONE player shell for every kind of media. A video and a slideshow differ
   only in what sits on the stage — the overlay chrome and the control bar
   below are the same elements, in the same order, every time. */
/* The player is one aspect-correct block: the stage, the overlay furniture
   and the control bar share its box, so the controls always span exactly the
   media and never float over dead space.
   Width is derived from the height cap, so the media is fully visible without
   scrolling (never taller than --stage-max) and never wider than the frame. */
.mp{--ar-w:9;--ar-h:16;position:relative;background:#000;overflow:hidden;margin:0 auto;
  width:min(100%,calc(var(--stage-max,520px) * var(--ar-w) / var(--ar-h)));}
/* Inside a media card the card already owns the width; just fill it. */
.card-media>.mp{width:100%;}
.mp.h{--ar-w:16;--ar-h:9}
.mp.sq{--ar-w:1;--ar-h:1}
.mp-stage{position:relative;width:100%;aspect-ratio:var(--ar-w) / var(--ar-h);max-height:var(--stage-max,520px);background:#000;overflow:hidden;}
.mp .mp-stage>video{width:100%;height:100%;max-height:none;object-fit:contain;display:block;background:#000;}
.mp .mp-slide{position:absolute;inset:0;width:100%;height:100%;max-height:none;object-fit:contain;opacity:0;transition:opacity .45s ease;background:#000;transform:none;}
.mp-slide.active{opacity:1;}

/* Overlay chrome — platform-native furniture sitting on the media itself. */
.mp-ov{position:absolute;inset:0;pointer-events:none;z-index:2;}
/* Overlay text sits on whatever the media happens to be — a bright frame
   would swallow it, so the lower third gets a scrim to read against. */
.mp-ov::after{content:"";position:absolute;left:0;right:0;bottom:0;height:46%;
  background:linear-gradient(transparent,rgba(0,0,0,.28) 38%,rgba(0,0,0,.72));pointer-events:none;}
.mp-ov::before{content:"";position:absolute;left:0;right:0;top:0;height:16%;
  background:linear-gradient(rgba(0,0,0,.45),transparent);pointer-events:none;}
.mp-badge,.mp-chip,.mp-rail,.mp-meta,.mp-tap,.mp-nav{z-index:1;}
.mp-ov>*{pointer-events:auto;}
.mp-badge{position:absolute;top:10px;left:10px;display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);color:#fff;font-size:11px;font-weight:700;text-transform:capitalize;}
.mp-pick{position:absolute;top:9px;right:9px;z-index:3;width:26px;height:26px;border-radius:50%;
  border:2px solid rgba(255,255,255,.85);background:rgba(0,0,0,.42);backdrop-filter:blur(6px);
  cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;
  color:transparent;transition:var(--transition)}
.mp-pick:hover{background:rgba(0,0,0,.66);transform:scale(1.08)}
/* Sits beside the checkbox so the card footer can go away entirely - the
   footer button cost a whole row under every card in a gallery. */
.mp-open{position:absolute;top:9px;right:9px;z-index:3;width:26px;height:26px;border-radius:50%;
  border:2px solid rgba(255,255,255,.85);background:rgba(0,0,0,.42);backdrop-filter:blur(6px);
  cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;
  color:#fff;text-decoration:none;transition:var(--transition)}
.mp-open:hover{background:rgba(0,0,0,.66);transform:scale(1.08)}
.mp-open.with-pick{right:43px}
.mp-pick[aria-pressed="true"]{background:var(--brand,#ff4d23);border-color:#fff;color:#fff}
.mp.picked{outline:2px solid var(--brand,#ff4d23);outline-offset:-2px}
/* The slide counter moves down so it never sits under the checkbox. */
.mp-pick~.mp-chip,.mp[data-mp="slides"] .mp-chip{top:42px}

/* Selection menu — appears only once something is picked. */
.pickbar{position:sticky;bottom:0;z-index:20;display:flex;align-items:center;gap:10px;
  margin:12px 0 0;padding:10px 12px;border-radius:999px;background:var(--card);
  border:1px solid var(--border);box-shadow:var(--shadow-lg);animation:fadeIn .2s ease-out}
.pickbar .n{font-size:13px;font-weight:700;white-space:nowrap}
.pickbar .sp{flex:1}
.pickbar button{border-radius:999px;border:1px solid var(--border);background:var(--card);
  color:var(--fg);font:inherit;font-size:12.5px;font-weight:600;padding:6px 13px;cursor:pointer;
  white-space:nowrap;transition:var(--transition)}
.pickbar button.primary{background:var(--brand,#ff4d23);border-color:transparent;color:#fff}
.pickbar button:hover{filter:brightness(1.08)}
.pickbar button:disabled{opacity:.5;cursor:not-allowed}
.pickbar .hint{font-size:11.5px;color:var(--muted)}
.mp-chip{position:absolute;top:10px;right:10px;padding:3px 9px;border-radius:999px;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);color:#fff;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;}

/* Right-hand action rail — the TikTok/Reels engagement column. */
.mp-rail{position:absolute;right:8px;bottom:76px;display:flex;flex-direction:column;align-items:center;gap:14px;}
.mp-act{display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:none;padding:0;cursor:default;}
.mp-act .ic{width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.4);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;color:#fff;transition:var(--transition);}
.mp-act:hover .ic{background:rgba(0,0,0,.62);transform:scale(1.06)}
.mp-act .n{color:#fff;font-size:11px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.8);font-variant-numeric:tabular-nums;}

/* Bottom-left caption block — handle, text, track. */
.mp-meta{position:absolute;left:12px;right:64px;bottom:60px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.85);}
.mp-handle{font-size:13px;font-weight:800;margin-bottom:3px;}
.mp-cap{font-size:12px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;opacity:.95;}
.mp-song{display:flex;align-items:center;gap:5px;margin-top:6px;font-size:11px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.mp-song .note{display:inline-flex;flex-shrink:0}
/* Spins only while the track is actually playing — a permanently rotating
   note just reads as a rendering glitch. */
.mp.playing .mp-song .note{animation:spin 3s linear infinite;}
.mp-song-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@keyframes spin{to{transform:rotate(360deg)}}

/* Centre tap target — the big play triangle while paused. */
.mp-tap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border:none;background:transparent;cursor:pointer;}
.mp-tap span{width:64px;height:64px;border-radius:50%;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;font-size:26px;color:#fff;transition:var(--transition);opacity:1;}
.mp.playing .mp-tap span{opacity:0;}
.mp.playing:hover .mp-tap span{opacity:.65;}

/* Step arrows — slideshows only, but the same shape as everything else. */
.mp-nav{position:absolute;top:50%;transform:translateY(-50%);width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;opacity:0;transition:var(--transition);}
.mp:hover .mp-nav,.mp:focus-within .mp-nav{opacity:1;}
.mp-nav.prev{left:8px}.mp-nav.next{right:8px}
.mp-nav:hover{background:rgba(0,0,0,.8)}

/* Control bar — IDENTICAL markup for video and slideshow. */
.mp-ctl{position:absolute;left:0;right:0;bottom:0;z-index:3;display:flex;align-items:center;gap:9px;padding:9px 11px;background:linear-gradient(transparent,rgba(0,0,0,.85));}
.mp-btn{width:30px;height:30px;flex-shrink:0;border-radius:50%;background:rgba(255,255,255,.95);color:#111;border:none;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;transition:var(--transition);}
.mp-btn:hover{transform:scale(1.09)}
.mp-time{color:#fff;font-size:10px;font-weight:700;font-variant-numeric:tabular-nums;flex-shrink:0;text-shadow:0 1px 2px rgba(0,0,0,.8);}
.mp-seek{flex:1;min-width:0;height:14px;display:flex;align-items:center;cursor:pointer;}
/* One seek widget: a plain bar for video, segmented for a slideshow. */
.mp-segs{width:100%;height:3px;display:flex;gap:2px;border-radius:999px;overflow:hidden;}
.mp-seg{flex:1;height:100%;background:rgba(255,255,255,.32);border-radius:999px;overflow:hidden;}
.mp-seg>i{display:block;height:100%;width:0;background:#fff;border-radius:999px;}
.mp-seg.done>i{width:100%;}
.mp-icon{background:none;border:none;color:#fff;cursor:pointer;font-size:14px;flex-shrink:0;opacity:.9;padding:0;line-height:1;}
.mp-icon:hover{opacity:1}

/* Buffering + failure — visible states, not a frozen black frame. */
.mp-spin{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:2;pointer-events:none;}
.mp-spin>i{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;animation:spin .8s linear infinite;}
/* Purely informational - it has no controls of its own. Left clickable it
   covered the whole player at z-index 4, so on a post whose video failed
   to load it swallowed the taps meant for the select-for-comparison
   checkbox underneath, and the card could not be picked at all. */
.mp-err{pointer-events:none;position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;z-index:4;background:rgba(0,0,0,.82);color:#fff;font-size:12px;font-weight:600;text-align:center;padding:16px;}

/* Keyboard focus has to be visible — the player is reachable by Tab. */
.mp:focus-visible{outline:2px solid #fff;outline-offset:-2px;}
.mp-btn:focus-visible,.mp-icon:focus-visible,.mp-nav:focus-visible,.mp-tap:focus-visible,
.au-play:focus-visible,.gallery-nav:focus-visible,.dot:focus-visible{outline:2px solid #fff;outline-offset:2px;}
.mp-seek{position:relative;}
.mp-seek:hover .mp-segs{height:5px;}
.mp-segs{transition:height .15s ease;}

/* Respect a reduced-motion preference: no spinning note, no crossfades. */
@media(prefers-reduced-motion:reduce){
  .mp-song .note{animation:none}
  .mp-slide{transition:none}
  .mp-spin>i{animation-duration:2s}
  *{scroll-behavior:auto !important}
}

/* ─── Inline audio player (sound cards) ─── */
.au{display:flex;align-items:center;gap:10px;margin-top:10px;}
.au-play{width:34px;height:34px;flex-shrink:0;border-radius:50%;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:var(--transition);box-shadow:0 0 0 1px color-mix(in srgb,var(--fg) 22%,transparent);}
.au-play:hover{transform:scale(1.08);filter:brightness(1.1)}
.au-body{flex:1;min-width:0}
.au-seek{width:100%;height:5px;border-radius:999px;background:color-mix(in srgb,var(--fg) 22%,transparent);cursor:pointer;overflow:hidden;position:relative}
.au-seek>i{display:block;height:100%;width:0;border-radius:999px;background:var(--accent);}
.au-time{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:3px;font-variant-numeric:tabular-nums}
.au-missing{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);margin-top:8px;}

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
  /* How many results a tool comes back with, and in what shape — so the
     skeleton matches the answer instead of being a generic grey box. */
  var LOADING_SHAPE={
    get_social_media:        {kind:"post",  n:1, label:"Fetching the post"},
    get_post_transcript:     {kind:"text",  n:1, label:"Reading the caption track"},
    analyze_post:            {kind:"post",  n:1, label:"Analysing the post"},
    understand_social_post:  {kind:"post",  n:1, label:"Watching the video"},
    analyze_creator_profile: {kind:"list",  n:4, label:"Reading the profile"},
    compare_posts:           {kind:"strip", n:2, label:"Comparing posts"},
    discover_social_posts:   {kind:"strip", n:3, label:"Searching posts"},
    get_user_posts:          {kind:"strip", n:3, label:"Loading their posts"},
    search_creators:         {kind:"list",  n:5, label:"Finding creators"},
    get_similar_creators:    {kind:"list",  n:5, label:"Finding similar creators"},
    discover_sounds:         {kind:"list",  n:4, label:"Finding trending sounds"},
    discover_hashtags:       {kind:"list",  n:6, label:"Reading the trend board"},
    get_post_comments:       {kind:"list",  n:6, label:"Loading comments"},
    analyze_comments:        {kind:"text",  n:1, label:"Reading the comment section"},
    check_orchyn_credits:    {kind:"text",  n:1, label:"Checking your balance"},
    buy_orchyn_credits:      {kind:"text",  n:1, label:"Opening checkout"}
  };

  function skPostCard(){
    return '<div class="sk-card"><div class="sk sk-media"></div><div class="sk-body">'
      +'<span class="sk sk-pill" style="width:64px"></span>'
      +'<div class="sk sk-line w80"></div><div class="sk sk-line w60"></div></div></div>';
  }
  function skRow(){
    return '<div class="sk-row"><div class="sk sk-avatar"></div>'
      +'<div style="flex:1;min-width:0"><div class="sk sk-line w40"></div>'
      +'<div class="sk sk-line w80"></div></div></div>';
  }
  function skText(){
    return '<div class="sk sk-line w60"></div><div class="sk sk-line"></div>'
      +'<div class="sk sk-line"></div><div class="sk sk-line w80"></div>'
      +'<div style="margin-top:14px"><span class="sk sk-pill"></span>'
      +'<span class="sk sk-pill" style="width:58px"></span>'
      +'<span class="sk sk-pill" style="width:92px"></span></div>';
  }

  /** Skeleton that mirrors the shape of the result the tool will return. */
  // The tool-input notifications carry only the arguments, never the tool
  // name, so when the host does not add one the arguments decide the shape.
  // Guessing the skeleton wrong costs nothing - it is a placeholder - while
  // always falling back to a bare text block made every load look the same.
  function shapeFromArgs(a){
    if(!a||typeof a!=="object")return null;
    if(Array.isArray(a.urls))
      return {kind:"strip",n:Math.min(5,Math.max(2,a.urls.length)),label:"Comparing posts"};
    if(a.draft)return {kind:"text",n:1,label:"Scoring the draft"};
    if(a.username)return {kind:"strip",n:3,label:"Loading their posts"};
    if(a.country||a.days)return {kind:"list",n:6,label:"Reading the trend board"};
    if(a.niche||a.keyword)return {kind:"strip",n:3,label:"Searching"};
    if(a.url)return {kind:"post",n:1,label:"Working on the post"};
    if(a.topic)return {kind:"text",n:1,label:"Writing"};
    return null;
  }

  function renderCancelled(reason){
    var app=document.getElementById("app");
    if(!app||toolResultReceived)return;
    app.innerHTML='<div class="empty-state fade-in"><div class="icon">x</div><div class="text">'
      +esc(reason?("Cancelled: "+reason):"The tool call was cancelled")+"</div></div>";
    setTimeout(reportSize,50);
  }

  function renderLoading(tool,args){
    var app=document.getElementById("app");
    if(!app||toolResultReceived)return;
    var shape=LOADING_SHAPE[tool]||shapeFromArgs(args)||{kind:"text",n:1,label:"Working"};
    var inner="";
    if(shape.kind==="post"){
      inner='<div style="display:flex;justify-content:center">'+skPostCard()+"</div>";
    }else if(shape.kind==="strip"){
      var cards="";
      for(var i=0;i<shape.n;i++)cards+=skPostCard();
      inner='<div class="sk-strip">'+cards+"</div>";
    }else if(shape.kind==="list"){
      var rows="";
      for(var j=0;j<shape.n;j++)rows+=skRow();
      inner='<div class="card card-wide"><div class="card-body">'+rows+"</div></div>";
    }else{
      inner='<div class="card card-wide"><div class="card-body">'+skText()+"</div></div>";
    }
    app.innerHTML='<div class="fade-in"><div class="load-bar"></div>'
      +'<div class="load-head"><span class="dot"></span><span>'
      +esc(shape.label)+"…</span></div>"+inner+"</div>";
    setTimeout(reportSize,50);
  }

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

  // ChatGPT hands the result over as a global rather than a message. Its docs
  // call the postMessage bridge above the portable path and this the
  // compatibility alias, but a host that only sets the global would leave the
  // view sitting on its placeholder forever - so read it too. Claude never
  // defines window.openai, so nothing here runs there.
  var lastOutRef=null,lastOutSig="";
  function readHostGlobals(){
    var api=window.openai;
    if(!api)return;
    var out=api.toolOutput;
    if(out){
      // set_globals fires for theme, display mode and height changes as well
      // as for results. Rendering on every one of them rebuilt every <video>
      // and <audio> in the view each time, which is the flashing - and Chrome
      // logged 982 "too many WebMediaPlayers already in existence"
      // interventions as the discarded players piled up. Only a genuinely new
      // result is worth a render.
      if(out===lastOutRef)return;
      var sig="";
      try{sig=JSON.stringify(out);}catch(e){sig="";}
      if(sig&&sig===lastOutSig){lastOutRef=out;return;}
      lastOutRef=out;lastOutSig=sig;
      toolResultReceived=true;
      // The bridge passes {structuredContent}; the alias passes the structured
      // content itself. Accept either rather than guessing.
      render(out.structuredContent?out:{structuredContent:out});
      setTimeout(reportSize,50);
    }else if(api.toolInput&&!toolResultReceived&&!lastOutRef){
      renderLoading(currentTool,api.toolInput);
    }
  }
  window.addEventListener("openai:set_globals",function(ev){
    var g=ev&&ev.detail?ev.detail.globals:null;
    if(g){
      window.openai=window.openai||{};
      if(g.toolOutput!==undefined)window.openai.toolOutput=g.toolOutput;
      if(g.toolInput!==undefined)window.openai.toolInput=g.toolInput;
    }
    readHostGlobals();
  },{passive:true});
  readHostGlobals();

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
    // tool-input is the one the spec requires and sends exactly once;
    // tool-input-partial is optional streaming on top of it. Listening only
    // for the partial meant a host that does not stream left the view sitting
    // on its idle placeholder until the result landed, with no shimmer at all.
    if(d.method==="ui/notifications/tool-input"
       ||d.method==="ui/notifications/tool-input-partial"){
      var pp=d.params||{};
      // The payload is just {arguments}; a host may add the name, so use it
      // when offered and shape the skeleton from the arguments when not.
      var n=pp.name||pp.toolName||"";
      if(n)currentTool=n;
      // A view is reused across calls, and this flag was set on the first
      // result and never cleared - so every later call skipped the shimmer
      // and left the previous tool's cards on screen. Asking for Instagram
      // posts and then TikTok showed the Instagram ones again. A new input
      // notification means a new call, so the old result no longer stands.
      toolResultReceived=false;
      renderLoading(currentTool,pp.arguments);
    }
    if(d.method==="ui/notifications/tool-cancelled"){
      renderCancelled(d.params&&d.params.reason);
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
  /** "3d" / "2h" for an ISO timestamp — compact enough for a chat panel. */
  function relTime(iso){
    var t=Date.parse(iso);
    if(isNaN(t))return "";
    var s=Math.floor((Date.now()-t)/1000);
    if(s<0)return "";
    if(s<3600)return Math.max(1,Math.floor(s/60))+"m";
    if(s<86400)return Math.floor(s/3600)+"h";
    if(s<2592000)return Math.floor(s/86400)+"d";
    if(s<31536000)return Math.floor(s/2592000)+"mo";
    return Math.floor(s/31536000)+"y";
  }
  function fmtTime(sec){sec=Math.max(0,Math.floor(Number(sec)||0));return Math.floor(sec/60)+":"+("0"+(sec%60)).slice(-2);}

  // ─── Audio engine ───
  // Every <audio> in the view registers here so only one track is ever
  // audible: starting a sound preview pauses a playing slideshow and vice
  // versa. Elements are re-collected after each render.
  var audioReg=[];
  function registerAudio(el){
    if(!el||audioReg.indexOf(el)>-1)return;
    audioReg.push(el);
    el.addEventListener("play",function(){
      for(var i=0;i<audioReg.length;i++){
        var a=audioReg[i];
        if(a!==el&&!a.paused){try{a.pause();}catch(e){}}
      }
    });
  }
  function resetAudio(){
    for(var i=0;i<audioReg.length;i++){try{audioReg[i].pause();}catch(e){}}
    audioReg=[];
  }

  // ─── Media player controller ───
  // A transport hides the difference between the two media kinds behind one
  // interface (duration/time/seek/play/pause). The control bar is wired to
  // the transport, never to a <video> or an <audio> directly, so the same
  // handlers drive every player and the controls behave identically.
  var SLIDE_MS=3000;

  function videoTransport(box){
    var v=box.querySelector("video");
    return {
      kind:"video",
      el:v,
      // Until metadata loads the element reports NaN for its duration. With
      // preload="none" that is the whole time before the first press, and a
      // scrubber reading 0:00 of 0:00 looks like a card that has failed
      // rather than one waiting. The listing already told us how long the
      // post is, so fall back to that.
      duration:function(){
        if(isFinite(v.duration)&&v.duration>0)return v.duration;
        var d=Number(box.getAttribute("data-mp-dur"))||0;
        return d>0?d:0;
      },
      time:function(){return v.currentTime||0;},
      paused:function(){return v.paused;},
      play:function(){var r=v.play();if(r&&r.catch)r.catch(function(){});},
      pause:function(){try{v.pause();}catch(e){}},
      seek:function(t){try{v.currentTime=t;}catch(e){}},
      muted:function(m){if(m===undefined)return v.muted;v.muted=m;return m;},
      step:function(dir){this.seek(Math.max(0,this.time()+dir*5));},
      // Video paints one continuous segment.
      segment:function(){return 0;},
      audio:null,
      on:function(ev,cb){v.addEventListener(ev,cb);}
    };
  }

  function slidesTransport(box){
    var slides=box.querySelectorAll(".mp-slide");
    var audio=box.querySelector("audio");
    var total=slides.length||1;
    var idx=0,base=0,startedAt=0,running=false,seekBroken=false;
    // With a track, the track is the clock and each slide owns an equal share
    // of it. Without one, slides run on a fixed beat.
    // A track we cannot seek (a host that serves the audio without range
    // support) would strand the clock at zero while the slides moved on, so
    // we fall back to the wall clock the first time a seek refuses to take.
    function driven(){
      return !seekBroken&&!!audio&&isFinite(audio.duration)&&audio.duration>0;
    }
    function per(){return driven()?audio.duration/total:SLIDE_MS/1000;}
    function paint(){
      for(var k=0;k<total;k++)slides[k].classList.toggle("active",k===idx);
      var chip=box.querySelector(".mp-idx");
      if(chip)chip.textContent=idx+1;
    }
    var t={
      kind:"slides",
      el:box,
      total:total,
      audio:audio,
      duration:function(){return driven()?audio.duration:total*(SLIDE_MS/1000);},
      time:function(){
        if(driven())return audio.currentTime||0;
        return base+(running?(Date.now()-startedAt)/1000:0);
      },
      paused:function(){return !running;},
      play:function(){
        running=true;startedAt=Date.now();
        if(audio){var r=audio.play();if(r&&r.catch)r.catch(function(){});}
      },
      pause:function(){
        if(running)base=t.time();
        running=false;
        if(audio){try{audio.pause();}catch(e){}}
      },
      seek:function(sec){
        sec=Math.max(0,Math.min(sec,t.duration()));
        base=sec;startedAt=Date.now();
        if(audio){
          try{
            audio.currentTime=sec;
            if(sec>0.5&&Math.abs(audio.currentTime-sec)>1)seekBroken=true;
          }catch(e){seekBroken=true;}
        }
        idx=Math.max(0,Math.min(total-1,Math.floor(sec/per())));
        paint();
      },
      muted:function(m){
        if(!audio)return true;
        if(m===undefined)return audio.muted;
        audio.muted=m;return m;
      },
      // Slideshows step a whole slide at a time, not five seconds.
      step:function(dir){t.seek((idx+dir)*per());},
      segment:function(){return idx;},
      sync:function(){
        var want=Math.max(0,Math.min(total-1,Math.floor(t.time()/per())));
        if(want!==idx){idx=want;paint();}
        return t.time()>=t.duration();
      },
      on:function(ev,cb){if(audio)audio.addEventListener(ev,cb);}
    };
    paint();
    return t;
  }

  // ─── AI actions ───
  // A button that spends credits must show that it will: sparkle to mark it
  // as an AI action, and the price on the face. The click asks the host to
  // run the tool, and falls back to copying a ready prompt where the host
  // cannot run one from a view.
  var AI_PRICE={analyze_post_fast:2,write_hooks:2,create_variants:3,score_draft:2,
    repurpose_post:2,niche_report:3,find_hook_pattern:2,analyze_post:6,
    analyze_comments:6,compare_posts:8,understand_social_post:6,analyze_creator_profile:15};

  function aiBtn(tool,label,argsJson){
    var cost=AI_PRICE[tool]||0;
    return '<button class="ai-btn" type="button" data-ai="'+esc(tool)+'" data-args="'+esc(argsJson)+'">'
      +'<span class="spark">'+mpIcon("sparkle",13)+"</span><span>"+esc(label)+"</span>"
      +(cost?'<span class="price">'+cost+" cr</span>":"")+"</button>";
  }

  /** Buttons offered under a single post. */
  function postAiActions(p){
    var url=p&&(p.externalUrl||p.url);
    if(!url)return "";
    var a=JSON.stringify({url:url});
    return '<div class="ai-actions">'
      +aiBtn("create_variants","Create variants",a)
      +aiBtn("write_hooks","Write hooks",a)
      +aiBtn("repurpose_post","Repurpose",a)
      +aiBtn("analyze_comments","Read comments",a)
      +"</div>";
  }

  function runAiTool(btn){
    var tool=btn.getAttribute("data-ai");
    var args={};
    try{args=JSON.parse(btn.getAttribute("data-args")||"{}");}catch(e){}
    var label=btn.querySelector("span:nth-child(2)");
    var original=label?label.textContent:"";
    btn.disabled=true;btn.classList.add("busy");
    if(label)label.textContent="Working…";
    var restore=function(text){
      btn.classList.remove("busy");
      if(label)label.textContent=text||original;
      setTimeout(function(){btn.disabled=false;if(label)label.textContent=original;},1600);
    };
    var settled=false;
    var fallback=function(){
      if(settled)return;settled=true;
      var ask="Run "+tool+" on "+(args.url||JSON.stringify(args));
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(ask).then(function(){restore("Copied ✓");})
          .catch(function(){restore("Try in chat");});
      }else restore("Try in chat");
    };
    var pr=null;
    try{pr=send("tools/call",{name:tool,arguments:args});}catch(e){}
    if(pr&&pr.then){
      pr.then(function(){settled=true;restore("Sent ✓");}).catch(fallback);
      setTimeout(fallback,1500);
    }else fallback();
  }

  document.addEventListener("click",function(e){
    var b=e.target.closest&&e.target.closest(".ai-btn[data-ai]");
    if(b&&!b.disabled)runAiTool(b);
  });

  // A sandboxed view cannot navigate the top-level window, so a plain anchor
  // does nothing in most hosts - the "Open on ..." buttons and the trending
  // hashtag rows were all inert. MCP Apps exposes ui/open-link for this.
  // window.open stays as the fallback for hosts that do allow it.
  document.addEventListener("click",function(e){
    var a=e.target.closest&&e.target.closest("a[href]");
    if(!a)return;
    var href=a.getAttribute("href")||"";
    if(href.indexOf("http")!==0)return;
    e.preventDefault();
    var popOut=function(){try{window.open(href,"_blank","noopener");}catch(err){}};
    var pr=null;
    try{pr=send("ui/open-link",{url:href});}catch(err2){}
    if(pr&&pr.then)pr.catch(popOut); else popOut();
  });

  // ─── Post selection & comparison ───
  // Comparing posts is the one action that needs more than one card, so the
  // cards themselves carry the control: a checkbox on the media, and a menu
  // that only exists once something is picked.
  var picked = [];

  function pickBarHtml(){
    return '<div class="pickbar" id="pickbar" hidden>'
      +'<span class="n"><b id="pickn">0</b> selected</span>'
      +'<span class="hint" id="pickhint">Pick 2 or more to compare</span>'
      +'<span class="sp"></span>'
      +'<button type="button" id="pickclear">Clear</button>'
      +'<button type="button" id="pickgo" class="primary" disabled>Compare</button>'
      +"</div>";
  }

  function syncPickBar(){
    var bar=document.getElementById("pickbar");
    if(!bar)return;
    bar.hidden = picked.length===0;
    var n=document.getElementById("pickn");
    if(n)n.textContent=picked.length;
    var urls=pickedUrls();
    var go=document.getElementById("pickgo");
    if(go)go.disabled = urls.length<2 || urls.length>5;
    var hint=document.getElementById("pickhint");
    if(hint){
      hint.textContent = picked.length>5 ? "Compare takes at most 5"
        : urls.length<2 ? (picked.length>=2 ? "Those are the same post" : "Pick 2 or more to compare")
        : "Ready to compare";
    }
    setTimeout(reportSize,60);
  }

  function initPicks(){
    picked=[];
    document.addEventListener("click",onPickClick);
    var clear=document.getElementById("pickclear");
    if(clear)clear.addEventListener("click",function(){
      picked=[];
      document.querySelectorAll('.mp-pick[aria-pressed="true"]').forEach(function(b){
        b.setAttribute("aria-pressed","false");
        var mp=b.closest(".mp"); if(mp)mp.classList.remove("picked");
      });
      syncPickBar();
    });
    var go=document.getElementById("pickgo");
    if(go)go.addEventListener("click",runCompare);
    syncPickBar();
  }

  function onPickClick(e){
    var b=e.target.closest&&e.target.closest(".mp-pick[data-pick]");
    if(!b)return;
    e.stopPropagation(); // never let the tap reach the player underneath
    var id=b.getAttribute("data-pick-id");
    var i=picked.findIndex(function(x){return x.id===id;});
    var on=i<0;
    if(on)picked.push({id:id,url:b.getAttribute("data-pick")});
    else picked.splice(i,1);
    b.setAttribute("aria-pressed",on?"true":"false");
    var mp=b.closest(".mp");
    if(mp)mp.classList.toggle("picked",on);
    syncPickBar();
  }

  /** Distinct URLs from the current selection — the same post picked twice
   *  is still one post to compare. */
  function pickedUrls(){
    var seen=[],out=[];
    picked.forEach(function(x){
      if(x.url&&seen.indexOf(x.url)<0){seen.push(x.url);out.push(x.url);}
    });
    return out;
  }

  /** Ask the host to run compare_posts; fall back to copying the URLs.
   *  The method is "tools/call" - MCP Apps reuses the core MCP method for
   *  tool invocation rather than defining a prefixed one of its own. This
   *  used to send a ui-prefixed name that no host answers, so every in-view
   *  action button silently timed out into the clipboard fallback. */
  function runCompare(){
    var go=document.getElementById("pickgo");
    var urls=pickedUrls().slice(0,5);
    if(!go||urls.length<2)return;
    go.disabled=true; go.textContent="Comparing…";
    var done=function(label){
      go.textContent=label;
      setTimeout(function(){ go.textContent="Compare"; syncPickBar(); },1800);
    };
    // Preferred path: the host runs the tool for us.
    var p=null;
    try{ p=send("tools/call",{name:"compare_posts",arguments:{urls:urls}}); }catch(e){}
    var settled=false;
    var fallback=function(){
      if(settled)return; settled=true;
      // Hosts that do not support tool-calls from a view still let the user
      // paste — so hand them something ready to send.
      // Build the newline from a char code rather than an escape sequence.
      // This template is embedded both in a Rust raw string (escapes stay
      // literal) and a TS template literal (escapes are resolved), so an
      // escaped newline here becomes a real one in the TS build and breaks
      // the surrounding string literal. Same reason this comment avoids one.
      var NL=String.fromCharCode(10);
      var text="Compare these posts:"+NL+urls.join(NL);
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){done("Copied ✓");})
          .catch(function(){done("Copy failed");});
      } else done("Copy failed");
    };
    if(p&&p.then){
      p.then(function(){ settled=true; done("Sent ✓"); }).catch(fallback);
      setTimeout(fallback,1500);
    } else fallback();
  }

  // Images cannot bubble an error, so this listens in the capture phase: any
  // <img data-fallback> that fails swaps to its fallback once. Thumbnails and
  // sound covers expire the same way videos do - a TikTok poster lasts about
  // five hours - and a dead cover is the most visible kind of broken card.
  document.addEventListener("error",function(e){
    var el=e.target;
    if(!el||el.tagName!=="IMG")return;
    var alt=el.getAttribute("data-fallback")||"";
    if(!alt||el.getAttribute("src")===alt)return;
    el.removeAttribute("data-fallback");
    el.setAttribute("src",alt);
  },true);

  // ─── Player registry ───
  // Exclusivity cannot ride on the audio elements alone: a silent slideshow
  // owns no <audio>, so it would happily keep advancing underneath a video
  // that just started. Every player registers its own stop() instead.
  var players=[];
  function registerPlayer(rec){players.push(rec);}
  function stopOtherPlayers(except){
    for(var i=0;i<players.length;i++){
      if(players[i]!==except&&players[i].isPlaying())players[i].stop(false);
    }
  }
  function stopAllPlayers(){stopOtherPlayers(null);}
  function resetPlayers(){stopAllPlayers();players=[];}

  // Mute is a session preference, not a per-card one — having to silence
  // every card in a feed one at a time is the kind of thing that makes people
  // close the tab.
  var mutePref=false;

  function initMediaPlayers(root){
    var nodes=(root||document).querySelectorAll(".mp[data-mp]");
    for(var n=0;n<nodes.length;n++)initMediaPlayer(nodes[n]);
    observeVisibility();
  }

  // ─── Pause on scroll-away ───
  // Paging to the next card in a gallery must stop the one you left, or two
  // soundtracks end up playing over each other.
  var mpObserver=null;
  function observeVisibility(){
    if(!("IntersectionObserver" in window))return;
    if(mpObserver)mpObserver.disconnect();
    mpObserver=new IntersectionObserver(function(entries){
      for(var i=0;i<entries.length;i++){
        var e=entries[i],rec=e.target.__mpRec;
        if(!rec)continue;
        if(e.intersectionRatio>=0.6){rec.wasVisible=true;warmMedia(e.target);continue;}
        // Only a card that was genuinely on screen and has scrolled away
        // stops. Without the transition check, a smooth-scroll that is still
        // settling reads as "off screen" and kills playback the instant the
        // user presses play on a partly-visible card.
        if(e.intersectionRatio<0.25&&rec.wasVisible){
          rec.wasVisible=false;
          if(rec.isPlaying())rec.stop(false);
        }
      }
    },{threshold:[0,0.25,0.6,1]});
    var nodes=document.querySelectorAll(".mp[data-mp]");
    for(var n=0;n<nodes.length;n++)mpObserver.observe(nodes[n]);
  }

  // Leaving the tab (or the host collapsing the view) must not leave audio
  // playing out of sight.
  document.addEventListener("visibilitychange",function(){
    if(document.hidden)stopAllPlayers();
  });
  window.addEventListener("pagehide",stopAllPlayers);

  // Resolver-backed video costs eight to twenty-five seconds before a URL
  // comes back. That is the provider's own latency, measured across repeated
  // calls for the same video, and they do not cache it - so nothing we do on
  // our side makes the *first* one quick. Left until the play button is
  // pressed, all of it is spent staring at a spinner, which is what "loads
  // indefinitely" was.
  //
  // A card that is genuinely on screen therefore warms itself, once. Metadata
  // only - a small range request, not the video - and it primes the resolve
  // cache so the press that follows is instant. Cards nobody scrolls to cost
  // nothing, which is the whole reason preload is "none" to begin with.
  function warmMedia(box){
    if(box.__mpWarm)return;
    var v=box.querySelector("video");
    if(!v)return;
    var src=v.getAttribute("src")||"";
    if(src.indexOf("/media/resolve")<0||v.preload!=="none")return;
    box.__mpWarm=true;
    v.preload="metadata";
    try{v.load();}catch(e){}
  }

  function initMediaPlayer(box){
    if(box.__mpInit)return;
    box.__mpInit=true;
    var t=box.getAttribute("data-mp")==="video"?videoTransport(box):slidesTransport(box);
    if(!t.el)return;
    if(t.audio)registerAudio(t.audio);
    if(t.kind==="video")registerAudio(t.el);

    var playBtn=box.querySelector(".mp-play");
    var tapBtn=box.querySelector(".mp-tap");
    var muteBtn=box.querySelector(".mp-mute");
    var seekBar=box.querySelector(".mp-seek");
    var segs=box.querySelectorAll(".mp-seg");
    var curEl=box.querySelector(".mp-cur");
    var durEl=box.querySelector(".mp-dur");
    // Driven by an interval, not requestAnimationFrame: hosts render these
    // cards in iframes that often are not compositing, where rAF never fires.
    var ticker=null;

    function paintSeek(){
      var d=t.duration(),now=t.time();
      if(segs.length<=1){
        if(segs[0])segs[0].firstChild.style.width=(d>0?Math.min(100,(now/d)*100):0)+"%";
      }else{
        var per=d/segs.length,active=t.segment();
        for(var k=0;k<segs.length;k++){
          segs[k].classList.toggle("done",k<active);
          segs[k].firstChild.style.width=
            k<active?"100%":k>active?"0":Math.max(0,Math.min(100,((now-k*per)/per)*100))+"%";
        }
      }
      if(curEl)curEl.textContent=fmtTime(now);
      if(durEl)durEl.textContent=fmtTime(d);
    }
    function setPlaying(on){
      box.classList.toggle("playing",on);
      if(playBtn){
        playBtn.innerHTML=mpIcon(on?"pause":"play",16);
        playBtn.setAttribute("aria-label",on?"Pause":"Play");
      }
      if(tapBtn){
        tapBtn.innerHTML="<span>"+mpIcon(on?"pause":"play",28)+"</span>";
        tapBtn.setAttribute("aria-label",on?"Pause":"Play");
      }
    }
    function applyMute(){
      t.muted(mutePref);
      if(muteBtn){
        muteBtn.innerHTML=mpIcon(mutePref?"muted":"volume",17);
        muteBtn.setAttribute("aria-label",mutePref?"Unmute":"Mute");
        muteBtn.setAttribute("aria-pressed",mutePref?"true":"false");
      }
    }
    function tick(){
      paintSeek();
      if(t.kind==="slides"&&t.sync&&!t.paused()&&t.sync())stop(true);
    }
    function start(){
      // Only one thing plays at a time, across every card in the view.
      stopOtherPlayers(rec);
      rec.wasVisible=true;
      t.play();setPlaying(true);
      clearInterval(ticker);ticker=setInterval(tick,100);
      tick();
    }
    function stop(reset){
      t.pause();setPlaying(false);
      clearInterval(ticker);ticker=null;
      if(reset)t.seek(0);
      paintSeek();
    }
    function toggle(){t.paused()?start():stop(false);}

    // Registered before any wiring so start() can reach it.
    var rec={wasVisible:false,
             isPlaying:function(){return box.classList.contains("playing");},
             stop:function(reset){stop(reset);}};
    box.__mpRec=rec;
    registerPlayer(rec);

    if(playBtn)playBtn.addEventListener("click",toggle);
    if(tapBtn)tapBtn.addEventListener("click",toggle);
    if(muteBtn)muteBtn.addEventListener("click",function(){
      mutePref=!mutePref;
      // Apply to every player, so the choice sticks across the whole feed.
      var all=document.querySelectorAll(".mp[data-mp]");
      for(var i=0;i<all.length;i++)if(all[i].__mpApplyMute)all[i].__mpApplyMute();
    });
    box.__mpApplyMute=applyMute;

    // Keyboard: the same keys people already expect from a video player.
    box.addEventListener("keydown",function(e){
      var k=e.key;
      if(k===" "||k==="Spacebar"||k==="k"){e.preventDefault();toggle();}
      else if(k==="ArrowRight"){e.preventDefault();t.step(1);paintSeek();}
      else if(k==="ArrowLeft"){e.preventDefault();t.step(-1);paintSeek();}
      else if(k==="m"||k==="M"){e.preventDefault();if(muteBtn)muteBtn.click();}
      else if(k==="Home"){e.preventDefault();t.seek(0);paintSeek();}
    });
    if(seekBar)seekBar.addEventListener("click",function(e){
      var d=t.duration();
      if(d<=0)return;
      var r=seekBar.getBoundingClientRect();
      t.seek(((e.clientX-r.left)/r.width)*d);
      paintSeek();
    });
    box.addEventListener("click",function(e){
      var nav=e.target.closest?e.target.closest(".mp-nav"):null;
      if(!nav)return;
      t.step(Number(nav.getAttribute("data-dir"))||1);
      paintSeek();
    });
    // Media the user paused from elsewhere (another player claimed the
    // audio, or the native video UI) must not leave the button lying.
    t.on("ended",function(){stop(true);});
    t.on("pause",function(){if(!box.classList.contains("playing"))return;setPlaying(false);clearInterval(ticker);});
    t.on("play",function(){if(!box.classList.contains("playing"))start();});
    t.on("loadedmetadata",paintSeek);
    if(t.kind==="slides")t.on("timeupdate",tick);

    // Buffering and failure are states the user can see, not a frozen frame.
    var spin=box.querySelector(".mp-spin"),errBox=box.querySelector(".mp-err");
    function busy(on){if(spin)spin.hidden=!on;}
    if(t.kind==="video"){
      t.on("waiting",function(){busy(true);});
      t.on("stalled",function(){busy(true);});
      t.on("playing",function(){busy(false);});
      t.on("canplay",function(){busy(false);});
    }
    var media=t.kind==="video"?t.el:t.audio;
    if(media)media.addEventListener("error",function(){
      // One retry through the proxy before admitting defeat: the direct CDN
      // link is tried first, but some hosts refuse a cross-origin request
      // from this frame and only the proxied copy will play.
      var alt=media.getAttribute("data-fallback")||box.getAttribute("data-mp-fallback")||"";
      if(alt&&media.getAttribute("src")!==alt){
        media.removeAttribute("data-fallback");
        box.removeAttribute("data-mp-fallback");
        media.setAttribute("src",alt);
        try{media.load();}catch(e){}
        return;
      }
      busy(false);
      if(errBox)errBox.hidden=false;
      stop(false);
    });

    setPlaying(false);
    applyMute();
    paintSeek();
  }

  // ─── Sound card players ───
  function initSoundPlayers(root){
    var nodes=(root||document).querySelectorAll(".au[data-au]");
    for(var n=0;n<nodes.length;n++){
      (function(wrap){
        if(wrap.__auInit)return;
        wrap.__auInit=true;
        var audio=wrap.querySelector("audio");
        var btn=wrap.querySelector(".au-play");
        var seek=wrap.querySelector(".au-seek");
        var fill=seek?seek.firstChild:null;
        var cur=wrap.querySelector(".au-cur");
        var dur=wrap.querySelector(".au-dur");
        if(!audio||!btn)return;
        registerAudio(audio);
        btn.addEventListener("click",function(){
          if(audio.paused){var pr=audio.play();if(pr&&pr.catch)pr.catch(function(){
            wrap.setAttribute("data-error","1");
            if(cur)cur.textContent="unavailable";
          });}
          else audio.pause();
        });
        function mark(on){
          btn.innerHTML=mpIcon(on?"pause":"play",14);
          btn.setAttribute("aria-label",on?"Pause sound":"Play sound");
        }
        // A sound preview must also silence any playing card, not just other
        // previews — they are all one audio surface to the user.
        audio.addEventListener("play",function(){mark(true);stopAllPlayers();});
        audio.addEventListener("pause",function(){mark(false);});
        audio.addEventListener("ended",function(){mark(false);if(fill)fill.style.width="0";});
        audio.addEventListener("loadedmetadata",function(){
          if(dur&&isFinite(audio.duration))dur.textContent=fmtTime(audio.duration);
        });
        audio.addEventListener("timeupdate",function(){
          if(cur)cur.textContent=fmtTime(audio.currentTime);
          if(fill&&isFinite(audio.duration)&&audio.duration>0)
            fill.style.width=((audio.currentTime/audio.duration)*100)+"%";
        });
        if(seek)seek.addEventListener("click",function(e){
          if(!isFinite(audio.duration)||audio.duration<=0)return;
          var r=seek.getBoundingClientRect();
          try{audio.currentTime=((e.clientX-r.left)/r.width)*audio.duration;}catch(err){}
        });
      })(nodes[n]);
    }
  }

  // Wire every player in the freshly rendered view.
  function initPlayers(){
    resetPlayers();
    resetAudio();
    setStageMax();
    initMediaPlayers(document);
    initSoundPlayers(document);
  }

  // ─── Stage size ───
  // Ceiling on the stage height, so a portrait post cannot run the card off
  // the screen. It is the only thing capping the stage now.
  var HARD_MAX=560;
  function availableWidth(){
    var vv=window.visualViewport;
    return (vv&&vv.width)||document.documentElement.clientWidth||window.innerWidth||0;
  }
  // The stage takes its size from the width of the frame and the aspect ratio
  // of the post. It must not take it from the frame's *height*.
  //
  // That height is provisional: the host sets a placeholder, waits for us to
  // report how tall we are, then resizes. Deriving our width from it (the CSS
  // takes .mp width from --stage-max via the ratio) made the card a function
  // of that placeholder. Measured with the same card and the same content,
  // varying only the height the host started with:
  //
  //     starts 300px -> 492x277      starts 560px -> 738x415
  //     starts 420px -> 706x397      starts 700px -> 738x415
  //
  // Deterministic, but the placeholder differs every time a virtualising host
  // unmounts a card on scroll and mounts it again - which is the "videos get
  // resized randomly when I scroll or they reload" report.
  //
  // So the cap is now fixed. Width comes from the frame, height follows from
  // the ratio, the cap only stops a portrait post running away, and we report
  // the height that produces. The host accommodates us rather than the other
  // way round, which is the only direction that terminates.
  function setStageMax(){
    document.documentElement.style.setProperty("--stage-max",HARD_MAX+"px");
  }
  // A width change is a real layout change and worth re-reporting; a height
  // change is the host answering us, and must not feed back.
  var lastWidth=availableWidth();
  function onViewportChange(){
    var w=availableWidth();
    if(w===lastWidth)return;
    lastWidth=w;
    reportSize();
  }
  if(window.visualViewport)window.visualViewport.addEventListener("resize",onViewportChange);
  window.addEventListener("orientationchange",function(){setTimeout(function(){
    lastWidth=availableWidth();reportSize();
  },120);});

  function fmtNum(n){n=Number(n)||0;return n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e3?(n/1e3).toFixed(1)+"K":String(n);}
  function pColor(p){return{tiktok:"#000",douyin:"#000",instagram:"#E4405F",youtube:"#FF0000",xiaohongshu:"#FF2442",x:"#000",twitter:"#1DA1F2",bilibili:"#00A1D6",linkedin:"#0A66C2"}[p]||"#6B7280";}
  // Brand colours are chosen against a white page. TikTok, Douyin and X are
  // pure black, so used as label text on the dark card they were invisible.
  // Keep the brand colour for fills, but lift a too-dark one toward the card
  // foreground when it has to be read as text in dark mode.
  function pColorText(p){
    var c=pColor(p);
    var dq=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)");
    if(!dq||!dq.matches)return c;
    var h=c.replace("#","");
    if(h.length===3)h=h.charAt(0)+h.charAt(0)+h.charAt(1)+h.charAt(1)+h.charAt(2)+h.charAt(2);
    var r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
    if(isNaN(r)||isNaN(g)||isNaN(b))return c;
    if((0.2126*r+0.7152*g+0.0722*b)/255>0.38)return c;
    var t=0.66;
    return "rgb("+Math.round(r+(255-r)*t)+","+Math.round(g+(255-g)*t)+","+Math.round(b+(255-b)*t)+")";
  }
  // Official brand mark (simple-icons path) as an inline SVG that inherits
  // the current text color via fill="currentColor" — matches badge accents.
  // ─── UI icon set ───
  // Real vector icons rather than emoji: emoji render differently on every
  // OS (and some platforms colour them), so the control bar and engagement
  // rail would not look the same from one machine to the next. These inherit
  // currentColor and size, so one icon serves every context.
  var MP_ICONS={
    heart:"M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
    comment:"M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z",
    share:"M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z",
    eye:"M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
    play:"M8 5v14l11-7z",
    pause:"M6 19h4V5H6v14zm8-14v14h4V5h-4z",
    volume:"M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
    muted:"M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z",
    note:"M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z",
    prev:"M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z",
    next:"M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
    open:"M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
    warn:"M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
    check:"M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
    sparkle:"M12 2l1.9 5.7L19.6 9.6l-5.7 1.9L12 17.2l-1.9-5.7L4.4 9.6l5.7-1.9L12 2zm6.5 10.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6zM5 14l.7 2 2 .7-2 .7L5 19.4l-.7-2-2-.7 2-.7L5 14z"
  };
  function mpIcon(name,size){
    var s=size||18,d=MP_ICONS[name]||"";
    return '<svg viewBox="0 0 24 24" width="'+s+'" height="'+s+'" fill="currentColor" style="display:block;flex-shrink:0" aria-hidden="true" focusable="false"><path d="'+d+'"/></svg>';
  }

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
  // ─── Media player markup ───
  // Video and slideshow render the SAME shell: same overlay furniture, same
  // control bar, same order. Only the stage contents differ — a <video>, or a
  // stack of slides with the post's track behind them. Everything below the
  // stage is byte-for-byte identical between the two, which is the point:
  // controls must not move or change shape from one post to the next.
  var mpId=0;
  // Aspect class of the most recent player, so the enclosing card can adopt it.
  var lastPlayerAr="v";
  var lastVideoFallback="";
  function mediaPlayerHtml(p,images,video,platform,pickable){
    var id="mp"+(mpId++);
    var pickUrl=p.externalUrl||p.url||"";
    pickable=!!pickable&&!!pickUrl;
    // A photo post carries its slides AND a server-rendered slideshow video.
    // Judging by "no video" alone picked that video, so the stage was a black
    // rectangle while the separate audio element played on - the caller saw a
    // black screen with music. contentType is what actually says photo post,
    // and postCard already worked that out before calling this.
    var ctype=p.contentType||"";
    var isSlideshow=images.length>1&&(ctype==="slideshow"||ctype==="carousel"||!video);
    var music=p.musicUrl||p.musicProxyUrl||"";
    var musicFallback=(p.musicUrl&&(p.musicFallbackUrl||p.musicProxyUrl))||"";
    var thumbFallback=(p.thumbnailUrl&&(p.thumbnailFallbackUrl||p.thumbnailProxyUrl))||"";
    var thumb=p.thumbnailUrl||p.thumbnailProxyUrl||"";
    var songLabel=[p.musicTitle||"",p.musicAuthor||""].filter(Boolean).join(" · ");

    // Shape: vertical is the short-form default; long-form and the desktop
    // networks are wide; carousels on those networks are square.
    var fmt=p.detectedFormat||"",dur=Number(p.duration)||0,ar="v";
    var wide=(platform==="youtube"&&!(dur>0&&dur<=60))||platform==="linkedin"||platform==="twitter"||platform==="x";
    if(fmt==="Long-form")wide=true;
    if(fmt==="Short-form")wide=false;
    if(wide)ar=isSlideshow?"sq":"h";

    // Stage
    var stage="";
    if(video&&!isSlideshow){
      // A /media/resolve link is not a CDN URL: the server downloads the
      // whole video with yt-dlp before it answers. "metadata" preload starts
      // that for every card on screen, unprompted - eight Bilibili results
      // meant eight full downloads nobody asked for, which is what gets us
      // rate limited. Those wait for play; a real CDN URL still preloads,
      // because there it costs a range request.
      var pre=video.indexOf("/media/resolve")>=0?"none":"metadata";
      stage='<video src="'+esc(video)+'" preload="'+pre+'" playsinline'
        +(thumb?' poster="'+esc(thumb)+'"':"")+"></video>";
    }else{
      // A failed slide had nowhere to go. The thumbnail carries a fallback and
      // self-heals through the resolver; slides carried none, so one dead
      // image left a black stage with the music still listed underneath and no
      // way back - permanently, since nothing retries. The post cover is not
      // the right slide, but it is the right shape and it heals the same way,
      // which beats a black card.
      var slideFb=p.thumbnailFallbackUrl||p.thumbnailProxyUrl||p.thumbnailUrl||"";
      for(var i=0;i<images.length;i++)
        stage+='<img class="mp-slide'+(i===0?" active":"")+'" src="'+esc(images[i])
          +'" alt="slide '+(i+1)+'" loading="'+(i===0?"eager":"lazy")+'"'
          +(slideFb&&slideFb!==images[i]?' data-fallback="'+esc(slideFb)+'"':"")+"/>";
    }

    // Overlay: brand badge, slide counter, engagement rail, caption block.
    var acts=[["heart",p.likes,"likes"],["comment",p.comments,"comments"],
              ["share",p.shares,"shares"],["eye",p.views,"views"]]
      .filter(function(a){return Number(a[1])>0;})
      .map(function(a){
        return '<div class="mp-act" title="'+fmtNum(a[1])+" "+a[2]+'">'
          +'<div class="ic">'+mpIcon(a[0],19)+"</div>"
          +'<div class="n">'+fmtNum(a[1])+"</div></div>";
      }).join("");
    var handle=p.creatorHandle?'<div class="mp-handle">@'+esc(p.creatorHandle)+"</div>":"";
    var capText=p.caption||p.title||"";
    var cap=capText?'<div class="mp-cap">'+esc(capText)+"</div>":"";
    var song=songLabel||music
      ? '<div class="mp-song"><span class="note">'+mpIcon("note",12)+"</span>"
        +'<span class="mp-song-t">'+esc(songLabel||"original sound")+"</span></div>"
      : "";
    var counter=isSlideshow?'<div class="mp-chip"><span class="mp-idx">1</span>/'+images.length+"</div>":"";
    var navs=isSlideshow
      ? '<button class="mp-nav prev" type="button" data-dir="-1" aria-label="Previous slide">'+mpIcon("prev",20)+"</button>"
        +'<button class="mp-nav next" type="button" data-dir="1" aria-label="Next slide">'+mpIcon("next",20)+"</button>"
      : "";

    // Seek widget: one segment for video, one per slide for a slideshow.
    var segCount=isSlideshow?images.length:1,segs="";
    for(var k=0;k<segCount;k++)segs+='<div class="mp-seg"><i></i></div>';

    var label=(p.creatorHandle?"@"+p.creatorHandle+" — ":"")+(isSlideshow?"slideshow":"video");
    lastPlayerAr=ar;
    return '<div class="mp '+ar+'" id="'+id+'" data-mp="'+(isSlideshow?"slides":"video")+'"'
      +(Number(p.duration)>0?' data-mp-dur="'+Math.floor(Number(p.duration))+'"':"")
      +(lastVideoFallback?' data-mp-fallback="'+esc(lastVideoFallback)+'"':"")
      +(isSlideshow?' data-slides="'+images.length+'"':"")
      +' tabindex="0" role="group" aria-label="'+esc(label)+'">'
      +'<div class="mp-stage">'+stage
      +'<div class="mp-spin" hidden><i></i></div>'
      +'<div class="mp-err" hidden>'+mpIcon("warn",22)
      +"<span>This media could not be loaded</span></div>"
      +"</div>"
      +'<div class="mp-ov">'
      +'<div class="mp-badge">'+pSvg(platform,12)+" "+esc(platform)+"</div>"
      +(pickable?'<button class="mp-pick" type="button" aria-pressed="false" data-pick-id="'+id+'" data-pick="'+esc(pickUrl)+'" title="Select for comparison">'+mpIcon("check",15)+"</button>":"")
      +(pickUrl?'<a class="mp-open'+(pickable?" with-pick":"")+'" href="'+esc(pickUrl)+'" target="_blank" rel="noopener" title="Open on '+esc(platform)+'" aria-label="Open on '+esc(platform)+'">'+mpIcon("open",14)+"</a>":"")
      +counter+navs
      +'<div class="mp-rail">'+acts+"</div>"
      +'<div class="mp-meta">'+handle+cap+song+"</div>"
      +'<button class="mp-tap" type="button" aria-label="Play"><span>'+mpIcon("play",28)+"</span></button>"
      +"</div>"
      +'<div class="mp-ctl">'
      +'<button class="mp-btn mp-play" type="button" aria-label="Play">'+mpIcon("play",16)+"</button>"
      +'<span class="mp-time mp-cur">0:00</span>'
      +'<div class="mp-seek" role="slider" tabindex="-1" aria-label="Seek"'
      +' aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">'
      +'<div class="mp-segs">'+segs+"</div></div>"
      +'<span class="mp-time mp-dur">0:00</span>'
      +'<button class="mp-icon mp-mute" type="button" aria-label="Mute" aria-pressed="false">'
      +mpIcon("volume",17)+"</button>"
      +"</div>"
      +(music?'<audio preload="metadata" src="'+esc(music)+'"'
        +(musicFallback?' data-fallback="'+esc(musicFallback)+'"':"")+"></audio>":"")
      +"</div>";
  }

  function postCard(p,wide,pickable,hideActions){
    var platform=p.platform||"unknown",color=pColor(platform),brandSvg=pSvg(platform);
    var tcolor=pColorText(platform);
    var title=p.title||p.caption||"",handle=p.creatorHandle||"",url=p.externalUrl||"";
    var thumb=p.thumbnailUrl||p.thumbnailProxyUrl||"",ct=p.contentType||"post";
    var views=p.views||0,likes=p.likes||0,comments=p.comments||0,shares=p.shares||0;
    var cls=wide?"card card-wide":"card";
    var statsHtml=[[views,"eye"],[likes,"heart"],[comments,"comment"],[shares,"share"]]
      .filter(function(s){return s[0]>0})
      .map(function(s){return'<span class="stat-pill">'+mpIcon(s[1],13)+" "+fmtNum(s[0])+"</span>";}).join("");
    var handleHtml=handle?'<span class="handle">@'+esc(handle)+"</span>":"";
    var linkHtml=url?'<a href="'+esc(url)+'" target="_blank" class="btn" style="background:'+color+'">View on '+esc(platform)+' →</a>':"";
    // Prefer video playback over a static thumbnail when the post has one
    // (videoUrl, or a video mediaItem preview_url). Videos are proxied /
    // re-hosted to a permanent orchyn URL so they play inside the CSP.
    var video="",images=[];
    // Play the platform URL directly. Going through /media/proxy did not fix
    // playback in practice, and the direct link is one less hop that can fail.
    // The proxied companion is kept as a fallback: the player retries with it
    // once if the direct URL errors, which covers the CDNs that refuse a
    // cross-origin request from this frame.
    var rawVideo=typeof p.videoUrl==="string"?p.videoUrl:"";
    if(rawVideo)video=rawVideo;
    else if(typeof p.videoProxyUrl==="string"&&p.videoProxyUrl)video=p.videoProxyUrl;
    // Some feeds carry no stream at all - Douyin's search endpoint returns a
    // permalink and a poster and nothing else - but the post detail does. The
    // resolver fetches it on demand, so the card plays instead of sitting
    // there as a still image. Only offered where resolution actually works.
    else if(typeof p.videoFallbackUrl==="string"&&p.videoFallbackUrl
            &&(p.contentType==="video"||Number(p.duration)>0))video=p.videoFallbackUrl;
    // The retry target: the resolver re-fetches the post and hands back a
    // fresh link, which is the only thing that helps once the signed URL has
    // expired - a proxy of a dead link is just as dead.
    lastVideoFallback=(rawVideo&&(p.videoFallbackUrl||p.videoProxyUrl))||"";
    if(p.mediaItems&&p.mediaItems.length){
      for(var i=0;i<p.mediaItems.length;i++){
        var m=p.mediaItems[i];
        // "proxy_url" is the same asset served through Orchyn — the raw
        // preview_url is a signed CDN link that this frame can't load.
        var mu=m.proxy_url||m.preview_url;
        if(m.kind==="video"&&mu){if(!video)video=mu;}
        else if(m.kind==="image"&&mu&&images.length<12)images.push(mu);
      }
    }
    var mediaHtml="";
    var vh=wide?"340px":"200px";
    var bodyText=p.caption||p.text||"";
    var isSlideshow=(ct==="slideshow"||ct==="carousel")&&images.length>1;
    // Anything playable — a video or a slideshow — goes through the one
    // player, so the controls are the same on every card.
    if(video||isSlideshow||images.length>1){
      mediaHtml=mediaPlayerHtml(p,images,video,platform,pickable);
      // The player already carries the handle, caption and stats as overlay
      // chrome, so the card body underneath is just the outbound link.
      return '<div class="'+cls+' card-media '+lastPlayerAr+'">'+mediaHtml
        +"</div>"
        // Only on the single-post view — a gallery of these would be noise.
        +(wide&&!hideActions?postAiActions(p):"");
    }
    if(thumb){
      var tfb=(p.thumbnailUrl&&(p.thumbnailFallbackUrl||p.thumbnailProxyUrl))||"";
      mediaHtml='<img src="'+esc(thumb)+'" alt="thumbnail" loading="lazy"'
        +(tfb?' data-fallback="'+esc(tfb)+'"':"")+"/>";
    }else if(bodyText){
      // Text-only post (LinkedIn / X) — styled quote block.
      mediaHtml='<div style="padding:16px 18px;border-bottom:1px solid var(--border);background:var(--card)">'
        +'<div style="font-size:13px;line-height:1.55;color:var(--fg);white-space:pre-line">'+esc(bodyText.length>400?bodyText.slice(0,400)+"…":bodyText)+'</div></div>';
    }
    var ctTag=wide?'<span style="font-size:12px;color:var(--muted);text-transform:capitalize">'+esc(ct)+"</span>":"";
    return '<div class="'+cls+'">'+mediaHtml+'<div class="card-body">'
      +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'
      +'<span class="badge" style="background:'+color+'15;color:'+tcolor+';display:inline-flex;align-items:center;gap:4px">'+brandSvg+" "+esc(platform)+"</span>"
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
      // Parenthesised: + binds tighter than the ternary, so without these the whole
      // concatenation became the condition and the function returned only the
      // bio — no card, no avatar, no name, no follower count.
      +(sig?'<div style="font-size:12px;color:var(--muted);line-height:1.4">'+esc(sig)+"</div>":"")
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
  // ─── AI analysis ───
  // Ordered for someone reading in a chat panel: the verdict in one glance,
  // then the things they can act on or copy, then reference material folded
  // away. Every field the model produces is surfaced somewhere — the analysis
  // is the expensive part of the call, so discarding two thirds of it in the
  // view (as this previously did) is throwing away what the user paid for.
  function analysisCard(d){
    var a=d.analysis||{};
    var postHtml=postCard(d.post||d,true,false,true);
    var out="";

    // ── Verdict strip ──
    var meters="";
    if(a.hookStrength!=null)meters+=meter("Hook strength",Number(a.hookStrength));
    if(a.commentBaitLevel!=null)meters+=meter("Comment bait",Number(a.commentBaitLevel));
    if(meters)out+='<div class="verdict">'+meters+"</div>";

    var chips=[];
    if(a.niche)chips.push(chip(a.niche,"eye"));
    if(a.trendAlignment)chips.push(chip(a.trendAlignment,"share"));
    if(a.audioTrack)chips.push(chip(a.audioTrack,"note"));
    if(a.callToAction)chips.push(chip(a.callToAction,"comment"));
    if(chips.length)out+='<div class="chiprow">'+chips.join("")+"</div>";

    if(a.summary)out+='<div class="lede-box">'+esc(a.summary)+"</div>";

    // ── Script structure: the most actionable single field ──
    var sc=a.scriptStructure;
    if(sc&&(sc.hook||sc.buildUp||sc.payoff||sc.cta)){
      var steps=[["Hook",sc.hook],["Build-up",sc.buildUp],["Payoff",sc.payoff],["CTA",sc.cta]]
        .filter(function(x){return x[1];})
        .map(function(x){
          return '<div class="step-row"><span class="step-k">'+esc(x[0])+"</span>"
            +'<span class="step-v">'+esc(x[1])+"</span></div>";
        }).join("");
      out+=section("Script structure",'<div class="steps-list">'+steps+"</div>",true);
    }

    if(a.whyItWorks)out+=section("Why it works",expandable(a.whyItWorks),true);

    // ── Copyables: what a strategist actually lifts from the card ──
    if(a.suggestedHook)out+=section("Suggested hook",quote(a.suggestedHook),true);
    if(a.keyQuotes&&a.keyQuotes.length)
      out+=section("Quotable lines",a.keyQuotes.slice(0,6).map(quote).join(""));
    if(a.suggestedHashtags&&a.suggestedHashtags.length){
      var tags=a.suggestedHashtags.slice(0,12).map(function(t){
        var c=String(t).replace(/^#/,"");
        return '<button class="tag copyable" data-copy="#'+esc(c)+'">#'+esc(c)+"</button>";
      }).join("");
      out+=section("Hashtags",'<div class="chiprow">'+tags
        +'<button class="tag copyable" data-copy="'+esc(a.suggestedHashtags.map(function(t){return "#"+String(t).replace(/^#/,"");}).join(" "))+'">Copy all</button></div>',true);
    }

    // ── Who it is for ──
    var ta=a.targetAudience;
    if(ta&&typeof ta==="object"){
      var rows=[["Demographics",ta.demographics],["Psychographics",ta.psychographics],["Interests",ta.interests]]
        .filter(function(x){return x[1];})
        .map(function(x){return '<div class="step-row"><span class="step-k">'+esc(x[0])+'</span><span class="step-v">'+esc(x[1])+"</span></div>";}).join("");
      if(rows)out+=section("Target audience",'<div class="steps-list">'+rows+"</div>");
    }else if(typeof ta==="string"&&ta){
      out+=section("Target audience",'<div class="section-text">'+esc(ta)+"</div>");
    }

    // ── On-screen text: per-scene for slideshows ──
    if(a.overlayTexts&&a.overlayTexts.length){
      var ov=a.overlayTexts.slice(0,20).map(function(t,i){
        return '<div class="step-row"><span class="step-k">'+(i+1)+'</span><span class="step-v">'+esc(t)+"</span></div>";
      }).join("");
      out+=section("On-screen text",'<div class="steps-list">'+ov+"</div>");
    }else if(a.overlayText){
      out+=section("On-screen text",'<div class="section-text">'+esc(a.overlayText)+"</div>");
    }

    // ── Signals ──
    if(a.viralTriggers&&a.viralTriggers.length)
      out+=section("Viral triggers",'<div class="chiprow">'
        +a.viralTriggers.slice(0,10).map(function(t){return '<button class="tag copyable" data-copy="'+esc(t)+'">'+esc(t)+"</button>";}).join("")+"</div>");
    var es=a.engagementSignals;
    if(es&&typeof es==="object"&&(es.commentSentiment||es.shareMotivation)){
      var er=[["Comments","commentSentiment"],["Why shared","shareMotivation"]]
        .filter(function(x){return es[x[1]];})
        .map(function(x){return '<div class="step-row"><span class="step-k">'+esc(x[0])+'</span><span class="step-v">'+esc(es[x[1]])+"</span></div>";}).join("");
      out+=section("Engagement signals",'<div class="steps-list">'+er+"</div>");
    }
    if(a.emotionalArc)out+=section("Emotional arc",'<div class="section-text">'+esc(a.emotionalArc)+"</div>");

    // ── What to fix, what to try ──
    if(a.negativeSignals&&a.negativeSignals.length)
      out+=section("Weaknesses",'<div class="chiprow">'
        +a.negativeSignals.slice(0,8).map(function(n){return '<span class="tag warn">'+esc(n)+"</span>";}).join("")+"</div>",true);
    if(a.variationIdeas&&a.variationIdeas.length)
      out+=section("Variations to try",bullets(a.variationIdeas,8));

    // ── Reference, folded away ──
    if(a.formatBreakdown)out+=section("Format breakdown",expandable(a.formatBreakdown));
    if(a.visualStyle)out+=section("Visual style",'<div class="section-text">'+esc(a.visualStyle)+"</div>");
    if(a.whatHappens)out+=section("What happens",expandable(a.whatHappens));
    if(a.coreNarrative)out+=section("Core narrative",expandable(a.coreNarrative));
    if(a.transcript)out+=section("Transcript",
      '<div class="section-text" style="white-space:pre-wrap">'+esc(a.transcript)+"</div>"
      +'<button class="tag copyable" style="margin-top:8px" data-copy="'+esc(a.transcript)+'">Copy transcript</button>');
    if(a.brandMentions&&a.brandMentions.length)
      out+=section("Brands mentioned",'<div class="chiprow">'+a.brandMentions.map(function(b){return '<span class="tag">'+esc(b)+"</span>";}).join("")+"</div>");
    if(a.contentSafetyFlags&&a.contentSafetyFlags.length)
      out+=section("Brand safety",'<div class="chiprow">'+a.contentSafetyFlags.map(function(f){return '<span class="tag warn">'+esc(f)+"</span>";}).join("")+"</div>");

    // Turn the analysis into the next piece of work rather than ending on it.
    var src=(d.post||d);
    var srcUrl=src&&(src.externalUrl||src.url);
    var follow=srcUrl?'<div class="ai-actions">'
      +aiBtn("create_variants","Create variants",JSON.stringify({url:srcUrl}))
      +aiBtn("write_hooks","More hooks",JSON.stringify({url:srcUrl}))
      +aiBtn("repurpose_post","Repurpose",JSON.stringify({url:srcUrl}))
      +aiBtn("analyze_comments","Read comments",JSON.stringify({url:srcUrl}))
      +'</div><div class="ai-note">Each action runs a tool and spends the credits shown.</div>':"";

    if(!out)return postHtml;
    return postHtml+'<div class="card card-wide fade-in" style="margin-top:10px"><div class="card-body">'
      +'<div class="an-title">'+mpIcon("eye",16)+"<span>AI analysis</span></div>"+out+follow+"</div></div>";
  }

  /** 0-10 score as a labelled bar. */
  function meter(label,val){
    var v=Math.max(0,Math.min(10,Number(val)||0));
    var c=v>=7?"var(--green)":v>=4?"var(--amber)":"var(--red)";
    return '<div class="meter"><div class="meter-top"><span>'+esc(label)+"</span>"
      +'<b style="color:'+c+'">'+v+"/10</b></div>"
      +'<div class="meter-track"><i style="width:'+(v*10)+"%;background:"+c+'"></i></div></div>';
  }

  function chip(text,icon){
    return '<button class="tag copyable" data-copy="'+esc(text)+'">'
      +(icon?mpIcon(icon,11):"")+"<span>"+esc(text)+"</span></button>";
  }

  function quote(text){
    return '<div class="quote-box">'+esc(text)
      +'<button class="copy-btn" data-copy="'+esc(text)+'">Copy</button></div>';
  }

  function bullets(arr,cap){
    return '<ul class="an-list">'+arr.slice(0,cap||6).map(function(x){
      return "<li>"+esc(x)+"</li>";}).join("")+"</ul>";
  }

  /** Long prose: clamp with an expander instead of cutting it off. */
  function expandable(text){
    var t=String(text||"");
    if(t.length<=260)return '<div class="section-text">'+esc(t)+"</div>";
    var id="x"+(mpId++);
    return '<div class="section-text clamp6" data-x="'+id+'">'+esc(t)+"</div>"
      +'<button class="cmore" data-xmore="'+id+'">Show more</button>';
  }


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
        // Split "<html>  {json}" - if there is a JSON object after the HTML,
        // parse it; otherwise show the text itself. Deliberately not a regex:
        // this template is embedded in both a Rust raw string and a TS
        // template literal, and a backslash survives the first but is eaten by
        // the second, so the escaped pattern this used to carry matched
        // nothing in the copy the Worker serves.
        var NL=String.fromCharCode(10);
        for(var gap=textBlock.indexOf(NL+NL);gap!==-1;gap=textBlock.indexOf(NL+NL,gap+1)){
          var tail=textBlock.slice(gap+2).trim();
          if(tail.charAt(0)!=="{")continue;
          try{var parsed=JSON.parse(tail);if(parsed&&typeof parsed==="object")return parsed;}catch(e){}
        }
        // Single-line HTML (common): keep the whole block as text fallback.
        if(textBlock.indexOf("<")===0){return { _html: textBlock };}
        try{var j=JSON.parse(textBlock);if(j&&typeof j==="object")return j;}catch(e2){}
      }
    }
    return result;
  }

  var galleryId=0;
  function galleryWrap(cardsHtml,count){
    var id="gal"+(galleryId++);
    if(count<=1)return cardsHtml;
    var dots="";
    for(var i=0;i<count;i++)dots+='<button class="dot'+(i===0?" active":"")+'" data-g="'+id+'" data-i="'+i+'"></button>';
    return '<div class="gallery-wrap fade-in">'
      +'<button class="gallery-nav prev" data-gnav="'+id+'" data-dir="-1">‹</button>'
      +'<div class="gallery" id="'+id+'">'+cardsHtml+'</div>'
      +'<button class="gallery-nav next" data-gnav="'+id+'" data-dir="1">›</button>'
      +'<div class="gallery-dots" id="'+id+'-dots">'+dots+'</div>'
      +'</div>';
  }
  function initGalleryNav(){
    document.addEventListener('click',function(e){
      var navBtn=e.target.closest('.gallery-nav[data-gnav]');
      if(navBtn){
        var g=document.getElementById(navBtn.getAttribute('data-gnav'));
        if(!g)return;
        var dir=Number(navBtn.getAttribute('data-dir'));
        var cardW=g.querySelector('.card')?.offsetWidth||380;
        g.scrollBy({left:dir*(cardW+12),behavior:'smooth'});
        return;
      }
      var dotBtn=e.target.closest('.dot[data-g]');
      if(dotBtn){
        var gId=dotBtn.getAttribute('data-g');
        var g=document.getElementById(gId);
        var dots=document.getElementById(gId+'-dots');
        if(!g||!dots)return;
        var idx=Number(dotBtn.getAttribute('data-i'));
        var cards=g.querySelectorAll('.card');
        if(cards[idx])cards[idx].scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'});
        dots.querySelectorAll('.dot').forEach(function(d){d.classList.remove('active')});
        dotBtn.classList.add('active');
      }
    });
    document.addEventListener('scroll',function(e){
      if(!e.target.classList||!e.target.classList.contains('gallery'))return;
      var g=e.target;var gId=g.id;
      var dots=document.getElementById(gId+'-dots');
      if(!dots)return;
      var cards=g.querySelectorAll('.card');
      if(!cards.length)return;
      var scrollLeft=g.scrollLeft;var cardW=cards[0].offsetWidth+12;
      var active=Math.round(scrollLeft/cardW);
      active=Math.max(0,Math.min(active,cards.length-1));
      dots.querySelectorAll('.dot').forEach(function(d,i){d.classList.toggle('active',i===active)});
    },true);
  }
  initGalleryNav();

  // Every render replaces the DOM wholesale, so player wiring has to run
  // after it — one wrapper instead of a call at each of the many early
  // returns below.
  function render(result){
    try{renderView(result);}finally{initPlayers();setTimeout(reportSize,80);}
  }

  function renderView(result){
    var app=document.getElementById("app");if(!app)return;
    var d=extractResult(result);
    if(!d||typeof d!=="object"){app.innerHTML='<div class="json-block fade-in">'+esc(JSON.stringify(d,null,2))+"</div>";return;}
    // Raw HTML-only result — inject it directly.
    if(d._html){app.innerHTML=d._html;setTimeout(reportSize,50);return;}

    // Analysis
    if(d.analysis&&(d.post||d.url)){app.innerHTML=analysisCard(d);return;}
    // Post comparison
    if(d.comparison!==undefined&&d.posts&&Array.isArray(d.posts)){
      var c=d.comparison||{},win=Number(c.winner)||0;
      var cards=d.posts.map(function(p,i){
        var isw=win===i+1;
        return '<div style="padding:10px 12px;border:1px solid '+(isw?"var(--green)":"var(--border)")+';border-radius:10px;margin-bottom:8px">'
          +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px"><span style="font-size:11px;font-weight:700;color:var(--muted)">#'+(i+1)+"</span>"
          +(isw?'<span style="font-size:10px;font-weight:700;color:var(--green);border:1px solid var(--green);border-radius:4px;padding:0 5px">BEST</span>':"")+"</div>"
          +'<div style="font-size:13px;line-height:1.4">'+esc((p.title||p.caption||"").slice(0,140))+"</div>"
          +'<div style="font-size:11.5px;color:var(--muted);margin-top:4px">'+mpIcon("eye",11)+" "+fmtNum(p.views||0)+" · "+mpIcon("heart",11)+" "+fmtNum(p.likes||0)+"</div></div>";
      }).join("");
      var diffs=(c.differences||[]).slice(0,5).map(function(x){
        return '<div style="padding:7px 0;border-bottom:1px solid var(--border)"><span style="font-size:12.5px;font-weight:600">'+esc(x.factor||"")+"</span>"
          +'<div style="font-size:12.5px;color:var(--muted);margin-top:1px">'+esc(x.detail||"")+"</div></div>";
      }).join("");
      var lessons=(c.lessons||[]).length?'<div style="margin-top:14px"><div class="sec-label">Lessons</div><ul style="margin:0;padding-left:18px;font-size:13px;color:var(--muted)">'
        +c.lessons.slice(0,4).map(function(l){return '<li style="margin:4px 0">'+esc(l)+"</li>";}).join("")+"</ul></div>":"";
      app.innerHTML='<div class="card card-wide fade-in"><div class="card-body">'
        +'<div style="font-size:16px;font-weight:700;margin-bottom:10px">⚖️ Comparing '+d.posts.length+" posts</div>"
        +cards
        +(c.winnerReason?'<div style="font-size:13px;margin-top:10px"><b>Why it won:</b> '+esc(c.winnerReason)+"</div>":"")
        +(diffs?'<div style="margin-top:14px"><div class="sec-label">What differed</div>'+diffs+"</div>":"")
        +lessons
        +(c.nextTest?'<div style="margin-top:14px;padding:10px 12px;background:var(--tag);border-radius:10px;font-size:13px"><b>Next test:</b> '+esc(c.nextTest)+"</div>":"")
        +"</div></div>";
      return;}

    // Posts gallery
    if(d.posts&&Array.isArray(d.posts)){
      if(!d.posts.length){app.innerHTML='<div class="empty-state fade-in"><div class="icon">🔍</div><div class="text">No posts found</div></div>';return;}
      app.innerHTML=galleryWrap(d.posts.map(function(p){return postCard(p,false,true);}).join(""),d.posts.length)+pickBarHtml();initPicks();return;}
    // Creators
    if(d.creators&&Array.isArray(d.creators)){
      if(!d.creators.length){app.innerHTML='<div class="empty-state fade-in"><div class="icon">👤</div><div class="text">No creators found</div></div>';return;}
      app.innerHTML=galleryWrap(d.creators.map(function(c){return creatorCard(c);}).join(""),d.creators.length);return;}
    // Transcript
    if(d.transcript!==undefined||d.available!==undefined&&d.wordCount!==undefined){
      if(!d.available){
        app.innerHTML='<div class="card card-wide fade-in"><div class="card-body">'
          +'<div style="display:flex;align-items:center;gap:7px;font-size:16px;font-weight:700;margin-bottom:6px">'+mpIcon("note",16)+"<span>Transcript</span></div>"
          +'<div class="muted" style="font-size:13px;color:var(--muted)">'+esc(d.reason||"No transcript available.")+"</div></div></div>";
        return;}
      var meta=[(d.wordCount||0)+" words"];
      if(d.language)meta.push(esc(d.language));
      if(d.autoGenerated)meta.push("auto-generated");
      app.innerHTML='<div class="card card-wide fade-in"><div class="card-body">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
        +'<div style="display:flex;align-items:center;gap:7px;font-size:16px;font-weight:700">'+mpIcon("note",16)+"<span>Transcript</span></div>"
        +'<button class="btn btn-sm" style="background:var(--tag);color:var(--fg)" data-copy="'+esc(d.transcript||"")+'">Copy</button></div>'
        +'<div class="faint" style="font-size:11.5px;color:var(--muted);margin:3px 0 12px">'+meta.join(" · ")+"</div>"
        +'<div style="font-size:13.5px;line-height:1.65;white-space:pre-wrap">'+esc(d.transcript||"")+"</div>"
        +"</div></div>";
      return;}

    // Trending hashtags
    if(d.hashtags&&Array.isArray(d.hashtags)){
      if(!d.hashtags.length){app.innerHTML='<div class="empty-state fade-in"><div class="icon">#</div><div class="text">No trending hashtags found</div></div>';return;}
      var hr=d.hashtags.slice(0,30).map(function(t){
        var dir=t.trend==="rising"?["▲","var(--green)"]:t.trend==="cooling"?["▼","var(--red)"]:["▬","var(--muted)"];
        return '<a href="'+esc(t.url||"#")+'" target="_blank" rel="noopener" class="comment-row" style="text-decoration:none">'
          +'<div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:600">#'+esc(t.hashtag)+"</div>"
          +'<div style="font-size:11.5px;color:var(--muted)">'+fmtNum(t.posts||0)+" posts · "+fmtNum(t.views||0)+" views</div></div>"
          +'<span style="font-size:11px;font-weight:700;color:'+dir[1]+';white-space:nowrap">'+dir[0]+" "+esc(t.trend||"")+"</span></a>";
      }).join("");
      app.innerHTML='<div class="card card-wide fade-in"><div class="card-body">'
        +'<div style="display:flex;align-items:center;gap:7px;font-size:16px;font-weight:700">#<span>Trending hashtags</span></div>'
        +'<div class="faint" style="font-size:11.5px;color:var(--muted);margin:2px 0 10px">TikTok · '+esc(d.country||"US")+" · last "+(d.days||7)+" days</div>"
        +hr+"</div></div>";
      return;}

    // Comment analysis
    if(d.report&&(d.commentsAnalyzed!==undefined)){
      var r=d.report;
      var col=r.sentiment==="positive"?"var(--green)":r.sentiment==="negative"?"var(--red)":"var(--amber)";
      var list=function(arr,label){
        if(!arr||!arr.length)return "";
        return '<div style="margin-top:14px"><div class="sec-label">'+esc(label)+'</div><ul style="margin:0;padding-left:18px;font-size:13px;color:var(--muted)">'
          +arr.slice(0,6).map(function(x){return '<li style="margin:4px 0">'+esc(x)+"</li>";}).join("")+"</ul></div>";
      };
      var th=(r.topThemes||[]).slice(0,5).map(function(t){
        return '<div style="padding:8px 0;border-bottom:1px solid var(--border-soft,var(--border))">'
          +'<div style="font-size:13px;font-weight:600">'+esc(t.theme||"")+"</div>"
          +'<div style="font-size:12.5px;color:var(--muted);margin-top:2px">'+esc(t.summary||"")+"</div></div>";
      }).join("");
      app.innerHTML='<div class="card card-wide fade-in"><div class="card-body">'
        +'<div style="display:flex;align-items:center;gap:7px;font-size:16px;font-weight:700;margin-bottom:8px">'+mpIcon("comment",16)+"<span>Comment analysis</span></div>"
        +'<span style="display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:'+col+';border:1px solid '+col+';border-radius:999px;padding:2px 10px">'+esc(r.sentiment||"")+"</span>"
        +'<div style="font-size:13px;margin-top:8px">'+esc(r.sentimentNote||"")+"</div>"
        +(th?'<div style="margin-top:14px"><div class="sec-label">Themes</div>'+th+"</div>":"")
        +list(r.questions,"Questions asked")
        +list(r.objections,"Objections")
        +list(r.contentRequests,"Content requests")
        +list(r.nextVideoIdeas,"Next video ideas")
        +'<div class="faint" style="font-size:11px;color:var(--muted);margin-top:14px">Based on '+(d.commentsAnalyzed||0)+" comments</div>"
        +"</div></div>";
      return;}

    // Comments
    if(d.comments&&Array.isArray(d.comments)){
      // Themes first: on a post with thousands of comments, "what do people
      // keep saying" is the answer someone actually wants. The raw list is
      // the evidence underneath it.
      var themes="";
      if(d.themes&&d.themes.length){
        themes='<div style="margin-bottom:14px"><div class="sec-label">What people keep mentioning</div><div>'
          +d.themes.slice(0,12).map(function(t){
            return '<span class="theme-chip">'+esc(t.keyword||t)
              +(t.count?"<b>"+t.count+"</b>":"")+"</span>";
          }).join("")+"</div></div>";
      }
      var ch=d.comments.slice(0,25).map(function(c,i){
        var user=c.username||c.user||"";
        var text=c.text||c.comment||"";
        var likes=c.likes||c.likeCount||0, replies=c.replies||0;
        var badges="";
        if(c.pinned)badges+='<span class="cbadge pin">PINNED</span>';
        if(c.creatorLiked)badges+='<span class="cbadge liked">CREATOR LIKED</span>';
        var meta=[];
        if(likes>0)meta.push(mpIcon("heart",11)+" "+fmtNum(likes));
        if(replies>0)meta.push(mpIcon("comment",11)+" "+fmtNum(replies));
        if(c.postedAt)meta.push(esc(relTime(c.postedAt)));
        // Long comments clamp to three lines with an expander rather than
        // being cut mid-sentence — in a chat there is nowhere else to read it.
        var longish=text.length>180;
        return '<div class="comment-row" style="flex-direction:column;align-items:stretch">'
          +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
          +'<span style="font-size:12px;font-weight:600">@'+esc(user)+"</span>"+badges+"</div>"
          +'<div class="ctext'+(longish?" clamp":"")+'" data-c="'+i+'">'+esc(text)+"</div>"
          +(longish?'<button class="cmore" data-more="'+i+'">Show more</button>':"")
          +(meta.length?'<div class="cmeta">'+meta.join('<span style="opacity:.5">·</span>')+"</div>":"")
          +"</div>";
      }).join("");
      var extra=d.comments.length>25?'<div class="faint" style="text-align:center;font-size:12px;padding-top:10px;color:var(--muted)">Showing 25 of '+d.comments.length+"</div>":"";
      app.innerHTML='<div class="card card-wide fade-in"><div class="card-body">'
        +'<div style="display:flex;align-items:center;gap:7px;font-size:16px;font-weight:700">'+mpIcon("comment",17)+"<span>Comments ("+d.comments.length+")</span></div>"
        +(d.summary?'<div class="muted" style="font-size:12.5px;margin:5px 0 14px;color:var(--muted)">'+esc(d.summary)+"</div>":'<div style="height:12px"></div>')
        +themes+ch+extra+"</div></div>";
      return;}
    // Sounds
    if(d.sounds&&Array.isArray(d.sounds)){
      app.innerHTML=galleryWrap(d.sounds.map(function(s,i){
        var color=pColor(s.platform||"tiktok");
        var coverSrc=s.coverUrl||s.coverProxyUrl||"";
        var cover=coverSrc?'<img class="sound-cover" src="'+esc(coverSrc)+'" alt="cover" loading="lazy"/>'
          :'<div class="sound-cover" style="background:'+color+'15;display:flex;align-items:center;justify-content:center;font-size:26px">🎵</div>';
        // The raw CDN URL is signed and cross-origin — only the proxied one
        // actually plays in this sandboxed frame. A bare link never played
        // anything in-place, which is why sound cards were silent.
        var play=s.playUrl||s.playProxyUrl||s.url||"";
        var secs=Number(s.duration)||0;
        var meta=[s.artist||s.author||"",secs>0?fmtTime(secs):""].filter(Boolean).join(" • ");
        var player=play
          ? '<div class="au" data-au="au'+i+'">'
            +'<button class="au-play" style="background:'+color+'" aria-label="Play sound">'+mpIcon("play",14)+"</button>"
            +'<div class="au-body"><div class="au-seek"><i></i></div>'
            +'<div class="au-time"><span class="au-cur">0:00</span><span class="au-dur">'
            +(secs>0?fmtTime(secs):"--:--")+"</span></div></div>"
            +'<audio preload="metadata" src="'+esc(play)+'"></audio></div>'
          : '<div class="au-missing">'+mpIcon("warn",13)+"<span>No preview for this track</span></div>";
        return '<div class="sound-card"><div style="display:flex;gap:12px;align-items:center">'
          +cover+'<div style="flex:1;min-width:0">'
          +'<div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(s.title||"")+"</div>"
          +'<div style="font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(meta)+"</div>"
          +(s.videoCount?'<div style="font-size:11px;color:var(--muted);margin-top:2px">'+fmtNum(s.videoCount)+" videos</div>":"")
          +"</div></div>"+player+"</div>";
      }).join(""),d.sounds.length);return;}
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

  function updateProgress(params){
    var p=params||{};
    var toolName=p.name||p.toolName||"";
    if(toolName)currentTool=toolName;
    renderLoading(currentTool,p.arguments);
  }

  // Global helpers
  window.copyText=copyText;
  document.addEventListener('click',function(e){
    var btn=e.target.closest('.copy-btn[data-copy]');
    if(btn)copyText(btn.getAttribute('data-copy'));
  });
  // Analysis prose expanders and copy chips.
  document.addEventListener("click",function(e){
    if(!e.target.closest)return;
    var x=e.target.closest(".cmore[data-xmore]");
    if(x){
      var t=document.querySelector('.section-text[data-x="'+x.getAttribute("data-xmore")+'"]');
      if(t){
        var clamped=t.classList.toggle("clamp6");
        x.textContent=clamped?"Show more":"Show less";
        setTimeout(reportSize,60);
      }
      return;
    }
    var c=e.target.closest(".copyable[data-copy]");
    if(c){
      copyText(c.getAttribute("data-copy"));
      var label=c.textContent;
      c.textContent="Copied";
      setTimeout(function(){c.textContent=label;},1200);
    }
  });

  // Comment expanders.
  document.addEventListener("click",function(e){
    var b=e.target.closest&&e.target.closest(".cmore[data-more]");
    if(!b)return;
    var t=document.querySelector('.ctext[data-c="'+b.getAttribute("data-more")+'"]');
    if(!t)return;
    var open=t.classList.toggle("clamp");
    b.textContent=open?"Show more":"Show less";
    setTimeout(reportSize,60);
  });
  window.toggleSection=function(header){
    header.classList.toggle("open");
    var content=header.nextElementSibling;
    if(content)content.classList.toggle("open");
  };
})();
</script>
</body>
</html>
`;
