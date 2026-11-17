/* laoluo-diagnostics v6.50 */
/* ---------------------------------------------------------------------------
   牢络生成平台 · 加载诊断脚本（工作台侧工具，不是平台本体的一部分）

   本文件由 laoluo/prepare.mjs 在构建期读入、内联注入到 platform.html
   的 <head> 末尾，永远跑在平台主程序（body 里那段脚本）之前。职责只有
   一件：把「平台加载走到哪一步、卡在哪、出什么错」通过 postMessage
   报给父页面（工作台 wrapper，client/src/videogen.tsx），让加载失败
   不再是静默黑屏。

   上报通道：固定 channel "laoluo-diag" + build 标识；父页面会校验
   event.source（必须是平台 iframe 的 window）与 event.origin。
   本脚本不读平台的任何业务数据：localStorage 只写一个自己的测试键
   随即删掉，探查存储是否可用，不碰 llpub-* 等平台键。

   为什么内联而不是外联 <script src>：platform.html 打包时是带内容
   哈希的 assets 静态资源（platform-<hash>.html），外联诊断文件同理
   会被改成哈希名，而 prepare.mjs 在打包之前运行、算不出哈希，
   写进 platform.html 的相对地址必然对不上、迟早 404。内联是这条
   构建管线里唯一可重复的做法。代价与信号：若平台文档自身的 CSP
   连内联脚本都拦，本脚本同样跑不起来——但「iframe 已导航、诊断
   boot 却没到」本身就是父页面能判读的明确信号（平台主程序也是
   内联脚本，同命），诊断面板会照实显示卡在这一阶段。
   --------------------------------------------------------------------------- */
(function () {
  "use strict";
  var CHANNEL = "laoluo-diag";
  var BUILD = "v6.50";
  var startedAt = Date.now();

  function send(type, data) {
    var msg = { channel: CHANNEL, build: BUILD, type: type, at: Date.now() };
    if (data) {
      for (var k in data) {
        if (Object.prototype.hasOwnProperty.call(data, k)) msg[k] = data[k];
      }
    }
    try {
      window.parent.postMessage(msg, "*");
    } catch (e) {
      /* 父页面不可达时无声放弃：诊断不能反过来弄坏平台 */
    }
  }

  /* 1) 平台脚本 / 资源报错（含主程序启动异常） */
  window.addEventListener(
    "error",
    function (e) {
      if (e && e.message) {
        send("error", {
          message: String(e.message),
          filename: String(e.filename || ""),
          lineno: e.lineno || 0,
          colno: e.colno || 0,
        });
      } else if (e && e.target && e.target !== window) {
        var t = e.target;
        send("error", {
          message:
            "资源加载失败：" +
            String(t.tagName || "resource") +
            " " +
            String(t.src || t.href || ""),
          filename: String(t.src || t.href || ""),
          lineno: 0,
          colno: 0,
        });
      }
    },
    true,
  );
  window.addEventListener("unhandledrejection", function (e) {
    var r = e ? e.reason : null;
    send("error", {
      message:
        "未处理的异步错误：" +
        (r && r.message ? String(r.message) : String(r)),
      filename: "",
      lineno: 0,
      colno: 0,
    });
  });

  /* 2) 本文档的 CSP 违规（如内联脚本被拦、资源被拦） */
  document.addEventListener("securitypolicyviolation", function (e) {
    send("csp", {
      directive: String(e.violatedDirective || e.effectiveDirective || ""),
      blockedURI: String(e.blockedURI || ""),
      disposition: String(e.disposition || ""),
    });
  });

  /* 3) 存储探查：只写自己的测试键、随即删除，不读任何业务数据 */
  var storage = "unknown";
  try {
    var probeKey = "__laoluo_diag_probe__";
    window.localStorage.setItem(probeKey, "1");
    var probeVal = window.localStorage.getItem(probeKey);
    window.localStorage.removeItem(probeKey);
    storage = probeVal === "1" ? "ok" : "failed";
  } catch (err) {
    storage = "failed";
  }

  /* 4) boot：脚本已启动（这条没到 = 内联脚本没跑起来） */
  send("boot", {
    storage: storage,
    vw: window.innerWidth || 0,
    vh: window.innerHeight || 0,
    ua: String(navigator.userAgent || ""),
    path: String(window.location.pathname || ""),
  });

  /* 5) 渲染观测：轮询平台根节点 #app 是否真正挂载出内容。
        只看通用结构（节点存在 / 子节点数 / 尺寸），不依赖平台内部
        类名或文案，平台换版改内部实现也不影响这段检测。 */
  var lastState = { appExists: false, children: 0, w: 0, h: 0 };
  function observe() {
    var app = document.getElementById("app");
    var state = {
      appExists: !!app,
      children: app ? app.childElementCount : 0,
      w: 0,
      h: 0,
    };
    if (app) {
      var rect = app.getBoundingClientRect();
      state.w = Math.round(rect.width);
      state.h = Math.round(rect.height);
    }
    lastState = state;
    if (state.appExists && state.children > 0 && state.w > 0 && state.h > 0) {
      send("app-ready", state);
      return true;
    }
    return false;
  }
  var timer = window.setInterval(function () {
    if (observe()) {
      window.clearInterval(timer);
      return;
    }
    if (Date.now() - startedAt >= 20000) {
      window.clearInterval(timer);
      send("render-timeout", lastState);
    }
  }, 500);
})();
