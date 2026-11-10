// ---------------------------------------------------------------------------
// v4.64 视频云端播放源：悬浮播放器（监控页 / 分析模仿页共用）打开
// 一条视频时，先问服务端这条视频在云端（~/workspace/video-cloud）
// 有没有下载好的文件——对应 brief 的 GET /api/cloud-video/:videoId
// 语义：服务端动作 getCloudVideo 有文件回本站同源播放地址（200 口
// 径），没文件回 exists=false（404 口径）。有云端就播云端（同源、
// 不跨域、链接不过期），没有才回退原来的快手 video_play_url（走
// v4.60 既有过期降级）。checking 期间先不给 src，避免先闪一帧快手
// 直链再切云端；云端命中的判定结果由调用方打「云端」小标。
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { api } from "./api";

/** 云端 videoId 白名单（与服务端同一口径）：字母 / 数字 / 下划线 / 中划线。 */
export function isCloudVideoId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

export function useCloudVideoSource(
  videoId: string,
  fallbackUrl: string,
): { src: string; isCloud: boolean; checking: boolean } {
  const [state, setState] = useState<{
    src: string;
    isCloud: boolean;
    checking: boolean;
  }>(() => ({
    src: "",
    isCloud: false,
    checking: Boolean(videoId) && isCloudVideoId(videoId),
  }));
  useEffect(() => {
    if (!videoId || !isCloudVideoId(videoId)) {
      setState({ src: fallbackUrl, isCloud: false, checking: false });
      return;
    }
    let cancelled = false;
    setState({ src: "", isCloud: false, checking: true });
    api
      .getCloudVideo({ videoId })
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.exists && res.url) {
          setState({ src: res.url, isCloud: true, checking: false });
        } else {
          setState({ src: fallbackUrl, isCloud: false, checking: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ src: fallbackUrl, isCloud: false, checking: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [videoId, fallbackUrl]);
  return state;
}

/** 云端播放时打在播放器左上角的小标。 */
export function CloudBadge() {
  return (
    <span
      className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[11px] font-bold leading-4 text-white shadow"
      aria-label="正在播放云端视频"
    >
      云端
    </span>
  );
}
