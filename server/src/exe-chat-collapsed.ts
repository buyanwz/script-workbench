// exe 专属窄边页（移植层，不在 client/src 内）：左视图收起时（36px）
// 加载的本地页面。整条窄边可点，点一下经最小 preload 调 toggleChat(true)
// 展开左视图、加载真正的 muse.ai 网页。样式沿用旧聊天页窄边条的配色
// （藏青底 #1f2a44 + 金色按钮 #f7c948），与原来窄边协调。
// 注意：模板内不得出现 ${ 插值（会被当成模板表达式），页面脚本只用
// var/function 写法；页面不含任何工作台逻辑、不读工作台 DOM。

export const EXE_CHAT_COLLAPSED_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>聊天</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: system-ui, sans-serif; background: #1f2a44; }
#strip { display: flex; flex-direction: column; align-items: center; height: 100%; padding-top: 12px; gap: 10px; background: #1f2a44; cursor: pointer; }
#strip button { writing-mode: vertical-rl; font-size: 15px; padding: 12px 6px; border: none; border-radius: 8px; background: #f7c948; color: #1f2a44; cursor: pointer; }
#strip .hint { writing-mode: vertical-rl; color: #cfd6e4; font-size: 12px; }
#strip .dot { width: 8px; height: 8px; border-radius: 50%; background: #f7c948; }
</style>
</head>
<body>
<div id="strip" title="点一下打开 Muse 网页">
<span class="dot"></span>
<button id="expandBtn" type="button">展开 Muse</button>
<span class="hint">点一下打开 Muse 网页</span>
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
