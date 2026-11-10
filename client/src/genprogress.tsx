// ---------------------------------------------------------------------------
// GenProgress — 全站共用的生成进度条（v3.57 起）。
//
// 所有 AI 生成 / 分析流程共用这一套，不为每个流程各写一套：
//   剧本分段生成、大纲 AI 填写、确认分镜 / 重新生成分镜、
//   人物分析、储存库一键填写、模式训练窗口的分析进度。
//
// 三要素缺一不可（文案规则全站统一）：
//   ① 当前阶段文字（stage，如「正在写第 3 段 / 共 8 段」）
//   ② 已完成数 / 总数（completed / total，带单位 unit）
//   ③ 已保存数（saved，缺省 = completed；可用 savedText 整段覆盖）
//
// 形态规则：
//   - 常驻明显的条：生成中一直显示；sticky 时吸在滚动区顶部，
//     页面滚动不会把它顶掉。
//   - total > 0 时按 completed / total 显示真实百分比；total <= 0
//     （如整体规划阶段还不知道总段数）或 indeterminate 时显示
//     滑动动画条，不假装有百分比。
//   - failed 非空时条停在当前进度、变失败色，阶段行写明停在哪一步，
//     失败原因单独一行写清，绝不假装走完。
//   - done 时全条完成色，显示 100%。
//
// 样式只用 theme.css 的语义变量（--surface / --border / --accent /
// --bad / --ok），所以经典 / 白昼 / 未来三款主题与储存库、训练窗口
// 里长得一致；modebench / charbench 用内联样式为主，也能直接用。
// ---------------------------------------------------------------------------

export type GenProgressProps = {
  /** 当前阶段文字，如「整体规划中」「正在写第 3 段 / 共 8 段」 */
  stage: string;
  /** 已完成数 */
  completed: number;
  /** 总数；<= 0 表示还不知道总数（不确定进度动画） */
  total: number;
  /** 计数单位，默认「段」；训练窗口传 "%" 时 completed/total 直接是百分比口径 */
  unit?: string;
  /** 已保存数，缺省 = completed */
  saved?: number;
  /** 整段覆盖「已保存…」文案（如「已抽帧 5 张，分析成功后存为训练记录」） */
  savedText?: string;
  /** 整段覆盖「已完成 X / 共 Y」文案 */
  countText?: string;
  /** 失败原因：非空时进度条停住并变失败色 */
  failed?: string | null;
  /** 已全部完成 */
  done?: boolean;
  /** 阶段行下方的补充说明（小字） */
  note?: string;
  /** 是否吸顶常驻（默认 true）：滚动时不被顶掉 */
  sticky?: boolean;
  /** 无障碍名称，默认「生成进度」 */
  ariaLabel?: string;
  /** 强制不确定进度动画（单次调用类流程：总数已知但中途无分步进度） */
  indeterminate?: boolean;
};

export function GenProgress(props: GenProgressProps) {
  const {
    stage,
    completed,
    total,
    unit = "段",
    saved,
    savedText,
    countText,
    failed,
    done,
    note,
    sticky = true,
    ariaLabel = "生成进度",
    indeterminate = false,
  } = props;
  const isFailed = !!failed;
  const determinate = !indeterminate && total > 0;
  const pct = done
    ? 100
    : determinate
      ? Math.max(0, Math.min(100, Math.round((completed / total) * 100)))
      : 0;
  const fillColor = isFailed
    ? "var(--bad)"
    : done
      ? "var(--ok)"
      : "var(--accent)";
  const savedShown = saved ?? completed;
  const countLine =
    countText ??
    (total > 0
      ? `已完成 ${completed} / 共 ${total} ${unit}`
      : "总数待规划完成后确定");
  const savedLine =
    savedText ?? (total > 0 ? `已保存 ${savedShown} ${unit}` : `已保存 ${savedShown} ${unit}`);
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      style={{
        ...(sticky
          ? { position: "sticky", top: 8, zIndex: 30 }
          : null),
        marginTop: 10,
        border: `1px solid ${isFailed ? "var(--bad)" : "var(--border)"}`,
        borderRadius: "var(--radius)",
        background: "var(--surface)",
        padding: "10px 12px",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <p
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: isFailed ? "var(--bad)" : "var(--text)",
            lineHeight: "20px",
          }}
        >
          {stage}
        </p>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: isFailed ? "var(--bad)" : "var(--accent)",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {determinate || done ? `${pct}%` : "进行中"}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={determinate || done ? 100 : undefined}
        aria-valuenow={determinate || done ? pct : undefined}
        aria-valuetext={stage}
        style={{
          marginTop: 7,
          height: 10,
          borderRadius: 999,
          background: "var(--border)",
          overflow: "hidden",
        }}
      >
        {determinate || done ? (
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 999,
              background: fillColor,
              transition: "width 300ms ease",
            }}
          />
        ) : (
          <div className="gen-progress-indet">
            <div
              style={{
                width: "32%",
                height: "100%",
                borderRadius: 999,
                background: fillColor,
              }}
            />
          </div>
        )}
      </div>
      <p
        style={{
          marginTop: 6,
          fontSize: 12,
          lineHeight: "18px",
          color: "var(--dim)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {countLine} · {savedLine}
        {note ? ` · ${note}` : ""}
      </p>
      {isFailed && (
        <p
          role="alert"
          style={{
            marginTop: 4,
            fontSize: 12.5,
            lineHeight: "19px",
            color: "var(--bad)",
          }}
        >
          {failed}
        </p>
      )}
    </div>
  );
}
