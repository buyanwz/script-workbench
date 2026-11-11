// 本地 SDK 替代层（P1）— 取代 `@hatch/space-sdk` 的服务端符号。
//
// 背景：移植目标是脱离 Muse 平台运行的 Windows exe，`@hatch/space-sdk`
// 不再可用。本文件只复刻 `server/src/actions.ts` 与
// `server/src/privileged.ts` 实际用到的那一小部分 SDK 表面，行为与 SDK
// 原版一致（brand 字符串、zod 校验语义、特权合约结构）；handler 本体
// 一字未动。
//
// 用到的 SDK 符号（见 port-inventory.md §1.1）：
//   actions.ts:    defineAction, z, InferenceSchemaError,
//                  type ActionsModule, type Ctx
//   privileged.ts: definePrivilegedContracts, definePrivilegedHandlers, z
//
// 不在本文件里的东西（P2/P4 再接）：ctx.db 的真实 drizzle 实例、
// ctx.blobs 的文件系统实现、ctx.inference 的 Geeknow 通道、
// ctx.executePrivileged 的真实分发——这些由 `server/src/ctx.ts` 提供
// 占位实现，见该文件。

import { z } from "zod";

export { z };

// ---------------------------------------------------------------------------
// Action 定义
// ---------------------------------------------------------------------------

export const ACTION_BRAND = "@hatch/space-sdk/action/v1" as const;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface BlobPutOptions {
  readonly contentType?: string;
  readonly public?: boolean;
}

export interface BlobUrlOptions {
  readonly expiresInSeconds?: number;
  readonly public?: boolean;
}

export interface BlobMetadata {
  readonly key: string;
  readonly contentType: string;
  readonly size: number;
  readonly sizeBytes: number;
  readonly etag: string;
  readonly visibility: "private" | "public";
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly public: boolean;
}

export interface BlobClient {
  put(key: string, data: string | ArrayBuffer | ArrayBufferView | Blob, options?: BlobPutOptions): Promise<void>;
  getUrl(key: string, options?: BlobUrlOptions): Promise<string>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<BlobMetadata | null>;
  list(prefix?: string): Promise<BlobMetadata[]>;
}

import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

/** 本地版 ctx.db：调用方传 schema 类型，返回 drizzle 实例。P1 占位见 ctx.ts。 */
export type SpaceDb<TSchema extends Record<string, unknown> = Record<string, never>> =
  BunSQLiteDatabase<TSchema>;
export type SpaceDbAccessor = <TSchema extends Record<string, unknown> = Record<string, never>>() => SpaceDb<TSchema>;

export interface InferenceCompleteOptions<T extends z.ZodType = z.ZodType> {
  readonly schema: T;
  readonly timeout_secs?: number;
  readonly system?: string;
  readonly images?: readonly {
    readonly dataBase64: string;
    readonly mimeType?: "image/jpeg" | "image/png";
    readonly filename?: string;
    readonly caption?: string;
  }[];
}

export interface InferenceClient {
  complete<T extends z.ZodType>(
    prompt: string,
    options: InferenceCompleteOptions<T>,
  ): Promise<z.infer<T>>;
}

export const PRIVILEGED_CONTRACT_BRAND =
  "@hatch/space-sdk/privileged-contract/v1" as const;

export interface PrivilegedContract<
  Name extends string = string,
  Req extends z.ZodType = z.ZodType,
  Res extends z.ZodType = z.ZodType,
> {
  readonly __brand: typeof PRIVILEGED_CONTRACT_BRAND;
  readonly name: Name;
  readonly request: Req;
  readonly response: Res;
  readonly capabilities?: readonly string[];
  readonly timeoutMs?: number;
}

export type PrivilegedContractSpec<
  Req extends z.ZodType = z.ZodType,
  Res extends z.ZodType = z.ZodType,
> = {
  readonly request: Req;
  readonly response: Res;
  readonly capabilities?: readonly string[];
  readonly timeoutMs?: number;
};

export type PrivilegedContractsFor<
  Specs extends Record<string, PrivilegedContractSpec>,
> = {
  readonly [Name in keyof Specs & string]: PrivilegedContract<
    Name,
    Specs[Name]["request"],
    Specs[Name]["response"]
  >;
};

export type PrivilegedRequest<C extends PrivilegedContract> = z.infer<C["request"]>;
export type PrivilegedResponse<C extends PrivilegedContract> = z.infer<C["response"]>;

export interface PrivilegedExecutor {
  executePrivileged<C extends PrivilegedContract>(
    contract: C,
    args: PrivilegedRequest<C>,
  ): Promise<PrivilegedResponse<C>>;
}

export const PRIVILEGED_HANDLERS_FORMAT =
  "hatch-space-privileged-handlers-v1" as const;

/**
 * 特权 handler 的第二个可选参数：调用方传来的 Geeknow 凭证（P4）。
 * 服务端由请求头 x-geeknow-api-key / x-geeknow-api-base 取，ctx 分发
 * 时传入；handler 按“动作入参 apiKey/apiBase > 这里 > 环境变量”
 * 的顺序解析。只传给 Geeknow 相关的 handler，其他 handler 忽略。
 */
export interface GeeknowRequestAuth {
  readonly geeknowKey?: string;
  readonly geeknowBase?: string;
}

export type PrivilegedHandler<C extends PrivilegedContract = PrivilegedContract> = (
  args: PrivilegedRequest<C>,
  auth?: GeeknowRequestAuth,
) => Promise<PrivilegedResponse<C>> | PrivilegedResponse<C>;

export type PrivilegedHandlersFor<
  Contracts extends Record<string, PrivilegedContract>,
> = {
  readonly [Name in keyof Contracts]?: PrivilegedHandler<Contracts[Name]>;
};

export interface PrivilegedHandlerEntry<C extends PrivilegedContract = PrivilegedContract> {
  readonly contract: C;
  readonly handler: PrivilegedHandler<C>;
}

export interface PrivilegedHandlers {
  readonly format: typeof PRIVILEGED_HANDLERS_FORMAT;
  readonly entries: readonly PrivilegedHandlerEntry[];
}

export function definePrivilegedContracts<
  const Specs extends Record<string, PrivilegedContractSpec>,
>(specs: Specs): PrivilegedContractsFor<Specs> {
  const contracts: Record<string, PrivilegedContract> = {};
  for (const [name, spec] of Object.entries(specs)) {
    contracts[name] = {
      __brand: PRIVILEGED_CONTRACT_BRAND,
      name,
      request: spec.request,
      response: spec.response,
      ...(spec.capabilities !== undefined ? { capabilities: spec.capabilities } : {}),
      ...(spec.timeoutMs !== undefined ? { timeoutMs: spec.timeoutMs } : {}),
    };
  }
  return contracts as PrivilegedContractsFor<Specs>;
}

export function definePrivilegedHandlers<
  const Contracts extends Record<string, PrivilegedContract>,
>(
  contracts: Contracts,
  handlers: PrivilegedHandlersFor<Contracts>,
): PrivilegedHandlers {
  const entries: PrivilegedHandlerEntry[] = [];
  for (const [key, handler] of Object.entries(handlers)) {
    if (handler === undefined) continue;
    const contract = contracts[key];
    if (!contract || contract.__brand !== PRIVILEGED_CONTRACT_BRAND) {
      throw new Error(`privileged handler '${key}' does not have a contract descriptor`);
    }
    entries.push({ contract, handler: handler as PrivilegedHandler });
  }
  return { format: PRIVILEGED_HANDLERS_FORMAT, entries };
}

export function isPrivilegedContract(value: unknown): value is PrivilegedContract {
  return (
    typeof value === "object" &&
    value !== null &&
    "__brand" in value &&
    (value as { __brand: unknown }).__brand === PRIVILEGED_CONTRACT_BRAND
  );
}

/** 每一次动作调用传给 handler 的本地上下文（字段与 SDK 的 Ctx 对齐）。 */
export interface Ctx extends PrivilegedExecutor {
  readonly slug: string;
  readonly invocationId: string;
  readonly spaceDir: string;
  readonly db: SpaceDbAccessor;
  readonly blobs: BlobClient;
  readonly inference: InferenceClient;
  emit(data: JsonValue): void;
  invalidateQueries(invalidation?: unknown): void;
}

export interface ActionDefinition<
  Req extends z.ZodType = z.ZodType,
  Res extends z.ZodType = z.ZodType,
> {
  readonly __brand: typeof ACTION_BRAND;
  readonly request: Req;
  readonly response: Res;
  readonly description?: string;
  readonly privileged?: readonly PrivilegedContract[];
  readonly handler: (ctx: Ctx, args: z.infer<Req>) => Promise<z.infer<Res>>;
}

export type ActionFactoryInput<
  Req extends z.ZodType,
  Res extends z.ZodType,
> = {
  request: Req;
  response: Res;
  description?: string;
  privileged?: readonly PrivilegedContract[];
  handler: (ctx: Ctx, args: z.infer<Req>) => Promise<z.infer<Res>>;
};

/** 与 SDK 同款：只做结构组装，不做校验——校验在 HTTP 层做。 */
export function defineAction<Req extends z.ZodType, Res extends z.ZodType>(
  spec: ActionFactoryInput<Req, Res>,
): ActionDefinition<Req, Res> {
  return {
    __brand: ACTION_BRAND,
    request: spec.request,
    response: spec.response,
    ...(spec.description !== undefined ? { description: spec.description } : {}),
    ...(spec.privileged !== undefined ? { privileged: spec.privileged } : {}),
    handler: spec.handler,
  };
}

export type ActionsModule = Record<
  string,
  Omit<ActionDefinition, "handler"> & {
    handler: (ctx: Ctx, args: never) => Promise<unknown>;
  }
>;

export type ActionRequest<A extends { request: z.ZodType }> = z.infer<A["request"]>;
export type ActionResponse<A extends { response: z.ZodType }> = z.infer<A["response"]>;

// ---------------------------------------------------------------------------
// InferenceSchemaError（与 SDK 同款 brand，便于 actions.ts 里原样识别）
// ---------------------------------------------------------------------------

export const INFERENCE_SCHEMA_ERROR_BRAND =
  "@hatch/space-sdk/InferenceSchemaError/v1" as const;

export class InferenceSchemaError extends Error {
  readonly __brand: typeof INFERENCE_SCHEMA_ERROR_BRAND = INFERENCE_SCHEMA_ERROR_BRAND;
  readonly issues: readonly z.core.$ZodIssue[];
  constructor(issues: readonly z.core.$ZodIssue[]) {
    super(
      `Inference output failed schema validation (${issues.length} issue${issues.length === 1 ? "" : "s"})`,
    );
    this.name = "InferenceSchemaError";
    this.issues = issues;
  }

  static is(value: unknown): value is InferenceSchemaError {
    if (value instanceof InferenceSchemaError) return true;
    return (
      typeof value === "object" &&
      value !== null &&
      "__brand" in value &&
      (value as { __brand: unknown }).__brand === INFERENCE_SCHEMA_ERROR_BRAND &&
      "issues" in value &&
      Array.isArray((value as { issues: unknown }).issues)
    );
  }
}
