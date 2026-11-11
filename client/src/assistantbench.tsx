import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { loadImageApiSettings, resolveImageApiConfig } from "./imageapi";
import { describeThrownError } from "./gateway";

// ---------------------------------------------------------------------------
// AI助手（v5.74，原型 v0.1）：顶栏新页，与剧本工作台 / 人物资产储
// 存库并列。页面就是一个聊天界面：消息列表 + 输入框 + 发送 + 清
// 空对话。对话只存在本页内存里（useState），刷新就没了，持久化
// 以后再做；只收文字、不贴图。发送时把整份对话历史发给服务端
// runAssistantChat（无状态 agent 循环，接 Geeknow
// deepseek-v4-flash + 6 个白名单工具），回最终回答 + 工具轨迹；
// 轨迹在助手消息里用小灰字逐行展示（如「查了项目列表（3 个）」）。
// 凭证不新增入口：发送时读生图总设置那份（imageapi.ts，与生图 /
// 封面同一份），没填就由服务端走已连接的 Geeknow 凭证；Key 只
// 当次透传，不存本页、不显示。
// ---------------------------------------------------------------------------

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  trace?: string[];
};

export function AssistantBench() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setError(null);
    setSending(true);
    try {
      const cfg = resolveImageApiConfig(loadImageApiSettings());
      const res = await api.runAssistantChat({
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        apiKey: cfg.apiKey,
        apiBase: cfg.apiBase,
      });
      if (!res.ok) {
        setError(res.error ?? "助手这次没能回答，请再试一次。");
        return;
      }
      setMessages([
        ...next,
        { role: "assistant", content: res.reply, trace: res.trace },
      ]);
    } catch (e) {
      setError(describeThrownError(e));
    } finally {
      setSending(false);
    }
  };

  const clear = () => {
    if (sending) return;
    setMessages([]);
    setError(null);
    setInput("");
  };

  return (
    <section aria-label="AI助手聊天">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-display text-xl font-bold">AI助手</h2>
        <p className="text-xs text-[var(--dim)]">
          能查项目、查模式、做封面分析、解释功能；v0.1 是原型。对话只存在这个页面里，刷新就没了；只收文字，不能贴图。
        </p>
        <button
          type="button"
          className="btn btn-sm ml-auto"
          onClick={clear}
          disabled={sending || messages.length === 0}
          aria-label="清空当前对话（只清本页，不影响任何项目数据）"
        >
          清空对话
        </button>
      </div>

      <div className="card flex flex-col" style={{ height: "min(66vh, 720px)" }}>
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto"
          aria-label="对话消息列表"
          aria-live="polite"
        >
          {messages.length === 0 && !sending && (
            <p className="px-1 py-6 text-center text-sm text-[var(--dim)]">
              还没有对话。可以问我：工作台里有哪些项目、某个模式怎么样，或者把一段剧本摘要发我做封面分析（说清项目和风格，我会把提示词存进工作台）。
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <li
                key={i}
                className={
                  m.role === "user" ? "flex justify-end" : "flex justify-start"
                }
              >
                <div
                  className="max-w-[85%] rounded-[var(--radius)] px-3.5 py-2.5 text-sm leading-6 sm:max-w-[75%]"
                  style={
                    m.role === "user"
                      ? {
                          background: "var(--accent)",
                          color: "var(--on-primary)",
                        }
                      : {
                          background: "var(--surface-alt)",
                          color: "var(--text)",
                          border: "1px solid var(--border)",
                        }
                  }
                >
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  {m.role === "assistant" && m.trace && m.trace.length > 0 && (
                    <div
                      className="mt-1.5 border-t pt-1.5 text-xs leading-5"
                      style={{
                        borderColor: "var(--border)",
                        color: "var(--dim)",
                      }}
                    >
                      {m.trace.map((t, j) => (
                        <div key={j}>{t}</div>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
            {sending && (
              <li className="flex justify-start" aria-label="助手思考中">
                <div
                  className="rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--dim)]"
                  style={{
                    background: "var(--surface-alt)",
                    border: "1px solid var(--border)",
                  }}
                >
                  思考中…
                </div>
              </li>
            )}
          </ul>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}

        <div className="mt-3 flex items-end gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <label className="sr-only" htmlFor="assistant-chat-input">
            给 AI 助手发消息（只收文字）
          </label>
          <textarea
            id="assistant-chat-input"
            className="field"
            rows={2}
            value={input}
            disabled={sending}
            placeholder="问项目、问模式，或者贴一段剧本摘要让我做封面分析…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-primary shrink-0"
            onClick={() => void send()}
            disabled={sending || input.trim().length === 0}
            aria-label="发送消息给 AI 助手"
          >
            {sending ? "思考中…" : "发送"}
          </button>
        </div>
      </div>
    </section>
  );
}
