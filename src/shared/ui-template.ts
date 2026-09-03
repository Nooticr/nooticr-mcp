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
@layer properties{@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b)))){*,:before,:after,::backdrop{--tw-rotate-x:initial;--tw-rotate-y:initial;--tw-rotate-z:initial;--tw-skew-x:initial;--tw-skew-y:initial;--tw-border-style:solid;--tw-leading:initial;--tw-font-weight:initial;--tw-shadow:0 0 #0000;--tw-shadow-color:initial;--tw-shadow-alpha:100%;--tw-inset-shadow:0 0 #0000;--tw-inset-shadow-color:initial;--tw-inset-shadow-alpha:100%;--tw-ring-color:initial;--tw-ring-shadow:0 0 #0000;--tw-inset-ring-color:initial;--tw-inset-ring-shadow:0 0 #0000;--tw-ring-inset:initial;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-offset-shadow:0 0 #0000;--tw-blur:initial;--tw-brightness:initial;--tw-contrast:initial;--tw-grayscale:initial;--tw-hue-rotate:initial;--tw-invert:initial;--tw-opacity:initial;--tw-saturate:initial;--tw-sepia:initial;--tw-drop-shadow:initial;--tw-drop-shadow-color:initial;--tw-drop-shadow-alpha:100%;--tw-drop-shadow-size:initial;--tw-ease:initial}}}@layer theme{:root,:host{--font-sans:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";--font-mono:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;--color-black:#000;--color-white:#fff;--spacing:.25rem;--container-sm:24rem;--text-xs:.75rem;--text-xs--line-height:calc(1 / .75);--text-sm:.875rem;--text-sm--line-height:calc(1.25 / .875);--text-base:1rem;--text-base--line-height:calc(1.5 / 1);--text-lg:1.125rem;--text-lg--line-height:calc(1.75 / 1.125);--text-2xl:1.5rem;--text-2xl--line-height:calc(2 / 1.5);--font-weight-semibold:600;--font-weight-bold:700;--font-weight-extrabold:800;--leading-snug:1.375;--leading-relaxed:1.625;--radius-sm:.25rem;--radius-md:.375rem;--radius-lg:.5rem;--radius-xl:.75rem;--radius-2xl:1rem;--shadow-sm:0 1px 3px 0 #0000001a, 0 1px 2px -1px #0000001a;--shadow-md:0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a;--shadow-lg:0 10px 15px -3px #0000001a, 0 4px 6px -4px #0000001a;--ease-out:cubic-bezier(0, 0, .2, 1);--ease-in-out:cubic-bezier(.4, 0, .2, 1);--default-transition-duration:.15s;--default-transition-timing-function:cubic-bezier(.4, 0, .2, 1);--default-font-family:var(--font-sans);--default-mono-font-family:var(--font-mono)}}@layer base{*,:after,:before,::backdrop{box-sizing:border-box;border:0 solid;margin:0;padding:0}::file-selector-button{box-sizing:border-box;border:0 solid;margin:0;padding:0}html,:host{-webkit-text-size-adjust:100%;tab-size:4;line-height:1.5;font-family:var(--default-font-family,-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji");font-feature-settings:var(--default-font-feature-settings,normal);font-variation-settings:var(--default-font-variation-settings,normal);-webkit-tap-highlight-color:transparent}hr{height:0;color:inherit;border-top-width:1px}abbr:where([title]){-webkit-text-decoration:underline dotted;text-decoration:underline dotted}h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;-webkit-text-decoration:inherit;-webkit-text-decoration:inherit;-webkit-text-decoration:inherit;text-decoration:inherit}b,strong{font-weight:bolder}code,kbd,samp,pre{font-family:var(--default-mono-font-family,ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);font-feature-settings:var(--default-mono-font-feature-settings,normal);font-variation-settings:var(--default-mono-font-variation-settings,normal);font-size:1em}small{font-size:80%}sub,sup{vertical-align:baseline;font-size:75%;line-height:0;position:relative}sub{bottom:-.25em}sup{top:-.5em}table{text-indent:0;border-color:inherit;border-collapse:collapse}:-moz-focusring:where(:not(iframe)){outline:auto}progress{vertical-align:baseline}summary{display:list-item}ol,ul,menu{list-style:none}img,svg,video,canvas,audio,iframe,embed,object{vertical-align:middle;display:block}img,video{max-width:100%;height:auto}button,input,select,optgroup,textarea{font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;opacity:1;background-color:#0000;border-radius:0}::file-selector-button{font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;opacity:1;background-color:#0000;border-radius:0}:where(select:is([multiple],[size])) optgroup{font-weight:bolder}:where(select:is([multiple],[size])) optgroup option{padding-inline-start:20px}::file-selector-button{margin-inline-end:4px}::placeholder{opacity:1}@supports (not ((-webkit-appearance:-apple-pay-button))) or (contain-intrinsic-size:1px){::placeholder{color:currentColor}@supports (color:color-mix(in lab, red, red)){::placeholder{color:color-mix(in oklab, currentcolor 50%, transparent)}}}textarea{resize:vertical}::-webkit-search-decoration{-webkit-appearance:none}::-webkit-date-and-time-value{min-height:1lh;text-align:inherit}::-webkit-datetime-edit{display:inline-flex}::-webkit-datetime-edit-fields-wrapper{padding:0}::-webkit-datetime-edit{padding-block:0}::-webkit-datetime-edit-year-field{padding-block:0}::-webkit-datetime-edit-month-field{padding-block:0}::-webkit-datetime-edit-day-field{padding-block:0}::-webkit-datetime-edit-hour-field{padding-block:0}::-webkit-datetime-edit-minute-field{padding-block:0}::-webkit-datetime-edit-second-field{padding-block:0}::-webkit-datetime-edit-millisecond-field{padding-block:0}::-webkit-datetime-edit-meridiem-field{padding-block:0}::-webkit-calendar-picker-indicator{line-height:1}:-moz-ui-invalid{box-shadow:none}button,input:where([type=button],[type=reset],[type=submit]){appearance:button}::file-selector-button{appearance:button}::-webkit-inner-spin-button{height:auto}::-webkit-outer-spin-button{height:auto}[hidden]:where(:not([hidden=until-found])){display:none!important}html{overflow:hidden auto}[hidden]{display:none!important}a{color:inherit;text-decoration:none}body{color:var(--fg);background:0 0;max-width:100vw;padding:10px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;overflow-x:hidden}}@layer components{.load-bar{background:var(--tag);border-radius:3.40282e38px;height:3px;margin-bottom:14px;position:relative;overflow:hidden}.load-bar:after{content:"";background:var(--brand);border-radius:3.40282e38px;width:42%;animation:1.35s cubic-bezier(.45,0,.55,1) infinite sweep;position:absolute;top:0;bottom:0}@keyframes sweep{0%{left:-45%}50%{left:58%}to{left:-45%}}.load-head{align-items:center;gap:calc(var(--spacing) * 2);color:var(--muted);margin-bottom:11px;font-size:12.5px;font-weight:600;display:flex}.load-head .dot{background:var(--brand);border-radius:50%;flex-shrink:0;width:7px;height:7px;animation:1.2s ease-in-out infinite pulse}@keyframes pulse{0%,to{opacity:.35}50%{opacity:1}}.sk{border-radius:var(--radius-md);background:var(--tag);animation:1.5s ease-in-out infinite skpulse;position:relative;overflow:hidden}@keyframes skpulse{0%,to{opacity:1}50%{opacity:.55}}.sk-media{aspect-ratio:9/16;width:100%;max-height:var(--stage-max,420px);border-radius:0}.sk-media.h{aspect-ratio:16/9}.sk-line{height:11px;margin-top:8px}.sk-line.w40{width:40%}.sk-line.w60{width:60%}.sk-line.w80{width:80%}.sk-pill{border-radius:999px;width:76px;height:22px;margin:0 5px 5px 0;display:inline-block}.sk-card{border-radius:var(--radius-xl);border:1px solid var(--border);background:var(--card);flex-shrink:0;width:min(340px,86vw);min-width:min(340px,86vw);overflow:hidden}.sk-body{padding:13px 14px}.sk-row{align-items:center;gap:calc(var(--spacing) * 3);border-bottom:1px solid var(--border);padding:11px 0;display:flex}.sk-avatar{border-radius:10px;flex-shrink:0;width:44px;height:44px}.sk-strip{gap:calc(var(--spacing) * 3);padding:2px 0 8px;display:flex;overflow:hidden}@media (prefers-reduced-motion:reduce){.load-bar:after,.sk,.load-head .dot{animation:none}.load-bar:after{opacity:.5;width:100%;left:0}}.fade-in{animation:.4s ease-out fadeIn}@keyframes fadeIn{0%{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.stagger>*{opacity:0;animation:.4s ease-out forwards fadeIn}.stagger>:first-child{animation-delay:50ms}.stagger>:nth-child(2){animation-delay:.1s}.stagger>:nth-child(3){animation-delay:.15s}.stagger>:nth-child(4){animation-delay:.2s}.stagger>:nth-child(5){animation-delay:.25s}.stagger>:nth-child(6){animation-delay:.3s}.stagger>:nth-child(7){animation-delay:.35s}.stagger>:nth-child(8){animation-delay:.4s}.gallery-wrap{max-width:100%;position:relative;overflow:hidden}.gallery{gap:calc(var(--spacing) * 3);scroll-snap-type:x mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;scrollbar-width:none;width:100%;max-width:100%;padding:2px 0 8px;display:flex;overflow-x:auto}.gallery::-webkit-scrollbar{display:none}.gallery-dots{justify-content:center;gap:calc(var(--spacing) * 1.5);flex-wrap:wrap;margin-top:10px;display:flex}.gallery-dots .dot{background:var(--border);cursor:pointer;width:8px;height:8px;transition:var(--transition);border:none;border-radius:50%;padding:0}.gallery-dots .dot.active{background:var(--accent);border-radius:999px;width:20px}.gallery-nav{z-index:2;cursor:pointer;background:var(--card);border:1px solid var(--border);width:32px;height:32px;color:var(--fg);transition:var(--transition);opacity:0;border-radius:50%;justify-content:center;align-items:center;font-size:14px;display:flex;position:absolute;top:50%;transform:translateY(-50%)}.gallery-wrap:hover .gallery-nav{opacity:1}.gallery-nav:hover{background:var(--accent);color:var(--card)}.gallery-nav.prev{left:2px}.gallery-nav.next{right:2px}.card{border-radius:var(--radius-xl);border:1px solid var(--border);background:var(--card);width:min(380px,100%);min-width:min(380px,100%);max-width:100%;transition:var(--transition);cursor:default;scroll-snap-align:center;flex-shrink:0;display:block}.card.card-media{--ar-w:9;--ar-h:16;width:min(100%, calc(var(--stage-max,520px) * var(--ar-w) / var(--ar-h)));background:0 0;border-color:#0000;min-width:0;margin:0 auto}.card.card-media.h{--ar-w:16;--ar-h:9}.card.card-media.sq{--ar-w:1;--ar-h:1}.card-media .card-foot{background:0 0;justify-content:flex-end;padding:8px 4px 0;display:flex}.card-media .btn-sm{margin-top:0}.card:hover{border-color:var(--muted)}.card-media:hover{box-shadow:var(--shadow-md);transform:translateY(-2px)}.card-wide{width:100%}.card img:not(.mp-slide){object-fit:cover;width:100%;height:260px;display:block}.card-wide img:not(.mp-slide){max-height:340px}.card video{object-fit:contain;background:#000;border:none;outline:none;width:100%;min-height:220px;max-height:520px;display:block}.card-wide video{max-height:520px}.card-body{padding:14px 16px}.badge{align-items:center;gap:var(--spacing);text-transform:capitalize;transition:var(--transition);border-radius:3.40282e38px;padding:3px 10px;font-size:11px;font-weight:700;display:inline-flex}.handle{color:var(--muted);margin-left:auto;font-size:12px}.tag{align-items:center;gap:var(--spacing);transition:var(--transition);cursor:default;border-radius:3.40282e38px;margin:2px;padding:4px 10px;font-size:12px;display:inline-flex}.tag.clickable{cursor:pointer;-webkit-user-select:none;user-select:none}.tag.clickable:hover{background:var(--tag)}.tag.copied{background:var(--green)!important;color:#fff!important}.title{margin:6px 0;font-size:14px;font-weight:600;line-height:1.35}.card-wide .title{font-size:16px;font-weight:700}.caption{color:var(--muted);margin:6px 0 0;font-size:13px;line-height:1.5}.stats{align-items:center;gap:calc(var(--spacing) * 1.5);flex-wrap:wrap;margin-top:8px;display:flex}.stat-pill{align-items:center;gap:var(--spacing);color:var(--fg);background:var(--tag);transition:var(--transition);border-radius:3.40282e38px;padding:5px 12px;font-size:12px;display:inline-flex}.stat-pill:hover{background:var(--border)}.btn{cursor:pointer;align-items:center;gap:calc(var(--spacing) * 1.5);border-radius:var(--radius-lg);color:#fff;background:var(--brand);transition:var(--transition);border:none;margin-top:12px;padding:8px 18px;font-size:13px;font-weight:600;text-decoration-line:none;display:inline-flex}.btn:hover{background:var(--brand-2)}.btn:active{opacity:.9}.btn-sm{margin-top:8px;padding:5px 12px;font-size:11px}.section{border-bottom:1px solid var(--border);margin-bottom:6px;overflow:hidden}.section-header{cursor:pointer;-webkit-user-select:none;user-select:none;transition:var(--transition);justify-content:space-between;align-items:center;padding:10px 2px;display:flex}.section-header:hover .section-label{color:var(--fg)}.section-label{color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-size:11px;font-weight:700}.section-chevron{color:var(--muted);font-size:12px;transition:transform .2s}.section-header.open .section-chevron{transform:rotate(180deg)}.section-content{max-height:0;padding:0 2px;transition:max-height .28s,padding .28s;overflow:hidden}.section-content.open{max-height:2400px;padding:4px 2px 14px}.section-text{color:var(--fg);font-size:13px;line-height:1.6}.ai-actions{gap:calc(var(--spacing) * 2);flex-wrap:wrap;margin-top:14px;display:flex}.ai-btn{cursor:pointer;align-items:center;gap:calc(var(--spacing) * 2);border:1px solid var(--border);background:var(--card);color:var(--fg);font:inherit;transition:var(--transition);border-radius:3.40282e38px;padding:8px 13px;font-size:13px;font-weight:600;display:inline-flex}.ai-btn:hover:not(:disabled){border-color:var(--brand);background:var(--brand-soft)}.ai-btn:disabled{opacity:.55;cursor:not-allowed}.ai-btn .spark{color:var(--brand);flex-shrink:0;display:inline-flex}.ai-btn .price{white-space:nowrap;color:var(--brand);background:var(--brand-soft);border-radius:3.40282e38px;align-items:center;padding:2px 7px;font-size:11px;font-weight:700;display:inline-flex}.ai-btn.busy .spark{animation:1.1s linear infinite spin}.ai-note{color:var(--muted);margin-top:8px;font-size:11.5px}.an-title{align-items:center;gap:calc(var(--spacing) * 2);margin-bottom:14px;font-size:16px;font-weight:700;display:flex}.verdict{gap:calc(var(--spacing) * 2.5);grid-template-columns:repeat(1,minmax(0,1fr));margin-bottom:12px;display:grid}@media (min-width:420px){.verdict{grid-template-columns:1fr 1fr}}.meter{border-radius:var(--radius-md);background:var(--tag);padding:9px 11px}.meter-top{justify-content:space-between;align-items:baseline;gap:calc(var(--spacing) * 2);letter-spacing:.05em;text-transform:uppercase;color:var(--muted);font-size:11px;font-weight:700;display:flex}.meter-top b{letter-spacing:0;font-size:14px}.meter-track{background:var(--border);border-radius:3.40282e38px;height:5px;margin-top:6px;overflow:hidden}.meter-track>i{border-radius:3.40282e38px;height:100%;display:block}.chiprow{gap:calc(var(--spacing) * 1.5);flex-wrap:wrap;display:flex}.mhead{z-index:3;background:var(--bg);border-bottom:1px solid var(--border);padding:2px 0 10px;position:sticky;top:0}.mhead-top{justify-content:space-between;align-items:flex-end;gap:calc(var(--spacing) * 2.5);flex-wrap:wrap;display:flex}.mention-term{color:var(--muted);margin-bottom:2px;font-size:13px}.mention-term b{color:var(--fg)}.mention-total{color:var(--fg);letter-spacing:-.01em;font-size:20px;font-weight:650}.mention-down{color:var(--muted);margin-top:8px;font-size:12px}.mention-window{color:var(--muted);border:1px solid var(--border);border-radius:3.40282e38px;margin-left:6px;padding:1px 8px;font-size:11px;display:inline-block}.mention-summary{color:var(--muted);max-width:60ch;margin-top:6px;font-size:13px;line-height:1.45}.msort{background:var(--tag);border-radius:3.40282e38px;flex:none;align-items:center;gap:2px;padding:3px;display:inline-flex}.msort-btn{color:var(--muted);cursor:pointer;transition:var(--transition);white-space:nowrap;background:0 0;border:0;border-radius:999px;padding:5px 14px;font-size:11.5px;font-weight:600}.msort-btn:hover{color:var(--fg)}.msort-btn.on{color:var(--card);background:var(--accent)}.mchips{gap:calc(var(--spacing) * 1.5);flex-wrap:wrap;margin-top:10px;display:flex}.mchip{cursor:pointer;align-items:center;gap:calc(var(--spacing) * 2);color:var(--muted);border:1px solid var(--border);transition:var(--transition);white-space:nowrap;background:0 0;border-radius:3.40282e38px;padding:5px 12px;font-size:12px;font-weight:600;display:inline-flex}.mchip:hover{color:var(--fg);border-color:var(--muted)}.mchip b{color:var(--fg);background:var(--tag);font-variant-numeric:tabular-nums;border-radius:3.40282e38px;padding:1px 7px;font-weight:700}.mchip.on{color:var(--card);background:var(--accent);border-color:#0000}.mchip.on b{color:inherit;background:0 0;padding:1px 0}.mchip.on .mchip-mark{color:inherit}.mchip.quiet{opacity:.5;cursor:default}.mchip.quiet:hover{color:var(--muted);border-color:var(--border)}.mchip-mark{color:var(--brand);display:inline-flex}.mchip-mark svg{fill:currentColor;width:13px;height:13px}.mgroups{gap:calc(var(--spacing) * 2.5);flex-direction:column;margin-top:12px;display:flex}.mgroup{border-radius:var(--radius-xl);border:1px solid var(--border);background:var(--card);padding:12px 14px 6px}.mgroup-head{align-items:center;gap:calc(var(--spacing) * 2);flex-wrap:wrap;margin-bottom:6px;display:flex}.mgroup-plat{align-items:center;gap:calc(var(--spacing) * 1.5);color:var(--brand);font-size:11px;font-weight:600;display:inline-flex}.mgroup-plat svg{fill:currentColor;width:12px;height:12px}.mgroup-about{text-transform:uppercase;letter-spacing:.04em;color:var(--muted);border:1px solid var(--border);border-radius:3.40282e38px;padding:1px 7px;font-size:10.5px}.mgroup-reach{color:var(--muted);margin-left:auto;font-size:11px}.mgroup-title{color:var(--fg);-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:13px;font-weight:600;line-height:1.35;display:-webkit-box;overflow:hidden}.mgroup-rest{color:var(--muted);cursor:pointer;transition:var(--transition);background:0 0;border:0;align-self:flex-start;margin-top:2px;padding:2px 0;font-size:11.5px;font-weight:600}.mgroup-rest:hover{color:var(--fg)}.mgroup-actions{align-items:center;gap:calc(var(--spacing) * 3);margin-top:5px;display:flex}.mgroup-link{color:var(--muted);font-size:11.5px;text-decoration:none}.mgroup-link:hover{color:var(--fg);text-decoration:underline}.mgroup-all{color:var(--muted);cursor:pointer;transition:var(--transition);background:0 0;border:0;padding:0;font-size:11.5px;font-weight:600}.mgroup-all:hover{color:var(--fg)}.mgroup-none{color:var(--muted);margin-top:8px;font-size:12px}.mgroup-media{margin-top:10px}.mentions{flex-direction:column;margin-top:8px;display:flex}.mention{cursor:pointer;align-items:flex-start;gap:calc(var(--spacing) * 3);transition:var(--transition);padding:11px 2px;display:flex}.mention+.mention{border-top:1px solid var(--border)}.mention:hover{background:var(--card-hover)}.mention.picked{background:var(--tag)}.mention-pick{width:15px;height:15px;accent-color:var(--accent);cursor:pointer;flex:none;margin-top:11px}.mention-av{background:var(--tag);border:1px solid var(--border);border-radius:3.40282e38px;flex:none;width:36px;height:36px;position:relative;overflow:visible}.mention-av-init{color:var(--muted);border-radius:3.40282e38px;justify-content:center;align-items:center;font-size:14px;font-weight:700;display:flex;position:absolute;inset:0}.mention-av-img{object-fit:cover;border-radius:3.40282e38px;width:100%;height:100%;position:absolute;inset:0}.mention-av-badge{background:var(--card);width:16px;height:16px;color:var(--brand);border:1px solid var(--border);border-radius:3.40282e38px;justify-content:center;align-items:center;display:flex;position:absolute;bottom:-3px;right:-3px}.mention-av-badge svg{fill:currentColor;width:9.5px;height:9.5px}.mention-body{gap:calc(var(--spacing) * .5);flex-direction:column;flex:1;min-width:0;display:flex}.mention-head{align-items:baseline;gap:calc(var(--spacing) * 2);flex-wrap:wrap;display:flex}.mention-who{color:var(--fg);font-size:13px;font-weight:650}.mention-when{color:var(--muted);font-size:11.5px}.mention-when:before{content:"·";color:var(--border);margin-right:7px}.mention-hits{color:var(--fg);background:var(--tag);border:1px solid var(--border);border-radius:3.40282e38px;margin-left:auto;padding:1px 7px;font-size:10.5px;font-weight:700}.mention-text{color:var(--fg);word-break:break-word;margin-top:4px;font-size:13.5px;line-height:1.5}.mention-text mark{color:inherit;background:#f43f5e26;border-radius:4px;padding:1px 3px;font-weight:600}.mention-note{border-left:2px solid var(--brand,#f43f5e);background:var(--tag);color:var(--fg);white-space:pre-wrap;word-break:break-word;border-radius:0 6px 6px 0;margin-top:6px;padding:6px 9px;font-size:12.5px;line-height:1.5;display:block}.mention-meta{align-items:center;gap:calc(var(--spacing) * 3.5);margin-top:6px;display:flex}.mention-stat{align-items:center;gap:var(--spacing);color:var(--muted);font-size:11px;display:inline-flex}.mention-stat svg{fill:none;stroke:currentColor;stroke-width:1.8px;stroke-linecap:round;stroke-linejoin:round;width:12px;height:12px}.chip{text-transform:capitalize;letter-spacing:.01em;border:1px solid var(--border);color:var(--muted);border-radius:3.40282e38px;padding:1px 7px;font-size:10px;font-weight:600}.chip-positive{color:#15803d;background:#15803d14;border-color:#15803d55}.chip-negative{color:#b91c1c;background:#b91c1c14;border-color:#b91c1c55}.chip-mixed{color:#a16207;background:#a1620714;border-color:#a1620755}.chip-neutral{color:var(--muted)}.chip-cat{background:var(--tag)}.mention-more{cursor:pointer;border-radius:var(--radius-xl);width:100%;color:var(--fg);background:var(--tag);border:1px solid var(--border);transition:var(--transition);margin-top:12px;padding:10px;font-size:13px;font-weight:600;display:block}.mention-more:hover:not(:disabled){border-color:var(--muted)}.mention-more:disabled{opacity:.6;cursor:default}.tag.copyable{cursor:pointer;border:1px solid var(--border);font:inherit;align-items:center;gap:5px;font-size:12px;display:inline-flex}.tag.copyable:hover{border-color:var(--accent)}.tag.warn{background:var(--red)}@supports (color:color-mix(in lab, red, red)){.tag.warn{background:color-mix(in srgb, var(--red) 12%, transparent)}}.tag.warn{color:var(--red);border:1px solid var(--red)}@supports (color:color-mix(in lab, red, red)){.tag.warn{border:1px solid color-mix(in srgb, var(--red) 35%, transparent)}}.lede-box{background:var(--tag);border-radius:var(--radius-sm);margin-bottom:12px;padding:11px 13px;font-size:13.5px;line-height:1.6}.steps-list{gap:calc(var(--spacing) * 2);flex-direction:column;display:flex}.step-row{align-items:flex-start;gap:calc(var(--spacing) * 2.5);grid-template-columns:78px 1fr;display:grid}.step-k{letter-spacing:.05em;text-transform:uppercase;color:var(--muted);padding-top:2px;font-size:10.5px;font-weight:700}.step-v{font-size:13px;line-height:1.5}.an-list{margin:0;padding-left:18px;font-size:13px;line-height:1.55}.an-list li{margin:4px 0}.clamp6{-webkit-line-clamp:6;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}.hook-bar-track{align-items:center;gap:calc(var(--spacing) * 2.5);margin-top:6px;display:flex}.hook-bar{background:var(--tag);border-radius:3.40282e38px;flex:1;height:10px;overflow:hidden}.hook-bar-fill{border-radius:3.40282e38px;height:100%;transition:width .8s cubic-bezier(.4,0,.2,1)}.hook-score{text-align:right;min-width:40px;font-size:15px;font-weight:800}.quote-box{border-radius:var(--radius-md);background:var(--tag);border-left:3px solid var(--blue);margin:6px 0;padding:10px 14px;font-size:13px;font-weight:600;line-height:1.45;position:relative}.quote-box .copy-btn{cursor:pointer;border-radius:var(--radius-md);background:var(--card);border:1px solid var(--border);color:var(--muted);transition:var(--transition);opacity:0;padding:3px 8px;font-size:10px;position:absolute;top:8px;right:8px}.quote-box:hover .copy-btn{opacity:1}.copy-btn:hover{background:var(--accent);color:var(--card)}.theme-chip{align-items:center;gap:calc(var(--spacing) * 1.5);background:var(--tag);border:1px solid var(--border);color:var(--fg);border-radius:3.40282e38px;margin:0 4px 5px 0;padding:4px 10px;font-size:12px;display:inline-flex}.theme-chip b{color:var(--brand,var(--blue));font-variant-numeric:tabular-nums}.sec-label{letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-bottom:7px;font-size:11px;font-weight:700}.cbadge{white-space:nowrap;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700}.cbadge.pin{color:#b45309;background:#fef3c7}.cbadge.liked{color:#be185d;background:#fce7f3}.cmeta{align-items:center;gap:calc(var(--spacing) * 2);color:var(--muted);flex-wrap:wrap;margin-top:5px;font-size:11px;display:flex}.ctext{color:var(--fg);font-size:13px;line-height:1.45}.ctext.clamp{-webkit-line-clamp:3;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}.cmore{color:var(--blue);cursor:pointer;background:0 0;border:none;padding:3px 0 0;font-family:inherit;font-size:11.5px;font-weight:600}.comment-row{justify-content:space-between;align-items:flex-start;gap:calc(var(--spacing) * 2.5);border-radius:var(--radius-md);border-bottom:1px solid var(--border);transition:var(--transition);padding:10px 0;display:flex}.comment-row:last-child{border-bottom:none}.comment-row:hover{background:var(--tag)}.creator-card{border-radius:var(--radius-xl);border:1px solid var(--border);background:var(--card);width:min(240px,80vw);min-width:min(240px,80vw);transition:var(--transition);scroll-snap-align:start;flex-shrink:0;padding:16px;display:block}.creator-card:hover{border-color:var(--muted)}.avatar{object-fit:cover;border:2px solid var(--border);border-radius:3.40282e38px;width:52px;height:52px}.avatar-placeholder{border-radius:3.40282e38px;justify-content:center;align-items:center;width:52px;height:52px;font-size:22px;display:flex}.verified{color:#fff;border-radius:3.40282e38px;justify-content:center;align-items:center;width:18px;height:18px;margin-left:4px;font-size:10px;display:inline-flex}.sound-card{border-radius:var(--radius-xl);border:1px solid var(--border);background:var(--card);width:min(300px,88vw);min-width:min(300px,88vw);transition:var(--transition);scroll-snap-align:start;flex-shrink:0;padding:14px;display:block}.sound-card:hover{border-color:var(--muted)}.sound-cover{border-radius:var(--radius-md);object-fit:cover;width:68px;height:68px}.mp{--ar-w:9;--ar-h:16;width:min(100%, calc(var(--stage-max,520px) * var(--ar-w) / var(--ar-h)));background:#000;border:2px solid #0000;border-radius:18px;margin-inline:auto;position:relative;overflow:hidden}.mp.playing{border-color:var(--brand)}.card-media>.mp{width:100%}.mp.h{--ar-w:16;--ar-h:9}.mp.sq{--ar-w:1;--ar-h:1}.mp-stage{width:100%;aspect-ratio:var(--ar-w) / var(--ar-h);max-height:var(--stage-max,520px);background:#000;position:relative;overflow:hidden}.mp .mp-stage>video{object-fit:contain;background:#000;width:100%;height:100%;max-height:none;display:block}.mp .mp-slide{object-fit:contain;opacity:0;background:#000;width:100%;height:100%;max-height:none;transition:opacity .45s;position:absolute;inset:0;transform:none}.mp-slide.active{opacity:1}.mp-ov{pointer-events:none;z-index:2;position:absolute;inset:0}.mp-ov:after{content:"";pointer-events:none;background:linear-gradient(#0000,#00000047 38%,#000000b8);height:46%;position:absolute;bottom:0;left:0;right:0}.mp-ov:before{content:"";pointer-events:none;background:linear-gradient(#00000073,#0000);height:16%;position:absolute;top:0;left:0;right:0}.mp-badge,.mp-chip,.mp-rail,.mp-meta,.mp-tap,.mp-nav{z-index:1}.mp-ov>*{pointer-events:auto}.mp-badge{text-transform:capitalize;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fff;background:#0000008c;border-radius:3.40282e38px;align-items:center;gap:5px;padding:4px 9px;font-size:11px;font-weight:700;display:inline-flex;position:absolute;top:10px;left:10px}.mp-pick{z-index:3;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#0000;width:26px;height:26px;transition:var(--transition);background:#0000006b;border:2px solid #ffffffd9;border-radius:3.40282e38px;justify-content:center;align-items:center;padding:0;display:flex;position:absolute;top:9px;right:9px}.mp-pick:hover{background:#000000a8;transform:scale(1.08)}.mp-open{z-index:3;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fff;width:26px;height:26px;transition:var(--transition);background:#0000006b;border:2px solid #ffffffd9;border-radius:3.40282e38px;justify-content:center;align-items:center;padding:0;text-decoration-line:none;display:flex;position:absolute;top:9px;right:9px}.mp-open:hover{background:#000000a8;transform:scale(1.08)}.mp-open.with-pick{right:43px}.mp-pick[aria-pressed=true]{background:var(--brand,#ff4d23);color:#fff;border-color:#fff}.mp.picked{outline:2px solid var(--brand,#ff4d23);outline-offset:-2px}.mp-pick~.mp-chip,.mp[data-mp=slides] .mp-chip{top:42px}.pickbar{z-index:20;align-items:center;gap:calc(var(--spacing) * 2.5);background:var(--card);border:1px solid var(--border);box-shadow:var(--shadow-lg);border-radius:3.40282e38px;margin:12px 0 0;padding:10px 12px;animation:.2s ease-out fadeIn;display:flex;position:sticky;bottom:0}.pickbar .n{white-space:nowrap;font-size:13px;font-weight:700}.pickbar .sp{flex:1}.pickbar button{cursor:pointer;white-space:nowrap;border:1px solid var(--border);background:var(--card);color:var(--fg);font:inherit;transition:var(--transition);border-radius:3.40282e38px;padding:6px 13px;font-size:12.5px;font-weight:600}.pickbar button.primary{background:var(--brand,#ff4d23);color:#fff;border-color:#0000}.pickbar button:hover{filter:brightness(1.08)}.pickbar button:disabled{opacity:.5;cursor:not-allowed}.pickbar .hint{color:var(--muted);font-size:11.5px}.mp-chip{-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fff;font-variant-numeric:tabular-nums;background:#0000008c;border-radius:3.40282e38px;padding:3px 9px;font-size:11px;font-weight:700;position:absolute;top:10px;right:10px}.mp-rail{align-items:center;gap:calc(var(--spacing) * 3.5);flex-direction:column;display:flex;position:absolute;bottom:76px;right:8px}.mp-act{cursor:default;background:0 0;border:none;flex-direction:column;align-items:center;gap:3px;padding:0;display:flex}.mp-act .ic{-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fff;width:38px;height:38px;transition:var(--transition);background:#0006;border-radius:3.40282e38px;justify-content:center;align-items:center;display:flex}.mp-act:hover .ic{background:#0000009e;transform:scale(1.06)}.mp-act .n{color:#fff;text-shadow:0 1px 3px #000c;font-variant-numeric:tabular-nums;font-size:11px;font-weight:700}.mp-meta{color:#fff;text-shadow:0 1px 3px #000000d9;position:absolute;bottom:60px;left:12px;right:64px}.mp-handle{margin-bottom:3px;font-size:13px;font-weight:800}.mp-cap{-webkit-line-clamp:2;opacity:.95;-webkit-box-orient:vertical;font-size:12px;line-height:1.4;display:-webkit-box;overflow:hidden}.mp-song{white-space:nowrap;text-overflow:ellipsis;align-items:center;gap:5px;margin-top:6px;font-size:11px;font-weight:600;display:flex;overflow:hidden}.mp-song .note{flex:none;display:inline-flex}.mp.playing .mp-song .note{animation:3s linear infinite spin}.mp-song-t{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}@keyframes spin{to{transform:rotate(360deg)}}.mp-tap{cursor:pointer;background:0 0;border:none;justify-content:center;align-items:center;display:flex;position:absolute;inset:0}.mp-tap span{-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);color:#fff;width:64px;height:64px;transition:var(--transition);opacity:1;background:#00000073;border-radius:3.40282e38px;justify-content:center;align-items:center;font-size:26px;display:flex}.mp.playing .mp-tap span{opacity:0}.mp.playing:hover .mp-tap span{opacity:.65}.mp-nav{cursor:pointer;color:#fff;opacity:0;width:34px;height:34px;transition:var(--transition);background:#0000008c;border:none;border-radius:3.40282e38px;justify-content:center;align-items:center;font-size:18px;display:flex;position:absolute;top:50%;transform:translateY(-50%)}.mp:hover .mp-nav,.mp:focus-within .mp-nav{opacity:1}.mp-nav.prev{left:8px}.mp-nav.next{right:8px}.mp-nav:hover{background:#000c}.mp-ctl{z-index:3;background:linear-gradient(#0000,#000000d9);align-items:center;gap:9px;padding:9px 11px;display:flex;position:absolute;bottom:0;left:0;right:0}.mp-btn{cursor:pointer;color:#111;width:30px;height:30px;transition:var(--transition);background:#fffffff2;border:none;border-radius:3.40282e38px;flex:none;justify-content:center;align-items:center;font-size:12px;display:flex}.mp-btn:hover{transform:scale(1.09)}.mp-time{color:#fff;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px #000c;flex-shrink:0;font-size:10px;font-weight:700}.mp-seek{cursor:pointer;flex:1;align-items:center;min-width:0;height:14px;display:flex;position:relative}.mp-segs{gap:calc(var(--spacing) * .5);border-radius:3.40282e38px;width:100%;height:3px;transition:height .15s;display:flex;overflow:hidden}.mp-seek:hover .mp-segs{height:5px}.mp-seg{background:#ffffff52;border-radius:3.40282e38px;flex:1;height:100%;overflow:hidden}.mp-seg>i{background:#fff;border-radius:3.40282e38px;width:0;height:100%;display:block}.mp-seg.done>i{width:100%}.mp-icon{color:#fff;cursor:pointer;opacity:.9;background:0 0;border:none;flex-shrink:0;padding:0;font-size:14px;line-height:1}.mp-icon:hover{opacity:1}.mp-spin{pointer-events:none;z-index:2;justify-content:center;align-items:center;display:flex;position:absolute;inset:0}.mp-spin>i{border:3px solid #ffffff40;border-top-color:#fff;border-radius:3.40282e38px;width:34px;height:34px;animation:.8s linear infinite spin}.mp-err{pointer-events:none;z-index:4;justify-content:center;align-items:center;gap:calc(var(--spacing) * 2);text-align:center;color:#fff;background:#000000d1;flex-direction:column;padding:16px;font-size:12px;font-weight:600;display:flex;position:absolute;inset:0}.mp:focus-visible{outline-offset:-2px;outline:2px solid #fff}.mp-btn:focus-visible,.mp-icon:focus-visible,.mp-nav:focus-visible,.mp-tap:focus-visible,.au-play:focus-visible,.gallery-nav:focus-visible,.dot:focus-visible{outline-offset:2px;outline:2px solid #fff}@media (prefers-reduced-motion:reduce){.mp-song .note{animation:none}.mp-slide{transition:none}.mp-spin>i{animation-duration:2s}*{scroll-behavior:auto!important}}.au{align-items:center;gap:calc(var(--spacing) * 2.5);margin-top:10px;display:flex}.au-play{cursor:pointer;color:#fff;background:var(--brand);width:34px;height:34px;transition:var(--transition);border:none;border-radius:3.40282e38px;flex:none;justify-content:center;align-items:center;display:flex}.au-body{flex:1;min-width:0}.au-seek{cursor:pointer;background:var(--fg);border-radius:3.40282e38px;width:100%;height:5px;position:relative;overflow:hidden}@supports (color:color-mix(in lab, red, red)){.au-seek{background:color-mix(in srgb, var(--fg) 22%, transparent)}}.au-seek>i{background:var(--accent);border-radius:3.40282e38px;width:0;height:100%;display:block}.au-time{color:var(--muted);font-variant-numeric:tabular-nums;justify-content:space-between;margin-top:3px;font-size:10px;display:flex}.au-missing{align-items:center;gap:calc(var(--spacing) * 1.5);color:var(--muted);margin-top:8px;font-size:11px;display:flex}.credits-card{border-radius:var(--radius-2xl);border:1px solid var(--border);background:var(--card);max-width:380px;margin:8px 0;padding:24px}.pack{cursor:pointer;border-radius:var(--radius-xl);text-align:center;border:1px solid var(--border);transition:var(--transition);padding:16px}.pack:hover{border-color:var(--muted)}.pack-featured{border-radius:var(--radius-xl);text-align:center;border:2px solid var(--accent);padding:16px}.tier-badge{color:#1e40af;background:#dbeafe;border-radius:3.40282e38px;align-items:center;padding:4px 12px;font-size:12px;font-weight:700;display:inline-flex}.free-tag{align-items:center;gap:var(--spacing);color:#065f46;transition:var(--transition);background:#d1fae5;border-radius:3.40282e38px;margin:2px;padding:4px 10px;font-size:11px;font-weight:600;display:inline-flex}.json-block{border-radius:var(--radius-md);background:var(--tag);border:1px solid var(--border);white-space:pre-wrap;word-break:break-all;max-height:320px;margin-top:10px;padding:14px;font-family:SF Mono,Monaco,monospace;font-size:12px;overflow-y:auto}.empty-state{text-align:center;color:var(--muted);padding:48px 24px}.empty-state .icon{margin-bottom:12px;font-size:48px}.empty-state .text{font-size:14px}}@layer utilities{.collapse{visibility:collapse}.invisible{visibility:hidden}.visible{visibility:visible}.absolute{position:absolute}.fixed{position:fixed}.relative{position:relative}.static{position:static}.bottom-3{bottom:calc(var(--spacing) * 3)}.left-3{left:calc(var(--spacing) * 3)}.m-0{margin:0}.mx-auto{margin-inline:auto}.mt-2{margin-top:calc(var(--spacing) * 2)}.mt-3{margin-top:calc(var(--spacing) * 3)}.mt-4{margin-top:calc(var(--spacing) * 4)}.mb-1{margin-bottom:var(--spacing)}.mb-2{margin-bottom:calc(var(--spacing) * 2)}.mb-3{margin-bottom:calc(var(--spacing) * 3)}.block{display:block}.contents{display:contents}.flex{display:flex}.grid{display:grid}.hidden{display:none}.inline{display:inline}.inline-flex{display:inline-flex}.table{display:table}.h-2{height:calc(var(--spacing) * 2)}.h-full{height:100%}.w-full{width:100%}.max-w-sm{max-width:var(--container-sm)}.shrink{flex-shrink:1}.grow{flex-grow:1}.transform{transform:var(--tw-rotate-x,) var(--tw-rotate-y,) var(--tw-rotate-z,) var(--tw-skew-x,) var(--tw-skew-y,)}.resize{resize:both}.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.items-center{align-items:center}.justify-center{justify-content:center}.gap-1{gap:var(--spacing)}.gap-2{gap:calc(var(--spacing) * 2)}.gap-3{gap:calc(var(--spacing) * 3)}.truncate{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.overflow-hidden{overflow:hidden}.rounded-full{border-radius:3.40282e38px}.rounded-lg{border-radius:var(--radius-lg)}.rounded-xl{border-radius:var(--radius-xl)}.border{border-style:var(--tw-border-style);border-width:1px}.border-line{border-color:var(--border)}.bg-black{background-color:var(--color-black)}.bg-soft{background-color:var(--tag)}.bg-surface{background-color:var(--card)}.object-contain{object-fit:contain}.object-cover{object-fit:cover}.p-3{padding:calc(var(--spacing) * 3)}.px-3{padding-inline:calc(var(--spacing) * 3)}.px-5{padding-inline:calc(var(--spacing) * 5)}.px-6{padding-inline:calc(var(--spacing) * 6)}.py-1{padding-block:var(--spacing)}.py-4{padding-block:calc(var(--spacing) * 4)}.py-10{padding-block:calc(var(--spacing) * 10)}.pl-5{padding-left:calc(var(--spacing) * 5)}.text-center{text-align:center}.text-2xl{font-size:var(--text-2xl);line-height:var(--tw-leading,var(--text-2xl--line-height))}.text-base{font-size:var(--text-base);line-height:var(--tw-leading,var(--text-base--line-height))}.text-lg{font-size:var(--text-lg);line-height:var(--tw-leading,var(--text-lg--line-height))}.text-sm{font-size:var(--text-sm);line-height:var(--tw-leading,var(--text-sm--line-height))}.text-xs{font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height))}.leading-relaxed{--tw-leading:var(--leading-relaxed);line-height:var(--leading-relaxed)}.leading-snug{--tw-leading:var(--leading-snug);line-height:var(--leading-snug)}.font-bold{--tw-font-weight:var(--font-weight-bold);font-weight:var(--font-weight-bold)}.font-extrabold{--tw-font-weight:var(--font-weight-extrabold);font-weight:var(--font-weight-extrabold)}.font-semibold{--tw-font-weight:var(--font-weight-semibold);font-weight:var(--font-weight-semibold)}.text-ink{color:var(--fg)}.text-muted{color:var(--muted)}.text-white{color:var(--color-white)}.lowercase{text-transform:lowercase}.uppercase{text-transform:uppercase}.italic{font-style:italic}.shadow{--tw-shadow:0 1px 3px 0 var(--tw-shadow-color,#0000001a), 0 1px 2px -1px var(--tw-shadow-color,#0000001a);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.blur{--tw-blur:blur(8px);filter:var(--tw-blur,) var(--tw-brightness,) var(--tw-contrast,) var(--tw-grayscale,) var(--tw-hue-rotate,) var(--tw-invert,) var(--tw-saturate,) var(--tw-sepia,) var(--tw-drop-shadow,)}.filter{filter:var(--tw-blur,) var(--tw-brightness,) var(--tw-contrast,) var(--tw-grayscale,) var(--tw-hue-rotate,) var(--tw-invert,) var(--tw-saturate,) var(--tw-sepia,) var(--tw-drop-shadow,)}.transition{transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--tw-gradient-from,--tw-gradient-via,--tw-gradient-to,opacity,box-shadow,transform,translate,scale,rotate,filter,-webkit-backdrop-filter,backdrop-filter,display,content-visibility,overlay,pointer-events;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.ease-in-out{--tw-ease:var(--ease-in-out);transition-timing-function:var(--ease-in-out)}.ease-out{--tw-ease:var(--ease-out);transition-timing-function:var(--ease-out)}.select-all{-webkit-user-select:all;user-select:all}}:root{color-scheme:light dark;--bg:#fafbfc;--fg:#111827;--muted:#5f6773;--border:#e5e7eb;--card:#fff;--card-hover:#f3f4f6;--tag:#f3f4f6;--accent:#14151a;--brand:#ff4d23;--brand-2:#ff8a3d;--brand-soft:#ff4d2321;--radius:10px;--radius-sm:6px;--transition:all .25s cubic-bezier(.4, 0, .2, 1);--shadow-md:0 4px 12px #00000014;--shadow-lg:0 8px 24px #0000001f;--green:#047857;--amber:#b45309;--red:#dc2626;--blue:#2563eb}@media (prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#f1f5f9;--muted:#a8b8cc;--border:#334155;--green:#34d399;--amber:#fbbf24;--red:#f87171;--blue:#60a5fa;--card:#1e293b;--card-hover:#273548;--tag:#1e293b;--accent:#e2e8f0;--brand:#ff5c33;--brand-2:#ff9351;--brand-soft:#ff5c3329;--shadow-md:0 4px 12px #0000004d;--shadow-lg:0 8px 24px #0006}}@property --tw-rotate-x{syntax:"*";inherits:false}@property --tw-rotate-y{syntax:"*";inherits:false}@property --tw-rotate-z{syntax:"*";inherits:false}@property --tw-skew-x{syntax:"*";inherits:false}@property --tw-skew-y{syntax:"*";inherits:false}@property --tw-border-style{syntax:"*";inherits:false;initial-value:solid}@property --tw-leading{syntax:"*";inherits:false}@property --tw-font-weight{syntax:"*";inherits:false}@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-shadow-color{syntax:"*";inherits:false}@property --tw-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --tw-inset-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-inset-shadow-color{syntax:"*";inherits:false}@property --tw-inset-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --tw-ring-color{syntax:"*";inherits:false}@property --tw-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-inset-ring-color{syntax:"*";inherits:false}@property --tw-inset-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-ring-inset{syntax:"*";inherits:false}@property --tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0}@property --tw-ring-offset-color{syntax:"*";inherits:false;initial-value:#fff}@property --tw-ring-offset-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-blur{syntax:"*";inherits:false}@property --tw-brightness{syntax:"*";inherits:false}@property --tw-contrast{syntax:"*";inherits:false}@property --tw-grayscale{syntax:"*";inherits:false}@property --tw-hue-rotate{syntax:"*";inherits:false}@property --tw-invert{syntax:"*";inherits:false}@property --tw-opacity{syntax:"*";inherits:false}@property --tw-saturate{syntax:"*";inherits:false}@property --tw-sepia{syntax:"*";inherits:false}@property --tw-drop-shadow{syntax:"*";inherits:false}@property --tw-drop-shadow-color{syntax:"*";inherits:false}@property --tw-drop-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --tw-drop-shadow-size{syntax:"*";inherits:false}@property --tw-ease{syntax:"*";inherits:false}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{50%{opacity:.5}}
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
    analyze_post:"Frames from the post plus its transcript, for you to read yourself.",
    discover_social_posts:"Trending posts from any platform for a given niche.",
    get_user_posts:"Recent posts from a specific creator handle.",
    get_social_media:"Get post data from any social media URL.",
    analyze_creator_profile:"Full creator profile analysis — engagement, audience, content style.",
    get_post_comments:"Top comments on a post — sentiment, themes, viral threads.",
    search_creators:"Find creators in a niche by engagement, followers, and content.",
    get_similar_creators:"Find creators similar to a given handle.",
    discover_sounds:"Trending sounds and music on TikTok/Instagram.",
    understand_social_post:"The same frames and transcript, for a description of what happens on screen.",
    check_orchyn_credits:"View your Orchyn credit balance and usage.",
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

  // A ChatGPT-shaped host sends no tool-input notification, so the poll below
  // is what drives the skeleton there - which means this runs over and over
  // within one call: every 250ms while polling, plus once per set_globals,
  // and that fires for theme, display mode and height changes as well as for
  // results. Rewriting innerHTML on each of them restarted .fade-in (opacity
  // 0, shifted 8px down), the load-bar sweep and every skeleton shine four
  // times a second, and posted a size-changed at the same rate for the host
  // to re-lay-out on. That is the blinking. The skeleton is a pure function
  // of its shape, so paint it once and let the CSS animations run: repaint
  // only when the shape changes, or when it is no longer on screen because a
  // result replaced it - which is the second call in a reused view.
  var loadingSig=null;
  function renderLoading(tool,args){
    var app=document.getElementById("app");
    if(!app||toolResultReceived)return;
    var shape=LOADING_SHAPE[tool]||shapeFromArgs(args)||{kind:"text",n:1,label:"Working"};
    var sig=shape.kind+"|"+shape.n+"|"+shape.label;
    if(sig===loadingSig&&app.querySelector(".load-bar"))return;
    loadingSig=sig;
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

  // The host serves this HTML from its own URL, so on ChatGPT there is no
  // ui:// path to read a tool name out of - which is why its view said
  // "Interactive View" and the generic placeholder while Claude, whose URL
  // does carry it, named the tool. The server knows which view it is serving,
  // so it substitutes it here.
  var BAKED_TOOL="__ORCHYN_TOOL__";
  function bakedTool(){
    return BAKED_TOOL.indexOf("ORCHYN_TOOL")>=0?"":BAKED_TOOL;
  }

  function renderIdle(){
    // Extract tool name from URI path segment (e.g. /ui://orchyn/analyze_post → analyze_post)
    // or from ?tool= param if the host passes it.
    var tool=bakedTool();
    var params=new URLSearchParams(window.location.search);
    if(!tool)tool=params.get("tool")||"";
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
    app.innerHTML='<div class="flex flex-col items-center justify-center text-center px-6 py-10" style="min-height:220px">'
      +'<svg width="44" height="44" viewBox="0 0 48 48" fill="none"><g fill="var(--brand)" transform="translate(24 24)"><circle r="4.1"/><g id="ri"><path d="M-2.85 -5.2 L0 -20.6 L2.85 -5.2 L1.15 1.1 L-1.15 1.1 Z"/></g><use href="#ri" transform="rotate(45)"/><use href="#ri" transform="rotate(90)"/><use href="#ri" transform="rotate(135)"/><use href="#ri" transform="rotate(180)"/><use href="#ri" transform="rotate(225)"/><use href="#ri" transform="rotate(270)"/><use href="#ri" transform="rotate(315)"/></g></svg>'
      +'<div class="mt-4 text-lg font-bold text-ink">'+label+'</div>'
      +'<div class="mt-2 text-sm leading-relaxed text-muted max-w-sm">'+desc+'</div>'
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
    }else if(!toolResultReceived&&!lastOutRef){
      // A ChatGPT-shaped host mounts this view as part of a tool call, so
      // "window.openai exists and has no output yet" *is* the loading state.
      // Requiring toolInput first meant the host that sets it late - or never
      // - kept the idle placeholder up for the whole call, which is the
      // "Results will appear here" that showed while Claude and Cursor
      // shimmered correctly. The give-up path below restores the placeholder
      // if nothing ever arrives.
      renderLoading(currentTool||bakedTool(),api.toolInput||{});
    }
  }
  // window.openai is injected asynchronously — OpenAI's own guidance is to
  // "wait for window.openai to be available and retry once or twice if data
  // arrives late". A single read at parse time therefore finds nothing and
  // never looks again, which is a view sitting on its placeholder while the
  // host has held the result the whole time.
  //
  // So poll, stop the moment anything lands, and give up rather than spin
  // forever. Claude never defines the global and delivers over postMessage
  // instead, so it stops at the first result and costs a few no-op ticks.
  var pollStart=Date.now();
  function pollHostGlobals(){
    readHostGlobals();
    if(lastOutRef||toolResultReceived)return;
    var waited=Date.now()-pollStart;
    // The budget was 40 ticks - ten seconds - and every tool here that fetches
    // a feed or watches a video runs longer than that. So the shimmer was
    // taken down mid-call and replaced by "Results will appear here", and
    // because this poll is the only way a host that merely sets the global is
    // ever read, the result that landed afterwards was never picked up at all.
    // Wait as long as the server itself waits on a job (POLL_TIMEOUT_MS).
    if(waited>=300000){
      // Nothing ever came. A view left shimmering forever is worse than one
      // that says plainly it is waiting, so put the placeholder back.
      if(window.openai)renderIdle();
      return;
    }
    // Quick while the global is still expected to land, slower once we are
    // plainly just waiting on the tool.
    setTimeout(pollHostGlobals,waited<3000?250:1000);
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
  pollHostGlobals();

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
  }).then(function(){ bridgeAlive=true; sendInitialized(); }).catch(sendInitialized);
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

  // ─── Follow-up actions ───
  // A button that spends credits must show that it will: sparkle to mark it as
  // a follow-up the model will reason over, and the price on the face. The
  // click asks the host to run the tool, and falls back to copying a ready
  // prompt where the host cannot run one from a view.
  //
  // These are the fetch prices, which is all any of these tools cost now. The
  // two that fan out to a second call are the two that are dearer than their
  // headline fetch: analyze_post and understand_social_post pay 2 for the
  // frames and 1 more for the transcript. score_draft fetches nothing, so it
  // has no badge — the || 0 below already hides it.
  var AI_PRICE={analyze_post_fast:2,write_hooks:2,create_variants:2,
    repurpose_post:2,niche_report:2,find_hook_pattern:2,analyze_post:3,
    analyze_comments:2,compare_posts:1,understand_social_post:3,analyze_creator_profile:2};

  // ChatGPT's Apps SDK does not answer the MCP Apps postMessage bridge. A
  // widget there reaches its server through window.openai.callTool, and opens
  // a link through window.openai.openExternal. This view only ever posted
  // tools/call and ui/open-link, so on ChatGPT every in-view button posted
  // into the void, waited out the 1500ms timeout and fell through to the
  // clipboard - and a sandboxed widget iframe carries no clipboard-write
  // grant either, so writeText rejected and the user was told "Copy failed"
  // while nothing had happened. Prefer the host's own API where it exists and
  // keep the bridge for the MCP Apps hosts that do answer it.
  // A tool call is not a UI event. Fetching a feed or watching a video takes
  // ten seconds and more - the discover call this view is built around
  // measures 10.3s - so the 1500ms this used to wait declared a host that was
  // running the tool correctly a failure, and showed "Copy failed" over a call
  // that then succeeded. Wait as long as the result poll does, and keep the
  // short deadline only for a host that answered neither the handshake nor
  // offers an API of its own, which is the one case where nothing is coming.
  var TOOL_CALL_BUDGET_MS=300000;
  var bridgeAlive=false;

  /** Ask the host to run a tool: onDone(result) when it does, onFail() only
   *  when the host cannot run it at all. */
  function invokeTool(tool,args,onDone,onFail){
    var settled=false;
    var fail=function(){ if(settled)return; settled=true; onFail(); };
    var api=window.openai;
    var native=!!(api&&typeof api.callTool==="function");
    var p=null;
    if(native){
      try{ p=api.callTool(tool,args||{}); if(p&&!p.then)p=Promise.resolve(p); }catch(e){ p=null; }
    }
    if(!p){ try{ p=send("tools/call",{name:tool,arguments:args||{}}); }catch(e2){ p=null; } }
    if(!p||!p.then){ fail(); return; }
    p.then(function(r){ if(settled)return; settled=true; onDone(r); },fail);
    setTimeout(fail,(native||bridgeAlive)?TOOL_CALL_BUDGET_MS:1500);
  }

  /** Show what the call came back with. A host that answers in-band hands the
   *  result straight to us; one that also pushes a tool-result notification
   *  would render the same payload again, so keep the globals bookkeeping in
   *  step and let that second pass be skipped. */
  function renderToolResult(r){
    if(!r||typeof r!=="object")return false;
    var sc=r.structuredContent;
    if(!sc||typeof sc!=="object")return false;
    lastOutRef=sc;
    try{ lastOutSig=JSON.stringify(sc); }catch(e){ lastOutSig=""; }
    toolResultReceived=true;
    render({structuredContent:sc});
    setTimeout(reportSize,50);
    return true;
  }

  /** True once the host has been asked to open the link. */
  function openHostLink(href){
    var api=window.openai;
    if(api&&typeof api.openExternal==="function"){
      try{ api.openExternal({href:href}); return true; }catch(e){}
    }
    return false;
  }

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
    invokeTool(tool,args,function(r){
      settled=true;
      restore("Sent ✓");
      renderToolResult(r);
    },fallback);
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
    if(openHostLink(href))return;
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
    invokeTool("compare_posts",{urls:urls},function(r){
      settled=true;
      done("Sent ✓");
      renderToolResult(r);
    },fallback);
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

  // An avatar with nothing left to try hides, uncovering the initial drawn
  // underneath it. A broken-image glyph in a column of faces reads as a fault;
  // an initial reads as a person whose picture did not load.
  document.addEventListener("error",function(e){
    var el=e.target;
    if(!el||el.tagName!=="IMG"||!el.hasAttribute("data-avatar"))return;
    if(el.getAttribute("data-fallback"))return;
    el.style.display="none";
  },true);

  // A <video> poster cannot report failure: there is no error event for it, so
  // a dead cover leaves a black stage and nothing notices. TikTok cover
  // signatures expire in hours, so this is the ordinary case, not the edge -
  // measured on a two-hour-old payload whose cover already answered 403 while
  // its video still played. Probing the URL with an Image gives us the error
  // event the video will not, and the resolver hands back a fresh cover.
  function healPosters(root){
    var vids=(root||document).querySelectorAll("video[data-poster-fallback]");
    for(var i=0;i<vids.length;i++)(function(v){
      var poster=v.getAttribute("poster")||"",alt=v.getAttribute("data-poster-fallback")||"";
      v.removeAttribute("data-poster-fallback");
      if(!poster||!alt||poster===alt)return;
      var probe=new Image();
      probe.onerror=function(){v.setAttribute("poster",alt);};
      probe.src=poster;
    })(vids[i]);
  }

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
    healPosters(document);
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
  function pColor(p){return{tiktok:"#000",douyin:"#000",instagram:"#E4405F",youtube:"#FF0000",xiaohongshu:"#FF2442",x:"#000",twitter:"#000",bilibili:"#00A1D6",linkedin:"#0A66C2",reddit:"#FF4500",weibo:"#E6162D"}[p]||"#6B7280";}
  /** Display name for a platform key — "xiaohongshu" is not a label. */
  function pTitle(p){
    var m={tiktok:"TikTok",douyin:"Douyin",instagram:"Instagram",youtube:"YouTube",
      xiaohongshu:"Xiaohongshu",twitter:"X",x:"X",bilibili:"Bilibili",
      linkedin:"LinkedIn",reddit:"Reddit",weibo:"Weibo"};
    return m[p]||(p?String(p).charAt(0).toUpperCase()+String(p).slice(1):"");
  }
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

  /**
   * The monitoring screen, kept in a variable so filtering and sorting redraw
   * without another paid call. A sandboxed view cannot re-query; anything the
   * user narrows has to be narrowed from what is already here.
   */
  var monitorState=null;
  var monitorTerm="";

  /**
   * Sentiment and category, when something has classified the comment.
   *
   * These are absent on a brand sweep and present on a show_comment_review,
   * because the sweep has no basis for them — nothing in the payload says
   * whether a comment is angry, and colouring it from a keyword guess would be
   * confidently wrong about the exact thing being scanned for. When a model
   * has actually read the words, the label is worth something, so it is drawn.
   */
  function labelChips(m){
    var out="";
    var s=String(m.sentiment||"");
    if(s)out+='<span class="chip chip-'+esc(s)+'">'+esc(s)+"</span>";
    var c=String(m.category||"");
    if(c)out+='<span class="chip chip-cat">'+esc(c.split("_").join(" "))+"</span>";
    return out;
  }

  /** The counts a review carries, as the same filter chips the sweep uses. */
  function reviewChips(st){
    var counts=st.byCategory||{};
    var keys=Object.keys(counts).sort(function(a,b){return counts[b]-counts[a];});
    if(!keys.length)return "";
    return '<div class="mchips">'
      +['<button type="button" class="mchip'+(st.filter?"":" on")+'" data-filter="">All <b>'
        +esc(String(st.total))+"</b></button>"]
        .concat(keys.map(function(k){
          return '<button type="button" class="mchip'+(st.filter===k?" on":"")
            +'" data-filter="'+esc(k)+'">'+esc(k.split("_").join(" "))
            +" <b>"+esc(String(counts[k]))+"</b></button>";
        })).join("")
      +"</div>";
  }

  /** Identifies a group across a redraw. The permalink is the stable part. */
  function groupKey(t){
    var post=t.post||{};
    return String(post.externalUrl||(post.platform||"")+":"+(post.title||""));
  }
  /** The group a key names, or null if the page has moved on. */
  function groupByKey(k){
    var found=null;
    (monitorState?monitorState.threads:[]).forEach(function(t){
      if(!found&&groupKey(t)===k)found=t;
    });
    return found;
  }

  /**
   * The comments "select all" means, for one group.
   *
   * Collapsing and filtering look alike — both leave rows off the screen — but
   * they mean opposite things. A collapsed comment is hidden to save space and
   * the reader still meant it; a filtered-out one they deliberately excluded.
   * So this ignores the fold and honours the filter.
   */
  function selectableMentions(t){
    var all=t.mentions||[];
    if(!monitorState||!monitorState.filter||!monitorState.byCategory)return all;
    var want=monitorState.filter;
    return all.filter(function(m){return String(m.category||"")===want;});
  }

  /** How many comments a group shows before it asks. */
  var GROUP_PEEK=4;
  /** Groups the reader has opened, by post URL, kept across a filter or sort. */
  var expandedGroups={};

  /** Reach of the post a comment sits under — how many people saw it. */
  function postReach(post){
    var bits=[];
    if(post.views)bits.push(fmtNum(post.views)+" views");
    if(post.likes)bits.push(fmtNum(post.likes)+" likes");
    if(post.comments)bits.push(fmtNum(post.comments)+" comments");
    return bits.slice(0,2).join(" · ");
  }

  /** Newest comment in a group, for the "recent first" ordering. */
  function groupNewest(t){
    var best=0;
    (t.mentions||[]).forEach(function(m){
      var d=new Date(String(m.postedAt||""));
      if(!isNaN(d.getTime())&&d.getTime()>best)best=d.getTime();
    });
    return best;
  }

  function renderMonitor(){
    var app=document.getElementById("app");
    if(!app||!monitorState)return;
    var st=monitorState;

    var keep=st.threads.filter(function(t){
      // A post with no matching comment earns its space only when the post
      // itself names the term; otherwise it is a card that says nothing.
      return Number(t.mentionCount||0)>0||!!t.postIsAboutTerm;
    });
    // Which platforms have something on screen — not the same as which have a
    // comment. A post that names the term with no matching replies still shows.
    var onScreen={};
    keep.forEach(function(t){onScreen[String((t.post||{}).platform||"")]=true;});
    // A brand sweep filters by network, because it spans many. A review is one
    // post, so the network is a constant and the useful cut is the label the
    // model put on each comment — which means filtering inside a group rather
    // than dropping whole ones.
    var shown=!st.filter?keep
      :st.byCategory
        ?keep.map(function(t){
          var kept=(t.mentions||[]).filter(function(m){return String(m.category||"")===st.filter;});
          return kept.length?{post:t.post,postIsAboutTerm:t.postIsAboutTerm,
            mentionCount:kept.length,mentions:kept}:null;
        }).filter(Boolean)
        :keep.filter(function(t){
          return String((t.post||{}).platform||"")===st.filter;
        });
    if(st.sort==="new"){
      shown=shown.slice().sort(function(a,b){return groupNewest(b)-groupNewest(a);});
    }

    var order=Object.keys(st.counts).sort(function(a,b){return (st.counts[b]||0)-(st.counts[a]||0);});
    var live=order.filter(function(k){return Number(st.counts[k]||0)>0;});
    // A platform that returned nothing still gets a chip — "we looked there and
    // it was quiet" is an answer — but it is not a filter, because filtering to
    // it is a dead end.
    var chips=['<button type="button" class="mchip'+(st.filter?"":" on")
      +'" data-filter="">All <b>'+esc(String(st.total))+"</b></button>"]
      .concat(order.map(function(k){
        var n=Number(st.counts[k]||0),has=!!onScreen[k];
        return '<button type="button" class="mchip'+(st.filter===k?" on":"")+(has?"":" quiet")
          +'" data-filter="'+esc(k)+'"'+(has?"":" disabled")+' style="--brand:'+pColor(k)+'">'
          +'<span class="mchip-mark">'+pSvg(k,13)+"</span>"
          +esc(pTitle(k))+" <b>"+esc(String(n))+"</b></button>";
      })).join("");

    var down=st.unavailable.length
      ? '<div class="mention-down">Could not reach '
        +st.unavailable.map(function(u){return esc(pTitle(u&&u.platform||"?"));}).join(", ")
        +" — those networks may have more.</div>"
      : "";

    var head='<div class="mhead">'
      +'<div class="mhead-top">'
      +'<div><div class="mention-term">'+(st.byCategory?"Comment review — ":"Mentions of ")
      +"<b>"+esc(st.term)+"</b> "
      +(st.since?'<span class="mention-window">since '+esc(st.since)
        +(st.sinceApplied?"":" · not applied")
        +(st.undatedMentions>0?" · "+esc(String(st.undatedMentions))+" undated":"")
        +"</span>":"")+"</div>"
      +'<div class="mention-total">'+esc(String(st.total))+" comment"+(st.total===1?"":"s")
      +(st.byCategory
        ?(st.summary?"":"")
        :(live.length?" across "+esc(String(live.length))+" network"+(live.length===1?"":"s"):""))
      +"</div>"
      +(st.summary?'<div class="mention-summary">'+esc(st.summary)+"</div>":"")
      +"</div>"
      +'<div class="msort"><button type="button" class="msort-btn'+(st.sort==="loud"?" on":"")
      +'" data-sort="loud">Loudest</button>'
      +'<button type="button" class="msort-btn'+(st.sort==="new"?" on":"")
      +'" data-sort="new">Newest</button></div>'
      +"</div>"
      +(st.byCategory?reviewChips(st):'<div class="mchips">'+chips+"</div>")+down+"</div>";

    if(!shown.length){
      app.innerHTML=head+'<div class="empty-state fade-in"><div class="icon">🔍</div>'
        +'<div class="text">'+(st.filter?"Nothing from "+esc(pTitle(st.filter)):"Nobody has mentioned that yet")
        +"</div></div>";
      setTimeout(reportSize,50);
      return;
    }

    var groups=shown.map(function(t){
      var post=t.post||{},plat=String(post.platform||""),about=!!t.postIsAboutTerm;
      var reach=postReach(post),link=String(post.externalUrl||"");
      var n=Number(t.mentionCount||0);
      var all=t.mentions||[];
      // A coordinated burst — seven near-identical fan posts under one Weibo
      // thread is a real shape in this data — should read as one loud thing,
      // not push everything else off the screen. Nothing is dropped: the rest
      // are one click away, and the click costs nothing.
      var key=groupKey(t);
      var open=expandedGroups[key],cut=open?all.length:Math.min(all.length,GROUP_PEEK);
      var mentions=all.slice(0,cut).map(function(m){
        // No invented handle. "@someone" reads as an account you could go and
        // look at, and there is none — the platform withheld it, or the
        // commenter is deleted. An empty handle renders as a stated absence
        // below instead of a fabricated name. (No backticks in here: this
        // whole view is one TypeScript template literal, and one would end it.)
        var hits=Number(m.hits||1),id=String(m.id||"");
        var who=m.username==null?"":String(m.username).trim();
        var pic=String(m.avatarProxyUrl||m.avatarUrl||"");
        var picAlt=String(m.avatarUrl||"");
        // A face and a platform mark, then the words. Reading a feed of
        // strangers is mostly working out who is talking; a column of handles
        // makes you read every one of them to find out.
        var avatar='<span class="mention-av" style="--brand:'+pColor(plat)+'">'
          +'<span class="mention-av-init">'+esc(initialOf(who))+"</span>"
          +(pic?'<img class="mention-av-img" data-avatar src="'+esc(pic)+'"'
              +(picAlt&&picAlt!==pic?' data-fallback="'+esc(picAlt)+'"':"")
              +' alt="" loading="lazy"/>':"")
          +'<span class="mention-av-badge">'+pSvg(plat,9)+"</span></span>";
        return '<label class="mention" data-mention-id="'+esc(id)+'">'
          +'<input type="checkbox" class="mention-pick" data-mid="'+esc(id)+'"/>'
          +avatar
          +'<span class="mention-body">'
          +'<span class="mention-head">'
          +(who?'<span class="mention-who">@'+esc(who)+"</span>"
                :'<span class="mention-who mention-who-unknown">no handle</span>')
          +(m.postedAt?'<span class="mention-when">'+esc(friendlyTime(m.postedAt))+"</span>":"")
          +(hits>1?'<span class="mention-hits" title="names it '+hits+' times">×'+hits+"</span>":"")
          +"</span>"
          +'<span class="mention-text">'+highlightTerm(String(m.text||""),st.term)+"</span>"
          +(m.note?'<span class="mention-note">'+esc(String(m.note))+"</span>":"")
          +'<span class="mention-meta">'
          +'<span class="mention-stat">'+heartIcon()+esc(fmtNum(m.likes||0))+"</span>"
          +'<span class="mention-stat">'+replyIcon()+esc(fmtNum(m.replies||0))+"</span>"
          +labelChips(m)
          +"</span></span></label>";
      }).join("");
      return '<div class="mgroup" data-platform="'+esc(plat)+'">'
        +'<div class="mgroup-head">'
        +'<span class="mgroup-plat" style="--brand:'+pColor(plat)+'">'+pSvg(plat,12)+" "+esc(pTitle(plat))+"</span>"
        +(about?'<span class="mgroup-about">about '+esc(st.term)+"</span>":"")
        +(reach?'<span class="mgroup-reach">'+esc(reach)+"</span>":"")
        +"</div>"
        +'<div class="mgroup-title">'+esc(String(post.title||post.caption||"").slice(0,140))+"</div>"
        +'<div class="mgroup-actions">'
        +(link?'<a class="mgroup-link" href="'+esc(link)+'" target="_blank" rel="noopener">Open ↗</a>':"")
        // A post can name the term while none of its comments do; there is
        // nothing to select there, so do not offer to select it.
        +(n?'<button type="button" class="mgroup-all" data-group-all="'+esc(key)+'">Select all '+esc(String(n))+"</button>":"")
        +"</div>"
        +(n?'<div class="mentions">'+mentions
             +(all.length>cut||open&&all.length>GROUP_PEEK
               ?'<button type="button" class="mgroup-rest" data-expand="'+esc(key)+'">'
                 +(open?"Show fewer":"Show "+(all.length-cut)+" more from this post")+"</button>"
               :"")
             +"</div>"
           :'<div class="mgroup-none">The post names '+esc(st.term)+", but none of its comments do.</div>")
        +"</div>";
    }).join("");

    var more=st.hasMore&&!st.filter
      ? '<button class="mention-more" type="button" data-next-offset="'+esc(String(st.nextOffset))
        +'" data-term="'+esc(st.term)+'">Load more mentions</button>'
      : "";
    app.innerHTML=head+'<div class="mgroups fade-in">'+groups+"</div>"+more+pickBarHtml();
    initMentionPicks();
    // Selections survive a filter or sort: narrowing the view is not unpicking.
    applyMentionPicks();
    setTimeout(reportSize,60);
  }

  // Filter and sort redraw from memory rather than re-querying — the view has
  // no way to call the tool again for free, and the user did not ask to spend.
  document.addEventListener("click",function(e){
    var chip=e.target.closest&&e.target.closest(".mchip");
    if(chip&&monitorState){
      monitorState.filter=chip.getAttribute("data-filter")||"";
      renderMonitor();
      return;
    }
    var sort=e.target.closest&&e.target.closest(".msort-btn");
    if(sort&&monitorState){
      monitorState.sort=sort.getAttribute("data-sort")||"loud";
      renderMonitor();
      return;
    }
    var rest=e.target.closest&&e.target.closest("[data-expand]");
    if(rest&&monitorState){
      var k=rest.getAttribute("data-expand")||"";
      expandedGroups[k]=!expandedGroups[k];
      renderMonitor();
      return;
    }
    var all=e.target.closest&&e.target.closest("[data-group-all]");
    if(all&&monitorState){
      // Over the group's comments, not its rendered rows: a collapsed comment
      // is still one the reader asked for when they said "all".
      var t=groupByKey(all.getAttribute("data-group-all")||"");
      if(!t)return;
      var ids=selectableMentions(t).map(function(m){return String(m.id||"");}).filter(Boolean);
      var turnOn=ids.some(function(id){return pickedMentions.indexOf(id)<0;});
      ids.forEach(function(id){
        var i=pickedMentions.indexOf(id);
        if(turnOn&&i<0)pickedMentions.push(id);
        if(!turnOn&&i>=0)pickedMentions.splice(i,1);
      });
      applyMentionPicks();
    }
  });

  /**
   * Make what is on screen agree with the selection — after a redraw, and
   * after a select-all that reached comments no row is showing.
   */
  function applyMentionPicks(){
    document.querySelectorAll(".mention-pick").forEach(function(b){
      var on=pickedMentions.indexOf(b.getAttribute("data-mid")||"")>=0;
      b.checked=on;
      var row=b.closest(".mention");
      if(row)row.classList.toggle("picked",on);
    });
    document.querySelectorAll("[data-group-all]").forEach(function(b){
      var t=groupByKey(b.getAttribute("data-group-all")||"");
      if(!t)return;
      var ids=selectableMentions(t).map(function(m){return String(m.id||"");}).filter(Boolean);
      var allOn=ids.length&&ids.every(function(id){return pickedMentions.indexOf(id)>=0;});
      b.textContent=allOn?"Clear these":"Select all "+ids.length;
    });
    syncMentionBar();
  }

  /**
   * Show where the term actually appears in a comment.
   *
   * Walked by index rather than matched by regex: this template is embedded in
   * a Rust raw string as well as a TS literal, and a backslash means different
   * things in the two — so the file carries none at all. Escaping each slice
   * separately also means the mark cannot be injected by the comment text,
   * every word of which came from a stranger.
   */
  function highlightTerm(text,term){
    var src=String(text||""),t=String(term||"").trim();
    if(!t)return esc(src);
    var low=src.toLowerCase(),needle=t.toLowerCase(),out="",i=0;
    for(;;){
      var at=low.indexOf(needle,i);
      if(at<0){out+=esc(src.slice(i));break;}
      out+=esc(src.slice(i,at))+"<mark>"+esc(src.slice(at,at+needle.length))+"</mark>";
      i=at+needle.length;
    }
    return out;
  }

  /**
   * The time the way someone would say it. A monitoring feed is read for
   * recency above all — "today at 7:25 PM" answers the question the reader
   * actually has, which "2026-09-01T19:25:04Z" does not.
   */
  function friendlyTime(v){
    var s=String(v||"");
    if(!s)return "";
    var d=new Date(s);
    if(isNaN(d.getTime()))return s.slice(0,10);
    var now=new Date(),day=86400000;
    var clock=d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    if(d.toDateString()===now.toDateString())return "today at "+clock;
    if(d.toDateString()===new Date(now.getTime()-day).toDateString())return "yesterday at "+clock;
    var days=Math.floor((now.getTime()-d.getTime())/day);
    if(days>0&&days<7)return days+" days ago";
    var date=d.toLocaleDateString([],{month:"short",day:"numeric"});
    return d.getFullYear()===now.getFullYear()?date:date+", "+d.getFullYear();
  }

  function heartIcon(){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.9-9.3-9A5.2 5.2 0 0 1 12 6.2 5.2 5.2 0 0 1 21.3 12c-1.8 4.1-9.3 9-9.3 9z"/></svg>';
  }
  function replyIcon(){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4.2-.9L3 20.5l1.6-4.6A8.2 8.2 0 0 1 3.6 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8.4 8.4z"/></svg>';
  }

  /** First letter of a handle, for when the picture will not load. */
  function initialOf(name){
    var s=String(name||"").replace("@","").trim();
    return s?s.charAt(0).toUpperCase():"?";
  }

  /** "2026-08-18" rather than a full timestamp: the day is the useful part. */
  function shortDate(v){
    var s=String(v||"");
    if(!s)return "";
    var d=new Date(s);
    if(!isNaN(d.getTime()))return d.toISOString().slice(0,10);
    return s.slice(0,10);
  }

  /**
   * Selected comments, so an agent can be handed exactly the ones a person
   * picked — reply to these, escalate those. The ids come straight from the
   * tool result, so what the host receives addresses the same comments.
   */
  var pickedMentions=[];
  var mentionPicksWired=false;
  // Idempotent: the monitoring screen redraws on every filter and sort, and a
  // listener added per redraw would fire a selection several times over.
  function initMentionPicks(){
    if(!mentionPicksWired){
      mentionPicksWired=true;
      document.addEventListener("change",onMentionPick);
      document.addEventListener("click",function(e){
        var c=e.target.closest&&e.target.closest("#pickclear");
        if(!c||!pickedMentions.length)return;
        pickedMentions=[];
        applyMentionPicks();
      },true);
    }
    syncMentionBar();
  }
  function onMentionPick(e){
    var box=e.target;
    if(!box||!box.classList||!box.classList.contains("mention-pick"))return;
    var id=box.getAttribute("data-mid")||"";
    var i=pickedMentions.indexOf(id);
    if(box.checked&&i<0)pickedMentions.push(id);
    if(!box.checked&&i>=0)pickedMentions.splice(i,1);
    var row=box.closest(".mention");
    if(row)row.classList.toggle("picked",box.checked);
    syncMentionBar();
  }
  function syncMentionBar(){
    var bar=document.getElementById("pickbar");
    if(!bar)return;
    var n=document.getElementById("pickn");
    if(pickedMentions.length){
      bar.hidden=false;
      if(n)n.textContent=pickedMentions.length;
      var hint=document.getElementById("pickhint");
      if(hint)hint.textContent=pickedMentions.length===1?"1 comment selected":pickedMentions.length+" comments selected";
      var go=document.getElementById("pickgo");
      if(go){go.disabled=false;go.textContent="Analyse these";}
    }else{
      bar.hidden=true;
    }
    setTimeout(reportSize,60);
  }

  // Selected comments go to the host as a tool call, so whatever the user
  // picked is what the model receives — the ids are the tool's own.
  document.addEventListener("click",function(e){
    var go=e.target.closest&&e.target.closest("#pickgo");
    if(!go||!pickedMentions.length)return;
    if(!document.querySelector(".mention-pick"))return; // the compare bar owns it
    e.stopPropagation();
    go.disabled=true;go.textContent="Sending…";
    // From the result, not the rendered rows: a selected comment inside a
    // collapsed group has no row to read the text off.
    var byId={};
    (monitorState?monitorState.threads:[]).forEach(function(t){
      (t.mentions||[]).forEach(function(m){byId[String(m.id||"")]=String(m.text||"");});
    });
    var texts=pickedMentions.map(function(id){
      if(byId[id]!==undefined)return byId[id];
      var el=document.querySelector('.mention[data-mention-id="'+id+'"] .mention-text');
      return el?el.textContent:"";
    }).filter(Boolean);
    invokeTool("analyze_comments",{comments:texts,ids:pickedMentions},function(){
      go.textContent="Sent ✓";
      setTimeout(function(){go.disabled=false;go.textContent="Analyse these";},1800);
    },function(){
      go.textContent="Try in chat";
      setTimeout(function(){go.disabled=false;go.textContent="Analyse these";},1800);
    });
  },true);

  // Load more asks the host to re-run the tool with the next offset, which is
  // the only way a sandboxed view can page: it has no data of its own.
  document.addEventListener("click",function(e){
    var b=e.target.closest&&e.target.closest(".mention-more");
    if(!b||b.disabled)return;
    b.disabled=true;
    var was=b.textContent;
    b.textContent="Loading…";
    invokeTool("search_mentions",{
      term:b.getAttribute("data-term")||"",
      offset:Number(b.getAttribute("data-next-offset")||0),
    },function(){ b.textContent="Loaded ✓"; },function(){
      b.disabled=false;b.textContent=was;
    });
  });

  function pSvg(p,size){
    var s=size||14,paths={
      reddit:"M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286A.72.72 0 001.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0zm4.388 3.199a1.999 1.999 0 11-1.947 2.46v.002a2.37 2.37 0 00-2.032 2.341v.007c1.334.065 2.559.371 3.591.923a1.998 1.998 0 112.086 3.372c.005.061.007.121.007.183 0 2.891-3.611 5.235-8.067 5.235-4.455 0-8.066-2.344-8.066-5.235 0-.062.002-.122.007-.183a1.998 1.998 0 112.086-3.372c1.032-.552 2.257-.858 3.591-.923v-.007a3.77 3.77 0 013.412-3.751 1.999 1.999 0 011.332-1.052zM9.25 12a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zm5.5 0a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 00.029-.463.33.33 0 00-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 00-.232-.095z",
      weibo:"M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.737 5.439l-.002.004zM9.05 17.219c-.384.616-1.208.884-1.829.602-.612-.279-.793-.991-.406-1.593.379-.595 1.176-.861 1.793-.601.622.263.82.972.442 1.592zm1.027-1.32c-.141.237-.449.353-.689.253-.236-.09-.312-.359-.177-.586.138-.227.436-.346.672-.24.239.09.315.36.18.601l.014-.028zm.176-2.719c-1.893-.493-4.033.45-4.857 2.118-.836 1.704-.026 3.591 1.886 4.21 1.983.64 4.318-.341 5.132-2.179.8-1.793-.201-3.642-2.161-4.149zm7.563-1.224c-.346-.105-.57-.18-.405-.615.375-.977.42-1.804 0-2.4-.781-1.112-2.915-1.053-5.364-.03 0 0-.766.331-.571-.271.376-1.217.315-2.224-.27-2.815-1.336-1.335-4.891.045-7.94 3.089C1.009 11.104 0 13.499 0 15.564c0 3.951 5.067 6.36 10.028 6.36 6.504 0 10.834-3.782 10.834-6.78 0-1.809-1.529-2.835-2.897-3.264l-.149-.03v.106zm2.482-6.135c-1.502-1.666-3.716-2.305-5.767-1.869a.914.914 0 00-.705 1.086.916.916 0 001.086.705c1.454-.309 3.03.15 4.096 1.327 1.061 1.18 1.363 2.79.9 4.2a.918.918 0 00.585 1.155.913.913 0 001.155-.585c.66-1.984.238-4.25-1.259-5.909l-.091-.11zm-2.204 1.995c-.732-.81-1.812-1.125-2.81-.915a.789.789 0 10.33 1.545c.489-.105 1.02.045 1.38.45.359.401.464.945.315 1.425a.795.795 0 00.51.996.79.79 0 00.996-.51c.301-.976.09-2.086-.646-2.895l-.075-.096z",
      tiktok:"M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
      instagram:"M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
      youtube:"M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
      x:"M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
      twitter:"M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
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
        +(thumb?' poster="'+esc(thumb)+'"':"")
        +(thumbFallback?' data-poster-fallback="'+esc(thumbFallback)+'"':"")+"></video>";
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

    // Brand monitoring.
    //
    // This screen is a triage surface, not a feed. The job is to see what needs
    // answering, how loud it is, and where — so three things drive the layout.
    //
    // The comment leads and its metadata sits under it, because the comment is
    // what you are reading; who said it matters only once the words have caught
    // your eye. The post carries its reach, because the same sentence under a
    // 25K-upvote thread and under one nobody saw are not the same problem, and
    // nothing else on screen tells you which you are looking at. And the counts
    // are filters rather than decoration: a nine-platform sweep is unreadable
    // as one list, and the chips were already the obvious place to narrow it.
    //
    // Deliberately not here: a sentiment badge. Nothing in this payload says
    // whether a comment is angry, and colouring it green or red from a keyword
    // guess would be confidently wrong about the one thing you are scanning
    // for. The signals shown are the ones that are real — reach, repetition,
    // recency, likes — and the reading is left to the model.
    if(d.term!==undefined&&Array.isArray(d.threads)){
      monitorState={
        term:String(d.term||""),
        threads:d.threads,
        counts:(d.byPlatform&&typeof d.byPlatform==="object")?d.byPlatform:{},
        since:d.since?String(d.since):"",
        // The badge used to print "since <date>" whenever a window was asked
        // for, which asserted a filter had happened. Most networks do not date
        // their comments, so it often had not. These two carry the truth.
        sinceApplied:!!d.sinceApplied,
        undatedMentions:Number(d.undatedMentions||0),
        total:Number(d.totalMentions||0),
        unavailable:Array.isArray(d.unavailable)?d.unavailable:[],
        hasMore:!!d.hasMore,
        nextOffset:d.nextOffset,
        // Present only on a show_comment_review: the model's own labels, and
        // the counts they roll up to.
        byCategory:(d.byCategory&&typeof d.byCategory==="object")?d.byCategory:null,
        summary:d.summary?String(d.summary):"",
        filter:"",
        sort:"loud",
      };
      // A new term addresses different comments, so a selection made against
      // the old one is stale rather than carried over.
      if(monitorTerm!==monitorState.term){monitorTerm=monitorState.term;pickedMentions=[];}
      renderMonitor();
      return;
    }

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
      var pack=function(name,price,credits,featured){
        return '<div class="'+(featured?"pack-featured":"pack")+'">'
          +'<div class="text-sm font-semibold">'+name+'</div>'
          +'<div class="mt-2 text-2xl font-extrabold">'+price+'</div>'
          +'<div class="mt-2 text-xs text-muted">'+credits+"</div></div>";
      };
      app.innerHTML='<div class="card card-wide fade-in"><div class="card-body">'
        +'<div class="mb-3 text-base font-bold">🛒 Credit Packs</div>'
        +'<div class="grid grid-cols-3 gap-2">'
        +pack("Starter","$12.50","500 credits",false)
        +pack("Pro ⭐","$40","2,000 credits",true)
        +pack("Scale","$85","5,000 credits",false)
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
