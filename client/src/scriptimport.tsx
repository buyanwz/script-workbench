// 导入剧本弹层：两个入口（项目管理区、剧本审查页顶部操作区）共用
// 同一套流程，不做两套逻辑：
//   选文件 / 拖拽 → 客户端解析（不直接覆盖）→ 预览核对（新稿 vs 当前稿
//   对比、人物表变化、待确认人物、预估总时长、逐行解析结果、解析
//   失败行原文）→ 确认导入才回调 onConfirm 覆盖。
// 覆盖本身由调用方走既有 saveScript（v5.29 起覆盖前不再自动存
// 快照）；解析或保存失败时本弹层只报错，不改动当前稿。导入稿
// 一律回到审查阶段，语速/风格/目标快照默认沿用当前
// 项目设置（预览里写明，可改选跟随导入稿自带设置）。

import { useMemo, useRef, useState } from "react";
import { describeThrownError } from "./gateway";
import type { ScriptData } from "./scriptlib";
import {
buildImportPreview,
parseScriptImport,
scriptCounts,
type ScriptImportResult,
} from "./importlib";

export interface ImportProjectSettings {
  speechRate: number;
  stylePreset: string;
  styleCustom: string;
  targetSeconds: number;
}

function projectStyleLabel(p: ImportProjectSettings): string {
  return p.stylePreset === "自定义"
    ? p.styleCustom.trim() || "自定义风格"
    : p.stylePreset;
}

const KIND_LABEL: Record<ScriptImportResult["kind"], string> = {
  json: "JSON（项目 / 剧本文件）",
  markdown: "Markdown（剧本格式01 全文）",
  text: "纯文本剧本",
};

export function ScriptImportDialog({
  project,
  currentScript,
  projectCharacterNames,
  onConfirm,
  onClose,
}: {
  project: ImportProjectSettings;
  currentScript: ScriptData | null;
  projectCharacterNames: string[];
  /** Persist the imported script (host calls saveScript with the
   *  「导入剧本覆盖前」 snapshot trigger). May throw / reject with a
   *  friendly message; the dialog then stays open and nothing is
   *  overwritten. */
  onConfirm: (final: ScriptData) => void | Promise<void>;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScriptImportResult | null>(null);
  const [settingsChoice, setSettingsChoice] = useState<"project" | "imported">("project");
  const [confirming, setConfirming] = useState(false);

  const readFile = async (file: File) => {
    setError(null);
    setResult(null);
    if (file.size > 2_000_000) {
      setError("导入失败：文件太大了（超过 2MB）。请确认选的是剧本文件，不是图片或视频。当前稿没有被改动。");
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseScriptImport(file.name, text);
      setResult(parsed);
      setSettingsChoice("project");
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败：文件读不出来，请换一个文件再试。当前稿没有被改动。");
    }
  };

  /** The script as it will be saved: imported content + the chosen
   *  settings snapshot, forced back to the review stage (any old
   *  storyboard is dropped and must be re-confirmed). */
  const finalScript = useMemo<ScriptData | null>(() => {
    if (!result) return null;
    const imp = result.importedSettings;
    const follow = settingsChoice === "imported" && imp != null;
    const s = result.script;
    return {
      ...s,
      speechRate: follow && imp?.speechRate ? imp.speechRate : project.speechRate,
      styleLabel: follow && imp?.styleLabel ? imp.styleLabel : projectStyleLabel(project),
      targetSeconds:
        follow && typeof imp?.targetSeconds === "number"
          ? imp.targetSeconds
          : project.targetSeconds,
      snapshotStylePreset: follow && imp?.stylePreset ? imp.stylePreset : project.stylePreset,
      snapshotStyleCustom:
        follow && typeof imp?.styleCustom === "string" ? imp.styleCustom : project.styleCustom,
      stage: "review",
      storyboardGroups: undefined,
      storyboardConfig: undefined,
      voiceMap: undefined,
      generationPlan: undefined,
      generationProgress: undefined,
      confirmedAt: undefined,
      generatedAt:
        s.generatedAt && !Number.isNaN(Date.parse(s.generatedAt))
          ? s.generatedAt
          : new Date().toISOString(),
      versionNote: s.versionNote.trim() || "外部导入的剧本",
    };
  }, [result, settingsChoice, project]);

  const preview = useMemo(
    () =>
      finalScript
        ? buildImportPreview(finalScript, currentScript, projectCharacterNames)
        : null,
    [finalScript, currentScript, projectCharacterNames],
  );
  const currentCounts = useMemo(
    () => (currentScript ? scriptCounts(currentScript) : null),
    [currentScript],
  );

  const doConfirm = async () => {
    if (!finalScript || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      await onConfirm(finalScript);
      onClose();
    } catch (e) {
      setError(
        `导入保存失败：${describeThrownError(e)}。当前稿没有被改动，请检查网络后再点一次确认导入。`,
      );
      setConfirming(false);
    }
  };

  const imp = result?.importedSettings ?? null;
  const hasImportedSettings =
    imp != null &&
    (imp.speechRate != null || imp.styleLabel != null || imp.targetSeconds != null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      style={{
        background: "rgba(3, 5, 9, 0.62)",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="导入剧本"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-[14px] border"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-card)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b p-5 pb-3" style={{ borderColor: "var(--border)" }}>
          <div>
            <p className="font-display text-lg font-bold">导入剧本</p>
            <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
              把在外面改好、核对完的稿子导回来：支持工作台导出的项目 / 剧本 JSON、剧本格式01 的 .md 全文、.txt 纯文本剧本。先解析预览，你确认后才覆盖当前稿；覆盖后无法恢复，导错了只能重新导入或手动改回。
            </p>
          </div>
          <button type="button" className="btn btn-sm shrink-0" onClick={onClose} aria-label="关闭导入剧本">
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 pt-4">
          {/* ---- file pick / drop ---- */}
          <div
            className="rounded-[var(--radius)] border border-dashed p-4 text-center"
            style={{
              borderColor: dragOver ? "var(--terra)" : "var(--taupe)",
              background: dragOver ? "var(--accent-soft)" : "var(--surface-alt)",
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void readFile(f);
            }}
          >
            <p className="text-sm">
              {result
                ? `已选：${result.fileName}（${KIND_LABEL[result.kind]}）`
                : "把剧本文件拖到这里，或者点下面的按钮选文件"}
            </p>
            <button
              type="button"
              className="btn btn-sm mt-2.5"
              onClick={() => fileRef.current?.click()}
            >
              {result ? "换一个文件" : "选择剧本文件"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.md,.markdown,.txt,application/json,text/markdown,text/plain"
              className="hidden"
              aria-label="选择要导入的剧本文件"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readFile(f);
                e.target.value = "";
              }}
            />
            <p className="mt-2 text-xs text-[var(--dim)]">
              只选文件不会改动当前稿；解析不成功也不会覆盖当前稿。
            </p>
          </div>

          {error && (
            <p className="mt-3 rounded-[var(--radius)] border p-3 text-sm leading-6" style={{ borderColor: "var(--terra)", background: "var(--bad-soft)", color: "var(--bad)" }} role="alert">
              {error}
            </p>
          )}

          {/* ---- preview ---- */}
          {result && finalScript && preview && (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-bold">导入预览：先核对，再覆盖</p>
                <table className="script-table mt-2">
                  <thead>
                    <tr>
                      <th>对比项</th>
                      <th>当前稿</th>
                      <th>导入稿</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>片名</td>
                      <td>{currentScript?.title ?? "（暂无剧本）"}</td>
                      <td>{finalScript.title}</td>
                    </tr>
                    <tr>
                      <td>段落数</td>
                      <td>{currentCounts ? `${currentCounts.groups} 段` : "—"}</td>
                      <td>{preview.groupCount} 段</td>
                    </tr>
                    <tr>
                      <td>节拍数</td>
                      <td>{currentCounts ? `${currentCounts.beats} 个` : "—"}</td>
                      <td>{preview.beatCount} 个</td>
                    </tr>
                    <tr>
                      <td>台词句数</td>
                      <td>{currentCounts ? `${currentCounts.lines} 句` : "—"}</td>
                      <td>{preview.lineCount} 句</td>
                    </tr>
                    <tr>
                      <td>预估总时长</td>
                      <td>—</td>
                      <td>
                        {preview.totalSeconds.toFixed(1)} 秒（台词 {preview.dialogueSeconds.toFixed(1)} 秒 + 动作 {preview.actionSeconds.toFixed(1)} 秒，按 {finalScript.speechRate} 字/秒算）
                        {finalScript.targetSeconds > 0 &&
                          `；目标 ${finalScript.targetSeconds} 秒，${preview.totalSeconds - finalScript.targetSeconds > 0.05 ? `超 ${(preview.totalSeconds - finalScript.targetSeconds).toFixed(1)} 秒` : preview.totalSeconds - finalScript.targetSeconds < -0.05 ? `还差 ${(finalScript.targetSeconds - preview.totalSeconds).toFixed(1)} 秒` : "与目标一致"}`}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <p className="text-sm font-bold">人物表变化</p>
                {preview.addedCharacters.length === 0 && preview.removedCharacters.length === 0 ? (
                  <p className="mt-1 text-sm text-[var(--dim)]">导入稿的人物表和当前稿一致，没有增减。</p>
                ) : (
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6">
                    {preview.addedCharacters.length > 0 && (
                      <li>新增人物：{preview.addedCharacters.join("、")}（导入后出现在人物表里；还没有人物卡和资产图的，请到「人物与大纲」补建）</li>
                    )}
                    {preview.removedCharacters.length > 0 && (
                      <li>当前稿有、导入稿没有：{preview.removedCharacters.join("、")}（导入后人物表以导入稿为准，这几位不再出现在人物表里；项目里的人物卡不会被删）</li>
                    )}
                  </ul>
                )}
                {(preview.pendingSpeakers.length > 0 || preview.emptySpeakerLines > 0) && (
                  <div className="mt-2 rounded-[var(--radius)] border p-3 text-sm leading-6" style={{ borderColor: "var(--terra)", background: "var(--accent-soft)" }}>
                    <p>
                      <strong>待确认人物：</strong>
                      {preview.pendingSpeakers.length > 0 &&
                        `${preview.pendingSpeakers.map((p) => `${p.name}（${p.lineCount} 句台词）`).join("、")} 不在导入稿的人物表里、也不在当前项目的人物卡里；`}
                      {preview.emptySpeakerLines > 0 &&
                        `另有 ${preview.emptySpeakerLines} 句台词没有说话人；`}
                      导入后打开审查页，系统会自动把新人物设计并记入（有台词进正式人物表、无台词记为群演），不用逐个处理；不处理也不拦确认分镜。
                    </p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm font-bold">语速 / 风格 / 目标时长用哪一份</p>
                {hasImportedSettings ? (
                  <div className="mt-1.5 space-y-1.5 text-sm leading-6">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name="import-settings-source"
                        checked={settingsChoice === "project"}
                        onChange={() => setSettingsChoice("project")}
                        className="mt-1.5"
                      />
                      <span>
                        沿用当前项目设置（默认）：语速 {project.speechRate} 字/秒、风格 {projectStyleLabel(project)}
                        {project.targetSeconds > 0 ? `、目标 ${project.targetSeconds} 秒` : "、未设目标时长"}
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name="import-settings-source"
                        checked={settingsChoice === "imported"}
                        onChange={() => setSettingsChoice("imported")}
                        className="mt-1.5"
                      />
                      <span>
                        跟随导入稿自带：语速 {imp?.speechRate ?? project.speechRate} 字/秒、风格 {imp?.styleLabel ?? projectStyleLabel(project)}
                        {typeof imp?.targetSeconds === "number"
                          ? imp.targetSeconds > 0
                            ? `、目标 ${imp.targetSeconds} 秒`
                            : "、未设目标时长"
                          : `、目标 ${project.targetSeconds > 0 ? `${project.targetSeconds} 秒` : "未设"}`}
                      </span>
                    </label>
                    <p className="text-xs text-[var(--dim)]">
                      这里只决定导入稿记下的设置快照（时长按哪份语速算），不会改项目的基础设置；想改项目设置去「基础设置」窗口。
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-sm leading-6 text-[var(--dim)]">
                    导入稿没有自带语速 / 风格 / 目标设置，将沿用当前项目设置：语速 {project.speechRate} 字/秒、风格 {projectStyleLabel(project)}
                    {project.targetSeconds > 0 ? `、目标 ${project.targetSeconds} 秒` : "、未设目标时长"}。不会改项目的基础设置。
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-bold">逐行解析结果（导入后就是这些段落和节拍）</p>
                <div className="mt-2 max-h-64 space-y-2.5 overflow-y-auto rounded-[var(--radius)] border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-alt)" }}>
                  {finalScript.groups.map((g, gi) => (
                    <div key={gi}>
                      <p className="text-xs font-bold">
                        段落{gi + 1}｜{g.title}
                        {g.sceneName ? `（场景：${g.sceneName}）` : ""}
                      </p>
                      <ul className="mt-1 space-y-0.5 text-xs leading-5 text-[var(--dim)]">
                        {g.beats.map((b, bi) => (
                          <li key={bi}>
                            节拍{bi + 1}：
                            {b.line.trim()
                              ? `${b.speaker.trim() || "（空说话人）"}${b.emotion.trim() ? `（${b.emotion.trim()}）` : ""}："${b.line.trim().slice(0, 60)}${b.line.trim().length > 60 ? "…" : ""}"`
                              : `无台词（动作 ${b.actionSeconds} 秒）${b.visual.trim() ? `：${b.visual.trim().slice(0, 60)}${b.visual.trim().length > 60 ? "…" : ""}` : "：画面未填写"}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-bold">
                  解析失败 / 没有导入的行（{result.issues.length} 行）
                </p>
                {result.issues.length === 0 ? (
                  <p className="mt-1 text-sm text-[var(--dim)]">没有解析失败的行，文件内容都导入了。</p>
                ) : (
                  <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-[var(--radius)] border p-3" style={{ borderColor: "var(--terra)", background: "var(--bad-soft)" }}>
                    {result.issues.map((iss, i) => (
                      <div key={i} className="text-xs leading-5">
                        <p className="font-semibold">
                          {iss.lineNo > 0 ? `第 ${iss.lineNo} 行：` : ""}{iss.text}
                        </p>
                        <p className="text-[var(--dim)]">{iss.hint}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-4" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs leading-5 text-[var(--dim)]">
            确认导入后：当前剧本会被导入稿整体替换（覆盖后无法恢复，自动版本快照已下线）；剧本回到审查阶段，原分镜作废、需要重新确认台词生成分镜；待确认清单、新人物自动分拣、时长试算和服务端校验会立刻按导入稿重新跑一遍。
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn" onClick={onClose} disabled={confirming}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ background: "var(--terra)", borderColor: "var(--terra)", color: "var(--on-primary)" }}
              disabled={!result || confirming}
              onClick={() => void doConfirm()}
            >
              {confirming ? "正在导入…" : "确认导入（覆盖当前剧本）"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
