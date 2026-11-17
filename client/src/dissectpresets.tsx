// v6.27 拆解提示词库（监控页顶部工具栏绿色按钮打开的悬浮窗）：
// 管理拆解提示词预设——搜索 / 分类筛选 / 查看全文 / 复制 / 编辑 /
// 新增 / 删除（仅自定义预设可删、删前二次确认），数据存服务端
// dissect_presets 表（关窗、刷新都不丢）。默认预设在窗口首次打开
// 时由 seedDissectPreset 幂等落库，正文由监控页把代码常量
// DISSECT_CHAT_RULES 原样传入（seedBody），保证逐字一致。
// v6.37 起卡片「复刻」改走本库的预设：点「复刻」先开本文件末尾的
// DissectPresetPicker 选一条预设，复制的是「视频信息头＋选中预设
// 的正文全文」——所以在库里改了某条预设的正文，之后选它复刻复制
// 出去的就是改后的正文；DISSECT_CHAT_RULES 常量本身仍只是默认
// 预设的种子来源，常量一字未动。
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import { ConfirmDialog } from "./confirm";
import { describeThrownError } from "./gateway";

export type DissectPreset = ApiResponse<
  typeof api,
  "listDissectPresets"
>["presets"][number];

export const DISSECT_PRESET_CATEGORIES = [
  "通用视频拆解",
  "1:1视频复刻",
  "Seedance 2.5",
  "MiniMax H3",
  "人物与场景分析",
  "自定义预设",
] as const;

// 默认预设的固定标识与元信息；正文不在这里写死，由监控页把
// DISSECT_CHAT_RULES 常量原样经 seedBody 传入。
const DEFAULT_PRESET = {
  slug: "dissect-chat-rules-current",
  name: "聊天精修解剖规则（当前版）",
  intro:
    "点卡片「复刻」、选这条预设时随指令一起复制的现行规则全文（14 节＋执行纪律）：核台词与时间轴、连续性审核、破绽修复与二次审核、H3 提示词与存档套用。",
  category: "1:1视频复刻",
};

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 剪贴板 API 不可用时回落 execCommand（与监控页同一口径）。
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { hour12: false });
}

type Draft = { name: string; intro: string; category: string; body: string };

const EMPTY_DRAFT: Draft = {
  name: "",
  intro: "",
  category: "自定义预设",
  body: "",
};

export function DissectPresetLibrary({
  open,
  onClose,
  seedBody,
}: {
  open: boolean;
  onClose: () => void;
  seedBody: string;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<Draft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DissectPreset | null>(
    null,
  );
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const showFeedback = (kind: "ok" | "err", text: string) =>
    setFeedback({ kind, text });
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const listQuery = useQuery({
    queryKey: ["dissectPresets"],
    queryFn: () => api.listDissectPresets({}),
    enabled: open,
  });

  // 窗口每次打开先幂等补种子（已存在不重复插入），再刷新列表。
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      void (async () => {
        try {
          await api.seedDissectPreset({ ...DEFAULT_PRESET, body: seedBody });
        } catch {
          // 种子失败不拦窗口：列表照常显示，下次打开会再补。
        }
        void queryClient.invalidateQueries({ queryKey: ["dissectPresets"] });
      })();
    }
    if (!open) wasOpenRef.current = false;
  }, [open, seedBody, queryClient]);

  // Esc 关闭（删除确认窗开着时让确认窗自己处理）。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pendingDelete) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pendingDelete]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["dissectPresets"] });

  const createMut = useMutation({
    mutationFn: async (draft: Draft) =>
      await api.createDissectPreset({
        name: draft.name.trim(),
        intro: draft.intro.trim(),
        category: draft.category,
        body: draft.body,
      }),
    onSuccess: () => {
      setAdding(false);
      setAddDraft(EMPTY_DRAFT);
      setFormError("");
      showFeedback("ok", "新预设已保存。");
      void invalidate();
    },
    onError: (e) =>
      showFeedback("err", `保存失败：${describeThrownError(e)}`),
  });

  const updateMut = useMutation({
    mutationFn: async (args: { id: number; draft: Draft }) =>
      await api.updateDissectPreset({
        id: args.id,
        name: args.draft.name.trim(),
        intro: args.draft.intro.trim(),
        category: args.draft.category,
        body: args.draft.body,
      }),
    onSuccess: () => {
      setEditingId(null);
      setFormError("");
      showFeedback("ok", "已保存修改。");
      void invalidate();
    },
    onError: (e) =>
      showFeedback("err", `保存失败：${describeThrownError(e)}`),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => await api.deleteDissectPreset({ id }),
    onSuccess: (res) => {
      setPendingDelete(null);
      if (res.ok) {
        showFeedback("ok", res.message);
        void invalidate();
      } else {
        showFeedback("err", res.message);
      }
    },
    onError: (e) =>
      showFeedback("err", `删除失败：${describeThrownError(e)}`),
  });

  if (!open) return null;

  const presets = listQuery.data?.presets ?? [];
  const kw = search.trim().toLowerCase();
  const visible = presets.filter((p) => {
    if (categoryFilter !== "全部" && p.category !== categoryFilter)
      return false;
    if (!kw) return true;
    return (
      p.name.toLowerCase().includes(kw) ||
      p.intro.toLowerCase().includes(kw) ||
      p.category.toLowerCase().includes(kw) ||
      p.body.toLowerCase().includes(kw)
    );
  });

  const validateDraft = (draft: Draft): string => {
    if (!draft.name.trim()) return "预设名称不能为空。";
    if (!draft.body.trim()) return "提示词正文不能为空。";
    return "";
  };

  const handleCopy = async (p: DissectPreset) => {
    const ok = await copyTextToClipboard(p.body);
    if (ok) {
      setCopiedId(p.id);
      showFeedback("ok", `已复制「${p.name}」的完整正文。`);
      setTimeout(() => setCopiedId((cur) => (cur === p.id ? null : cur)), 2500);
    } else {
      showFeedback("err", "复制失败，请展开预设后手动选中正文复制。");
    }
  };

  const startEdit = (p: DissectPreset) => {
    setEditingId(p.id);
    setEditDraft({
      name: p.name,
      intro: p.intro,
      category: p.category,
      body: p.body,
    });
    setFormError("");
    setExpandedId(p.id);
  };

  const renderDraftForm = (
    draft: Draft,
    setDraft: (d: Draft) => void,
    onSave: () => void,
    onCancel: () => void,
    saving: boolean,
    formId: string,
  ) => (
    <div
      className="mt-3 flex flex-col gap-2"
      // 表单打开时把自己滚进可视区（列表长时表单在下方，用户不用找）。
      ref={(el) => {
        el?.scrollIntoView({ block: "nearest" });
      }}
    >
      <label className="text-xs font-semibold text-[var(--dim)]" htmlFor={`${formId}-name`}>
        预设名称（必填）
      </label>
      <input
        id={`${formId}-name`}
        className="field field-sm"
        value={draft.name}
        maxLength={200}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="给这条预设起个名字"
      />
      <label className="text-xs font-semibold text-[var(--dim)]" htmlFor={`${formId}-intro`}>
        简介
      </label>
      <input
        id={`${formId}-intro`}
        className="field field-sm"
        value={draft.intro}
        maxLength={500}
        onChange={(e) => setDraft({ ...draft, intro: e.target.value })}
        placeholder="一句话说明这条预设是干什么的"
      />
      <label className="text-xs font-semibold text-[var(--dim)]" htmlFor={`${formId}-category`}>
        分类
      </label>
      <select
        id={`${formId}-category`}
        className="field field-sm"
        value={draft.category}
        onChange={(e) => setDraft({ ...draft, category: e.target.value })}
        aria-label="选择预设分类"
      >
        {DISSECT_PRESET_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <label className="text-xs font-semibold text-[var(--dim)]" htmlFor={`${formId}-body`}>
        提示词正文（必填）
      </label>
      <textarea
        id={`${formId}-body`}
        className="field font-mono"
        style={{ fontSize: 13, lineHeight: "20px" }}
        rows={10}
        value={draft.body}
        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        placeholder="把完整的提示词粘贴到这里"
      />
      <p className="text-xs text-[var(--dim)]">正文共 {draft.body.length} 字</p>
      {formError && (
        <p className="text-sm" style={{ color: "var(--bad)" }} role="alert">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: "rgba(3, 5, 9, 0.62)" }}
      role="dialog"
      aria-modal="true"
      aria-label="拆解提示词库"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-[14px] border sm:max-h-[86vh] sm:rounded-[14px]"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-card)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <h3 className="font-display text-lg font-bold">拆解提示词库</h3>
          <span className="text-xs text-[var(--dim)]">
            共 {presets.length} 条预设
          </span>
          <button
            type="button"
            className="btn btn-sm ml-auto"
            aria-label="关闭拆解提示词库"
            onClick={onClose}
          >
            关闭 ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <input
            className="field field-sm min-w-[180px] flex-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索名称 / 简介 / 分类 / 正文"
            aria-label="搜索预设（按名称、简介、分类、正文匹配）"
          />
          <select
            className="field field-sm w-auto"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="按分类筛选预设"
          >
            <option value="全部">全部分类</option>
            {DISSECT_PRESET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {feedback && (
          <p
            className="mx-4 mt-3 rounded-[8px] px-3 py-2 text-sm"
            style={{
              background:
                feedback.kind === "ok" ? "var(--ok-soft)" : "var(--bad-soft)",
              color: feedback.kind === "ok" ? "var(--olive)" : "var(--bad)",
            }}
            role="status"
          >
            {feedback.text}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {/* 新增表单放在列表上方：点「＋ 新增预设」后表单就在眼前，
              不用先滚过整个列表才找得到。 */}
          {adding &&
            renderDraftForm(
              addDraft,
              setAddDraft,
              () => {
                const err = validateDraft(addDraft);
                if (err) {
                  setFormError(err);
                  return;
                }
                createMut.mutate(addDraft);
              },
              () => {
                setAdding(false);
                setFormError("");
              },
              createMut.isPending,
              "add",
            )}

          {listQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-[var(--dim)]">
              正在读取预设…
            </p>
          ) : listQuery.isError ? (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: "var(--bad)" }}>
                预设没读出来：{describeThrownError(listQuery.error)}
              </p>
              <button
                type="button"
                className="btn btn-sm mt-3"
                onClick={() => void listQuery.refetch()}
              >
                重新读取
              </button>
            </div>
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--dim)]">
              {presets.length === 0
                ? "还没有预设，点下方「＋ 新增预设」加第一条。"
                : "没有符合搜索与分类条件的预设，换个关键词或分类试试。"}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {visible.map((p) => {
                const expanded = expandedId === p.id;
                const editing = editingId === p.id;
                return (
                  <li
                    key={p.id}
                    className="rounded-[10px] border p-3"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--surface-alt)",
                    }}
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <button
                        type="button"
                        className="min-w-[220px] flex-1 text-left"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "收起" : "展开查看"}预设「${p.name}」的完整正文`}
                        onClick={() =>
                          setExpandedId(expanded ? null : p.id)
                        }
                      >
                        <span className="block truncate text-[15px] font-bold">
                          {expanded ? "▾ " : "▸ "}
                          {p.name}
                        </span>
                        {p.intro && (
                          <span className="mt-0.5 block text-[13px] leading-5 text-[var(--dim)]">
                            {p.intro}
                          </span>
                        )}
                      </button>
                      <span className="flex shrink-0 flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-label={`复制预设「${p.name}」的完整正文`}
                          onClick={() => void handleCopy(p)}
                        >
                          {copiedId === p.id ? "已复制 ✓" : "复制"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-label={`编辑预设「${p.name}」`}
                          onClick={() => startEdit(p)}
                        >
                          编辑
                        </button>
                        {p.kind === "custom" ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-danger-ghost"
                            aria-label={`删除预设「${p.name}」`}
                            onClick={() => setPendingDelete(p)}
                          >
                            删除
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled
                            title="系统默认预设不可删除，只能编辑或复制"
                            aria-label={`预设「${p.name}」是系统默认预设，不可删除`}
                          >
                            删除
                          </button>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--dim)]">
                      <span
                        className="rounded-full border px-2 py-0.5"
                        style={{ borderColor: "var(--taupe)" }}
                      >
                        {p.category}
                      </span>
                      <span
                        className="rounded-full border px-2 py-0.5"
                        style={{
                          borderColor:
                            p.kind === "system"
                              ? "var(--olive)"
                              : "var(--taupe)",
                          color:
                            p.kind === "system" ? "var(--olive)" : undefined,
                        }}
                      >
                        {p.kind === "system" ? "系统默认" : "自定义"}
                      </span>
                      <span>最后修改：{formatTime(p.updatedAt)}</span>
                      <span>全文 {p.body.length} 字</span>
                    </div>
                    {editing
                      ? renderDraftForm(
                          editDraft,
                          setEditDraft,
                          () => {
                            const err = validateDraft(editDraft);
                            if (err) {
                              setFormError(err);
                              return;
                            }
                            updateMut.mutate({ id: p.id, draft: editDraft });
                          },
                          () => {
                            setEditingId(null);
                            setFormError("");
                          },
                          updateMut.isPending,
                          `edit-${p.id}`,
                        )
                      : expanded && (
                          <pre
                            className="mt-3 overflow-auto rounded-[8px] border p-3 font-mono"
                            style={{
                              borderColor: "var(--border)",
                              background: "var(--bg)",
                              fontSize: 12.5,
                              lineHeight: "19px",
                              maxHeight: 320,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                            aria-label={`预设「${p.name}」的完整正文`}
                          >
                            {p.body}
                          </pre>
                        )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          className="border-t px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            type="button"
            className="btn w-full"
            style={{
              background: "var(--olive)",
              borderColor: "var(--olive)",
              color: "#fff",
              fontWeight: 700,
            }}
            aria-label="新增一条拆解提示词预设"
            onClick={() => {
              setAdding((v) => !v);
              setFormError("");
            }}
          >
            ＋ 新增预设
          </button>
        </div>
      </div>

      {pendingDelete && (
        // 确认窗自带遮罩在本窗遮罩之内：拦住点击冒泡，避免点确认窗
        // 遮罩时把整个提示词库一起关掉。
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
          title="删除这条预设？"
          body={
            <>
              <p>
                预设「{pendingDelete.name}」将被删除，删除后无法恢复。
              </p>
              <p className="mt-1 text-[var(--dim)]">
                只删这一条，其他预设不受影响。
              </p>
            </>
          }
            confirmLabel="删除"
            pending={deleteMut.isPending}
            onConfirm={() => deleteMut.mutate(pendingDelete.id)}
            onCancel={() => setPendingDelete(null)}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// v6.37 复刻预设选择窗：监控页卡片底部 / 详情窗 / 悬浮播放窗点「复刻」
// 后先开这个窗——列出全部预设（名称 / 简介 / 分类 / 最后修改时间，
// 系统默认预设带「系统默认」标记），点一条即选中，由监控页按现行
// 指令格式拼「视频信息头＋选中预设正文全文」复制到剪贴板、入待解剖
// 队列并关窗。一条预设都没有时只显示提示文案，不报错、不复制。
// 本窗只读列表（listDissectPresets），不做种子落库——默认预设由
// 拆解提示词库管理窗打开时幂等补种。
// ---------------------------------------------------------------------------
export function DissectPresetPicker({
  open,
  videoTitle,
  onClose,
  onSelect,
}: {
  open: boolean;
  videoTitle: string;
  onClose: () => void;
  onSelect: (preset: DissectPreset) => void;
}) {
  const listQuery = useQuery({
    queryKey: ["dissectPresets"],
    queryFn: () => api.listDissectPresets({}),
    enabled: open,
  });

  // Esc 关闭（与管理窗同一口径）。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const presets = listQuery.data?.presets ?? [];

  return (
    <div
      className="fixed inset-0 z-[92] flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: "rgba(3, 5, 9, 0.62)" }}
      role="dialog"
      aria-modal="true"
      aria-label="复刻：选择拆解提示词预设"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-[14px] border sm:max-h-[86vh] sm:rounded-[14px]"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-card)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-start gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-bold">
              复刻：选一条拆解提示词预设
            </h3>
            <p className="mt-0.5 text-[13px] leading-5 text-[var(--dim)]">
              {videoTitle ? (
                <>
                  给「<span className="font-semibold">{videoTitle}</span>」用：
                </>
              ) : null}
              点一条预设，就把「视频信息＋预设全文」拼成的复刻指令复制好，去聊天框粘贴发送；同时排进待解剖队列。
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            aria-label="关闭预设选择窗"
            onClick={onClose}
          >
            关闭 ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {listQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-[var(--dim)]">
              正在读取预设…
            </p>
          ) : listQuery.isError ? (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: "var(--bad)" }} role="alert">
                预设没读出来：{describeThrownError(listQuery.error)}
              </p>
              <button
                type="button"
                className="btn btn-sm mt-3"
                onClick={() => void listQuery.refetch()}
              >
                重新读取
              </button>
            </div>
          ) : presets.length === 0 ? (
            <p className="py-8 text-center text-sm leading-6 text-[var(--dim)]">
              还没有预设，去拆解提示词库里加一条。
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {presets.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full rounded-[10px] border p-3 text-left transition-colors hover:border-[var(--accent)]"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--surface-alt)",
                    }}
                    aria-label={`用预设「${p.name}」复刻这条视频`}
                    onClick={() => onSelect(p)}
                  >
                    <span className="block truncate text-[15px] font-bold">
                      {p.name}
                    </span>
                    {p.intro && (
                      <span className="mt-0.5 block text-[13px] leading-5 text-[var(--dim)]">
                        {p.intro}
                      </span>
                    )}
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--dim)]">
                      <span
                        className="rounded-full border px-2 py-0.5"
                        style={{ borderColor: "var(--taupe)" }}
                      >
                        {p.category}
                      </span>
                      {p.kind === "system" && (
                        <span
                          className="rounded-full border px-2 py-0.5"
                          style={{
                            borderColor: "var(--olive)",
                            color: "var(--olive)",
                          }}
                        >
                          系统默认
                        </span>
                      )}
                      <span>最后修改：{formatTime(p.updatedAt)}</span>
                      <span>全文 {p.body.length} 字</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
