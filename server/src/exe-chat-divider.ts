// exe 专属分界条页（移植层，不在 client/src 内）：壳层第三视图
// （8px 分界视图，夹在左 Muse 视图与右工作台视图之间）加载的本地
// 极简页面。muse.ai 远端页面上没有拖拽手柄、也没有页内收起按钮，
// 这条分界把 1.1.6 的拖拽调宽补回来：按住左右拖动经最小 preload
// 调 setChatWidth（钳制 280–640px 与记忆都在主进程做，与原来一致）；
// 双击分界条切换收起/展开（解决页内无收起按钮的问题）。
// 样式沿用 1.1.6 手柄：8px 热区、ew-resize 光标、悬停/拖拽时金色
// 高亮（#f7c948）、常显 2px 抓手竖条。
// 拖拽用 screenX 差值算移动量：分界视图会跟着宽度一起移动，视图内
// 的 clientX 在拖动中几乎不变，拿它算宽度会算错；screenX 是屏幕
// 绝对坐标，窗口不动时差值即鼠标真实移动量。screenX 不变的极少数
// 环境回落到 movementX。双击用手动计时判定（pointerdown 里
// preventDefault 会吃掉兼容 dblclick 事件，不能依赖它）。
// 注意：模板内不得出现 ${ 插值（会被当成模板表达式），页面脚本只用
// var/function 写法；页面不含任何工作台逻辑、不读工作台 DOM。

export const EXE_CHAT_DIVIDER_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>分界</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
#divider { position: fixed; inset: 0; cursor: ew-resize; background: transparent; border-left: 1px solid #e5dcc4; touch-action: none; }
#divider:hover, #divider.dragging { background: #f7c948; border-left-color: #f7c948; }
#divider::after { content: ""; position: absolute; top: 50%; left: 3px; width: 2px; height: 48px; margin-top: -24px; background: #c9bfa4; border-radius: 1px; }
#divider:hover::after, #divider.dragging::after { background: #1f2a44; }
</style>
</head>
<body>
<div id="divider" title="按住左右拖动，调宽聊天栏；双击收起或展开"></div>
<script>
(function () {
  var divider = document.getElementById('divider');
  var api = window.electronAPI;
  var resizing = false;
  var lastScreenX = 0;
  var pendingWidth = 380;
  var movedTotal = 0;
  var lastClickUpAt = 0;
  function refreshWidth() {
    if (api && api.getChatWidth) {
      try {
        var p = api.getChatWidth();
        if (p && p.then) {
          p.then(function (r) {
            if (r && typeof r.width === 'number') { pendingWidth = r.width; }
          }).catch(function () {});
        }
      } catch (e) {}
    }
  }
  refreshWidth();
  function pushWidth(w) {
    pendingWidth = Math.round(w);
    if (api && api.setChatWidth) {
      try {
        var p = api.setChatWidth(pendingWidth);
        if (p && p.then) {
          p.then(function (r) {
            if (r && typeof r.width === 'number') { pendingWidth = r.width; }
          }).catch(function () {});
        }
      } catch (e) {}
    }
  }
  function toggleExpanded() {
    if (api && api.getChatExpanded && api.toggleChat) {
      try {
        var p = api.getChatExpanded();
        if (p && p.then) {
          p.then(function (r) {
            var q = api.toggleChat(!(r && r.expanded));
            if (q && q.catch) { q.catch(function () {}); }
          }).catch(function () {});
        }
      } catch (e) {}
    }
  }
  divider.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) { return; }
    resizing = true;
    movedTotal = 0;
    lastScreenX = e.screenX;
    refreshWidth();
    divider.classList.add('dragging');
    document.body.style.userSelect = 'none';
    try { divider.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  divider.addEventListener('pointermove', function (e) {
    if (!resizing) { return; }
    var dx = e.screenX - lastScreenX;
    if (dx === 0 && typeof e.movementX === 'number') { dx = e.movementX; }
    lastScreenX = e.screenX;
    if (dx !== 0) {
      movedTotal += Math.abs(dx);
      pushWidth(pendingWidth + dx);
    }
  });
  function endResize(e) {
    if (!resizing) { return; }
    resizing = false;
    divider.classList.remove('dragging');
    document.body.style.userSelect = '';
    if (movedTotal < 3) {
      var now = Date.now();
      if (now - lastClickUpAt < 400) {
        lastClickUpAt = 0;
        toggleExpanded();
      } else {
        lastClickUpAt = now;
      }
    } else {
      lastClickUpAt = 0;
    }
  }
  divider.addEventListener('pointerup', endResize);
  divider.addEventListener('pointercancel', endResize);
  window.addEventListener('pointerup', endResize);
})();
</script>
</body>
</html>
`;
