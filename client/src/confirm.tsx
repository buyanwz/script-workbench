import type { ReactNode } from "react";

/**
 * Shared destructive-action confirmation dialog (modal overlay).
 *
 * Every irreversible action in the workbench — deleting a project, a
 * character card, a scene image or a preset, discarding an unsaved
 * draft, overwriting the current script by regenerating — must go
 * through this dialog BEFORE anything is executed. The dialog states
 * exactly what will be removed and whether it can be recovered.
 * (v5.29: automatic version snapshots were removed entirely, so no
 * dialog may promise a snapshot restore anymore — unrecoverable
 * actions say so plainly, e.g. "删除后无法恢复".)
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "取消",
  pending = false,
  extraActions,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  /** Extra buttons rendered before the confirm button (e.g. 先导出当前稿). */
  extraActions?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      style={{
        background: "rgba(3, 5, 9, 0.62)",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-[14px] border p-5"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-card)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-lg font-bold">{title}</p>
        <div className="mt-2 text-sm leading-6 text-[var(--text)]">{body}</div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          {extraActions}
          <button
            type="button"
            className="btn btn-primary"
            style={{ background: "var(--terra)", borderColor: "var(--terra)" }}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
