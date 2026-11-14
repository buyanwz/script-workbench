// exe 专属窄边页（移植层，不在 client/src 内）：左视图收起时（36px）
// 加载的本地页面。整条窄边可点，点一下经最小 preload 调 toggleChat(true)
// 展开左视图、加载真正的 muse.ai 网页。页面不含任何工作台逻辑、
// 不读工作台 DOM。
//
// 设计（#111313，英伦俱乐部风格，三段式排版）：
//   配色只用三样——墨蓝 #141A2E→#1B2340 纵向微渐变、黄铜 #C6A15B、
//   米白 #EFE7D8；亮金 #f7c948 退场，不再有大面积色块。
//   版式分三段钉死（space-between，顶 / 中 / 底），不再居中漂浮：
//   顶部是字母章（衬线 M + 双线黄铜框，像俱乐部徽章）；中部是动作
//   （竖排「展开 Muse」黄铜描边直角按钮，上下各一条黄铜细线收束）；
//   底部是一行竖排小字「点一下打开」。右缘一条 1px 黄铜发丝线与
//   工作台分隔。悬停时整条窄边微亮、按钮填满黄铜、字变墨蓝，
//   提示整条都可点；键盘聚焦时按钮有米白描边。
// 注意：模板内不得出现 ${ 插值（会被当成模板表达式），页面脚本只用
// var/function 写法。

export const EXE_CHAT_COLLAPSED_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>聊天</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: Georgia, 'Times New Roman', serif; background: #141A2E; }
#strip { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: space-between; height: 100%; padding: 16px 0 18px; background: linear-gradient(180deg, #1B2340 0%, #141A2E 100%); cursor: pointer; }
#strip::after { content: ""; position: absolute; top: 0; right: 0; bottom: 0; width: 1px; background: linear-gradient(180deg, rgba(198,161,91,0), rgba(198,161,91,.55) 20%, rgba(198,161,91,.55) 80%, rgba(198,161,91,0)); }
#strip:hover { background: linear-gradient(180deg, #1E2748 0%, #161D33 100%); }
.crest { position: relative; flex: none; width: 26px; height: 36px; border: 1px solid #C6A15B; display: flex; align-items: center; justify-content: center; }
.crest::after { content: ""; position: absolute; inset: 3px; border: 1px solid rgba(198,161,91,.45); }
.crest span { font-size: 17px; line-height: 1; color: #EFE7D8; }
.action { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.action .rule { width: 1px; height: 28px; background: linear-gradient(180deg, rgba(198,161,91,0), rgba(198,161,91,.6), rgba(198,161,91,0)); }
#strip button { writing-mode: vertical-rl; font-family: Georgia, 'Times New Roman', serif; font-size: 15px; letter-spacing: 2px; padding: 14px 5px; border: 1px solid #C6A15B; border-radius: 2px; background: transparent; color: #EFE7D8; cursor: pointer; transition: background .16s ease, color .16s ease; }
#strip:hover button { background: #C6A15B; color: #141A2E; }
#strip button:focus-visible { outline: 1px solid #EFE7D8; outline-offset: 2px; }
#strip .hint { writing-mode: vertical-rl; color: rgba(239,231,216,.55); font-family: Georgia, 'Times New Roman', serif; font-size: 11px; letter-spacing: 2px; }
</style>
</head>
<body>
<div id="strip" title="点一下打开 Muse 网页">
<div class="crest" aria-hidden="true"><span>M</span></div>
<div class="action">
<span class="rule" aria-hidden="true"></span>
<button id="expandBtn" type="button">展开 Muse</button>
<span class="rule" aria-hidden="true"></span>
</div>
<span class="hint">点一下打开</span>
</div>
<script>
(function () {
  function expand() {
    if (window.electronAPI && window.electronAPI.toggleChat) {
      try {
        var p = window.electronAPI.toggleChat(true);
        if (p && p.catch) { p.catch(function () {}); }
      } catch (e) {}
    }
  }
  document.getElementById('strip').addEventListener('click', expand);
})();
</script>
</body>
</html>
`;
