// v3.79 独立复刻页（可编辑离线功能复刻 + 页内 AI 与生图）：与复刻
// 包同一次点击一起下载的第二个文件。
//
// v3.78 把「不依赖服务端与凭证」的确定性功能做进了页内，但 AI 生成
// 与 Geeknow 生图这两类核心功能仍不在页内。本版把这两类也做进页
// 内：页顶新增「AI 与生图网关」面板——用户在页内填入自己的
// Geeknow API Key（与工作台本体同一个服务商、同一个主机
// api.geeknow.top），页内即可直连：AI 填写大纲、AI 生成剧本（先规
// 划 → 按目标时长校准字数预算 → 逐段生成、断点续跑）、Geeknow 生
// 图（异步提交 + 只查同一任务号轮询）。Key 的口径与包一致：永不写
// 进本文件、永不进导出的复刻包；默认只在本次打开的内存里，勾选
// 「记住在本机浏览器」才存进打开它的浏览器本机存储、可一键清除。
// 生图禁令在页内同口径执行：只有用户亲手点「生成图片」才提交新任
// 务，打开页面 / 刷新只自动续查已提交任务号（只读、不计费），失败
// 后重新提交必须二次确认并明说「这是新任务（重新计费）」。
// 浏览器直连服务商是否放行（跨域）取决于服务商与打开方式，页内请
// 求失败会把原始错误写清；真机未验证前不声称页内 AI / 生图已跑通。
//
// v3.77 的复刻页只是只读浏览：布局与内容在点击当场成为可打开的复刻
// 品，但编辑、保存、重算分镜、成套导出这些功能层不在页内。v3.78 把
// 「不依赖服务端与凭证」的确定性功能全部做进页内，让复刻页本身就
// 是一个能干活的离线工作台：
// · 可编辑：项目基础设置（语速/目标时长/场景/风格/所选模式）、人
// 物名与备注、大纲、剧本逐节拍（画面/音效/说话人/情绪/台词/动
// 作秒数，可增删节拍）、储存库卡（姓名/十部位中文/身份/备注/
// 性格/分类）、模式基因卡八维与权重——全部可在页内改；
// · 会保存：改动自动存进打开它的浏览器本机存储（按导出时间分
// 键），关掉重开还在；也可一键恢复为包内原始数据；本机存储不
// 可用（应用内预览的沙箱框、隐私模式）时改动只在内存里，页内
// 会提示用「导出更新后的复刻包」落成文件；
// · 会重算：时长仍按全站同一公式现算（台词字数去标点 ÷ 语速 +
// 动作秒），改台词即重算；分镜可在页内按两种方式重新生成——
// 按时长打包 / 按剧本段切镜，超 30 秒的镜头只列警告清单、不
// 自动拆分（与本体软顶口径一致）；
// · 会导出：剧本格式01、SRT 字幕、逐镜头提示词包都按当前（可
// 能已改过的）数据在页内生成下载；还能把改后的全部数据导回
// 成一个包格式兼容的 JSON（format / packageVersion 与复刻包
// 相同、图片字节原样带回），拿回完整工作台点「导入备份」即
// 可恢复（新增不覆盖）；
// · 布局与内容与本体同口径：双台切换、窗口顺序、单套深空未来
// 深色主题（v3.99 起，旧两款主题与切换器已删）、860px 深色审查
// 稿、图片真实字节内嵌。
// 边界照实写在页面页脚：本页不含任何凭证（文件本身永远无 Key）；
// 页内 AI / 生图用的是用户自己在页内填入的 Key，视频投喂训练分析
// （抽帧 + 多模态服务端管线）仍不在页内；与服务端完全同口径的完
// 整工作台仍按 JSON 包第一项执行单在新账号重建 + 导入。储存库卡
// 的英文字段页内不改、原样保留（导出包时带回）。

export type ReplicaViewCounts = {
projects: number;
presets: number;
presetImages: number;
characterImages: number;
totalUniqueImages: number;
snapshots: number;
styleCards: number;
trainingRecords: number;
modesWithCards: number;
imageGenRecords: number;
stagedImages?: number;
};

export type ReplicaViewData = {
baseline: string;
exportedAt: string;
counts: ReplicaViewCounts;
acceptanceChecklist: string[];
incomplete: { missingImages: { label: string; reason: string}[]} | null;
// 以下各段直接用打包时组装好的包内数据形状（图片引用已换成包内
// imageId），生成器只读不改。
categories?: unknown[];
presets: unknown[];
projects: unknown[];
modes: unknown[];
imageGenRecords?: unknown[];
images: { id: string; mimeType: string; dataBase64: string}[];
};

function escapeJsonForHtml(json: string): string {
// 内嵌 JSON 里若出现 </script> 会提前关掉脚本标签；统一转义。
return json.replace(/<\//g, "<\\/");
}

const REPLICA_CSS = `
:root{--ivory:#0E1116;--taupe:#46536A;--terra:#4D7CFE;--olive:#3CB179;--walnut:#4D7CFE;--bg:#0E1116;--surface:#161B22;--surface-alt:#1C2330;--text:#E8EDF4;--dim:#9AA7B8;--border:#2A3342;--accent:#4D7CFE;--accent-soft:#1A2745;--ok:#3CB179;--ok-soft:#12291E;--on-primary:#FFFFFF;--radius:10px;--shadow-card:0 1px 2px rgba(0,0,0,.35),0 8px 24px rgba(0,0,0,.22);--font-serif:ui-sans-serif,system-ui,"PingFang SC","Microsoft YaHei",sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,"PingFang SC","Microsoft YaHei",sans-serif;font-size:15px;line-height:1.6}
h1,h2,h3{font-family:var(--font-serif);margin:0}
.topbar{position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--border);padding:10px 16px}
.wrap{max-width:1440px;margin:0 auto;padding:16px}
.seg{display:inline-flex;flex-wrap:wrap;gap:6px}
.seg button{min-height:38px;padding:6px 14px;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--dim);font-size:14px;font-weight:500;cursor:pointer}
.seg button[aria-pressed="true"]{background:var(--walnut);border-color:var(--walnut);color:var(--on-primary)}
button.act{min-height:34px;padding:5px 12px;border-radius:999px;border:1px solid var(--taupe);background:var(--surface);color:var(--text);font-size:13px;font-weight:600;cursor:pointer;margin:2px 4px 2px 0}
button.act[aria-pressed="true"]{background:var(--walnut);border-color:var(--walnut);color:var(--on-primary)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-card);padding:14px 16px;margin-top:16px}
.grid{display:grid;gap:16px}
@media(min-width:768px){.grid2{grid-template-columns:1fr 1fr}.grid3{grid-template-columns:repeat(3,1fr)}}
img.asset{width:100%;height:auto;border-radius:8px;border:1px solid var(--border);display:block}
.dim{color:var(--dim)}.small{font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{border:1px solid var(--border);padding:6px 8px;text-align:left;vertical-align:top}
th{background:var(--surface-alt);white-space:nowrap}
.scrollx{overflow-x:auto}
.paper{max-width:860px;margin:16px auto 0;background:#161B22;color:#E8EDF4;border:1px solid #2A3342;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.35),0 12px 32px rgba(0,0,0,.28);padding:38px 44px}
@media(max-width:767px){.paper{padding:26px 20px 30px}}
.paper.grp{margin-top:36px}.paper.beat{margin-top:22px}
.paper.line{margin-top:6px;padding-left:17px;position:relative;font-size:14px;line-height:23px}
.paper.line:before{content:"•";position:absolute;left:3px;color:var(--taupe);font-weight:700}
.tone{background:#1A2745;color:#8FB0FF;border:1px solid #4D7CFE;border-radius:6px;padding:0 5px;font-size:12px}
.lineText{background:#12291E;color:#5FD598;border-radius:6px;padding:1px 5px}
.warn{border:1px solid var(--terra);background:var(--accent-soft);border-radius:10px;padding:10px 12px;margin-top:16px}
select.field{width:100%;max-width:520px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);padding:9px 12px;font-size:15px}
.kv{display:grid;grid-template-columns:110px 1fr;gap:4px 10px;font-size:14px}
.kv dt{color:var(--dim)}.kv dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
pre.raw{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:var(--surface-alt);border-radius:8px;padding:10px}
.inp{width:100%;border:1px solid var(--border);border-radius:8px;background:var(--surface-alt);color:var(--text);padding:5px 8px;font-size:14px;line-height:21px}
label.fl{display:block;font-size:12px;color:var(--dim);margin-top:6px}
.beatEdit{border:1px dashed var(--taupe);border-radius:8px;padding:8px 10px;margin-top:10px}
.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px}
.aiPanel{border:1px dashed var(--taupe);border-radius:8px;padding:10px 12px;margin-top:14px}
.gwPanel{margin-top:12px}
.inpSel{width:auto;max-width:100%;border:1px solid var(--border);border-radius:8px;background:var(--surface-alt);color:var(--text);padding:5px 8px;font-size:14px;line-height:21px}
img.thumb{max-width:220px;width:100%;height:auto;border-radius:8px;border:1px solid var(--border);display:block;margin-top:6px}
.recBlock{border-top:1px solid var(--border);padding-top:10px;margin-top:10px}
.errText{color:var(--terra);white-space:pre-wrap;overflow-wrap:anywhere}
`;

// 页面内脚本：只用 textContent / value 建节点与填值（数据再怪也不
// 会变成标签）；图片地址由内嵌字节当场拼 data URL。全部字符串拼
// 接，不用模板字面量，方便整体嵌进生成器。
const REPLICA_JS = `
var RAW = JSON.parse(document.getElementById("replica-data").textContent);
var LSKEY = "replica78." + RAW.exportedAt;
function lsGet(){ try { return window.localStorage.getItem(LSKEY);} catch(e){ return null;}}
function lsSet(v){ try { window.localStorage.setItem(LSKEY, v); return true;} catch(e){ return false;}}
function lsDel(){ try { window.localStorage.removeItem(LSKEY);} catch(e){}}
function deep(x){ return JSON.parse(JSON.stringify(x));}
var DATA = { baseline: RAW.baseline, exportedAt: RAW.exportedAt, counts: RAW.counts, acceptanceChecklist: RAW.acceptanceChecklist || [], categories: RAW.categories || [], presets: deep(RAW.presets || []), projects: deep(RAW.projects || []), modes: deep(RAW.modes || []), imageGenRecords: deep(RAW.imageGenRecords || [])};
var EXTRA = [];
var AISTATE = {};
var RESTORED = false;
(function(){ var s = lsGet(); if(s){ try { var o = JSON.parse(s); if(o && o.projects && o.presets && o.modes){ DATA.projects = o.projects; DATA.presets = o.presets; DATA.modes = o.modes; if(o.imageGenRecords) DATA.imageGenRecords = o.imageGenRecords; if(o.extraImages) EXTRA = o.extraImages; if(o.aiState) AISTATE = o.aiState; RESTORED = true;}} catch(e){}}})();
var IMG = {};
(RAW.images || []).forEach(function(im){ IMG[im.id] = "data:" + im.mimeType + ";base64," + im.dataBase64;});
EXTRA.forEach(function(im){ IMG[im.id] = "data:" + im.mimeType + ";base64," + im.dataBase64;});
var EDIT = false;
var CURPROJ = 0;
var CURBENCH = "script";
var saveTimer = null;
function saveStatus(msg){ var n = document.getElementById("save-status"); if(n) n.textContent = msg;}
function persist(){ var ok = lsSet(JSON.stringify({ projects: DATA.projects, presets: DATA.presets, modes: DATA.modes, imageGenRecords: DATA.imageGenRecords, extraImages: EXTRA, aiState: AISTATE })); saveStatus(ok? ("改动已保存到本机浏览器 " + new Date().toLocaleTimeString()): "本机存储不可用（应用内预览或隐私模式）：改动只在本次打开内有效，请用顶部的「导出更新后的复刻包」把改动保存成文件");}
function markDirty(){ saveStatus("有改动，正在保存…"); if(saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400);}
function el(tag, cls, text){ var n = document.createElement(tag); if(cls) n.className = cls; if(text!= null) n.textContent = text; return n;}
function btn(label, fn){ var b = el("button","act",label); b.type = "button"; b.addEventListener("click", fn); return b;}
function inp(value, onchg, isNum){ var i = el("input","inp"); i.type = isNum? "number": "text"; i.value = value == null? "": String(value); i.addEventListener("change", function(){ onchg(isNum? Number(i.value): i.value);}); return i;}
function tarea(value, onchg, rows){ var t = el("textarea","inp"); t.rows = rows || 3; t.value = value || ""; t.addEventListener("change", function(){ onchg(t.value);}); return t;}
function fld(label, control){ var w = el("label","fl", label); w.appendChild(control); return w;}
function imgEl(id, alt){ if(!id ||!IMG[id]) return el("p","dim small","（这张图不在包内或打包时缺失）"); var i = el("img","asset"); i.src = IMG[id]; i.alt = alt || ""; i.loading = "lazy"; return i;}
function countChars(line){ var n = 0; for (var i=0;i<line.length;i++){ var c = line.charCodeAt(i); if((c>=0x4e00&&c<=0x9fff)||(c>=65&&c<=90)||(c>=97&&c<=122)||(c>=48&&c<=57)) n++;} return n;}
function beatSec(b, rate){ var s = (Number(b.actionSeconds)||0); if(b.line) s += countChars(b.line) / (rate||5); return s;}
function groupSec(g, rate){ var s = 0; (g.beats||[]).forEach(function(b){ s += beatSec(b, rate);}); return s;}
function fmtT(sec){ var m = Math.floor(sec/60), s = sec - m*60; return (m>0? m + "分": "") + s.toFixed(1) + "秒";}
function tc(sec){ var m = Math.floor(sec/60), s = sec - m*60; return (m<10?"0":"") + m + ":" + (s<10?"0":"") + s.toFixed(1);}
function parseScript(p){ if(!p.scriptJson) return null; try { return JSON.parse(p.scriptJson);} catch(e){ return null;}}
function setScript(p, sc){ p.scriptJson = JSON.stringify(sc);}
function download(name, text, mime){ try { var blob = new Blob([text], {type: mime || "text/plain;charset=utf-8"}); var url = URL.createObjectURL(blob); var a = el("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(url); a.remove();}, 500);} catch(e){ saveStatus("下载被浏览器拦截（在应用内预览框里常见）：请双击打开下载到本机的复刻页文件再导出");}}
function renderGroups(container, groups, rate, isLens){
groups.forEach(function(g, gi){
var sec = el("section","grp");
sec.appendChild(el("h3", null, (isLens? "镜头 ": "第 ") + (gi+1) + (isLens? "": " 组") + " · " + (g.title||"未命名") + (g.sceneName? "（场景：" + g.sceneName + "）": "")));
sec.appendChild(el("p","dim small","时长约 " + fmtT(groupSec(g, rate))));
(g.beats||[]).forEach(function(b){
var d = el("div","beat");
if(b.visual) { var v = el("p","line"); v.appendChild(el("strong",null,"画面 ")); v.appendChild(document.createTextNode(b.visual)); d.appendChild(v);}
if(b.sfx) { var s2 = el("p","line"); s2.appendChild(el("strong",null,"音效 ")); s2.appendChild(document.createTextNode(b.sfx)); d.appendChild(s2);}
if(b.line) { var l = el("p","line"); if(b.speaker) l.appendChild(el("strong",null,b.speaker + " ")); if(b.emotion){ var t = el("span","tone",b.emotion); l.appendChild(t); l.appendChild(document.createTextNode(" "));} var lt = el("span","lineText",b.line); l.appendChild(lt); d.appendChild(l);}
if(!b.visual &&!b.sfx &&!b.line) d.appendChild(el("p","line dim","（空节拍）"));
sec.appendChild(d);
});
container.appendChild(sec);
});
}
function renderEditableScript(paper, p, script, rerender){
var rate = p.speechRate || 5;
paper.appendChild(el("h2",null,script.title || p.name || "未命名"));
paper.appendChild(fld("故事梗概", tarea(script.synopsis || "", function(v){ script.synopsis = v; setScript(p, script); markDirty();}, 2)));
(script.groups || []).forEach(function(g, gi){
var sec = el("section","grp");
sec.appendChild(fld("第 " + (gi+1) + " 组标题", inp(g.title || "", function(v){ g.title = v; setScript(p, script); markDirty();})));
sec.appendChild(el("p","dim small","本组时长约 " + fmtT(groupSec(g, rate)) + "（改台词 / 动作秒后失焦即重算）"));
(g.beats || []).forEach(function(b, bi){
var d = el("div","beatEdit");
d.appendChild(el("p","small","节拍 " + (bi+1) + " · 约 " + fmtT(beatSec(b, rate))));
d.appendChild(fld("画面", tarea(b.visual || "", function(v){ b.visual = v; setScript(p, script); markDirty();}, 2)));
d.appendChild(fld("音效", inp(b.sfx || "", function(v){ b.sfx = v; setScript(p, script); markDirty();})));
d.appendChild(fld("说话人", inp(b.speaker || "", function(v){ b.speaker = v; setScript(p, script); markDirty();})));
d.appendChild(fld("情绪", inp(b.emotion || "", function(v){ b.emotion = v; setScript(p, script); markDirty();})));
d.appendChild(fld("台词", tarea(b.line || "", function(v){ b.line = v; setScript(p, script); markDirty(); rerender();}, 2)));
d.appendChild(fld("动作秒数", inp(b.actionSeconds || 0, function(v){ b.actionSeconds = v || 0; setScript(p, script); markDirty(); rerender();}, true)));
d.appendChild(btn("删除这个节拍", function(){ g.beats.splice(bi,1); setScript(p, script); markDirty(); rerender();}));
sec.appendChild(d);
});
sec.appendChild(btn("＋ 在本组加一个节拍", function(){ g.beats = g.beats || []; g.beats.push({ visual:"", sfx:"", speaker:"", emotion:"", line:"", actionSeconds:0}); setScript(p, script); markDirty(); rerender();}));
paper.appendChild(sec);
});
}
function storyboardOf(p){ var sc = parseScript(p); if(!sc) return null; if(sc.stage === "storyboard" && sc.storyboardGroups && sc.storyboardGroups.length) return sc.storyboardGroups; return sc.groups || [];}
function packByDuration(sc, packSec, rate){ var lenses = []; var cur = null; var curSec = 0; (sc.groups||[]).forEach(function(g){ (g.beats||[]).forEach(function(b){ var s = beatSec(b, rate); if(!cur || (curSec > 0 && curSec + s > packSec)){ cur = { title: g.title, sceneName: g.sceneName, beats: []}; lenses.push(cur); curSec = 0;} cur.beats.push(b); curSec += s;});}); return lenses;}
function packBySegment(sc){ return (sc.groups||[]).map(function(g){ return { title: g.title, sceneName: g.sceneName, beats: g.beats || []};});}
function buildSrt(p){ var rate = p.speechRate||5; var groups = storyboardOf(p) || []; var out = []; var t = 0; var idx = 1; groups.forEach(function(g){ (g.beats||[]).forEach(function(b){ var s = beatSec(b, rate); if(b.line){ out.push(String(idx)); idx++; out.push(tc(t) + " --> " + tc(t+s)); out.push((b.speaker? b.speaker + "：": "") + b.line); out.push("");} t += s;});}); return out.join("\\n");}
function buildFormat01(p){ var rate = p.speechRate||5; var sc = parseScript(p); var L = []; L.push("⚠️ 待确认事项：以完整工作台审查页为准（本文件由独立复刻页按包内剧本数据导出）"); L.push(""); L.push("一、基本信息"); L.push("片名：" + ((sc && sc.title) || p.name || "未命名")); L.push("语速：" + rate + " 字/秒；目标时长：" + (p.targetSeconds? p.targetSeconds + " 秒": "未设") + "；风格：" + (p.stylePreset||"") + (p.styleCustom? "（自定义：" + p.styleCustom + "）": "")); L.push(""); L.push("二、故事梗概"); L.push((sc && sc.synopsis) || p.outline || "（无）"); L.push(""); L.push("三、人物表"); (p.characters||[]).forEach(function(c){ L.push("- " + (c.name||"未命名") + (c.note? "：" + c.note: ""));}); L.push(""); L.push("四、正文（逐节拍）"); if(sc){ (sc.groups||[]).forEach(function(g, gi){ L.push(""); L.push("第 " + (gi+1) + " 组｜" + (g.title||"未命名") + "（约 " + fmtT(groupSec(g, rate)) + "）"); (g.beats||[]).forEach(function(b){ if(b.visual) L.push("画面：" + b.visual); if(b.sfx) L.push("音效：" + b.sfx); if(b.line) L.push((b.speaker||"") + (b.emotion? "（" + b.emotion + "）": "") + "：\\"" + b.line + "\\"");});});} else L.push("（还没有生成剧本）"); L.push(""); L.push("五、台词本（按说话人分组）"); if(sc){ var bySp = {}; var order = []; (sc.groups||[]).forEach(function(g){ (g.beats||[]).forEach(function(b){ if(b.line){ var sp = b.speaker || "（无说话人）"; if(!bySp[sp]){ bySp[sp] = []; order.push(sp);} bySp[sp].push(b.line);}});}); order.forEach(function(sp){ L.push(""); L.push(""); bySp[sp].forEach(function(line){ L.push("- " + line);});});} L.push(""); L.push("六、版本说明"); L.push("由独立复刻页（基线 " + DATA.baseline + "）导出；原包导出时间 " + DATA.exportedAt + "。"); return L.join("\\n");}
function buildPromptPack(p){ var rate = p.speechRate||5; var groups = storyboardOf(p) || []; var L = []; L.push("逐镜头生图/生视频提示词包（16:9）——项目：" + (p.name||"未命名")); groups.forEach(function(g, gi){ var vis = []; var lines = []; (g.beats||[]).forEach(function(b){ if(b.visual) vis.push(b.visual); if(b.line) lines.push((b.speaker||"") + "：" + b.line);}); L.push(""); L.push("镜头 " + (gi+1) + "（约 " + fmtT(groupSec(g, rate)) + "）"); L.push("场景：" + (g.sceneName || "按剧本场景")); L.push("画面内容：" + (vis.join("；") || "按剧本画面")); if(lines.length) L.push("台词：" + lines.join(" / ")); L.push("人物：" + (p.characters||[]).map(function(c){ return c.name;}).join("、")); L.push("衔接：首帧承接上一镜头末帧的人物位置与情绪，末帧停在动作完成点供下一镜头接入。禁用项：不要文字水印、不要多余人物、不要改变人物造型。");}); return L.join("\\n");}
function recomputeCounts(){ var c = { projects: DATA.projects.length, presets: DATA.presets.length, presetImages: 0, characterImages: 0, totalUniqueImages: (RAW.images||[]).length + EXTRA.length, snapshots: 0, styleCards: 0, trainingRecords: 0, modesWithCards: 0, imageGenRecords: DATA.imageGenRecords.length, stagedImages: 0}; DATA.presets.forEach(function(p){ c.presetImages += (p.images||[]).length;}); DATA.projects.forEach(function(p){ c.snapshots += (p.versions||[]).length; (p.characters||[]).forEach(function(ch){ if(ch.imageId) c.characterImages += 1;});}); DATA.modes.forEach(function(m){ c.styleCards += (m.cards||[]).length; c.trainingRecords += (m.records||[]).length; if((m.cards||[]).length) c.modesWithCards += 1;}); DATA.imageGenRecords.forEach(function(r){ if(r.stagedImageId) c.stagedImages += 1;}); return c;}
function exportPackage(){ var pkg = {}; pkg["RESTORE_一键复刻执行单"] = "这份包由独立复刻页（v3.79：可编辑离线功能复刻 + 页内 AI 与生图）导出，数据可能已在复刻页里改过（包括页内 AI 生成的剧本与页内生图的新图，新图字节与生图记录都在包里）。要恢复：在完整工作台里点「导入备份」上传本文件（新增不覆盖）；要在新账号复刻完整工作台：先按同批下载的原复刻包内 replicationSpec 重建工作台、再导入本文件、最后逐项核对。Geeknow 凭证永不进任何包——复刻页里填过的 Key 只存在打开它的浏览器里，不在本文件内。"; pkg.format = "script-workbench-backup"; pkg.packageVersion = 2; pkg.baseline = DATA.baseline + "（复刻页导出）"; pkg.exportedAt = new Date().toISOString(); pkg.counts = recomputeCounts(); pkg.categories = DATA.categories; pkg.presets = DATA.presets; pkg.projects = DATA.projects; pkg.modes = DATA.modes; pkg.imageGenRecords = DATA.imageGenRecords; pkg.images = (RAW.images || []).concat(EXTRA).map(function(im){ var bytes = b64ToBytes(im.dataBase64); return { id: im.id, mimeType: im.mimeType, sizeBytes: bytes.length, sha256: sha256Hex(bytes), dataBase64: im.dataBase64 }; }); download("剧本工作台1比1复刻包_复刻页导出.json", JSON.stringify(pkg), "application/json;charset=utf-8"); saveStatus("已导出更新后的复刻包 JSON：拿回完整工作台点「导入备份」即可恢复改动（新增不覆盖）");}
function scriptBench(root){
var selWrap = el("div","card");
selWrap.appendChild(el("h2",null,"选择项目"));
var sel = el("select","field"); sel.setAttribute("aria-label","选择项目");
DATA.projects.forEach(function(p, i){ var o = el("option",null,p.name || "未命名项目"); o.value = String(i); sel.appendChild(o);});
if(CURPROJ >= DATA.projects.length) CURPROJ = 0;
sel.value = String(CURPROJ);
selWrap.appendChild(sel);
var body = el("div");
selWrap.appendChild(body);
root.appendChild(selWrap);
function show(){
CURPROJ = Number(sel.value) || 0;
body.textContent = "";
var p = DATA.projects[CURPROJ];
if(!p){ body.appendChild(el("p","dim","包里没有项目。")); return;}
var rate = p.speechRate || 5;
var modeCard = el("div","card");
modeCard.appendChild(el("h2",null,"一、模式"));
if(EDIT){
var selm = el("select","field"); selm.setAttribute("aria-label","选择模式");
var o0 = el("option",null,"未选模式"); o0.value = "0"; selm.appendChild(o0);
[1,2,3,4,5].forEach(function(n){ var o = el("option",null,"模式 " + n); o.value = String(n); selm.appendChild(o);});
selm.value = String(p.selectedModeId || 0);
selm.addEventListener("change", function(){ p.selectedModeId = Number(selm.value); markDirty(); show();});
modeCard.appendChild(selm);
} else {
modeCard.appendChild(el("p",null, p.selectedModeId? ("本项目选中模式 " + p.selectedModeId + "（基因卡内容见储存库台的模式区）"): "本项目未选模式"));
}
body.appendChild(modeCard);
var base = el("div","card");
base.appendChild(el("h2",null,"二、基础设置"));
if(EDIT){
base.appendChild(fld("语速（字/秒）", inp(p.speechRate || 5, function(v){ p.speechRate = v || 5; markDirty(); show();}, true)));
base.appendChild(fld("目标时长（秒，0 = 未设）", inp(p.targetSeconds || 0, function(v){ p.targetSeconds = v || 0; markDirty();}, true)));
base.appendChild(fld("风格预设", inp(p.stylePreset || "", function(v){ p.stylePreset = v; markDirty();})));
base.appendChild(fld("自定义风格（一句话）", inp(p.styleCustom || "", function(v){ p.styleCustom = v; markDirty();})));
} else {
var kv = el("dl","kv");
[["语速", (p.speechRate||5) + " 字/秒"], ["目标时长", p.targetSeconds? p.targetSeconds + " 秒": "未设"], ["风格", (p.stylePreset||"") + (p.styleCustom? "（自定义：" + p.styleCustom + "）": "")]].forEach(function(r){ kv.appendChild(el("dt",null,r[0])); kv.appendChild(el("dd",null,r[1]));});
base.appendChild(kv);
}
body.appendChild(base);
var chars = el("div","card");
chars.appendChild(el("h2",null,"三、人物与大纲"));
var cg = el("div","grid grid3");
(p.characters||[]).forEach(function(c){
var cc = el("div","card");
if(EDIT){
cc.appendChild(fld("人物名", inp(c.name || "", function(v){ c.name = v; markDirty();})));
} else {
cc.appendChild(el("h3",null,c.name || "未命名人物"));
}
if(c.imageId) cc.appendChild(imgEl(c.imageId, c.name||""));
if(EDIT){
cc.appendChild(fld("备注", tarea(c.note || "", function(v){ c.note = v; markDirty();}, 3)));
} else if(c.note) cc.appendChild(el("p","small",c.note));
if(c.sourcePresetName) cc.appendChild(el("p","dim small","来自储存库：" + c.sourcePresetName));
cg.appendChild(cc);
});
chars.appendChild(cg);
chars.appendChild(el("h3",null,"故事大纲"));
if(EDIT){
chars.appendChild(tarea(p.outline || "", function(v){ p.outline = v; markDirty();}, 6));
} else {
chars.appendChild(el("p",null,p.outline || "（无大纲）"));
}
if(p.prevOutline){
var pb = el("div","toolbar");
pb.appendChild(el("span","small dim","有一份「AI 填写覆盖前」的大纲备份"));
pb.appendChild(btn("恢复覆盖前大纲", function(){ p.outline = p.prevOutline; p.prevOutline = ""; markDirty(); show();}));
chars.appendChild(pb);
}
renderAiOutline(chars, p, show);
if((p.versions||[]).length){ chars.appendChild(el("h3",null,"版本快照")); var ul = el("ul"); p.versions.forEach(function(v){ ul.appendChild(el("li",null,"V" + v.versionNo + " · " + (v.stage==="storyboard"?"分镜阶段":"审查阶段") + " · " + (v.autoNote||v.userNote||"")));}); chars.appendChild(ul);}
body.appendChild(chars);
renderAiScript(body, p, show);
var script = parseScript(p);
var review = el("div","card");
review.appendChild(el("h2",null,"四、剧本审查（白纸修稿台）"));
var paper = el("div","paper");
if(script){
var charRows = script.characterRows || script.characters;
if(charRows && charRows.length){ var ct = el("table"); var trh = el("tr"); ["人物","身份","造型","音色","语气"].forEach(function(h){ trh.appendChild(el("th",null,h));}); ct.appendChild(trh); charRows.forEach(function(cr){ var tr = el("tr"); [cr.name,cr.identity,cr.look,cr.voice,cr.tone].forEach(function(v){ tr.appendChild(el("td",null,v||""));}); ct.appendChild(tr);}); var tw = el("div","scrollx"); tw.appendChild(ct); paper.appendChild(tw);}
if(EDIT) renderEditableScript(paper, p, script, show);
else {
paper.appendChild(el("h2",null,script.title || p.name || "未命名"));
if(script.synopsis) paper.appendChild(el("p","dim small",script.synopsis));
renderGroups(paper, script.groups || [], rate, false);
}
} else {
paper.appendChild(el("p","dim", p.scriptJson? "剧本数据无法解析，原文如下：": "这个项目还没有生成剧本。"));
if(p.scriptJson) paper.appendChild(el("pre","raw",p.scriptJson));
}
review.appendChild(paper);
body.appendChild(review);
var sb = el("div","card");
sb.appendChild(el("h2",null,"五、分镜"));
var ctl = el("div","toolbar");
var packSec = 12;
var packInp = inp(12, function(v){ packSec = v || 12;}, true);
packInp.style.maxWidth = "90px";
packInp.setAttribute("aria-label","打包秒数");
ctl.appendChild(el("span","small","打包秒数"));
ctl.appendChild(packInp);
ctl.appendChild(btn("按时长打包生成分镜", function(){ var sc = parseScript(p); if(!sc){ saveStatus("这个项目还没有剧本，先有剧本才能切分镜"); return;} sc.storyboardGroups = packByDuration(sc, packSec || 12, rate); sc.stage = "storyboard"; setScript(p, sc); markDirty(); show();}));
ctl.appendChild(btn("按剧本段切镜（一组一镜）", function(){ var sc = parseScript(p); if(!sc){ saveStatus("这个项目还没有剧本，先有剧本才能切分镜"); return;} sc.storyboardGroups = packBySegment(sc); sc.stage = "storyboard"; setScript(p, sc); markDirty(); show();}));
ctl.appendChild(btn("导出剧本格式01", function(){ download((p.name||"剧本") + "_剧本格式01.txt", buildFormat01(p));}));
ctl.appendChild(btn("导出 SRT 字幕", function(){ download((p.name||"剧本") + "_字幕.srt", buildSrt(p));}));
ctl.appendChild(btn("导出逐镜头提示词包", function(){ download((p.name||"剧本") + "_逐镜头提示词包.txt", buildPromptPack(p));}));
sb.appendChild(ctl);
var lenses = storyboardOf(p);
if(script && script.stage === "storyboard" && lenses && lenses.length){
var over = [];
lenses.forEach(function(g, gi){ var s = groupSec(g, rate); if(s > 30) over.push("镜头 " + (gi+1) + " 约 " + fmtT(s));});
if(over.length){
var w = el("div","warn");
w.appendChild(el("p",null,"软顶警告（30 秒是软顶、不自动拆分）：以下镜头超过 30 秒，请回审查稿缩减台词、重新分配，或在完整工作台里走高权限确认：" + over.join("；")));
sb.appendChild(w);
}
var sbp = el("div","paper");
renderGroups(sbp, lenses, rate, true);
sb.appendChild(sbp);
} else {
sb.appendChild(el("p","dim","这个项目还没确认到分镜阶段：点上面的「按时长打包生成分镜」或「按剧本段切镜」即可在页内按同一时长公式生成（与完整工作台的两种切镜方式同口径）。"));
}
body.appendChild(sb);
}
sel.addEventListener("change", show);
show();
}
function libraryBench(root){
var modes = el("div","card");
modes.appendChild(el("h2",null,"模式与爆款基因卡"));
DATA.modes.forEach(function(m){
modes.appendChild(el("h3",null,"模式 " + m.id + ((m.styleTags && m.styleTags.length)? " · 标签：" + m.styleTags.join("、"): "") + " · 进度 " + (m.progress||0) + (m.stability? " · 稳定度 " + m.stability: "")));
if(EDIT){ modes.appendChild(fld("模式 " + m.id + " · 底层逻辑", tarea(m.coreLogic || "", function(v){ m.coreLogic = v; markDirty();}, 3))); } else if(m.coreLogic){ modes.appendChild(el("p","small","底层逻辑：" + m.coreLogic)); }
(m.cards||[]).forEach(function(c){
var fields = [["主题","themeStyle"],["节奏","rhythmStyle"],["对话","dialogueStyle"],["像素","pixelStyle"],["爆款钩子","hookStyle"],["情绪曲线","emotionCurve"],["叙事结构","narrativeStructure"],["互动/转化","interactionDesign"],["提炼摘要","viralSummary"],["权重","weightsJson"]];
if(EDIT){
fields.forEach(function(r){ modes.appendChild(fld("模式 " + m.id + " · " + r[0], tarea(c[r[1]] || "", function(v){ c[r[1]] = v; markDirty();}, 2)));});
} else {
var kv = el("dl","kv");
fields.forEach(function(r){ if(c[r[1]]){ kv.appendChild(el("dt",null,r[0])); kv.appendChild(el("dd",null,c[r[1]]));}});
modes.appendChild(kv);
}
});
if((m.records||[]).length){ var ul = el("ul"); m.records.forEach(function(r){ ul.appendChild(el("li","small",(r.kind==="feedback"?"反馈记录":"训练记录") + " · " + (r.status||"") + (r.videoName? " · " + r.videoName: "") + (r.analysisSummary? " · " + r.analysisSummary: "")));}); modes.appendChild(ul);}
});
root.appendChild(modes);
var lib = el("div");
var head = el("div","card");
head.appendChild(el("h2",null,"人物资产储存库（全部卡）"));
if(EDIT) head.appendChild(el("p","dim small","编辑模式：可改中文十部位、身份、备注、性格与分类；英文字段页内不改、原样保留，导出包时会带回。"));
lib.appendChild(head);
var g = el("div","grid grid3");
DATA.presets.forEach(function(p){
var c = el("div","card");
var parts = [["人物","personZh"],["发型","hairZh"],["帽子","hatZh"],["面部","faceZh"],["颈部","neckZh"],["上衣","topZh"],["手臂","armsZh"],["下装","bottomZh"],["鞋子","shoesZh"],["补充","extraZh"],["扮演/身份","cardRole"],["备注","cardNote"],["性格","personality"],["分类","category"]];
if(EDIT){
c.appendChild(fld("卡名", inp(p.name || "", function(v){ p.name = v; markDirty();})));
} else {
c.appendChild(el("h3",null,(p.name||"未命名卡") + (p.locked? "（已锁定）": "")));
}
(p.images||[]).forEach(function(im){ c.appendChild(imgEl(im.imageId, p.name||""));});
if(EDIT){
parts.forEach(function(r){ c.appendChild(fld(r[0], tarea(p[r[1]] || "", function(v){ p[r[1]] = v; markDirty();}, 1)));});
} else {
var kv = el("dl","kv");
parts.forEach(function(r){ if(p[r[1]]){ kv.appendChild(el("dt",null,r[0])); kv.appendChild(el("dd",null,p[r[1]]));}});
c.appendChild(kv);
}
renderGenPanel(c, p);
g.appendChild(c);
});
lib.appendChild(g);
root.appendChild(lib);
var gens = el("div","card");
gens.appendChild(el("h2",null,"生图记录"));
renderGenRecords(gens);
root.appendChild(gens);
var acc = el("div","card");
acc.appendChild(el("h2",null,"复刻验收清单"));
var ul2 = el("ol"); DATA.acceptanceChecklist.forEach(function(s){ ul2.appendChild(el("li","small",s));}); acc.appendChild(ul2);
root.appendChild(acc);
}
var rootEl = document.getElementById("bench-root");
var btnScript = document.getElementById("bench-script");
var btnLib = document.getElementById("bench-lib");
function showBench(which){
CURBENCH = which;
btnScript.setAttribute("aria-pressed", which==="script"? "true": "false");
btnLib.setAttribute("aria-pressed", which==="lib"? "true": "false");
rootEl.textContent = "";
if(which==="script") scriptBench(rootEl); else libraryBench(rootEl);
}
btnScript.addEventListener("click", function(){ showBench("script");});
btnLib.addEventListener("click", function(){ showBench("lib");});
showBench("script");
var editBtn = document.getElementById("edit-toggle");
editBtn.addEventListener("click", function(){ EDIT =!EDIT; editBtn.setAttribute("aria-pressed", EDIT? "true": "false"); editBtn.textContent = EDIT? "退出编辑模式": "进入编辑模式"; showBench(CURBENCH);});
document.getElementById("export-package").addEventListener("click", exportPackage);
document.getElementById("reset-data").addEventListener("click", function(){ DATA.presets = deep(RAW.presets || []); DATA.projects = deep(RAW.projects || []); DATA.modes = deep(RAW.modes || []); DATA.imageGenRecords = deep(RAW.imageGenRecords || []); EXTRA = []; AISTATE = {}; IMG = {}; (RAW.images || []).forEach(function(im){ IMG[im.id] = "data:" + im.mimeType + ";base64," + im.dataBase64;}); lsDel(); RESTORED = false; saveStatus("已恢复为包内原始数据（导出那一刻）"); showBench(CURBENCH);});
saveStatus(RESTORED? "已恢复上次在本机浏览器里改过的内容；点「恢复包内原始数据」可回到导出那一刻": "当前是导出那一刻的原始数据；点「进入编辑模式」即可改，改动自动存本机");
`;

// v3.79 页内 AI 与生图脚本：与 REPLICA_JS 拼进同一个 <script>。
// 约束与 REPLICA_JS 相同：只用字符串拼接、不用模板字面量。Key 只
// 在内存（GW.key）或用户勾选记住后的本机存储 replica79.gwkey 里，
// 永不写进页面数据、永不进导出的包。生图提交只挂在「生成图片」按
// 钮与记录上二次确认的「确认，这是新任务（重新计费）」按钮；打开
// 页面只自动续查已提交任务号。
const REPLICA_JS_AI = `
var GW = { key: "", chatModel: "", imgModel: "gpt-image-2.5-flare", models: [], imgModels: [] };
var GWKEY_LS = "replica79.gwkey";
var GENUI = { openPreset: null, zh: "", en: "", model: "gpt-image-2.5-flare", quality: "max", ratio: "16:9", threeView: true, err: "", armedId: null };
var POLLS = {};
function gwStatus(msg){ var n = document.getElementById("gw-status"); if(n) n.textContent = msg; }
function gwRememberKey(k){ try { window.localStorage.setItem(GWKEY_LS, k); } catch(e){} }
function gwForgetKey(){ try { window.localStorage.removeItem(GWKEY_LS); } catch(e){} }
function gwRememberedKey(){ try { return window.localStorage.getItem(GWKEY_LS) || ""; } catch(e){ return ""; } }
function gwFailText(e){ var m = (e && e.message)? e.message: String(e); if(e && e.name === "TypeError"){ return "请求没发出去或被浏览器拦下（网络不通，或服务商没有放行网页跨域调用）。请在双击打开的复刻页文件里再试；应用内预览的沙箱框会拦截联网，这不算失败证据。原始错误：" + m; } return m; }
function gwFetch(path, opts){ opts = opts || {}; var h = { "Authorization": "Bearer " + GW.key }; if(opts.body) h["Content-Type"] = "application/json"; opts.headers = h; return fetch("https://api.geeknow.top" + path, opts).then(function(r){ return r.text().then(function(t){ var j = null; try { j = JSON.parse(t); } catch(e2){} if(!r.ok) throw new Error("Geeknow 接口返回 HTTP " + r.status + "：" + String(t || "").slice(0, 300)); if(j == null) throw new Error("Geeknow 接口没有返回可解析的数据：" + String(t || "").slice(0, 200)); return j; }); }); }
function gwFillLists(){ var cl = document.getElementById("gw-chat-list"); var il = document.getElementById("gw-img-list"); if(cl){ cl.textContent = ""; GW.models.forEach(function(id){ var o = el("option"); o.value = id; cl.appendChild(o); }); } if(il){ il.textContent = ""; GW.imgModels.forEach(function(id){ var o = el("option"); o.value = id; il.appendChild(o); }); } }
function gwLoadModels(){ if(!GW.key){ gwStatus("先填入你的 Geeknow API Key，再读取模型列表"); return; } gwStatus("正在读取模型列表…"); gwFetch("/v1/models", { method: "GET" }).then(function(body){ var ids = []; (body.data || []).forEach(function(d){ if(d && typeof d.id === "string") ids.push(d.id); }); GW.models = ids; var keys = ["image", "seedream", "flux", "dall", "midjourney", "mj-", "omni"]; GW.imgModels = ids.filter(function(id){ var s = id.toLowerCase(); if(s.indexOf("kling") >= 0 || s.indexOf("video") >= 0) return false; for(var i = 0; i < keys.length; i++){ if(s.indexOf(keys[i]) >= 0) return true; } return false; }); gwFillLists(); gwStatus("模型列表读取成功：共 " + ids.length + " 个模型，其中生图模型 " + GW.imgModels.length + " 个。对话模型与生图模型都可以在输入框里选，也可以直接填模型名。"); }).catch(function(e){ gwStatus("读取模型列表失败：" + gwFailText(e)); }); }
function gwChatModel(){ var n = document.getElementById("gw-chat-model"); var v = n? (n.value || "").trim(): ""; return v || GW.chatModel || ""; }
function gwChat(system, user){ var model = gwChatModel(); if(!GW.key) return Promise.reject(new Error("先在页面顶部「AI / 生图网关」里填入你的 Geeknow API Key")); if(!model) return Promise.reject(new Error("先填对话模型：点网关面板的「读取模型列表」选一个，或直接在对话模型框里填模型名")); return gwFetch("/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: model, messages: [ { role: "system", content: system }, { role: "user", content: user } ], temperature: 0.8 }) }).then(function(body){ var c = body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content; if(typeof c !== "string" || !c.trim()) throw new Error("模型这次没有返回文本内容，请重试"); return c; }); }
function extractJson(text){ var t = String(text || "").split("\`\`\`json").join("").split("\`\`\`").join(""); var a = t.indexOf("{"), b = t.lastIndexOf("}"); if(a < 0 || b <= a) throw new Error("模型返回里找不到完整的 JSON 对象，请重试"); return JSON.parse(t.slice(a, b + 1)); }
function b64ToBytes(b64){ var bin = atob(String(b64 || "")); var arr = new Uint8Array(bin.length); for(var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return arr; }
function bytesToB64(bytes){ var s = ""; for(var i = 0; i < bytes.length; i += 32768){ s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)); } return btoa(s); }
function blobToB64(blob){ return blob.arrayBuffer().then(function(ab){ return bytesToB64(new Uint8Array(ab)); }); }
//SHA256-START
function sha256Hex(bytes){
var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function rr(x, n){ return (x >>> n) | (x << (32 - n)); }
var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
var l = bytes.length; var bitLen = l * 8;
var withPad = ((l + 9 + 63) >> 6) << 6;
var buf = new Uint8Array(withPad); buf.set(bytes); buf[l] = 0x80;
var dv = new DataView(buf.buffer); dv.setUint32(withPad - 4, bitLen >>> 0); dv.setUint32(withPad - 8, Math.floor(bitLen / 4294967296));
var w = new Uint32Array(64);
for(var off = 0; off < withPad; off += 64){
for(var t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4);
for(var t2 = 16; t2 < 64; t2++){ var s0 = rr(w[t2-15],7) ^ rr(w[t2-15],18) ^ (w[t2-15] >>> 3); var s1 = rr(w[t2-2],17) ^ rr(w[t2-2],19) ^ (w[t2-2] >>> 10); w[t2] = (w[t2-16] + s0 + w[t2-7] + s1) | 0; }
var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
for(var t3 = 0; t3 < 64; t3++){ var S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25); var ch = (e & f) ^ (~e & g); var tt1 = (h + S1 + ch + K[t3] + w[t3]) | 0; var S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22); var mj = (a & b) ^ (a & c) ^ (b & c); var tt2 = (S0 + mj) | 0; h=g; g=f; f=e; e=(d+tt1)|0; d=c; c=b; b=a; a=(tt1+tt2)|0; }
H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0; H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
}
return H.map(function(x){ return ("0000000" + (x >>> 0).toString(16)).slice(-8); }).join("");
}
//SHA256-END
function styleLabelOf(p){ if(p.stylePreset === "自定义"){ return (p.styleCustom || "").trim() || "幽默风趣"; } return (p.stylePreset || "").trim() || "幽默风趣"; }
function castLinesOf(p){ return (p.characters || []).filter(function(c){ return (c.name || "").trim(); }).map(function(c){ var n = (c.note || "").trim(); return n? ("- " + c.name.trim() + "（备注：" + n + "）"): ("- " + c.name.trim()); }).join("\\n"); }
function scenePartOf(p){ return ""; }
function tagListOf(v){ if(!v) return []; if(typeof v !== "string") return v; try { var x = JSON.parse(v); return (x && x.length)? x: []; } catch(e){ return []; } }
function genePartFor(p){ if(!p || !p.selectedModeId) return ""; var m = null; DATA.modes.forEach(function(x){ if(x.id === p.selectedModeId) m = x; }); if(!m || !(m.cards || []).length) return ""; var c = null; (m.cards || []).forEach(function(x){ if(x.oldId === m.currentCardOldId) c = x; }); if(!c) c = m.cards[m.cards.length - 1]; var w = {}; try { w = JSON.parse(c.weightsJson || "{}"); } catch(e){} function wn(k){ return (w[k] == null? 100: w[k]); } var lines = []; lines.push("【爆款基因卡注入 · 依据模式 " + m.id + "爆款基因卡生成】权重：主题" + wn("theme") + " 节奏" + wn("rhythm") + " 对话" + wn("dialogue") + " 像素" + wn("pixel") + " 钩子" + wn("hook") + " 情绪" + wn("emotion") + " 叙事" + wn("narrative") + " 互动" + wn("interaction") + "（0-200，越高越要强化该维度）"); if(c.viralSummary) lines.push("爆款逻辑提炼摘要：" + c.viralSummary); lines.push("主题：" + (c.themeStyle || "")); lines.push("节奏：" + (c.rhythmStyle || "") + (c.rhythmPoints? "；节奏点：" + c.rhythmPoints: "")); lines.push("对话：" + (c.dialogueStyle || "")); lines.push("像素视觉：" + (c.pixelStyle || "")); if(c.hookStyle) lines.push("爆款钩子（前3秒）：" + c.hookStyle + " —— 人物开场、大纲第一段、剧本第一拍、分镜第一镜都必须呼应这个钩子"); if(c.emotionCurve) lines.push("情绪曲线：" + c.emotionCurve + " —— 剧本台词与节拍必须按爽点/痛点/反转点的位置设计张力，审查时可对照"); if(c.narrativeStructure) lines.push("叙事结构模板：" + c.narrativeStructure + " —— 大纲必须套用此框架，分段标题或正文要能看出结构名"); if(c.interactionDesign) lines.push("互动/转化设计：" + c.interactionDesign); var tags = tagListOf(c.addedTags); if(tags.length) lines.push("基因标签：" + tags.join("、")); lines.push("生成要求：人物人设/语气/故事角色符合上述爆款调性；大纲套用叙事结构模板；剧本台词按情绪曲线制造张力；分镜运镜/切镜/时长分配匹配视觉节奏与高潮位置（节奏点）。"); return lines.join("\\n"); }
function aiStateFor(p){ var k = "p" + (p.oldId || 0); if(!AISTATE[k]) AISTATE[k] = {}; return AISTATE[k]; }
function buildOutlinePrompt(p, hints){
var modePart = genePartFor(p);
var named = (p.characters || []).filter(function(c){ return (c.name || "").trim(); });
var noCast = named.length === 0;
var rate = p.speechRate || 5;
var lines = [];
lines.push("你是一名短剧编剧。为一部短剧写整体故事大纲，只写大纲，不写剧本正文、不写台词。");
lines.push("");
lines.push("风格：" + styleLabelOf(p));
if(modePart){ lines.push(""); lines.push(modePart); }
lines.push("台词语速：" + rate + " 字/秒。");
if(p.targetSeconds > 0){ lines.push("目标成片时长：约 " + p.targetSeconds + " 秒，大纲的事件量按这个时长安排，不要铺得过大。按语速 " + rate + " 字/秒估算，全片台词总量预算约 " + Math.max(30, Math.round(rate * p.targetSeconds * 0.7)) + " 字上下（其余时间留给动作与停顿）；段数按时长安排：约每 10~15 秒一段，最少 3 段、最多 8 段，每段的事件量要与这个台词预算匹配，不要一段塞进全片一半的剧情。"); } else { lines.push("未设目标时长：按一个短剧单集的自然长度安排事件量，分 4~6 段。"); }
lines.push("");
if(noCast){
lines.push("本项目目前没有任何人物卡、也没有人物资产图。不要假装某位已有资产人物出演，不要给人物起具体的姓名。");
lines.push("改用「故事角色位」写大纲：按故事与主题需要设置角色位，每个角色位是一个清晰一致的称呼（如 现在小孩、以前小孩、妈妈、鱼贩、店长、顾客），全篇同一个角色位只用同一个称呼，不要中途改名。");
lines.push("每个角色位第一次出现时，用括号用一句话交代他的年龄段、性别、气质或在故事里的功能（如：现在小孩（7-10岁男孩，娇气、怕疼爱哭）），方便写完大纲后按角色位一键写生图提示词、按故事角色名建人物卡。");
lines.push("角色位数量按故事需要，一般 2~6 个；路人/群演只能一笔带过、不设角色位。");
} else {
lines.push("出场人物（只能用这些人，不得新增任何有名有姓的新人物；路人/群演只能一笔带过、不给名字）：");
lines.push(castLinesOf(p));
}
var sp = scenePartOf(p); if(sp){ lines.push(""); lines.push(sp); }
var hs = [];
if((hints.theme || "").trim()) hs.push("一句话主题/梗：" + hints.theme.trim());
if((hints.storyFlow || "").trim()) hs.push("故事大概流程（用户用自己的话写的故事起因、经过与结尾走向，按这个流程展开成大纲，流程里的关键事件、转折与结尾不要改）：" + hints.storyFlow.trim());
if(hs.length){ lines.push(""); lines.push("用户给的料（优先采纳）："); hs.forEach(function(x){ lines.push(x); }); }
if((p.outline || "").trim()){ lines.push(""); lines.push("用户已经写了一份大纲/素材，在它的基础上改写完善，不要推翻已有的核心设定：\\n" + p.outline.trim()); }
lines.push("");
lines.push("输出格式（与手写大纲一致的分段大纲，能直接拿去生成剧本）：");
lines.push("1. 按上面目标时长与语速定的段数分段（未设目标时长时分 4~6 段），每段以「第X段·小标题」单独一行开头。");
lines.push(noCast? "2. 每段 2~4 句，写清这一段发生了什么、冲突在哪、人物做了什么，用到的人物只写故事角色位称呼（不要起具体姓名）。": "2. 每段 2~4 句，写清这一段发生了什么、冲突在哪、人物做了什么，用到的人物只写上面给的名字。");
lines.push("3. 第一段交代起因与人物关系，最后一段写清结局走向；中间段要有转折或笑点升级。");
lines.push("4. 只输出大纲正文，不要解释、不要前后缀、不要 Markdown 标题符号。");
lines.push(modePart? "5. 若上方有爆款基因卡注入：大纲最前面单独一行写「叙事结构：<模板名>（依据模式" + p.selectedModeId + "爆款基因卡生成）」，各段必须对应模板的分段结构，第一段必须落地前3秒钩子。": "5. 未注入基因卡时按原流程写，不要假装套用了爆款结构。");
return lines.join("\\n");
}
function renderAiOutline(container, p, rerender){
var st = aiStateFor(p);
var box = el("div","aiPanel");
box.appendChild(el("h3",null,"AI 填写大纲（复刻页内 · 用你自己的 Geeknow Key）"));
box.appendChild(el("p","small dim","与工作台同一套写法：基础设置先行（语速与目标时长决定段数与台词预算）；所选模式有爆款基因卡时自动注入；没有人物时按故事角色位写。生成的是草稿，采用时若当前大纲非空会先存为覆盖前大纲、可恢复。"));
function hintInput(key, label, ph){ var i = inp(st[key] || "", function(){}); i.placeholder = ph; i.setAttribute("aria-label", label); i.addEventListener("input", function(){ st[key] = i.value; }); return fld(label, i); }
box.appendChild(hintInput("theme","一句话主题 / 梗","可不填"));
var flowTa = tarea(st.storyFlow || "", function(v){ st.storyFlow = v; }, 4);
flowTa.placeholder = "如：小孩想吃泡面→妈妈不让→小孩偷吃→被发现→反转";
flowTa.setAttribute("aria-label","故事大概流程");
box.appendChild(fld("故事大概流程", flowTa));
var status = el("p","small dim", st.outlineStatus || "");
var genBtn = btn("AI 生成大纲草稿", function(){
status.textContent = "正在生成大纲草稿…"; genBtn.disabled = true;
gwChat("你只输出分段大纲正文本身。", buildOutlinePrompt(p, st)).then(function(out){
st.outlineDraft = out.trim(); st.outlineStatus = "草稿已生成：检查后点「采用这份大纲」；采用前不会动当前大纲。"; persist(); rerender();
}).catch(function(e){ st.outlineStatus = "生成失败：" + gwFailText(e); persist(); status.textContent = st.outlineStatus; genBtn.disabled = false; });
});
box.appendChild(genBtn);
box.appendChild(status);
if(st.outlineDraft){
box.appendChild(fld("AI 大纲草稿（可先改再采用）", tarea(st.outlineDraft, function(v){ st.outlineDraft = v; }, 8)));
var row = el("div","toolbar");
row.appendChild(btn("采用这份大纲", function(){
var d = st.outlineDraft; if(!d) return;
if((p.outline || "").trim() && (p.outline || "").trim() !== d.trim()) p.prevOutline = p.outline;
p.outline = d; st.outlineDraft = ""; st.outlineStatus = "已采用为当前大纲（覆盖前大纲已备份，可在上方恢复）。"; markDirty(); rerender();
}));
row.appendChild(btn("丢弃草稿", function(){ st.outlineDraft = ""; st.outlineStatus = ""; persist(); rerender(); }));
box.appendChild(row);
}
container.appendChild(box);
}
function buildPlanPrompt(p){
var modePart = genePartFor(p);
var lines = [];
lines.push("你是一名短剧编剧。先为一部短剧做整体规划，不要写正文节拍，只输出规划。");
lines.push("");
lines.push("风格：" + styleLabelOf(p));
if(modePart){ lines.push(""); lines.push(modePart); }
lines.push("台词语速：" + (p.speechRate || 5) + " 字/秒");
if(p.targetSeconds > 0){ lines.push("目标剧本时长：" + p.targetSeconds + " 秒。时长口径是「台词时间 + 动作时间」：每段除了台词总字数预算（wordBudget），还要给出本段无台词节拍的动作总时长估计（actionSeconds，秒）。服务端会先把各段动作时间从目标里扣掉，剩余时间再按语速换算成台词字数总预算并重新校准各段 wordBudget，所以你的 wordBudget 只需大致合理，actionSeconds 要按剧情如实估计（开场、转场、动作戏的无台词节拍都要算进去）。"); } else { lines.push("未设目标时长：按故事大纲的自然长度规划段落与每段台词字数预算，并如实估计每段无台词节拍的动作总时长（actionSeconds，秒）；不要注水、不要压缩关键剧情。"); }
lines.push("");
lines.push("（只能使用以下人物，不要新增有名有姓的角色；群演/路人可合并处理且不给台词）");
lines.push(castLinesOf(p));
lines.push("");
lines.push("故事大纲：\\n" + (p.outline || "").trim());
var sp = scenePartOf(p); if(sp){ lines.push(""); lines.push(sp); }
lines.push("");
lines.push("规划要求：");
lines.push("1. pendingItems 只写真正的冲突或缺失，没有就给空数组。");
lines.push("2. 人物表里每个出场人物一行，造型结合资产图与备注，不要写与图片明显矛盾的外貌；人物表不得超出上面给出的人物。");
lines.push("3. 正文按故事推进自然分成 3~6 段，每段给小标题、场景名、一到两句剧情任务（brief）、台词字数预算（wordBudget）和无台词动作总时长估计（actionSeconds，秒）。");
lines.push("4. overlays 只列真正需要的花字/字幕/界面类叠加，groupIndex 是段落序号（从 0 开始）。");
lines.push("5. generationNotes 面向 AI 视频生成工具：画幅 16:9、画面内不出现文字、角色造型全程锁定一致、语速节奏、禁用事项等，每条一句话。");
lines.push("");
lines.push("输出要求：只输出一个 JSON 对象，不要解释、不要 Markdown 代码块。字段：title（片名，字符串）、pendingItems（字符串数组）、synopsis（故事梗概，字符串）、characterRows（数组，每项 {name, identity, look, voice, tone}）、overlays（数组，每项 {type, groupIndex, content}）、generationNotes（字符串数组）、versionNote（字符串）、segments（数组，3~6 项，每项 {title, sceneName, brief, wordBudget, actionSeconds}，wordBudget 与 actionSeconds 为数字）。");
return lines.join("\\n");
}
function calibratePlan(p, plan){
if(!((p.targetSeconds || 0) > 0) || !plan.segments || !plan.segments.length) return plan;
var target = p.targetSeconds;
var totalAction = 0;
plan.segments.forEach(function(sg){ totalAction += Math.min(120, Math.max(0, Number(sg.actionSeconds) || 0)); });
var totalBudget = Math.max(0, Math.round((p.speechRate || 5) * Math.max(0, target - totalAction)));
var raw = plan.segments.map(function(sg){ return Math.max(0, Number(sg.wordBudget) || 0); });
var rawSum = raw.reduce(function(a, b){ return a + b; }, 0);
var assigned = 0;
plan.segments.forEach(function(sg, idx){
if(idx === plan.segments.length - 1){ sg.wordBudget = Math.max(0, totalBudget - assigned); }
else { sg.wordBudget = rawSum > 0? Math.round((raw[idx] / rawSum) * totalBudget): Math.round(totalBudget / plan.segments.length); assigned += sg.wordBudget; }
});
return plan;
}
function buildSegmentPrompt(p, plan, idx, prevSummary){
var modePart = genePartFor(p);
var seg = plan.segments[idx];
var allowed = (plan.characterRows || []).map(function(r){ return r.name; }).join("、");
var lines = [];
lines.push("你是一名短剧编剧。只写下面这一段的正文节拍，不要写其他段落，不要重复规划内容。");
lines.push("");
lines.push("片名：" + (plan.title || ""));
lines.push("风格：" + styleLabelOf(p));
if(modePart){ lines.push(""); lines.push(modePart); }
lines.push("台词语速：" + (p.speechRate || 5) + " 字/秒（本阶段不计算时长、不写时间码）");
lines.push("");
lines.push("（只能使用以下人物，不要新增有名有姓的角色）");
lines.push(castLinesOf(p));
lines.push("");
lines.push("故事大纲：\\n" + (p.outline || "").trim());
var sp = scenePartOf(p); if(sp){ lines.push(""); lines.push(sp); }
lines.push("");
lines.push("人物表（说话人只能是：" + allowed + "）：");
(plan.characterRows || []).forEach(function(r){ lines.push("- " + r.name + "｜" + (r.identity || "") + "｜造型：" + (r.look || "") + "｜音色：" + (r.voice || "") + "｜语气基调：" + (r.tone || "")); });
lines.push("");
lines.push(prevSummary? ("前文摘要（保持连贯，不要复述）：\\n" + prevSummary): "这是第一段，没有前文。");
lines.push("");
lines.push("本段任务：第 " + (idx + 1) + " / " + plan.segments.length + " 段");
lines.push("标题：" + (seg.title || ""));
lines.push("场景名：" + (seg.sceneName || ""));
lines.push("剧情任务：" + (seg.brief || ""));
if(Number(seg.wordBudget) > 0){ lines.push("本段台词总字数预算约 " + seg.wordBudget + " 字（按去标点后的实际字数计，上下浮动两成以内，不要为凑字数注水，也不要明显写不满）；台词时间约 " + (seg.wordBudget / (p.speechRate || 5)).toFixed(1) + " 秒。"); } else { lines.push("本段台词字数按剧情自然长度。"); }
if(Number(seg.actionSeconds) > 0){ lines.push("本段无台词节拍的动作总时长按约 " + seg.actionSeconds + " 秒安排（每个无台词节拍的 actionSeconds 之和控制在这个量级）；本段总时长 = 台词时间 + 动作时间，约 " + ((Number(seg.wordBudget) || 0) / (p.speechRate || 5) + Number(seg.actionSeconds)).toFixed(1) + " 秒。"); } else { lines.push("本段如有无台词节拍，每个给 1~6 秒画面时长，其时长会计入本段总时长（总时长 = 台词时间 + 动作时间）。"); }
lines.push("");
lines.push("写作要求：本段 4~14 个节拍；每拍先写画面（一句话：站位+动作+关键道具/表情），有台词的拍给出说话人、语气/情绪（具体、可表演）和台词原文；台词口语化、贴合风格与人物身份。有台词的拍 actionSeconds 填 0；无台词的拍给 1~6 秒画面时长。段尾留钩子或转折，最后一段收束结局。输出的 group 标题与场景名必须与本段规划一致。");
lines.push("");
lines.push("输出要求：只输出一个 JSON 对象，不要解释、不要 Markdown 代码块。格式：{group:{title, sceneName, beats:[{visual, sfx, speaker, emotion, line, actionSeconds}]}}；无台词的拍 speaker / emotion / line 给空字符串，actionSeconds 为数字。");
return lines.join("\\n");
}
function cleanGroup(g){
var out = { title: String((g && g.title) || ""), sceneName: String((g && g.sceneName) || ""), beats: [] };
var bs = (g && g.beats) || [];
bs.slice(0, 14).forEach(function(b){ out.beats.push({ visual: String(b.visual || ""), sfx: String(b.sfx || ""), speaker: String(b.speaker || ""), emotion: String(b.emotion || ""), line: String(b.line || ""), actionSeconds: Number(b.actionSeconds) || 0 }); });
return out;
}
function prevSummaryOf(groups){
return groups.map(function(g, i){ var ls = []; (g.beats || []).forEach(function(b){ if(b.line) ls.push((b.speaker? b.speaker + "：": "") + b.line); }); return "第" + (i + 1) + "段《" + (g.title || "") + "》（" + (g.sceneName || "") + "）：" + ls.slice(0, 3).join(" / "); }).join("\\n");
}
function adoptAiScript(p, ai, rerender){
if(p.scriptJson){
var old = parseScript(p);
var maxNo = 0; (p.versions || []).forEach(function(v){ if(v.versionNo > maxNo) maxNo = v.versionNo; });
p.versions = p.versions || [];
p.versions.push({ versionNo: maxNo + 1, scriptJson: p.scriptJson, stage: (old && old.stage) || "review", lensCount: (old && old.storyboardGroups)? old.storyboardGroups.length: 0, totalSeconds: old? (old.groups || []).reduce(function(a, g){ return a + groupSec(g, p.speechRate || 5); }, 0): 0, autoNote: "复刻页 AI 生成剧本前快照", userNote: "", createdAt: new Date().toISOString() });
}
var sd = { title: ai.plan.title || p.name || "未命名", pendingItems: ai.plan.pendingItems || [], synopsis: ai.plan.synopsis || "", characterRows: ai.plan.characterRows || [], groups: ai.groups, overlays: ai.plan.overlays || [], generationNotes: ai.plan.generationNotes || [], versionNote: ai.plan.versionNote || "", speechRate: p.speechRate || 5, styleLabel: styleLabelOf(p), targetSeconds: p.targetSeconds || 0, snapshotStylePreset: p.stylePreset || "", snapshotStyleCustom: p.styleCustom || "", generatedAt: new Date().toISOString(), stage: "review" };
setScript(p, sd);
ai.note = "已采用为当前剧本（审查阶段；采用前剧本已存快照）。到下方分镜区可按两种方式重新切镜。"; ai.error = "";
markDirty(); rerender();
}
function renderAiScript(container, p, rerender){
var st = aiStateFor(p);
if(!st.ai) st.ai = { plan: null, groups: [], busy: "", error: "", note: "" };
var ai = st.ai;
var card = el("div","card");
card.appendChild(el("h2",null,"AI 生成剧本（复刻页内 · 先规划后逐段）"));
card.appendChild(el("p","small dim","与工作台同口径：先整体规划（片名 / 梗概 / 人物表 / 每段任务与台词预算），设了目标时长时先扣各段动作时间、再按语速把台词总预算校准到各段；然后逐段生成，每写完一段立刻存本机，关掉重开能接着写，断了只丢正在写的那一段。走页顶网关里你填的对话模型；采用前会把当前剧本存一份快照。"));
if(ai.error) card.appendChild(el("p","small errText", ai.error));
if(ai.note) card.appendChild(el("p","small dim", ai.note));
if(ai.busy) card.appendChild(el("p","small", ai.busy));
var row = el("div","toolbar");
var planBtn = btn(ai.plan? "重新做整体规划（会清掉已生成的段）": "AI 做整体规划", function(){
ai.busy = "正在做整体规划…"; ai.error = ""; persist(); rerender();
gwChat("你只输出符合结构要求的规划内容本身。", buildPlanPrompt(p)).then(function(out){
var plan = extractJson(out);
if(!plan.segments || !plan.segments.length) throw new Error("规划里没有段落，请重试");
ai.plan = calibratePlan(p, plan); ai.groups = []; ai.busy = ""; ai.note = "规划完成：《" + (plan.title || "") + "》，共 " + plan.segments.length + " 段。接着逐段生成。"; persist(); rerender();
}).catch(function(e){ ai.busy = ""; ai.error = "规划失败：" + gwFailText(e); persist(); rerender(); });
});
planBtn.disabled = !!ai.busy;
row.appendChild(planBtn);
if(ai.plan){
var doneCount = ai.groups.filter(Boolean).length;
var allDone = doneCount === ai.plan.segments.length;
if(!allDone){
var nextBtn = btn("生成下一段（第 " + (doneCount + 1) + " 段）", function(){ genSegments(p, ai, doneCount, doneCount + 1, rerender); });
nextBtn.disabled = !!ai.busy; row.appendChild(nextBtn);
var allBtn = btn("生成全部剩余段", function(){ genSegments(p, ai, doneCount, ai.plan.segments.length, rerender); });
allBtn.disabled = !!ai.busy; row.appendChild(allBtn);
}
var adoptBtn = btn("采用为当前剧本", function(){ adoptAiScript(p, ai, rerender); });
adoptBtn.disabled = !allDone || !!ai.busy; row.appendChild(adoptBtn);
var clearBtn = btn("清除本次 AI 稿", function(){ st.ai = { plan: null, groups: [], busy: "", error: "", note: "" }; persist(); rerender(); });
clearBtn.disabled = !!ai.busy; row.appendChild(clearBtn);
}
card.appendChild(row);
if(ai.plan){
var ul = el("ul");
ai.plan.segments.forEach(function(sg, i){
var done = !!ai.groups[i];
ul.appendChild(el("li","small", "第 " + (i + 1) + " 段《" + (sg.title || "") + "》（" + (sg.sceneName || "") + "）：" + (sg.brief || "") + "；台词预算 " + (sg.wordBudget || 0) + " 字、动作约 " + (sg.actionSeconds || 0) + " 秒 —— " + (done? "已生成（" + (ai.groups[i].beats || []).length + " 个节拍）": "待生成")));
});
card.appendChild(ul);
}
container.appendChild(card);
}
function genSegments(p, ai, from, to, rerender){
var idx = from;
function step(){
if(idx >= to){ ai.busy = ""; ai.note = "已生成到第 " + to + " 段（共 " + ai.plan.segments.length + " 段）。"; persist(); rerender(); return; }
ai.busy = "正在生成第 " + (idx + 1) + " 段…"; ai.error = ""; persist(); rerender();
var prev = ai.groups.slice(0, idx).filter(Boolean);
gwChat("你只输出符合结构要求的本段节拍本身。", buildSegmentPrompt(p, ai.plan, idx, prev.length? prevSummaryOf(prev): "")).then(function(out){
var parsed = extractJson(out);
ai.groups[idx] = cleanGroup(parsed.group || parsed);
idx++; persist(); step();
}).catch(function(e){ ai.busy = ""; ai.error = "第 " + (idx + 1) + " 段生成失败（前面已生成的段都还在，可断点续跑）：" + gwFailText(e); persist(); rerender(); });
}
step();
}
var THREE_VIEW_TEXT = "人物三视图排版：16:9 一张图，左 70% 为三个无头全身（正面、侧面、背面，均裁到脖子），右 30% 上为头部侧面特写、下为头部正面特写，五格同一个人、同套衣服、同个发型；纯色浅色背景，无文字，无水印";
function withThreeView(text, on){ var base = String(text || "").split(THREE_VIEW_TEXT).join("").replace(/[；;\\s]+$/, "").trim(); if(!on) return base; return base? (base + "；" + THREE_VIEW_TEXT): THREE_VIEW_TEXT; }
function presetPromptZh(p){
var parts = [["人物", p.personZh], ["发型", p.hairZh], ["帽子", p.hatZh], ["面部", p.faceZh], ["脖子", p.neckZh], ["上衣", p.topZh], ["手臂", p.armsZh], ["下装", p.bottomZh], ["鞋子", p.shoesZh], ["补充", p.extraZh]];
var segs = parts.filter(function(x){ return (x[1] || "").trim(); }).map(function(x){ return x[0] + "：" + x[1].trim(); });
if(segs.length) return segs.join("；");
if((p.cardNote || "").trim()) return (p.name || "") + "：" + p.cardNote.trim();
if((p.cardRole || "").trim()) return (p.name || "") + "：" + p.cardRole.trim();
return p.name || "";
}
function presetPromptEn(p){
var parts = [["Person", p.personEn], ["Hair", p.hairEn], ["Hat", p.hatEn], ["Face", p.faceEn], ["Neck", p.neckEn], ["Top", p.topEn], ["Arms", p.armsEn], ["Bottom", p.bottomEn], ["Shoes", p.shoesEn], ["Extra", p.extraEn]];
return parts.filter(function(x){ return (x[1] || "").trim(); }).map(function(x){ return x[0] + ": " + x[1].trim(); }).join("; ");
}
function sizeFor(ratio, quality){
var table = { "16:9": ["1536x864", "2048x1152", "3840x2160"], "3:4": ["1200x1600", "1536x2048", "2304x3072"], "1:1": ["1024x1024", "2048x2048", "2880x2880"], "9:16": ["864x1536", "1152x2048", "2160x3840"], "4:3": ["1600x1200", "2048x1536", "3072x2304"] };
var row = table[ratio] || table["16:9"];
return quality === "max"? row[2]: (quality === "high"? row[1]: row[0]);
}
function findTaskId(body){
if(!body || typeof body !== "object") return null;
var ks = ["task_id", "taskId", "id", "job_id"];
for(var i = 0; i < ks.length; i++){ var v = body[ks[i]]; if(typeof v === "string" && v) return v; }
if(body.data && typeof body.data === "object" && !Array.isArray(body.data)) return findTaskId(body.data);
return null;
}
function statusTextOf(body){
var vals = [];
if(body && typeof body === "object"){ vals.push(body.status, body.state); if(body.data && typeof body.data === "object" && !Array.isArray(body.data)) vals.push(body.data.status, body.data.state); if(body.result && typeof body.result === "object") vals.push(body.result.status, body.result.state); }
for(var i = 0; i < vals.length; i++){ if(typeof vals[i] === "string" && vals[i]) return vals[i].toLowerCase(); }
return "";
}
function providerMsg(body){
if(body && typeof body === "object"){
var ks = ["error", "message", "detail", "msg"];
for(var i = 0; i < ks.length; i++){ var v = body[ks[i]]; if(typeof v === "string" && v) return v.slice(0, 400); if(v && typeof v === "object" && typeof v.message === "string" && v.message) return v.message.slice(0, 400); }
if(body.data && typeof body.data === "object" && !Array.isArray(body.data)) return providerMsg(body.data);
}
return "";
}
function extractImage(body){
var cs = [body];
if(body && typeof body === "object"){ ["data", "result"].forEach(function(k){ var s = body[k]; if(s && typeof s === "object" && !Array.isArray(s)) cs.push(s); }); }
for(var i = 0; i < cs.length; i++){
var c = cs[i]; if(!c || typeof c !== "object") continue;
var items = c.data;
if(items && items.length && typeof items[0] === "object"){ if(items[0].b64_json) return [items[0].b64_json, null]; if(items[0].url) return [null, items[0].url]; }
if(c.b64_json) return [c.b64_json, null];
if(c.url) return [null, c.url];
if(typeof c.image_url === "string" && c.image_url) return [null, c.image_url];
}
return [null, null];
}
function finishGen(rec, b64, mime){
var id = "replica-gen-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);
EXTRA.push({ id: id, mimeType: mime || "image/png", dataBase64: b64 });
IMG[id] = "data:" + (mime || "image/png") + ";base64," + b64;
rec.status = "done"; rec.stagedImageId = id; rec.mimeType = mime || "image/png"; rec.error = null;
persist(); showBench(CURBENCH);
saveStatus("生图已出图（" + (rec.personName || "") + "）：在储存库台底部的生图记录里点「保存到这张卡」即可上卡；新图也会随「导出更新后的复刻包」带回完整工作台");
}
function fetchUrlAsB64(url){
return fetch(url).then(function(fr){ if(!fr.ok) throw new Error("HTTP " + fr.status); return fr.blob(); }).then(function(blob){ return blobToB64(blob).then(function(b64){ return [b64, blob.type || "image/png"]; }); });
}
function pollOnce(rec){
var url = "https://api.geeknow.top/v1/images/generations/async/" + encodeURIComponent(rec.taskId);
return fetch(url, { headers: { "Authorization": "Bearer " + GW.key } }).then(function(r){
return r.text().then(function(t){
var body = null; try { body = JSON.parse(t); } catch(e){}
if(r.status === 404){ rec.status = "expired"; rec.error = "任务号不存在或已过期（HTTP 404），这个任务查不到了"; persist(); showBench(CURBENCH); return true; }
if(r.status === 401 || r.status === 403){ rec.error = "Geeknow 鉴权失败（HTTP " + r.status + "）：检查网关面板里的 Key 是否正确、是否已勾选记住"; persist(); showBench(CURBENCH); return true; }
if(!r.ok){ rec.error = "查询生图任务失败 HTTP " + r.status + "：" + String(t || "").slice(0, 300); persist(); showBench(CURBENCH); return true; }
if(!body){ rec.error = "查询返回不可解析，点「用同一任务号续查」再试"; persist(); showBench(CURBENCH); return true; }
var st = statusTextOf(body);
if(["failed", "error", "cancelled", "canceled", "rejected", "expired"].indexOf(st) >= 0){ rec.status = "failed"; rec.error = providerMsg(body) || "服务商判定这张图生成失败"; persist(); showBench(CURBENCH); return true; }
var ex = extractImage(body);
var doneStates = ["succeeded", "success", "successful", "completed", "complete", "done", "finished"];
if(doneStates.indexOf(st) >= 0 || ex[0] || ex[1]){
if(ex[0]){ finishGen(rec, ex[0], "image/png"); return true; }
if(ex[1]){ return fetchUrlAsB64(ex[1]).then(function(pair){ finishGen(rec, pair[0], pair[1]); return true; }).catch(function(e2){ rec.error = "图片已生成但取回失败（可继续查询）：" + gwFailText(e2); persist(); showBench(CURBENCH); return true; }); }
rec.error = "任务显示已完成，但返回里没有图片数据（可继续查询）"; persist(); showBench(CURBENCH); return true;
}
rec.status = "generating"; rec.error = null; persist(); return false;
});
}).catch(function(e){ rec.error = "查询生图任务失败：" + gwFailText(e); persist(); showBench(CURBENCH); return true; });
}
function startPoll(rec){
if(!rec.taskId || POLLS[rec.taskId]) return;
var tick = function(){ pollOnce(rec).then(function(done){ if(done && POLLS[rec.taskId]){ clearInterval(POLLS[rec.taskId]); delete POLLS[rec.taskId]; } }); };
POLLS[rec.taskId] = setInterval(tick, 5000);
tick();
}
function submitGen(preset){
if(!GW.key){ GENUI.err = "先在页面顶部「AI / 生图网关」面板填入你的 Geeknow API Key"; showBench(CURBENCH); return; }
var model = (GENUI.model || "").trim();
if(!model){ GENUI.err = "先填生图模型（网关面板读取模型列表后可选，或直接填，默认 gpt-image-2.5-flare）"; showBench(CURBENCH); return; }
var zhRaw = (GENUI.zh || "").trim();
var en = (GENUI.en || "").trim();
var prompt = en || withThreeView(zhRaw, GENUI.threeView);
if(!prompt){ GENUI.err = "提示词是空的：先有提示词才能生成"; showBench(CURBENCH); return; }
GENUI.err = "";
saveStatus("正在提交生图任务（" + (preset.name || "") + "）…");
var payload = { model: model, prompt: prompt, n: 1, size: sizeFor(GENUI.ratio, GENUI.quality), quality: GENUI.quality, response_format: "b64_json" };
gwFetch("/v1/images/generations/async", { method: "POST", body: JSON.stringify(payload) }).then(function(body){
var tid = findTaskId(body);
var ex = extractImage(body);
if(!tid && !ex[0] && !ex[1]){ GENUI.err = "Geeknow 异步提交没有返回任务号：" + JSON.stringify(body).slice(0, 300); showBench(CURBENCH); return; }
var rec = { oldId: -Date.now(), personName: preset.name || "", presetOldId: preset.oldId, presetName: preset.name || "", characterOldId: null, characterName: "", projectOldId: null, promptZh: zhRaw, promptEn: en, model: model, quality: GENUI.quality, ratio: GENUI.ratio, threeView: !!GENUI.threeView, taskId: tid, line: "geeknow.top", status: tid? "submitted": "generating", stagedKey: null, mimeType: null, error: null, savedPresetOldId: null, savedPresetName: "", savedCharacterOldId: null, savedCharacterName: "", createdAt: new Date().toISOString(), stagedImageId: null };
DATA.imageGenRecords.push(rec);
persist();
if(ex[0]){ finishGen(rec, ex[0], "image/png"); return; }
if(ex[1]){ fetchUrlAsB64(ex[1]).then(function(pair){ finishGen(rec, pair[0], pair[1]); }).catch(function(e2){ rec.error = "提交已返回图片地址但取回失败（可继续查询）：" + gwFailText(e2); persist(); showBench(CURBENCH); }); return; }
startPoll(rec);
showBench(CURBENCH);
saveStatus("生图任务已提交（任务号 " + tid + "），记录在储存库台底部，正在自动查询出图…");
}).catch(function(e){ GENUI.err = "生图提交失败：" + gwFailText(e); showBench(CURBENCH); });
}
function resubmitGen(rec, btnEl){
if(GENUI.armedId !== rec.oldId){ GENUI.armedId = rec.oldId; btnEl.textContent = "确认，这是新任务（重新计费）"; btnEl.setAttribute("aria-pressed", "true"); return; }
GENUI.armedId = null;
GENUI.zh = rec.promptZh || ""; GENUI.en = rec.promptEn || ""; GENUI.model = rec.model || GENUI.model; GENUI.quality = rec.quality || "max"; GENUI.ratio = rec.ratio || "16:9"; GENUI.threeView = !!rec.threeView;
var preset = null;
DATA.presets.forEach(function(x){ if(x.oldId === rec.presetOldId) preset = x; });
submitGen(preset || { oldId: rec.presetOldId, name: rec.presetName });
}
function saveGenToCard(rec){
var p = null;
DATA.presets.forEach(function(x){ if(x.oldId === rec.presetOldId) p = x; });
if(!p || !rec.stagedImageId){ saveStatus("找不到这张卡或这条记录还没有出图，没法保存"); return; }
p.images = p.images || [];
p.images.push({ oldId: -Date.now(), fileName: "复刻页生成图.png", mimeType: rec.mimeType || "image/png", sortOrder: p.images.length, imageId: rec.stagedImageId });
rec.savedPresetOldId = p.oldId; rec.savedPresetName = p.name || "";
markDirty(); showBench(CURBENCH);
saveStatus("已保存到卡「" + (p.name || "") + "」（随本页数据一起，导出更新包可带回完整工作台）");
}
function renderGenPanel(card, preset){
if(GENUI.openPreset !== preset.oldId){
card.appendChild(btn("生成图（复刻页内 · 自备 Key）", function(){ GENUI.openPreset = preset.oldId; GENUI.zh = presetPromptZh(preset); GENUI.en = presetPromptEn(preset); GENUI.err = ""; showBench(CURBENCH); }));
return;
}
var box = el("div","aiPanel");
box.appendChild(el("h3",null,"页内生图 · " + (preset.name || "未命名卡")));
box.appendChild(el("p","small dim","提示词已按这张卡的十部位字段拼好（与工作台同口径：英文优先提交、英文为空用中文），可以直接改。只有点下面「生成图片」才会提交新任务（会计费）：打开面板、刷新页面都不会自动提交；出图后在页面底部「生图记录」里保存到卡。"));
var zhI = tarea(GENUI.zh || "", function(){}, 3); zhI.setAttribute("aria-label", "中文提示词"); zhI.addEventListener("input", function(){ GENUI.zh = zhI.value; });
box.appendChild(fld("中文提示词", zhI));
var enI = tarea(GENUI.en || "", function(){}, 2); enI.setAttribute("aria-label", "英文提示词"); enI.addEventListener("input", function(){ GENUI.en = enI.value; });
box.appendChild(fld("英文提示词", enI));
var mI = inp(GENUI.model || "", function(){}); mI.setAttribute("list", "gw-img-list"); mI.setAttribute("aria-label", "生图模型"); mI.addEventListener("input", function(){ GENUI.model = mI.value; });
box.appendChild(fld("生图模型", mI));
function selOf(label, values, cur, onchg){ var s = el("select","inpSel"); s.setAttribute("aria-label", label); values.forEach(function(v){ var o = el("option", null, v[1]); o.value = v[0]; s.appendChild(o); }); s.value = cur; s.addEventListener("change", function(){ onchg(s.value); }); return fld(label, s); }
box.appendChild(selOf("质量", [["max", "max"], ["high", "high"], ["standard", "standard"]], GENUI.quality, function(v){ GENUI.quality = v; }));
box.appendChild(selOf("比例", [["16:9", "16:9"], ["3:4", "3:4"], ["1:1", "1:1"], ["9:16", "9:16"], ["4:3", "4:3"]], GENUI.ratio, function(v){ GENUI.ratio = v; }));
var tv = el("input"); tv.type = "checkbox"; tv.checked = !!GENUI.threeView; tv.setAttribute("aria-label", "人物三视图排版"); tv.addEventListener("change", function(){ GENUI.threeView = tv.checked; });
var tvl = el("label","fl"); tvl.appendChild(tv); tvl.appendChild(document.createTextNode(" 人物三视图排版（默认勾，与工作台同口径）"));
box.appendChild(tvl);
if(GENUI.err) box.appendChild(el("p","small errText", GENUI.err));
var row = el("div","toolbar");
row.appendChild(btn("生成图片", function(){ submitGen(preset); }));
row.appendChild(btn("收起", function(){ GENUI.openPreset = null; showBench(CURBENCH); }));
box.appendChild(row);
card.appendChild(box);
}
function renderGenRecords(gens){
if(!(DATA.imageGenRecords || []).length){ gens.appendChild(el("p","dim","包里没有生图记录。在储存库卡上点「生成图」、用你自己的 Key 生成后，记录会出现在这里（只点「生成图片」才提交）。")); return; }
var labels = { submitted: "已提交", generating: "生成中", done: "已出图", failed: "失败", expired: "失败（任务号已失效）" };
DATA.imageGenRecords.forEach(function(r){
var blk = el("div","recBlock");
blk.appendChild(el("p",null, (r.personName || r.characterName || "未命名") + " · " + (labels[r.status] || r.status || "") + " · " + (r.model || "") + (r.taskId? " · 任务号 " + r.taskId: "")));
if(r.promptZh) blk.appendChild(el("p","small dim", r.promptZh));
if(r.stagedImageId){ var im = imgEl(r.stagedImageId, r.personName || ""); if(im.tagName === "IMG") im.className = "thumb"; blk.appendChild(im); }
if(r.error) blk.appendChild(el("p","small errText", r.error));
var row = el("div","toolbar");
if(r.taskId && (r.status === "submitted" || r.status === "generating" || r.status === "failed")){ row.appendChild(btn("用同一任务号续查", function(){ if(!GW.key){ saveStatus("先在顶部网关面板填入你的 Geeknow API Key 才能续查"); return; } startPoll(r); })); }
if(r.status === "done" && r.stagedImageId && r.presetOldId != null && !r.savedPresetOldId){ row.appendChild(btn("保存到这张卡", function(){ saveGenToCard(r); })); }
if(r.savedPresetOldId){ row.appendChild(el("span","small dim", "已保存到卡「" + (r.savedPresetName || "") + "」")); }
if(r.status === "failed" && r.presetOldId != null){ var rb = btn("重新提交新任务", function(){ resubmitGen(r, rb); }); row.appendChild(rb); }
if(row.childNodes.length) blk.appendChild(row);
gens.appendChild(blk);
});
}
function initGateway(){
var panel = document.getElementById("gw-panel");
var toggle = document.getElementById("gw-toggle");
if(!panel) return;
var remembered = gwRememberedKey();
if(remembered) GW.key = remembered;
panel.appendChild(el("h3",null,"AI 与生图网关（Geeknow · 复刻页内直连）"));
panel.appendChild(el("p","small dim","填入你自己的 Geeknow API Key 后，本页就能直接做：AI 填写大纲、AI 生成剧本（先规划后逐段）、储存库卡页内生图。主机与工作台本体相同：api.geeknow.top。Key 只在你点按钮时随请求发给 Geeknow；不写进本文件、不进导出的复刻包；默认只留在本次打开的内存里，勾选「记住在本机浏览器」才存进这台浏览器的本机存储，可随时清除。所有提交都只发生在你亲手点按钮时：打开页面、刷新、切换都不会提交新任务，只会自动续查已提交的生图任务号（只读查询、不计费）。"));
var keyI = el("input","inp"); keyI.type = "password"; keyI.value = GW.key; keyI.placeholder = "粘贴你的 Geeknow API Key"; keyI.setAttribute("aria-label", "Geeknow API Key"); keyI.setAttribute("autocomplete", "off");
keyI.addEventListener("input", function(){ GW.key = keyI.value; if(remC.checked) gwRememberKey(GW.key); });
panel.appendChild(fld("Geeknow API Key（永不进文件 / 永不进包）", keyI));
var remC = el("input"); remC.type = "checkbox"; remC.checked = !!remembered; remC.setAttribute("aria-label", "记住在本机浏览器");
remC.addEventListener("change", function(){ if(remC.checked) gwRememberKey(GW.key); else gwForgetKey(); });
var remL = el("label","fl"); remL.appendChild(remC); remL.appendChild(document.createTextNode(" 记住在本机浏览器（只存这台浏览器，不进任何文件）"));
panel.appendChild(remL);
var chatI = el("input","inp"); chatI.setAttribute("list", "gw-chat-list"); chatI.placeholder = "先读取模型列表再选，或直接填模型名"; chatI.setAttribute("aria-label", "对话模型");
chatI.addEventListener("input", function(){ GW.chatModel = chatI.value; });
var chatDl = el("datalist"); chatDl.id = "gw-chat-list"; panel.appendChild(chatDl);
panel.appendChild(fld("对话模型（AI 大纲 / 剧本）", chatI));
var imgI = el("input","inp"); imgI.setAttribute("list", "gw-img-list"); imgI.value = GW.imgModel; imgI.setAttribute("aria-label", "生图模型（默认）");
imgI.addEventListener("input", function(){ GW.imgModel = imgI.value; GENUI.model = imgI.value; });
var imgDl = el("datalist"); imgDl.id = "gw-img-list"; panel.appendChild(imgDl);
panel.appendChild(fld("生图模型（默认，卡上可再改）", imgI));
var row = el("div","toolbar");
row.appendChild(btn("读取模型列表", function(){ gwLoadModels(); }));
row.appendChild(btn("清除已记住的 Key", function(){ gwForgetKey(); remC.checked = false; gwStatus("已清除本机记住的 Key（本次打开内存里的还在，关掉页面即没）"); }));
panel.appendChild(row);
var st = el("p","small dim", remembered? "已从本机浏览器恢复记住的 Key，可以直接用 AI 与生图；也可以换一个 Key 覆盖。": "还没有填 Key：填好后先点「读取模型列表」验证连接，再去用 AI 大纲 / AI 剧本 / 卡上的生成图。");
st.id = "gw-status"; st.setAttribute("role", "status");
panel.appendChild(st);
if(toggle){
toggle.addEventListener("click", function(){
var open = panel.style.display !== "none";
panel.style.display = open? "none": "block";
toggle.setAttribute("aria-pressed", open? "false": "true");
});
if(remembered) panel.style.display = "block";
}
gwFillLists();
}
function resumeGenPolls(){
if(!GW.key) return;
(DATA.imageGenRecords || []).forEach(function(r){ if(r.taskId && (r.status === "submitted" || r.status === "generating")) startPoll(r); });
}
initGateway();
resumeGenPolls();
`;

/** 生成独立复刻页 HTML（完整单文件，离线可开、可编辑）。 */
export function buildReplicaHtml(data: ReplicaViewData): string {
const payload = escapeJsonForHtml(
JSON.stringify({
baseline: data.baseline,
exportedAt: data.exportedAt,
counts: data.counts,
acceptanceChecklist: data.acceptanceChecklist,
categories: data.categories?? [],
presets: data.presets,
projects: data.projects,
modes: data.modes,
imageGenRecords: data.imageGenRecords?? [],
images: data.images,
}),
);
const c = data.counts;
const incompleteHtml =
data.incomplete && data.incomplete.missingImages.length > 0
? `<div class="warn" role="alert"><strong>不完整复刻：</strong>打包时有 ${data.incomplete.missingImages.length} 张图没能取回，本页这些位置会缺图：${data.incomplete.missingImages
.map((x) => `${x.label}（${x.reason}）`)
.join("；")}</div>`
: "";
return [
"<!DOCTYPE html>",
'<html lang="zh-CN">',
"<head>",
'<meta charset="utf-8">',
'<meta name="viewport" content="width=device-width, initial-scale=1">',
`<title>剧本创作工作台 · 1:1 复刻页（${data.baseline}）</title>`,
`<style>${REPLICA_CSS}</style>`,
"</head>",
"<body>",
'<header class="topbar"><div class="wrap" style="padding:0">',
'<div class="seg" role="group" aria-label="工作台切换">',
'<button type="button" id="bench-script" aria-pressed="true">剧本工作台</button>',
'<button type="button" id="bench-lib" aria-pressed="false">人物资产储存库</button>',
"</div>",
`<p class="small dim" style="margin:8px 0 0">独立复刻页（可编辑离线功能复刻 + 页内 AI 与生图） · 基线 ${data.baseline} · 导出于 ${new Date(data.exportedAt).toLocaleString()} · 项目 ${c.projects} 个 / 储存库卡 ${c.presets} 张 / 图片 ${c.totalUniqueImages} 张 / 快照 ${c.snapshots} 份 / 基因卡 ${c.styleCards} 张 / 训练记录 ${c.trainingRecords} 条</p>`,
'<div class="toolbar" role="group" aria-label="复刻页功能">',
'<button type="button" class="act" id="edit-toggle" aria-pressed="false">进入编辑模式</button>',
'<button type="button" class="act" id="export-package">导出更新后的复刻包 JSON</button>',
'<button type="button" class="act" id="reset-data">恢复包内原始数据</button>',
'<button type="button" class="act" id="gw-toggle" aria-pressed="false">AI / 生图网关（填自己的 Key）</button>',
'<span class="small dim" id="save-status" role="status"></span>',
"</div>",
'<div id="gw-panel" class="card gwPanel" style="display:none"></div>',
"</div></header>",
'<main class="wrap">',
incompleteHtml,
'<div id="bench-root"></div>',
'<footer class="card small dim">',
"这份文件是点「打包备份」时与 JSON 复刻包同一次下载的独立复刻页：布局（顶部导航、双台、窗口顺序 模式→基础设置→人物与大纲→剧本审查→分镜→封面生成、单套深空未来深色主题、860px 深色审查稿）、全部内容数据与图片真实字节都在这一个文件里；点「进入编辑模式」可改基础设置、人物、大纲、剧本逐节拍、储存库卡与基因卡，改动自动存进打开它的浏览器本机（关掉重开还在），时长按同一公式重算，分镜可按时长打包或按剧本段重新切镜（超 30 秒只警告不自动拆），剧本格式01 / SRT / 逐镜头提示词包可按当前数据导出，还能把改后的全部数据「导出更新后的复刻包 JSON」、拿回完整工作台用「导入备份」恢复。v3.79 起 AI 生成与 Geeknow 生图也进了本页：点顶部「AI / 生图网关（填自己的 Key）」，填入你自己的 Geeknow API Key（与工作台本体同一个服务商），即可在页内做 AI 填写大纲、AI 生成剧本（先规划、按目标时长校准字数预算、逐段生成可断点续跑）与储存库卡生图（同口径拼词与三视图、只点「生成图片」才提交、失败只用同一任务号续查、重新提交须二次确认并明说重新计费、出图可保存到卡）。Key 永不写进本文件、永不进导出的复刻包：默认只在本次打开的内存里，勾选记住才存进打开它的浏览器本机、可一键清除。本页不含任何凭证。仍不在页内的只有视频投喂训练分析（抽帧与多模态分析走服务端管线）；与服务端完全同口径的完整工作台仍按同一次下载的 JSON 复刻包第一项执行单在新账号重建并导入。页内联网是否放行取决于服务商与打开方式：请求失败时页内会把原始错误写清，应用内预览的沙箱框会拦截联网与本机存储，请以双击打开下载文件为准。",
"</footer>",
"</main>",
`<script type="application/json" id="replica-data">${payload}</script>`,
`<script>${REPLICA_JS}\n${REPLICA_JS_AI}</script>`,
"</body>",
"</html>",
].join("\n");
}
