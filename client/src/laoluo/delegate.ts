// 牢络生成平台 · 直接挂载的运行时支撑（v6.51）
//
// 平台本体（generated.js）渲染出的 HTML 大量使用内联 on* 属性。
// 这些处理器在本架构里只能由委托执行，原因有两层：
//   - 线上 CSP 不允许内联事件处理器时，属性只是 inert 的字符串；
//   - 即使环境允许内联处理器编译，处理器按名字找的是全局函数，
//     而平台函数都关在 bootLaoluo 的作用域里、没挂 window——原生
//     处理器一律报「xxx is not defined」（沙箱实测）。所以不存在
//     「原生可用就走原生」这条路，委托是唯一执行路径。
// 本模块负责三件事：
//   1. 探针：启动前先测「原生内联处理器能不能编译」「style 属性
//      是否生效」，结果只进诊断区（style 探针决定水合是否开启）。
//   2. 事件委托：在宿主元素上挂 9 个捕获阶段监听器做祖先遍历
//      委托——从 event.target 逐层向上执行每层的 on* 表达式，遇
//      event.cancelBubble 即停（保真平台 19 处 stopPropagation 的
//      语义）；派发过处理器的事件在派发完后 stopPropagation，
//      不再下到目标元素：原生 on* 即使被编译也不会再触发，有且
//      仅有一路生效，绝不双重触发，也不会刷 ReferenceError。
//      blur 例外要单独处理：它不冒泡、走 focusout 派发拦不住目标
//      元素自己的原生 onblur，另挂一个 blur 捕获屏蔽（只拦截、
//      不派发，执行仍归 focusout）。
//      平台没有任何元素级 / 文档级 addEventListener（已核查），
//      捕获阶段拦截不会饿死它自己的监听器。表达式解析只认白名单
//      形式，解析失败或函数缺失时大声报错（回调给 wrapper 显示
//      红色横幅），只跳过当前语句 / 节点，继续走完祖先链，绝不
//      静默吞掉。
//   3. style 水合：style 属性被 CSP 剥离时，用一个只管新节点的轻量
//      MutationObserver 把 style 属性值同步到 el.style.cssText。
//
// 解析器文法与 sync.mjs 的构建时模板审计严格同口径：语句只认
// event.stopPropagation() / event.preventDefault() /
// this.value='...' / fnName(参数...)；参数只认 event / this /
// this.files / this.checked / this.value / true / false / null /
// undefined / 字符串 / 数字，其余一律抛错。

export type LaoluoHandlers = Record<string, (...args: never[]) => unknown>;

export interface HandlerError {
  eventType: string;
  /** 出错元素的大致描述（标签 + 类名）。 */
  element: string;
  /** 处理器表达式原文。 */
  expr: string;
  /** 出错原因。 */
  reason: string;
  at: number;
}

type ErrorSink = (err: HandlerError) => void;

/** 委托事件 → 平台内联属性名（focusout 对应 onblur，blur 不冒泡）。
 *  v6.54 起补 pointermove / pointerup / pointerover / pointerout：
 *  小地图拖拽（down/move/up）与卡片悬浮高亮连线（over/out）要用，
 *  仍走同一套祖先遍历委托与白名单文法，没有第二条执行路径。 */
const EVENT_TO_ATTR: Record<string, string> = {
  click: "onclick",
  contextmenu: "oncontextmenu",
  pointerdown: "onpointerdown",
  pointermove: "onpointermove",
  pointerup: "onpointerup",
  pointerover: "onpointerover",
  pointerout: "onpointerout",
  dblclick: "ondblclick",
  input: "oninput",
  change: "onchange",
  keydown: "onkeydown",
  wheel: "onwheel",
  focusout: "onblur",
};

/** 引号感知的切分：字符串里的分隔符不切，括号深度 >0 时不切。 */
function splitAware(text: string, sep: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function resolveArg(token: string, el: Element, event: Event): unknown {
  const t = token.trim();
  if (t === "event") return event;
  if (t === "this") return el;
  if (t === "this.files") return (el as HTMLInputElement).files;
  if (t === "this.checked") return (el as HTMLInputElement).checked;
  if (t === "this.value") return (el as HTMLInputElement).value;
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (t === "undefined") return undefined;
  if (
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2) ||
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2)
  ) {
    return t.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  throw new Error("参数形式不在白名单内：" + t);
}

function describeEl(el: Element): string {
  const cls = (el.getAttribute("class") ?? "").trim().split(/\s+/).slice(0, 2).join(".");
  return el.tagName.toLowerCase() + (cls ? "." + cls : "");
}

/** 执行一个节点上的一段 on* 表达式；逐语句容错，错误经 onError 上报。 */
function runExpr(
  expr: string,
  el: Element,
  event: Event,
  handlers: LaoluoHandlers,
  onError: ErrorSink,
): void {
  for (const rawStmt of splitAware(expr, ";")) {
    const stmt = rawStmt.trim();
    if (!stmt) continue;
    try {
      if (stmt === "event.stopPropagation()") {
        event.stopPropagation();
        continue;
      }
      if (stmt === "event.preventDefault()") {
        event.preventDefault();
        continue;
      }
      const assign = stmt.match(/^this\.value\s*=\s*([\s\S]+)$/);
      if (assign) {
        const v = resolveArg((assign[1] ?? "").trim(), el, event);
        (el as HTMLInputElement).value = typeof v === "string" ? v : String(v ?? "");
        continue;
      }
      const call = stmt.match(/^([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/);
      if (!call) throw new Error("语句形式无法识别：" + stmt);
      const fnName = call[1] ?? "";
      const fn = handlers[fnName];
      if (typeof fn !== "function") {
        throw new Error("平台函数字典里没有这个函数：" + fnName);
      }
      const argsText = (call[2] ?? "").trim();
      const args =
        argsText === ""
          ? []
          : splitAware(argsText, ",").map((a) => resolveArg(a, el, event));
      (fn as (...a: unknown[]) => unknown).apply(el, args);
    } catch (e) {
      onError({
        eventType: event.type,
        element: describeEl(el),
        expr,
        reason: e instanceof Error ? e.message : String(e),
        at: Date.now(),
      });
    }
  }
}

/**
 * 在宿主上挂委托监听器（EVENT_TO_ATTR 里每种事件各一个，捕获阶段）。返回摘除函数。
 * 祖先遍历：从 event.target 走到宿主为止，每层有对应 on* 属性就
 * 执行；每层执行完检查 event.cancelBubble，true 就停。本次事件
 * 只要派发过任何一个处理器，派发完就 stopPropagation 把事件拦在
 * 宿主这一层，不再下到目标元素——原生内联处理器（若被环境编译）
 * 不会再触发，平台函数也不会因原生按名查找失败刷出报错。
 */
export function attachDelegation(
  host: HTMLElement,
  handlers: LaoluoHandlers,
  onError: ErrorSink,
): () => void {
  const removers: (() => void)[] = [];
  for (const [type, attr] of Object.entries(EVENT_TO_ATTR)) {
    const listener = (event: Event) => {
      let node: Element | null =
        event.target instanceof Element ? event.target : null;
      let dispatched = false;
      while (node) {
        const expr = node.getAttribute(attr);
        if (expr) {
          dispatched = true;
          runExpr(expr, node, event, handlers, onError);
        }
        if (event.cancelBubble) break;
        if (node === host) break;
        node = node.parentElement;
      }
      if (dispatched) event.stopPropagation();
    };
    // capture：宿主在事件下到目标元素之前先接住；wheel 还必须
    // 非 passive，平台的 wheelZoom 要 preventDefault。
    const options: AddEventListenerOptions =
      type === "wheel" ? { capture: true, passive: false } : { capture: true };
    host.addEventListener(type, listener, options);
    removers.push(() => host.removeEventListener(type, listener, options));
  }
  // blur 不冒泡：focusout 那一路的派发拦不住目标元素自己的原生
  // onblur——blur 是独立事件、在它自己的目标阶段触发内联处理器
  // （沙箱实测点缩放框失焦时刷出「onZoomBlur is not defined」）。
  // 单独给 blur 挂捕获阶段屏蔽：路径上有 onblur 就拦下不让它下到
  // 目标，执行仍归 focusout 派发那一路（只执行一次）。
  const blurShield = (event: Event) => {
    let node: Element | null =
      event.target instanceof Element ? event.target : null;
    while (node) {
      if (node.getAttribute("onblur")) {
        event.stopPropagation();
        break;
      }
      if (node === host) break;
      node = node.parentElement;
    }
  };
  host.addEventListener("blur", blurShield, { capture: true });
  removers.push(() =>
    host.removeEventListener("blur", blurShield, { capture: true }),
  );
  return () => {
    for (const off of removers) off();
  };
}

/**
 * 探针 1：原生内联处理器是否可编译。在宿主内放一个隐藏按钮，
 * onclick 写一个临时全局函数的调用，程序点击一次看是否触发。
 * 探完即清理（节点删除、临时全局删除），不留污染。
 * 结果只作诊断显示：即使可编译，平台的处理器也调不到关在
 * bootLaoluo 作用域里的函数，执行一律走委托（见文件头）。
 * 必须在挂委托之前调用（否则委托会把探针表达式当坏处理器上报）。
 */
export function probeNativeInline(host: HTMLElement): boolean {
  const w = window as unknown as Record<string, unknown>;
  const key = "__laoluoInlineProbe__";
  let fired = false;
  w[key] = () => {
    fired = true;
  };
  const btn = document.createElement("button");
  btn.setAttribute("onclick", key + "()");
  btn.setAttribute("aria-hidden", "true");
  btn.tabIndex = -1;
  btn.style.display = "none";
  host.appendChild(btn);
  try {
    btn.click();
  } catch {
    /* 点击异常按未触发处理 */
  }
  btn.remove();
  delete w[key];
  return fired;
}

/**
 * 探针 2：style 属性是否生效（style-src-attr 是否拦截）。
 * 放一个带 style="width:7px" 的节点，读计算样式核对。
 */
export function probeStyleAttr(host: HTMLElement): boolean {
  const el = document.createElement("div");
  el.setAttribute("style", "width:7px");
  el.setAttribute("aria-hidden", "true");
  host.appendChild(el);
  let ok = false;
  try {
    ok = window.getComputedStyle(el).width === "7px";
  } catch {
    ok = false;
  }
  el.remove();
  return ok;
}

/**
 * style 水合：只观察新增节点，把带 style 属性的节点（含其后代）
 * 的属性值同步到 el.style.cssText。平台用 CSSOM 属性做的拖拽 /
 * 缩放更新不在观察范围（只听 childList），不会被覆盖回去。
 */
export function startStyleHydration(host: HTMLElement): MutationObserver {
  const apply = (el: Element) => {
    const attr = el.getAttribute("style");
    if (attr && el instanceof HTMLElement && el.style.cssText !== attr) {
      el.style.cssText = attr;
    }
  };
  const walk = (root: Element) => {
    apply(root);
    root.querySelectorAll("[style]").forEach(apply);
  };
  walk(host);
  const obs = new MutationObserver((muts) => {
    for (const mu of muts) {
      mu.addedNodes.forEach((n) => {
        if (n instanceof Element) walk(n);
      });
    }
  });
  obs.observe(host, { childList: true, subtree: true });
  return obs;
}
