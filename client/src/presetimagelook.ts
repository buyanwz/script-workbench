// v5.56 单图造型分析（客户端引擎，储存库悬浮窗图片区与生图面板
// 「存到资产卡」共用）：一张换装图只分析「造型」一项，走与卡级
// 分析同一条任务制链路的单图变体（start → step 驱动 → poll，
// 任务号存本机、刷新可续取）。
//   - 取图：先拉最新卡找到这张图，图 url 经 urlToSubmitReference
//     降采样后随步进带给服务端；取不到图就如实失败（造型不能
//     凭空编），不静默按无图跑。
//   - 回填只写这张图的 pending 列（savePresetImagePending）：
//     待确认、刷新不丢；确认由用户在图片区点确认后经
//     confirmPresetImagePending 写进这张图的 look（是主体图
//     才同步卡片造型），不确认时这张图的已存造型与卡片造型
//     都不动。
//   - 只分析造型：音色 / 语气基调是这个人的、跟服装无关，本
//     引擎永不碰它们，永不改性别。

import { api, type ApiResponse } from "./api";
import { describeThrownError } from "./gateway";
import { urlToSubmitReference } from "./scriptlib";

export type PresetImageLookOutcome = {
  ok: boolean;
  failed: boolean;
  /** 有待确认造型已深存（ok 的主要含义）。 */
  savedPending: boolean;
  message: string;
};

type PresetRow = ApiResponse<typeof api, "listAssetPresets">["presets"][number];
type ImageRow = PresetRow["images"][number];
type ImageLookResult = NonNullable<
  ApiResponse<typeof api, "pollPresetImageLookJob">["result"]
>;

const jobKey = (imageId: number) =>
  `scriptbench.presetImageLookJob.${imageId}.v1`;
function readJob(imageId: number): number | null {
  try {
    const v = Number(window.localStorage.getItem(jobKey(imageId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function writeJob(imageId: number, jobId: number | null) {
  try {
    if (jobId == null) window.localStorage.removeItem(jobKey(imageId));
    else window.localStorage.setItem(jobKey(imageId), String(jobId));
  } catch {
    // 本机存储不可用时任务号只在当次有效，不报错。
  }
}

async function applyImageLookResult(
  presetName: string,
  presetId: number,
  image: ImageRow,
  result: ImageLookResult,
  jobId: number,
): Promise<PresetImageLookOutcome> {
  const name = presetName || "未命名人物";
  if (result.lookHeld) {
    return {
      ok: false,
      failed: false,
      savedPending: false,
      message: `「${name}」这张图的造型与图中人物的性别对不上，已拦下没有填：请自己在卡片造型里定，或换一张更清楚的图再点一次「分析造型」。`,
    };
  }
  if (!result.look.trim()) {
    return {
      ok: false,
      failed: false,
      savedPending: false,
      message: `「${name}」这张图这次没分析出造型（已存造型没动），可以再点一次「分析造型」。`,
    };
  }
  try {
    const saved = await api.savePresetImagePending({
      presetId,
      imageId: image.id,
      record: {
        look: result.look,
        jobId: String(jobId),
        updatedAt: Date.now(),
      },
    });
    if (!saved.ok) {
      return {
        ok: false,
        failed: true,
        savedPending: false,
        message: `「${name}」这张图的造型分析出了结果，但这次没存上（${saved.error ?? "请重试"}）：请再点一次「分析造型」。`,
      };
    }
  } catch (e) {
    return {
      ok: false,
      failed: true,
      savedPending: false,
      message: `「${name}」这张图的造型分析出了结果，但这次没存上（${describeThrownError(e)}）：请再点一次「分析造型」。`,
    };
  }
  const genderNote =
    result.genderJudged === "男" || result.genderJudged === "女"
      ? `（图中判读性别：${result.genderJudged}，只用来对齐造型里的性别用词，没有改卡上的性别。）`
      : result.genderJudged === "不确定"
        ? "（图中人物的性别这次没判准，造型里没写性别词。）"
        : "";
  return {
    ok: true,
    failed: false,
    savedPending: true,
    message: `「${name}」这张图的造型已分析完，存为待确认（刷新不丢）：${result.look}${genderNote} 在图片区核对后点「确认填入这张图的造型」才写进这张图；不确认时这张图的造型和卡片造型都不动。`,
  };
}

async function driveImageLookJob(
  presetName: string,
  presetId: number,
  image: ImageRow,
  jobId: number,
  presetImage: { dataBase64: string; mimeType: string },
  isCurrent: () => boolean,
): Promise<PresetImageLookOutcome | null> {
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  const DRIVE_CAP_MS = 5 * 60 * 1000;
  const startedAt = Date.now();
  const name = presetName || "未命名人物";
  for (;;) {
    if (!isCurrent()) return null;
    let out: ApiResponse<typeof api, "runPresetImageLookJobStep"> | null =
      null;
    try {
      out = await api.runPresetImageLookJobStep({ jobId, presetImage });
    } catch {
      out = null;
    }
    if (!isCurrent()) return null;
    if (out) {
      if (out.status === "done" && out.result) {
        return await applyImageLookResult(
          presetName,
          presetId,
          image,
          out.result,
          jobId,
        );
      }
      if (out.status === "failed") {
        writeJob(image.id, null);
        const reason = out.error ?? "造型分析失败";
        return {
          ok: false,
          failed: true,
          savedPending: false,
          message: `「${name}」这张图的造型分析没做成：${reason}。已存造型没动，再点一次「分析造型」即可。`,
        };
      }
    }
    if (Date.now() - startedAt > DRIVE_CAP_MS) {
      return {
        ok: false,
        failed: true,
        savedPending: false,
        message: `「${name}」这张图的造型分析跑得比平时久，页面先停在这里——任务（任务号 ${jobId}）还在服务端、任务号已留在本机，下次点这张图的「分析造型」会接着同一个任务取结果，不会从头重跑。`,
      };
    }
    await sleep(2500);
  }
}

/** 分析某张卡某一张图的造型（手动「分析造型」与新图自动分析共
 * 用）：先拉最新卡取这张图的最新 url，降采样后建 / 续任务驱动
 * 到终点，结果回填这张图的 pending 列。全程不写已存造型、
 * 不写卡片字段、不提交生图。 */
export async function runPresetImageLookCore(
  presetId: number,
  imageId: number,
  fallback: { presetName: string; imageUrl: string },
  isCurrent: () => boolean,
): Promise<PresetImageLookOutcome | null> {
  let presetName = fallback.presetName;
  let image: ImageRow | null = null;
  try {
    const res = await api.listAssetPresets({});
    const p = res.presets.find((x) => x.id === presetId);
    if (p) {
      presetName = p.name;
      image = p.images.find((im) => im.id === imageId) ?? null;
    }
  } catch {
    /* 拉不到最新数据就用调用方给的地址，不阻断 */
  }
  if (!isCurrent()) return null;
  const name = presetName || "未命名人物";
  const imageUrl = image?.url ?? fallback.imageUrl;
  if (!imageUrl) {
    return {
      ok: false,
      failed: true,
      savedPending: false,
      message: `「${name}」这张图取不到地址，没法分析造型。`,
    };
  }
  const imgRow: ImageRow =
    image ??
    ({
      id: imageId,
      url: imageUrl,
      previewUrl: null,
      fileName: "",
      look: "",
      pendingLook: "",
      pendingJobId: "",
      pendingUpdatedAt: 0,
      pendingRollback: "",
      isPrimary: false,
    } as ImageRow);
  let presetImage: { dataBase64: string; mimeType: string } | undefined;
  try {
    const ref = await urlToSubmitReference(imageUrl);
    if (ref && (ref.mimeType === "image/jpeg" || ref.mimeType === "image/png")) {
      presetImage = { dataBase64: ref.dataBase64, mimeType: ref.mimeType };
    }
  } catch {
    presetImage = undefined;
  }
  if (!isCurrent()) return null;
  if (!presetImage) {
    return {
      ok: false,
      failed: true,
      savedPending: false,
      message: `「${name}」这张图的画面这次没取到，造型不能凭空编、已存造型没动：请再点一次「分析造型」。`,
    };
  }
  const failedOutcome = (
    message: string,
  ): PresetImageLookOutcome => ({
    ok: false,
    failed: true,
    savedPending: false,
    message,
  });
  try {
    const storedJobId = readJob(imageId);
    if (storedJobId != null) {
      let st: ApiResponse<typeof api, "pollPresetImageLookJob"> | null = null;
      try {
        st = await api.pollPresetImageLookJob({ jobId: storedJobId });
      } catch {
        st = null;
      }
      if (!isCurrent()) return null;
      if (st?.status === "done" && st.result) {
        return await applyImageLookResult(
          presetName,
          presetId,
          imgRow,
          st.result,
          storedJobId,
        );
      }
      if (st?.status === "running") {
        return await driveImageLookJob(
          presetName,
          presetId,
          imgRow,
          storedJobId,
          presetImage,
          isCurrent,
        );
      }
      writeJob(imageId, null);
    }
    let start: ApiResponse<typeof api, "startPresetImageLookJob">;
    try {
      start = await api.startPresetImageLookJob({ presetId, imageId });
    } catch (e) {
      if (!isCurrent()) return null;
      return failedOutcome(
        `没发出去：「${name}」这张图的造型分析任务没建起来（${describeThrownError(e)}），服务端没回任务号。已存造型没动，再点一次「分析造型」即可。`,
      );
    }
    if (!isCurrent()) return null;
    if (!start.ok || start.jobId == null) {
      return failedOutcome(
        `没发出去：「${name}」这张图的造型分析任务没建起来：${start.error ?? "服务端没回任务号"}。已存造型没动，再点一次「分析造型」即可。`,
      );
    }
    writeJob(imageId, start.jobId);
    return await driveImageLookJob(
      presetName,
      presetId,
      imgRow,
      start.jobId,
      presetImage,
      isCurrent,
    );
  } catch (e) {
    if (!isCurrent()) return null;
    return failedOutcome(
      `「${name}」这张图的造型分析没做成：${describeThrownError(e)}。已存造型没动，再点一次「分析造型」即可。`,
    );
  }
}
