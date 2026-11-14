// exe 专属管理员锁屏页（移植层，不在 client/src 内）：exe 启动后先盖
// 在窗口最上层的全窗口视图加载的本地页面。首次打开设密码（只存在这
// 台电脑上），以后每次打开都要输密码才能进工作台。页面不含任何工作
// 台逻辑、不读工作台 DOM；解锁过渡由主进程里验过密码的 IPC 处理器
// 驱动，页面只拿 {ok} 做界面反馈。
//
// 设计（英伦俱乐部风格，与 #111313 窄边栏同一套语言）：
//   配色只用三样——墨蓝 #141A2E→#1B2340 纵向渐变、黄铜 #C6A15B、
//   米白 #EFE7D8；卡片 440px 宽，黄铜双线框；衬线 Georgia /
//   'Times New Roman'；直角 2px；暗红 #D98880 只做错提示。
//   卡底小字如实写清：本机锁只拦住这台电脑上的打开，全网限制还要
//   等服务器核验（见 p7 一期设计，那是下一步，本次不做）。
// 注意：模板内不得出现 ${ 插值（会被当成模板表达式），页面脚本只用
// var/function 写法。

export const EXE_ADMIN_LOCK_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>管理员登录</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: Georgia, 'Times New Roman', serif; background: #141A2E; }
#wrap { display: flex; align-items: center; justify-content: center; min-height: 100%; padding: 24px 16px; background: linear-gradient(180deg, #1B2340 0%, #141A2E 100%); }
#card { position: relative; width: 440px; max-width: 100%; padding: 36px 40px 30px; background: #1B2340; border: 1px solid rgba(198,161,91,.6); text-align: center; }
#card::after { content: ""; position: absolute; inset: 6px; border: 1px solid rgba(198,161,91,.35); pointer-events: none; }
.crest { position: relative; width: 26px; height: 36px; margin: 0 auto; border: 1px solid #C6A15B; display: flex; align-items: center; justify-content: center; }
.crest::after { content: ""; position: absolute; inset: 3px; border: 1px solid rgba(198,161,91,.45); }
.crest span { font-size: 17px; line-height: 1; color: #EFE7D8; }
h1 { margin: 20px 0 0; font-size: 20px; font-weight: normal; letter-spacing: 6px; color: #EFE7D8; }
.rule { width: 48px; height: 1px; margin: 16px auto 14px; background: #C6A15B; }
#subtitle { margin: 0 0 26px; font-size: 13px; letter-spacing: 3px; color: #C6A15B; }
#loading { margin: 26px 0; font-size: 13px; letter-spacing: 2px; color: rgba(239,231,216,.55); }
form { text-align: left; }
label { display: block; margin: 0 0 6px; font-family: system-ui, sans-serif; font-size: 12px; letter-spacing: 1px; color: rgba(239,231,216,.7); }
input[type="password"] { display: block; width: 100%; height: 44px; margin: 0 0 14px; padding: 0 12px; border: 1px solid rgba(198,161,91,.55); border-radius: 2px; background: #12172A; color: #EFE7D8; font-family: Georgia, 'Times New Roman', serif; font-size: 15px; letter-spacing: 1px; outline: none; }
input[type="password"]:focus { border-color: #C6A15B; }
input[type="password"]::placeholder { color: rgba(239,231,216,.35); }
#errorMsg { display: none; margin: -4px 0 12px; font-family: system-ui, sans-serif; font-size: 13px; line-height: 1.5; color: #D98880; }
#hint { margin: 0 0 18px; font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.6; color: rgba(239,231,216,.55); }
#submitBtn { display: block; width: 100%; height: 46px; border: none; border-radius: 2px; background: #C6A15B; color: #141A2E; font-family: Georgia, 'Times New Roman', serif; font-size: 15px; letter-spacing: 2px; cursor: pointer; }
#submitBtn:hover:not(:disabled) { background: #D4AF6A; }
#submitBtn:disabled { opacity: .65; cursor: default; }
#forgotLink { margin: 16px auto 0; padding: 0; border: none; background: none; font-family: system-ui, sans-serif; font-size: 12px; letter-spacing: 1px; color: rgba(239,231,216,.55); text-decoration: underline; cursor: pointer; }
#forgotBox { display: none; margin: 14px 0 0; padding: 12px; border: 1px solid rgba(198,161,91,.35); background: #12172A; text-align: left; font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.7; color: rgba(239,231,216,.75); }
#forgotBox code { display: block; margin-top: 6px; word-break: break-all; color: #EFE7D8; font-size: 11px; }
.foot { margin: 22px 0 0; font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.9; color: rgba(239,231,216,.55); }
.foot p { margin: 0; }
.hidden { display: none !important; }
</style>
</head>
<body>
<div id="wrap">
<div id="card">
<div class="crest" aria-hidden="true"><span>M</span></div>
<h1>剧本创作工作台</h1>
<div class="rule" aria-hidden="true"></div>
<p id="subtitle">管理员登录</p>
<p id="loading">正在确认锁定状态…</p>
<form id="lockForm" class="hidden" action="#" method="post">
<div id="fieldPassword">
<label for="password">管理员密码</label>
<input id="password" type="password" autocomplete="new-password" placeholder="请输入密码">
</div>
<div id="fieldConfirm" class="hidden">
<label for="passwordConfirm">再输一次确认</label>
<input id="passwordConfirm" type="password" autocomplete="new-password" placeholder="请再输一次密码">
</div>
<p id="errorMsg" role="alert"></p>
<p id="hint"></p>
<button id="submitBtn" type="submit">进入工作台</button>
</form>
<button id="forgotLink" type="button" class="hidden">忘记密码</button>
<div id="forgotBox"></div>
<div class="foot">
<p>只有管理员可以打开 · 项目数据仍在你的电脑上</p>
<p id="scopeNote" class="hidden">本机锁：只拦住这台电脑上的打开，全网限制还要等服务器核验</p>
</div>
</div>
</div>
<script>
(function () {
  var isFirstTime = false;
  var busy = false;
  var form = document.getElementById('lockForm');
  var loading = document.getElementById('loading');
  var subtitle = document.getElementById('subtitle');
  var passwordInput = document.getElementById('password');
  var confirmInput = document.getElementById('passwordConfirm');
  var fieldConfirm = document.getElementById('fieldConfirm');
  var errorMsg = document.getElementById('errorMsg');
  var hint = document.getElementById('hint');
  var submitBtn = document.getElementById('submitBtn');
  var forgotLink = document.getElementById('forgotLink');
  var forgotBox = document.getElementById('forgotBox');
  var scopeNote = document.getElementById('scopeNote');

  function showError(text) {
    errorMsg.textContent = text;
    errorMsg.style.display = 'block';
  }
  function clearError() {
    errorMsg.textContent = '';
    errorMsg.style.display = 'none';
  }
  function setBusy(on, text) {
    busy = on;
    submitBtn.disabled = on;
    submitBtn.textContent = on ? '正在验证…' : text;
  }
  function applyMode(firstTime) {
    isFirstTime = firstTime;
    loading.classList.add('hidden');
    form.classList.remove('hidden');
    forgotLink.classList.remove('hidden');
    if (firstTime) {
      subtitle.textContent = '设定管理员密码';
      fieldConfirm.classList.remove('hidden');
      hint.textContent = '至少 6 位，只存在这台电脑上';
      submitBtn.textContent = '设定密码并进入';
      scopeNote.classList.remove('hidden');
    } else {
      subtitle.textContent = '管理员登录';
      fieldConfirm.classList.add('hidden');
      hint.textContent = '';
      submitBtn.textContent = '进入工作台';
      scopeNote.classList.add('hidden');
    }
    passwordInput.focus();
  }
  function api() {
    return window.electronAPI || null;
  }
  function init() {
    var a = api();
    if (!a || !a.getAdminLockState) {
      loading.textContent = '锁屏只能在 exe 里打开，请用 exe 启动工作台。';
      return;
    }
    a.getAdminLockState().then(function (state) {
      applyMode(!state.set);
    }).catch(function () {
      loading.textContent = '没能确认锁定状态，请关掉重开再试。';
    });
  }
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (busy) { return; }
    var a = api();
    if (!a) { return; }
    var pw = passwordInput.value;
    var pw2 = confirmInput.value;
    clearError();
    if (isFirstTime) {
      if (!pw || pw.length < 6) { showError('密码至少 6 位，再想一个长一点的。'); return; }
      if (pw !== pw2) { showError('两次输入的密码不一样，再输一次。'); return; }
      setBusy(true, '');
      a.setAdminPassword(pw).then(function (res) {
        if (res && res.ok) { submitBtn.textContent = '正在进入…'; return; }
        setBusy(false, '设定密码并进入');
        showError((res && res.error) || '没能设好密码，再试一次。');
      }).catch(function () {
        setBusy(false, '设定密码并进入');
        showError('没能设好密码，再试一次。');
      });
      return;
    }
    if (!pw) { showError('先输入密码。'); return; }
    setBusy(true, '');
    a.unlockAdmin(pw).then(function (res) {
      if (res && res.ok) { submitBtn.textContent = '正在进入…'; return; }
      setBusy(false, '进入工作台');
      showError((res && res.error) || '密码不对，再试一次。');
      passwordInput.focus();
      passwordInput.select();
    }).catch(function () {
      setBusy(false, '进入工作台');
      showError('密码不对，再试一次。');
    });
  });
  forgotLink.addEventListener('click', function () {
    var a = api();
    if (!a || !a.getAdminLockFilePath) { return; }
    a.getAdminLockFilePath().then(function (res) {
      var path = (res && res.path) || '';
      forgotBox.innerHTML = '';
      var text = document.createElement('span');
      text.textContent = '删掉本机锁定文件就能重设：删了之后下次打开会让你重新设一个密码，项目数据不受影响。';
      var code = document.createElement('code');
      code.textContent = path;
      forgotBox.appendChild(text);
      forgotBox.appendChild(code);
      forgotBox.style.display = 'block';
    }).catch(function () {});
  });
  init();
})();
</script>
</body>
</html>
`;
