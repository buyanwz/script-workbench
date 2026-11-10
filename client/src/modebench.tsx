// v3.49 模式系统（T1–T10）客户端：主窗口模式选择区 + 应用内独立
// 训练窗口。配色与全站「深空未来」单套主题同值（v3.99 起）：主区
// 背景 #0E1116、窗口 / 卡片 #161B22、边框 #2A3342、主字 #E8EDF4、
// 次字 #9AA7B8、强调色电光蓝 #4D7CFE、圆角 8px、无渐变无纹理。
// 花朵图形第一版不做：模式图标是圆形编号占位，iconSlot 字段已在
// 服务端预留，后续替换为花朵视觉时只换这一个槽位。

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import {
describeThrownError, retryReadQuery, withReadTimeout, withWriteRetry
} from "./gateway";

export type ModesData = ApiResponse<typeof api, "listModes">;
export type ModeFull = ModesData["modes"][number];
export type ModeSummaryT =
  ApiResponse<typeof api, "listModeSummaries">["modes"][number];
export type StyleCardT = NonNullable<ModeFull["currentCard"]>;
export type TrainingRecordT = ModeFull["records"][number];

const C = {
  bg: "#0E1116",
  card: "#161B22",
  border: "#2A3342",
  text: "#E8EDF4",
  dim: "#9AA7B8",
  accent: "#4D7CFE",
  accentSoft: "#1A2745",
  bad: "#F0665E",
  badSoft: "#331D1D",
  radius: 8,
};

const btnBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 36,
  padding: "6px 14px",
  borderRadius: C.radius,
  border: `1px solid ${C.border}`,
  background: C.card,
  color: C.text,
  fontSize: 13.5,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: C.accent,
  borderColor: C.accent,
  color: "#FFFFFF",
};
const btnSm: React.CSSProperties = { ...btnBase, minHeight: 30, padding: "3px 10px", fontSize: 12.5 };
const btnSmPrimary: React.CSSProperties = { ...btnPrimary, minHeight: 30, padding: "3px 10px", fontSize: 12.5 };
const fieldS: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: C.radius,
  background: C.card,
  color: C.text,
  padding: "7px 10px",
  fontSize: 13.5,
  lineHeight: "20px",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const RECORD_STATUS_LABEL: Record<string, string> = {
  queued: "排队",
  analyzing: "分析中",
  success: "成功",
  failed: "失败",
};
function ProgressBar({ value }: { value: number }) {
  return (
    <div aria-label={`训练进度 ${value} / 10`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 10, borderRadius: 999, background: "#232B38", overflow: "hidden" }}>
        <div style={{ width: `${value * 10}%`, height: "100%", background: C.accent, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
        {value} / 10
      </span>
    </div>
  );
}

function ModeIcon({ n, active }: { n: number; active: boolean }) {
  // iconSlot 占位：圆形 + 编号。后续花朵视觉只替换这个组件。
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        borderRadius: 999,
        border: `1.5px solid ${active ? C.accent : C.border}`,
        background: active ? C.accentSoft : C.bg,
        color: active ? C.accent : C.dim,
        fontSize: 16,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {n}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 模式卡（v4.08 版式；v4.09 的三块居中重做已按用户要求撤回）：左对齐——
// 顶部一行圆形编号图标 + 模式名 / 状态行（状态 · 稳定度），下面进度条，
// 再下面是已学基因标签描述（styleTags 以「、」连接、最多 3 行省略；
// 没有标签时显示「暂无基因标签」），底部 [训练] [查看] 按钮与右侧
// 「已选中」标记。modes.core_logic 数据保留在库里与备份链里，但不再
// 在卡面展示或编辑。
// ---------------------------------------------------------------------------

function ModeCard({
  mode: m,
  active,
  onSelect,
  onTrain,
  onView,
}: {
  mode: ModeSummaryT;
  active: boolean;
  onSelect: () => void;
  onTrain: () => void;
  onView: () => void;
}) {
  const tagsText = m.styleTags.join("、");

  return (
    <article
      aria-label={`模式卡：${m.name}${active ? "（当前选中）" : ""}`}
      onClick={onSelect}
      style={{
        background: C.card,
        border: `1.5px solid ${active ? C.accent : C.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        cursor: "pointer",
        boxShadow: "0 1px 2px rgba(31,31,31,0.04)",
      }}
    >
      {/* 顶部：编号图标 + 模式名 / 状态行 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ModeIcon n={m.id} active={active} />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{m.name}</p>
          <p
            style={{
              marginTop: 2,
              fontSize: 12,
              lineHeight: "18px",
              fontWeight: 700,
              color: m.status === "conflict" ? C.bad : active ? C.accent : C.dim,
            }}
          >
            {m.statusLabel}
            {m.stability ? ` · 稳定度${m.stability}` : ""}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <ProgressBar value={m.progress} />
      </div>

      {/* 已学基因标签描述 */}
      {tagsText ? (
        <p
          style={{
            marginTop: 10,
            fontSize: 13.5,
            lineHeight: "20px",
            color: C.text,
            overflowWrap: "anywhere",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {tagsText}
        </p>
      ) : (
        <p style={{ marginTop: 10, fontSize: 13.5, lineHeight: "20px", color: C.dim }}>
          暂无基因标签
        </p>
      )}

      {/* 按钮行 */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
        }}
      >
        <button
          type="button"
          style={btnSmPrimary}
          aria-label={`训练${m.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onTrain();
          }}
        >
          训练
        </button>
        <button
          type="button"
          style={btnSm}
          aria-label={`查看${m.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
        >
          查看
        </button>
        {active && (
          <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: C.accent }}>
            已选中
          </span>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// 主窗口模式选择区（T1）
// ---------------------------------------------------------------------------

export function ModeSection({
  projectId,
  selectedModeId,
}: {
  projectId: number;
  selectedModeId: number;
}) {
  const queryClient = useQueryClient();
  // v5.20 性能瘦身：卡片只渲染名称/状态/稳定度/进度/基因标签，改拉
  // 轻量摘要（约 2KB）并沿用 5 秒轮询（聊天侧训练写库后卡片能自动
  // 跟上）；此前与查看窗口共用 listModes 全量载荷（约 110KB，含每
  // 张基因卡全文与全部训练记录），每 5 秒在首屏整份下载+解析。
  // 全量数据只在打开「查看」窗口时由 TrainingWindow 自己拉。
  const modesQuery = useQuery({
    queryKey: ["mode-summaries"],
    queryFn: () => withReadTimeout(() => api.listModeSummaries({})),
    retry: retryReadQuery,
    refetchInterval: 5000,
  });
  const modes = modesQuery.data?.modes ?? [];

  const [trainingOpen, setTrainingOpen] = useState(false);
  const [trainingModeId, setTrainingModeId] = useState<number>(selectedModeId || 1);
  // v4.82：选模式保存失败此前无任何提示——点了卡片没反应、模式
  // 也没选上，用户无从知道。现在失败把真实原因亮出来。
  const [selectError, setSelectError] = useState<string | null>(null);

  const selectMut = useMutation({
    mutationFn: (modeId: number) => api.selectProjectMode({ projectId, modeId }),
    onSuccess: () => {
      setSelectError(null);
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["modes"] });
      queryClient.invalidateQueries({ queryKey: ["mode-summaries"] });
    },
    onError: (e) =>
      setSelectError(
        `模式没选上：${describeThrownError(e)}。这个模式还没生效，再点一次卡片试试。`,
      ),
  });

  const openTraining = (modeId: number) => {
    setTrainingModeId(modeId);
    setTrainingOpen(true);
  };

  return (
    <section
      aria-label="模式选择区"
      data-tour="mode-section"
      style={{
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 16,
        marginTop: 24,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 12px" }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text }}>模式选择</h2>
        <p style={{ fontSize: 12.5, color: C.dim }}>
          每个模式独立保存规则；训练在聊天里和助手说，点「训练」或「查看」看记录与规则。
        </p>
      </div>

      {selectError && (
        <p style={{ marginTop: 12, fontSize: 13.5, color: C.bad }} role="alert">
          {selectError}
        </p>
      )}

      {modesQuery.isLoading ? (
        <p style={{ marginTop: 12, fontSize: 13.5, color: C.dim }}>正在读取模式…</p>
      ) : modesQuery.isError ? (
        <p style={{ marginTop: 12, fontSize: 13.5, color: C.bad }} role="alert">
          模式没读出来，请检查网络后刷新（人物与大纲不受影响）。
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 12,
            marginTop: 16,
          }}
        >
          {modes.map((m) => (
            <ModeCard
              key={m.id}
              mode={m}
              active={m.id === selectedModeId}
              onSelect={() => selectMut.mutate(m.id)}
              onTrain={() => openTraining(m.id)}
              onView={() => {
                selectMut.mutate(m.id);
                openTraining(m.id);
              }}
            />
          ))}
        </div>
      )}

      {selectedModeId === 0 && modes.length > 0 && (
        <p style={{ marginTop: 10, fontSize: 12.5, color: C.dim }}>
          还没选模式：点一张模式卡选中；不选也能照常写。
        </p>
      )}

      {trainingOpen && (
        <TrainingWindow
          initialModeId={trainingModeId}
          onClose={() => setTrainingOpen(false)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 模式查看窗口（T2，v4.10 起只做查看）：应用内窗口，可拖动标题栏
// 移动、右下角可调整大小、最小化成一条小条。窗口里只有已训练视频、
// 训练记录与模式规则；训练本身改走聊天，窗口不再有投喂入口。
// ---------------------------------------------------------------------------

function TrainingWindow({
  initialModeId,
  onClose,
}: {
  initialModeId: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [modeId, setModeId] = useState(initialModeId);
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const winRef = useRef<HTMLDivElement>(null);

  const modesQuery = useQuery({
    queryKey: ["modes"],
    queryFn: () => withReadTimeout(() => api.listModes({})),
    retry: retryReadQuery,
    refetchInterval: 4000,
  });
  const modes = modesQuery.data?.modes ?? [];
  const mode = modes.find((m) => m.id === modeId) ?? modes[0] ?? null;

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({ x: Math.max(0, e.clientX - dragRef.current.dx), y: Math.max(0, e.clientY - dragRef.current.dy) });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["modes"] });

  if (minimized) {
    return (
      <div
        role="dialog"
        aria-label={`模式查看窗口（已最小化）`}
        style={{
          position: "fixed",
          right: 12,
          bottom: "calc(12px + env(safe-area-inset-bottom))",
          zIndex: 60,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 999,
          boxShadow: "0 6px 20px rgba(31,31,31,0.14)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px 6px 14px",
          maxWidth: "calc(100vw - 24px)",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          模式查看{mode ? ` · ${mode.name} · 进度 ${mode.progress}/10` : ""}
        </span>
        <button type="button" style={btnSm} aria-label="展开模式查看窗口" onClick={() => setMinimized(false)}>
          展开
        </button>
        <button type="button" style={btnSm} aria-label="关闭模式查看窗口" onClick={onClose}>
          关闭
        </button>
      </div>
    );
  }

  return (
    <div
      ref={winRef}
      role="dialog"
      aria-modal="false"
      aria-label="模式查看窗口"
      style={{
        position: "fixed",
        left: pos ? pos.x : "50%",
        top: pos ? pos.y : "50%",
        transform: pos ? "none" : "translate(-50%, -50%)",
        zIndex: 60,
        width: 960,
        height: 720,
        maxWidth: "96vw",
        maxHeight: "92vh",
        resize: "both",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        boxShadow: "0 18px 48px rgba(31,31,31,0.18)",
      }}
    >
      {/* 顶部：模式切换条 + 当前模式 + 进度 + 状态 + 窗口控制 */}
      <div
        onMouseDown={(e) => {
          const rect = winRef.current?.getBoundingClientRect();
          if (!rect) return;
          if (!pos) setPos({ x: rect.left, y: rect.top });
          dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        }}
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: `1px solid ${C.border}`,
          background: C.bg,
          cursor: "move",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", gap: 4 }} role="group" aria-label="查看窗口内切换模式">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-label={`切换到${m.name}`}
              aria-pressed={m.id === modeId}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setModeId(m.id)}
              style={{
                ...btnSm,
                ...(m.id === modeId ? { background: C.accent, borderColor: C.accent, color: "#fff" } : {}),
              }}
            >
              {m.name}
            </button>
          ))}
        </div>
        {mode && (
          <span style={{ fontSize: 13, color: C.text }}>
            当前：<strong>{mode.name}</strong> · 进度 {mode.progress}/10 · {mode.statusLabel}
            {mode.stability ? ` · 稳定度${mode.stability}` : ""}
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }} onMouseDown={(e) => e.stopPropagation()}>
          <button type="button" style={btnSm} aria-label="最小化模式查看窗口" onClick={() => setMinimized(true)}>
            最小化
          </button>
          <button type="button" style={btnSm} aria-label="关闭模式查看窗口" onClick={onClose}>
            关闭
          </button>
        </span>
      </div>
      <p style={{ padding: "6px 12px 0", fontSize: 11.5, color: C.dim }}>
        训练在聊天里和助手说：这里只看已训练视频、训练记录与模式规则。
      </p>

      {mode ? (
        <TrainingBody key={mode.id} mode={mode} invalidate={invalidate} />
      ) : (
        <p style={{ padding: 16, fontSize: 13.5, color: C.dim }}>正在读取模式数据…</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 模式查看主体（v4.10 简化；v4.11 训练记录按类型过滤）：只保留两样——
// ①已训练视频名称（从训练记录自动取）与训练记录卡片（可逐条撤销）；
// ②「模式规则」可编辑区（coreLogic 落库、改完点保存）。训练改走聊天：
// 用户在聊天里和助手说、结论确认后由助手写入模式规则，工作台不再有
// 视频投喂、维度输入、台词识别、确认分析等入口（服务端
// submitModeTraining / confirmStyleCard / resetMode 动作保留，前端不再
// 调用，历史数据不动）。
// v4.11：训练记录列表只展示真正的视频训练报告（kind === "training" 且
// 视频沉淀为基因卡成果，与「已训练视频」同口径）；kind === "feedback"
// 的「生成反馈」记录是已下线（v4.01）的像/不像反馈功能留下的历史
// 数据，早期同文件改名试投喂记录同理，只在界面隐藏、不删除，
// 数据库行数不变。
// ---------------------------------------------------------------------------

function TrainingBody({ mode, invalidate }: { mode: ModeFull; invalidate: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [rulesDraft, setRulesDraft] = useState(mode.coreLogic);
  const [rulesMsg, setRulesMsg] = useState<string | null>(null);
  const rulesDirty = rulesDraft.trim() !== (mode.coreLogic ?? "").trim();

  const undoMut = useMutation({
    // v3.98 写数据加固：撤销是整份写回的幂等写，走 withWriteRetry
    // （任何失败自动重试共 3 次），失败提示透出真实原因。
    mutationFn: (recordId: number) =>
      withWriteRetry(() => api.undoModeTraining({ recordId })),
    onSuccess: (r) => {
      setMsg(r.ok ? "已撤销：进度已回滚到这次操作前，历史日志保留。" : (r.error ?? "撤销失败"));
      invalidate();
    },
    onError: (e) =>
      setMsg(
        `撤销没成功：${describeThrownError(e)}（已自动重试 3 次仍失败），请检查网络后重试。`,
      ),
  });

  const saveRulesMut = useMutation({
    mutationFn: (text: string) =>
      withWriteRetry(() => api.updateModeCoreLogic({ modeId: mode.id, coreLogic: text })),
    onSuccess: () => {
      setRulesMsg("模式规则已保存，刷新还在。");
      invalidate();
    },
    onError: (e) =>
      setRulesMsg(
        `保存没成功：${describeThrownError(e)}（已自动重试 3 次仍失败），请检查网络后重试。`,
      ),
  });

  // 已训练视频：以真正沉淀成训练成果的为准——基因卡各版的
  // sourceVideo（按版本去重），时长从对应训练记录里取；还没有
  // 基因卡时回退到成功的训练记录（按视频名去重）。早期同文件的
  // 改名重复试投喂不算正式训练成果，不进这个列表。
  const trainedVideos: { name: string; durationSec: number }[] = [];
  {
    const seen = new Set<string>();
    const durOf = (name: string) =>
      mode.records.find(
        (r) => r.kind === "training" && (r.videoName || "").trim() === name,
      )?.videoDurationSec ?? 0;
    const cardVideos = [
      ...(mode.currentCard ? [mode.currentCard] : []),
      ...mode.cardHistory,
    ]
      .map((c) => (c.sourceVideo || "").trim())
      .filter(Boolean);
    for (const name of cardVideos) {
      if (seen.has(name)) continue;
      seen.add(name);
      trainedVideos.push({ name, durationSec: durOf(name) });
    }
    if (trainedVideos.length === 0) {
      for (const r of mode.records) {
        if (r.kind !== "training" || r.status !== "success" || r.revoked) continue;
        const name = (r.videoName || "").trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        trainedVideos.push({ name, durationSec: r.videoDurationSec });
      }
    }
  }
  const stripExt = (n: string) => n.replace(/\.(mp4|mov|webm|mkv|avi)$/i, "");

  // v4.11：训练记录列表只显示真正的视频训练报告——kind === "training"
  // 且视频是真正沉淀成训练成果的（与上面「已训练视频」同一口径：基因卡
  // 各版 sourceVideo；无卡时回退成功训练记录的视频名）。这样：
  // 「生成反馈」（kind === "feedback"，已下线功能的遗留记录）不展示；
  // 早期同文件的改名试投喂（如模式1 的 #3 / #1，与复刻原片同字节异名、
  // 未沉淀为成果卡）也不展示——模式1 最后只剩 #12 与 #7 两条。
  // 未出结果的训练（排队 / 分析中 / 失败）仍展示，免得进行中的训练看不见。
  // 以上都只是界面隐藏，数据保留不删、数据库行数不变。
  const trainedNames = new Set(trainedVideos.map((v) => v.name.trim()));
  const visibleRecords = mode.records.filter(
    (r) =>
      r.kind === "training" &&
      (r.status !== "success" || trainedNames.has((r.videoName || "").trim())),
  );

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>
      {msg && (
        <p style={{ fontSize: 12.5, lineHeight: "19px", color: C.accent, marginBottom: 8 }} role="status">
          {msg}
        </p>
      )}

      <h4 style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>已训练视频（{mode.name}）</h4>
      {trainedVideos.length === 0 ? (
        <p style={{ marginTop: 6, fontSize: 12.5, color: C.dim }}>暂未训练。</p>
      ) : (
        <ul style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          {trainedVideos.map((v) => (
            <li key={v.name} style={{ fontSize: 13, lineHeight: "20px", color: C.text }}>
              《{stripExt(v.name)}》{v.durationSec ? `（${v.durationSec.toFixed(1)}秒）` : ""}
            </li>
          ))}
        </ul>
      )}

      <h4 style={{ marginTop: 18, fontSize: 13.5, fontWeight: 800, color: C.text }}>模式规则（{mode.name}）</h4>
      <p style={{ marginTop: 4, fontSize: 12, lineHeight: "18px", color: C.dim }}>
        训练出来的模式规则写在这里：训练在聊天里和助手说，结论确认后由助手写进来；你也可以直接改，改完点保存，按模式存好。
      </p>
      <textarea
        style={{ ...fieldS, marginTop: 8, resize: "vertical", lineHeight: "22px" }}
        rows={8}
        aria-label={`${mode.name}模式规则（可编辑）`}
        value={rulesDraft}
        onChange={(e) => {
          setRulesDraft(e.target.value);
          setRulesMsg(null);
        }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 }}>
        <button
          type="button"
          style={btnSmPrimary}
          aria-label={`保存${mode.name}模式规则`}
          disabled={!rulesDirty || !rulesDraft.trim() || saveRulesMut.isPending}
          onClick={() => saveRulesMut.mutate(rulesDraft.trim())}
        >
          {saveRulesMut.isPending ? "保存中…" : "保存规则"}
        </button>
        {rulesDirty && <span style={{ fontSize: 12, color: C.dim }}>有未保存的修改</span>}
        {rulesMsg && (
          <span style={{ fontSize: 12.5, color: C.accent }} role="status">
            {rulesMsg}
          </span>
        )}
      </div>

      <h4 style={{ marginTop: 18, fontSize: 13.5, fontWeight: 800, color: C.text }}>训练记录（{mode.name} · {visibleRecords.length} 条）</h4>
      {visibleRecords.length === 0 ? (
        <p style={{ marginTop: 6, fontSize: 12.5, color: C.dim }}>暂无记录。训练记录会记在这里，撤销后日志保留。</p>
      ) : (
        <ul style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
          {visibleRecords.map((r) => (
            <li key={r.id} style={{ border: `1px solid ${C.border}`, borderRadius: C.radius, padding: "8px 10px" }}>
              <p style={{ fontSize: 12.5, color: C.text }}>
                #{r.id} {`投喂：${r.videoName || "—"}`} ·{" "}
                {RECORD_STATUS_LABEL[r.status] ?? r.status}
                {r.revoked ? " · 已撤销" : ""}
              </p>
              <p style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>
                {fmtTime(r.createdAt)} · 进度 {r.progressBefore} → {r.progressAfter} · 稳定度{" "}
                {r.stabilityBefore || "—"} → {r.stabilityAfter || "—"}
                {r.conflict ? " · 本次检出风格冲突" : ""}
              </p>
              {r.analysisSummary && (
                <p style={{ fontSize: 12, lineHeight: "18px", color: C.text, marginTop: 3 }}>{r.analysisSummary}</p>
              )}
              {r.status === "success" && r.revocable && !r.revoked && (
                <button
                  type="button"
                  style={{ ...btnSm, marginTop: 6 }}
                  aria-label={`撤销记录 ${r.id}`}
                  disabled={undoMut.isPending}
                  onClick={() => undoMut.mutate(r.id)}
                >
                  撤销这次训练
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
