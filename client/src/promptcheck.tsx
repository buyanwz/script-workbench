// ---------------------------------------------------------------------------
// v5.92 「提示词检查」页（顶栏第五台，Bench = promptcheck）：把提示词
// 的检查方式从「导出时按词表闷头替换」改成「点进页面、粘贴、查询」。
//
// 布局 = 左右两框（手机上下堆叠）：
//   左框：粘贴要检查的提示词。打字时先用本机防版权替换表（内置 +
//   用户自定义，copyrightguard.tsx 同一份）在本机即时扫一遍，命
//   中的词直接标出来；点「开始检查」由本页把全文按约 1200 字切
//   成小段、一段调一次服务端 checkPromptCopyright 做 AI 通读检查
//   （v5.93：旧做法是服务端在单次动作调用里串行跑多段，长提示词
//   整次调用被网关超时掐断、什么结果都没有；改成一段一调后，每
//   次调用只跑一段，检查中显示真实进度、某段失败可单独重试一次
//   且不拖垮整单，合并在本页完成。v5.96 提速：各段改为最多 3 段
//   同时查、某段查完立刻补下一段，进度改显示已完成段数；合并仍
//   按原文段序、口径与 v5.93 一致）。
//   右框：检查结果——逐处列清哪一句有问题、在哪儿、是什么版权 / 商
//   标 / 真实人物、为什么会被平台拦、应该怎么改；下面给一份改好的
//   完整提示词（可复制、可一键放回左框再查一遍），改了哪几处逐条列
//   出来对账。
//
// 两条硬性规则（用户亲口定，写死在服务端检查指令里，本页也常驻
// 显示）：①台词的意思不许改——台词里的风险词只许换同音字（谐
// 音）；②人物造型不许改——造型描写原样保留，只许换掉造型句里夹
// 带的 IP 名称。结果区带 AI 自检两枚标记（台词意思未改 / 人物造型
// 未改），自检没过会红字提醒人工核对。
//
// 本页不存任何数据：粘贴内容与检查结果只在本页内存里，刷新即没；
// 不动任何项目 / 剧本 / 分镜数据，不提交任何生图。
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { api, type ApiResponse } from "./api";
import {
  describeThrownError,
  isGatewayTimeoutError,
  isGatewayTimeoutText,
} from "./gateway";
import { copyText } from "./scriptlib";
import {
  COPYRIGHT_GUARD_BUILTIN,
  COPYRIGHT_GUARD_STATEMENT,
  loadCopyrightGuardCustom,
  type CopyrightGuardPair,
} from "./copyrightguard";

type CheckResult = ApiResponse<typeof api, "checkPromptCopyright">;
type SegResult = CheckResult;

const MAX_TEXT = 20000;

/** 网关超时给用户看的大白话（不再把 Gateway request timed out 这类英文原文甩给用户）。 */
const TIMEOUT_FRIENDLY =
  "这次检查超时了，AI 那边这会儿比较慢，可以过一会儿再点一次，或把提示词拆成两段分别检查。";

/**
 * 把全文按行切成每段约 1200 字的小段（单行超长的按字数硬切），
 * 返回每段在原文中的起止偏移——合并时按偏移把各段改好的文本与
 * 段间原文拼回整篇，未查完的段用原文占位。
 */
function splitSegments(text: string): { start: number; end: number }[] {
  const TARGET = 1200;
  const ranges: { start: number; end: number }[] = [];
  let curStart = -1;
  let curEnd = -1;
  const pushCur = () => {
    if (curStart >= 0) {
      ranges.push({ start: curStart, end: curEnd });
      curStart = -1;
    }
  };
  let offset = 0;
  for (const line of text.split("\n")) {
    const ls = offset;
    const le = offset + line.length;
    if (line.length > TARGET) {
      pushCur();
      for (let i = 0; i < line.length; i += TARGET) {
        ranges.push({ start: ls + i, end: Math.min(le, ls + i + TARGET) });
      }
    } else {
      if (curStart >= 0 && le - curStart > TARGET) pushCur();
      if (curStart < 0) curStart = ls;
      curEnd = le;
    }
    offset = le + 1;
  }
  pushCur();
  if (ranges.length === 0) ranges.push({ start: 0, end: text.length });
  return ranges;
}

/** 本机词表即时扫描：合并口径与 applyCopyrightGuard 一致（自定义优先）。 */
function scanLocalHits(text: string): CopyrightGuardPair[] {
  if (!text.trim()) return [];
  const custom = loadCopyrightGuardCustom();
  const customFroms = new Set(custom.map((p) => p.from));
  const merged: CopyrightGuardPair[] = [
    ...custom,
    ...COPYRIGHT_GUARD_BUILTIN.filter((p) => !customFroms.has(p.from)),
  ].filter((p) => p.from.length > 0);
  return merged.filter((p) => text.includes(p.from));
}

export function PromptCheckBench() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checkedText, setCheckedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [withStatement, setWithStatement] = useState(true);
  const [copied, setCopied] = useState(false);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const [movedNote, setMovedNote] = useState<string | null>(null);

  const localHits = useMemo(() => scanLocalHits(text), [text]);
  const stale = result !== null && checkedText !== text;

  const displayFixed = useMemo(() => {
    if (!result || !result.ok) return "";
    const base = result.fixedText;
    if (!withStatement) return base;
    if (!base.trim() || base.includes("版权与原创声明")) return base;
    return `${base.replace(/\s+$/, "")}\n${COPYRIGHT_GUARD_STATEMENT}`;
  }, [result, withStatement]);

  async function runCheck() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    setMovedNote(null);
    // v5.93：本页先按约 1200 字切段，一段调一次检查动作（一次调用
    // 只查一段，网关等得了）；某段失败单独重试一次，仍失败就记未
    // 查完、不拖垮整单；合并在本页做。
    // v5.96 提速：各段改为最多 3 段同时查（并发上限 3，某段查完立
    // 刻补下一段），进度显示已完成段数；合并仍严格按原文段序。
    const ranges = splitSegments(text);
    const total = ranges.length;
    const segResults: (SegResult | null)[] = ranges.map(() => null);
    let lastErrorText = "";
    let lastWasTimeout = false;
    let doneSegs = 0;
    const checkSegment = async (i: number) => {
      const range = ranges[i]!;
      const segText = text.slice(range.start, range.end);
      const segHits = localHits.filter((h) => segText.includes(h.from));
      for (let attempt = 0; attempt < 2 && !segResults[i]; attempt++) {
        try {
          const res = await api.checkPromptCopyright({
            text: segText,
            knownHits: segHits.map((h) => ({ from: h.from, to: h.to })),
            segmented: total > 1,
          });
          if (res.ok) {
            segResults[i] = res;
          } else {
            lastErrorText = res.error ?? "";
            lastWasTimeout = isGatewayTimeoutText(lastErrorText);
          }
        } catch (e) {
          lastWasTimeout = isGatewayTimeoutError(e);
          lastErrorText = describeThrownError(e);
        }
      }
      doneSegs += 1;
      setProgress({ done: doneSegs, total });
    };
    try {
      setProgress({ done: 0, total });
      let nextSeg = 0;
      const worker = async () => {
        while (nextSeg < total) {
          const i = nextSeg;
          nextSeg += 1;
          await checkSegment(i);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(3, total) }, () => worker()),
      );
      const doneCount = segResults.filter((r) => r !== null).length;
      if (doneCount === 0) {
        setResult(null);
        setError(
          lastWasTimeout || isGatewayTimeoutText(lastErrorText)
            ? TIMEOUT_FRIENDLY
            : lastErrorText || "检查没完成，请再试一次。",
        );
        return;
      }
      const failedCount = total - doneCount;
      // 合并口径与旧服务端分段一致：问题片段与改动都已在各段原文里
      // 逐字验过；改好的全文按原文偏移把各段改好文本与段间原文拼
      // 回整篇，未查完的段保持原文；两枚自检取各段的与。
      const issues: CheckResult["issues"] = [];
      const changes: CheckResult["changes"] = [];
      const summaries: string[] = [];
      let fixedText = "";
      let cursor = 0;
      let dialogueIntact = true;
      let lookIntact = true;
      for (let i = 0; i < total; i++) {
        const range = ranges[i]!;
        const res = segResults[i];
        fixedText += text.slice(cursor, range.start);
        if (res) {
          issues.push(...res.issues);
          changes.push(...res.changes);
          const s = res.summary.trim();
          if (s && !summaries.includes(s)) summaries.push(s);
          fixedText += res.fixedText;
          dialogueIntact = dialogueIntact && res.dialogueIntact;
          lookIntact = lookIntact && res.lookIntact;
        } else {
          fixedText += text.slice(range.start, range.end);
        }
        cursor = range.end;
      }
      fixedText += text.slice(cursor);
      setResult({
        ok: true,
        error: null,
        summary: summaries.join("；").slice(0, 300),
        note:
          failedCount > 0
            ? `有 ${failedCount} 段没查完（AI 那边超时或出错），下面是其余 ${doneCount} 段的结果，还不完整；改好的提示词里没查完的部分保持原样，把那部分单独粘出来再查一次更稳。`
            : "",
        issues: issues.slice(0, 30),
        changes: changes.slice(0, 40),
        fixedText,
        dialogueIntact,
        lookIntact,
      });
      setCheckedText(text);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function pasteFromClipboard() {
    setPasteHint(null);
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        setText(t.slice(0, MAX_TEXT));
        setMovedNote(null);
      } else {
        setPasteHint("剪贴板是空的，没粘进来。");
      }
    } catch {
      setPasteHint(
        "浏览器不让直接读剪贴板：在左框里长按（手机）或按 Ctrl+V（电脑）粘贴就行。",
      );
    }
  }

  async function copyFixed() {
    if (!displayFixed) return;
    const ok = await copyText(displayFixed);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  }

  function moveFixedToLeft() {
    if (!result || !result.ok) return;
    setText(result.fixedText.slice(0, MAX_TEXT));
    setMovedNote("已把改好的提示词放到左框，可以再点一次「开始检查」确认干净了。");
  }

  function clearAll() {
    setText("");
    setResult(null);
    setCheckedText("");
    setError(null);
    setPasteHint(null);
    setMovedNote(null);
  }

  return (
    <section aria-label="提示词检查">
      <div className="mb-4">
        <h1 className="font-display text-xl font-black leading-7">提示词检查</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--dim)]">
          把要拿去生成的提示词粘到左框，点「开始检查」：右边会逐处告诉你哪里违规、哪里侵权、为什么会被拦，并给出一份改好的提示词。
        </p>
        <div
          className="mt-3 flex flex-wrap gap-2 text-xs leading-5"
          role="note"
          aria-label="检查的两条硬性规则"
        >
          <span
            className="rounded-full border px-3 py-1 font-bold"
            style={{ borderColor: "var(--terra)", color: "var(--terra)", background: "var(--accent-soft)" }}
          >
            硬性规则 1：台词意思不许改，只能用谐音换字
          </span>
          <span
            className="rounded-full border px-3 py-1 font-bold"
            style={{ borderColor: "var(--terra)", color: "var(--terra)", background: "var(--accent-soft)" }}
          >
            硬性规则 2：人物造型不许改，只换造型里夹带的 IP 名字
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 左框：粘贴原文 */}
        <div className="card flex flex-col" aria-label="原始提示词（左框）">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold">原始提示词</h2>
            <span className="text-xs text-[var(--dim)]">
              {text.length} / {MAX_TEXT} 字
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                className="btn btn-sm"
                aria-label="从剪贴板粘贴到左框"
                onClick={() => void pasteFromClipboard()}
              >
                粘贴
              </button>
              <button
                type="button"
                className="btn btn-sm"
                aria-label="清空左框和检查结果"
                onClick={clearAll}
                disabled={!text && !result}
              >
                清空
              </button>
            </div>
          </div>
          <label className="sr-only" htmlFor="prompt-check-input">
            把要检查的提示词粘贴到这里
          </label>
          <textarea
            id="prompt-check-input"
            className="field mt-3 h-72 w-full flex-1 lg:h-[430px]"
            placeholder="把要检查的提示词粘贴到这里（分镜提示词、封面提示词、单段镜头提示词都可以）"
            value={text}
            maxLength={MAX_TEXT}
            onChange={(e) => {
              setText(e.target.value);
              setMovedNote(null);
            }}
          />
          {pasteHint && (
            <p className="mt-2 text-xs leading-5 text-[var(--dim)]" role="status">
              {pasteHint}
            </p>
          )}
          {movedNote && (
            <p className="mt-2 text-xs leading-5" style={{ color: "var(--olive)" }} role="status">
              {movedNote}
            </p>
          )}
          {/* 本机词表即时扫描（不联网、不用 AI） */}
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
            {localHits.length === 0 ? (
              <p className="text-xs leading-5 text-[var(--dim)]">
                本机替换表先扫了一遍：暂时没扫到已知的风险词（不代表一定没问题，完整检查点下面按钮）。
              </p>
            ) : (
              <>
                <p className="text-xs font-bold leading-5">
                  本机替换表先扫到 {localHits.length} 处已知风险词：
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {localHits.slice(0, 12).map((h) => (
                    <li
                      key={h.from}
                      className="rounded-full border px-2.5 py-0.5 text-xs leading-5"
                      style={{ borderColor: "var(--bad)", color: "var(--bad)", background: "var(--bad-soft)" }}
                    >
                      {h.from} → {h.to === "" ? "（删掉）" : h.to}
                    </li>
                  ))}
                  {localHits.length > 12 && (
                    <li className="px-1 py-0.5 text-xs leading-5 text-[var(--dim)]">
                      还有 {localHits.length - 12} 处，检查时会一并处理
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-lg mt-4 w-full"
            aria-label="开始检查这段提示词的版权风险"
            disabled={!text.trim() || busy}
            onClick={() => void runCheck()}
          >
            {busy && progress && progress.total > 1
              ? `正在检查，已查完 ${progress.done} / 共 ${progress.total} 段…`
              : busy
                ? "正在检查，请稍等…"
                : "开始检查"}
          </button>
          <p className="mt-2 text-xs leading-5 text-[var(--dim)]">
            检查由 AI 通读全文进行：短提示词一般几十秒，长提示词会切成小段、最多 3 段同时查；检查结果只在本页显示，不保存、不动你的任何项目数据。
          </p>
        </div>

        {/* 右框：检查结果 */}
        <div className="card flex flex-col" aria-label="检查结果（右框）">
          <h2 className="text-base font-bold">检查结果</h2>

          {busy && (
            <div className="mt-4" role="status" aria-label="正在检查">
              <p className="text-sm leading-6">
                {progress && progress.total > 1
                  ? `已查完 ${progress.done} / 共 ${progress.total} 段，逐处找风险点…`
                  : "正在通读这段提示词、逐处找风险点…"}
              </p>
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full"
                style={{ background: "var(--surface-alt)" }}
                aria-hidden="true"
              >
                <div className="gen-progress-indet">
                  <div
                    className="h-full w-[30%] rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--dim)]">
                长提示词会切成小段、最多 3 段同时查，别关页面。
              </p>
            </div>
          )}

          {!busy && error && (
            <div className="mt-4" role="alert">
              <p className="text-sm font-bold leading-6" style={{ color: "var(--bad)" }}>
                这次没检查成
              </p>
              <p className="mt-1 break-words text-sm leading-6 text-[var(--dim)]">{error}</p>
              <button
                type="button"
                className="btn mt-3"
                aria-label="重新检查"
                disabled={!text.trim()}
                onClick={() => void runCheck()}
              >
                再检查一次
              </button>
            </div>
          )}

          {!busy && !error && !result && (
            <p className="mt-4 text-sm leading-6 text-[var(--dim)]">
              还没检查。把提示词粘到左框，点「开始检查」，这里会逐处列出：哪里违规、哪里侵权、为什么会被拦、应该怎么改，最后给一份改好的完整提示词。
            </p>
          )}

          {!busy && result && result.ok && (
            <div className="mt-3 flex min-h-0 flex-1 flex-col">
              {stale && (
                <p
                  className="mb-3 rounded-[var(--radius)] border px-3 py-2 text-xs leading-5"
                  style={{ borderColor: "var(--bad)", color: "var(--bad)", background: "var(--bad-soft)" }}
                  role="status"
                >
                  左框内容已经改动了，下面是上一次检查的结果；要按现在的文本重新查，点左框下的「开始检查」。
                </p>
              )}
              {result.note && (
                <p
                  className="mb-3 rounded-[var(--radius)] border px-3 py-2 text-xs leading-5"
                  style={{ borderColor: "var(--bad)", color: "var(--bad)", background: "var(--bad-soft)" }}
                  role="status"
                >
                  {result.note}
                </p>
              )}
              <p className="text-sm font-bold leading-6">
                {result.issues.length === 0
                  ? "没查出会被拦的风险点"
                  : `共查出 ${result.issues.length} 处风险`}
              </p>
              {result.summary && (
                <p className="mt-1 text-sm leading-6 text-[var(--dim)]">{result.summary}</p>
              )}

              {/* 逐处问题清单 */}
              {result.issues.length > 0 && (
                <ol className="mt-3 space-y-3">
                  {result.issues.map((it, i) => (
                    <li
                      key={`${i}-${it.quote}`}
                      className="rounded-[var(--radius)] border p-3"
                      style={{ borderColor: "var(--border)", background: "var(--surface-alt)" }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="rounded px-2 py-0.5 text-xs font-bold leading-5"
                          style={{ background: "var(--bad-soft)", color: "var(--bad)" }}
                        >
                          {it.kind}
                        </span>
                        <span className="text-xs leading-5 text-[var(--dim)]">{it.location}</span>
                      </div>
                      <p className="mt-2 break-words text-sm font-bold leading-6">
                        「{it.quote}」
                      </p>
                      <p className="mt-1 text-sm leading-6">
                        <span className="font-bold">问题：</span>
                        {it.reason}
                      </p>
                      <p className="mt-1 text-sm leading-6">
                        <span className="font-bold">解决办法：</span>
                        {it.solution}
                      </p>
                    </li>
                  ))}
                </ol>
              )}

              {/* 硬性规则自检 */}
              <div className="mt-4 flex flex-wrap gap-2 text-xs leading-5" aria-label="硬性规则自检结果">
                <span
                  className="chip-check"
                  data-state={result.dialogueIntact ? "ok" : "bad"}
                >
                  {result.dialogueIntact
                    ? "AI 自检：台词意思未改 ✓"
                    : "AI 自检：台词可能被改了意思，请人工核对"}
                </span>
                <span
                  className="chip-check"
                  data-state={result.lookIntact ? "ok" : "bad"}
                >
                  {result.lookIntact
                    ? "AI 自检：人物造型未改 ✓"
                    : "AI 自检：人物造型可能被改动，请人工核对"}
                </span>
              </div>
              {(!result.dialogueIntact || !result.lookIntact) && (
                <p className="mt-2 text-xs leading-5" style={{ color: "var(--bad)" }} role="alert">
                  自检没通过：下面这份改好的提示词先别直接用，对照下面的改动清单逐处核对，确认台词意思和人物造型没被动过再用。
                </p>
              )}

              {/* 改动清单 */}
              {result.changes.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-bold">改动清单（共 {result.changes.length} 处）</h3>
                  <ul className="mt-2 space-y-1.5">
                    {result.changes.map((c, i) => (
                      <li key={`${i}-${c.from}`} className="break-words text-sm leading-6">
                        <span style={{ color: "var(--bad)" }}>{c.from}</span>
                        <span aria-hidden="true" className="mx-1 text-[var(--dim)]">→</span>
                        <span style={{ color: "var(--olive)" }}>
                          {c.to === "" ? "（删掉）" : c.to}
                        </span>
                        {c.note && (
                          <span className="ml-2 text-xs text-[var(--dim)]">{c.note}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 改好的提示词 */}
              <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold">改好的提示词</h3>
                  <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs leading-5 text-[var(--dim)]">
                    <input
                      type="checkbox"
                      checked={withStatement}
                      onChange={(e) => setWithStatement(e.target.checked)}
                      aria-label="复制时在改好的提示词末尾附上原创声明"
                    />
                    末尾附原创声明
                  </label>
                </div>
                <label className="sr-only" htmlFor="prompt-check-fixed">
                  改好的完整提示词（可直接复制使用）
                </label>
                <textarea
                  id="prompt-check-fixed"
                  className="field mt-2 h-56 w-full lg:h-64"
                  readOnly
                  value={displayFixed}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    aria-label="复制改好的提示词"
                    onClick={() => void copyFixed()}
                  >
                    {copied ? "已复制 ✓" : "复制改好的提示词"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-label="把改好的提示词放到左框，再检查一遍"
                    onClick={moveFixedToLeft}
                  >
                    放到左框再检查一遍
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--dim)]">
                  检查只能尽量提前发现风险，不能保证平台一定放行；拿去生成前，先对照上面的问题清单和改动清单扫一眼。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
