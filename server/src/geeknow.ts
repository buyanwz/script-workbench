// Geeknow chat/completions 客户端（P4）— OpenAI 兼容接口。
//
// 替代原来走 Muse 平台的 ctx.inference.complete 通道：
//   POST {base}/v1/chat/completions
//   { model, messages: [{role:"system"},{role:"user"}], response_format }
// 鉴权：Authorization: Bearer <Key>。Key 解析顺序（与生图侧一致）：
//   调用方传入（请求头 x-geeknow-api-key）> 环境变量 GEEKNOW_API_KEY；
//   地址：请求头 x-geeknow-api-base > 环境变量 GEEKNOW_API_BASE >
//   默认 https://api.geeknow.top。无 Key 时抛明确的中文错误，绝不
//   静默用假 Key、绝不抛 P4_NOT_IMPLEMENTED。
//
// 模型选择（2026-11-10，模型名未完全验证，等用户亲手点一次 AI 大纲验证）：
//   - geeknow.py 连接器 helper 是通用代理，不调 chat/completions，
//     里面没有任何 chat 模型名；全工作区唯一模型名
//     doubao-seedream-4-0-250828（ark_model 字段）是生图模型，
//     不是 chat 模型，不能当 chat 默认模型。
//   - Geeknow 官方文档在公开搜索里查不到 chat 模型列表（geeknow.top
//     无索引到的文档页），无法验证哪几个 chat 模型名在 Geeknow 上
//     真实可用；以下选的是各家中转站最通用的同名 ID：
//       纯文本默认 deepseek-chat（DeepSeek-V3 系，中转站最通用、
//       中文写作强、便宜；DeepSeek 官方文档可验证该 ID 真实存在，
//       但未验证 Geeknow 侧是否同名开通）；
//       带图默认 doubao-seed-1-6-vision-250815（豆包 Seed-1.6
//       视觉版；deepseek-chat 不支持图片输入，多模态调用必须换
//       视觉模型，见映射表）。
//   - 两个默认模型都可用环境变量覆盖（GEEKNOW_CHAT_MODEL /
//     GEEKNOW_VISION_MODEL），不用改代码；模型不存在时 Geeknow 会
//     回 404 / model_not_found，错误原文会原样带回给调用方，不
//     静默回落到别的模型（回落会改计费口径，必须由用户定）。

import { InferenceSchemaError } from "./local-sdk";
import type {
  GeeknowRequestAuth,
  InferenceCompleteOptions,
} from "./local-sdk";
import type { z } from "zod";

export const GEEKNOW_DEFAULT_BASE = "https://api.geeknow.top";

/** 纯文本对话默认模型（未在 Geeknow 侧验证，见文件头注释）。 */
export const GEEKNOW_DEFAULT_CHAT_MODEL = "deepseek-chat";
/** 带图片输入时默认模型（deepseek-chat 不支持图片，见文件头注释）。 */
export const GEEKNOW_DEFAULT_VISION_MODEL = "doubao-seed-1-6-vision-250815";

/**
 * 模型映射表：调用方如果以后要按任务换模型，从这里换，不要散落在
 * 各 action 里。键是任务口径，值是 Geeknow 侧的模型 ID；未验证的
 * 候选写在注释里，验证通过后再提升为正式值。
 */
export const GEEKNOW_CHAT_MODEL_MAP: Record<string, string> = {
  /** 纯文本：大纲、剧本、分镜、审核、改写、封面文案等全部文本任务。 */
  text: GEEKNOW_DEFAULT_CHAT_MODEL,
  /** 带图：人物/资产图分析、封面分析、解剖终稿等带图片输入的任务。 */
  vision: GEEKNOW_DEFAULT_VISION_MODEL,
  // 候选（未验证）：qwen-vl-max、gpt-4o——若默认视觉模型报
  // model_not_found，可先试这两个，再由用户定最终默认。
};

export const GEEKNOW_NO_KEY_ERROR =
  "未填 Geeknow Key：请在工作台「生图接口总设置」里填写你自己的 Geeknow Key（环境变量 GEEKNOW_API_KEY 也可作为高级兜底）";

/** 解析一次调用实际用的 Key 与地址（不含 Key 时只回地址，不抛错）。 */
export function resolveGeeknowCredentials(
  input?: { apiKey?: string; apiBase?: string },
  ctxAuth?: GeeknowRequestAuth,
): { apiKey?: string; apiBase?: string } {
  const key =
    input?.apiKey?.trim() ||
    ctxAuth?.geeknowKey?.trim() ||
    process.env.GEEKNOW_API_KEY?.trim() ||
    undefined;
  const base =
    input?.apiBase?.trim() ||
    ctxAuth?.geeknowBase?.trim() ||
    process.env.GEEKNOW_API_BASE?.trim() ||
    undefined;
  return {
    ...(key ? { apiKey: key } : {}),
    ...(base ? { apiBase: base } : {}),
  };
}

function resolveBase(auth?: GeeknowRequestAuth): string {
  const raw =
    auth?.geeknowBase?.trim() ||
    process.env.GEEKNOW_API_BASE?.trim() ||
    GEEKNOW_DEFAULT_BASE;
  if (!raw.startsWith("https://")) {
    throw new Error("API 地址格式不对：需要以 https:// 开头的完整地址");
  }
  let base = raw.replace(/\/+$/, "");
  if (base.endsWith("/v1")) base = base.slice(0, -3).replace(/\/+$/, "");
  return base;
}

function resolveModel(hasImages: boolean): string {
  if (hasImages) {
    return (
      process.env.GEEKNOW_VISION_MODEL?.trim() ||
      GEEKNOW_CHAT_MODEL_MAP.vision ||
      GEEKNOW_DEFAULT_VISION_MODEL
    );
  }
  return (
    process.env.GEEKNOW_CHAT_MODEL?.trim() ||
    GEEKNOW_CHAT_MODEL_MAP.text ||
    GEEKNOW_DEFAULT_CHAT_MODEL
  );
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.search(/[\[{]/);
  if (start >= 0) {
    const open = trimmed[start];
    const close = open === "{" ? "}" : "]";
    const end = trimmed.lastIndexOf(close);
    if (end > start) return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

/**
 * Geeknow chat/completions 一次调用。返回前先 JSON.parse 再用
 * options.schema 校验；校验失败抛 InferenceSchemaError（与原来
 * 平台通道的错误类型一致，actions.ts 里原样识别）。
 */
export async function geeknowComplete<T extends z.ZodType>(
  prompt: string,
  options: InferenceCompleteOptions<T>,
  auth?: GeeknowRequestAuth,
): Promise<z.infer<T>> {
  const apiKey =
    auth?.geeknowKey?.trim() || process.env.GEEKNOW_API_KEY?.trim() || "";
  if (!apiKey) {
    throw new Error(GEEKNOW_NO_KEY_ERROR);
  }
  const base = resolveBase(auth);
  const images = options.images ?? [];
  const hasImages = images.length > 0;
  const model = resolveModel(hasImages);

  const isPlainString =
    (options.schema as unknown as { _zod?: { def?: { type?: string } } })
      ?._zod?.def?.type === "string" ||
    (options.schema as unknown as { _def?: { typeName?: string } })._def
      ?.typeName === "ZodString";

  const messages: Record<string, unknown>[] = [];
  if (options.system) {
    messages.push({ role: "system", content: options.system });
  }
  // 结构化输出：要求模型只回 JSON，服务端再按 schema 校验。
  const userText =
    prompt +
    (isPlainString
      ? ""
      : "\n\n只输出 JSON，不要输出任何解释、前后缀或 Markdown 代码围栏。");
  if (hasImages) {
    const parts: Record<string, unknown>[] = [{ type: "text", text: userText }];
    for (const img of images) {
      const mime = img.mimeType ?? "image/png";
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${mime};base64,${img.dataBase64}`,
        },
      });
      if (img.caption) {
        parts.push({ type: "text", text: `（上图图注：${img.caption}）` });
      }
    }
    messages.push({ role: "user", content: parts });
  } else {
    messages.push({ role: "user", content: userText });
  }

  const body: Record<string, unknown> = { model, messages };
  if (!isPlainString) {
    body.response_format = { type: "json_object" };
  }

  const timeoutMs = Math.max(
    1_000,
    Math.round((options.timeout_secs ?? 120) * 1000),
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new Error(
        `Geeknow 对话请求超时（${Math.round(timeoutMs / 1000)} 秒，模型 ${model}）`,
      );
    }
    throw new Error(
      `Geeknow 对话请求失败（模型 ${model}）：${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Geeknow 对话接口返回 HTTP ${res.status}（模型 ${model}）${rawText ? `：${rawText.slice(0, 400)}` : ""}`,
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(rawText) as unknown;
  } catch {
    throw new Error(
      `Geeknow 对话接口返回的不是合法 JSON（模型 ${model}）：${rawText.slice(0, 200)}`,
    );
  }
  const content = (data as { choices?: { message?: { content?: unknown } }[] })
    ?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`Geeknow 对话没有返回文本内容（模型 ${model}）`);
  }
  if (isPlainString) {
    const parsed = options.schema.safeParse(content.trim());
    if (!parsed.success) {
      throw new InferenceSchemaError(parsed.error.issues);
    }
    return parsed.data as z.infer<T>;
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonText(content));
  } catch {
    throw new Error(
      `AI 返回的不是合法 JSON（模型 ${model}）：${content.slice(0, 200)}`,
    );
  }
  const checked = options.schema.safeParse(parsedJson);
  if (!checked.success) {
    throw new InferenceSchemaError(checked.error.issues);
  }
  return checked.data as z.infer<T>;
}
