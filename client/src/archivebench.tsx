// ---------------------------------------------------------------------------
// 项目储存箱（v4.76）：顶部第四个页签，与剧本工作台 / 人物资产储存库 /
// 监控账号并列。存入储存箱的项目（projects.archived=1）只在这里出现：
// 左侧分类栏（默认「暂时不用」「已使用」+ 自定义分类，可新建 / 改名 /
// 删除，删分类其下项目自动回「暂时不用」），右侧项目卡片墙——每张卡
// 可打 1–5 星、换分类、一键「取回工作区」；顶部搜索按项目名搜，星级
// 筛选 + 排序（存入时间 / 星级 / 名称）。存入 / 取回只改 archived 标记，
// 剧本、分镜、封面记录、版本历史全部原样保留。
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { ConfirmDialog } from "./confirm";
import { describeThrownError, retryReadQuery, withReadTimeout } from "./gateway";

type ArchivedProject = {
  id: number;
  name: string;
  hasScript: boolean;
  characterCount: number;
  hasOutline: boolean;
  updatedAt: string;
  archived: boolean;
  archiveCategory: string;
  stars: number;
  archivedAt: string | null;
};

type SortMode = "archivedAt" | "stars" | "name";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

export function ArchiveBench({
  onRestored,
}: {
  /** 取回后跳回剧本工作台并选中该项目。 */
  onRestored: (projectId: number) => void;
}) {
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => withReadTimeout(() => api.listProjects({})),
    retry: retryReadQuery,
  });
  const categoriesQuery = useQuery({
    queryKey: ["archiveCategories"],
    queryFn: () => withReadTimeout(() => api.listArchiveCategories({})),
    retry: retryReadQuery,
  });
  const archived = useMemo<ArchivedProject[]>(
    () =>
      (projectsQuery.data?.projects ?? []).filter(
        (p) => p.archived,
      ) as ArchivedProject[],
    [projectsQuery.data],
  );
  const categories = categoriesQuery.data?.categories ?? [];

  const [activeCategory, setActiveCategory] = useState<string>("全部");
  const [search, setSearch] = useState("");
  const [starFilter, setStarFilter] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>("archivedAt");
  const [msg, setMsg] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingCategory, setDeletingCategory] = useState<{
    id: number;
    name: string;
    count: number;
  } | null>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["archiveCategories"] });
  };

  const unarchiveMut = useMutation({
    mutationFn: (id: number) => api.unarchiveProjects({ ids: [id] }),
    onSuccess: (_res, id) => {
      const p = archived.find((x) => x.id === id);
      setMsg(
        `已取回工作区：${p?.name ?? "项目"}（分类「${p?.archiveCategory ?? ""}」与 ${p?.stars ?? 0} 星保留）`,
      );
      invalidateAll();
      onRestored(id);
    },
    onError: (e) => setMsg(`取回失败：${describeThrownError(e)}`),
  });
  const starsMut = useMutation({
    mutationFn: (args: { id: number; stars: number }) =>
      api.setProjectStars(args),
    onSuccess: () => invalidateAll(),
    onError: (e) => setMsg(`打星失败：${describeThrownError(e)}`),
  });
  const moveMut = useMutation({
    mutationFn: (args: { id: number; category: string }) =>
      api.setProjectArchiveCategory(args),
    onSuccess: () => invalidateAll(),
    onError: (e) => setMsg(`换分类失败：${describeThrownError(e)}`),
  });
  const createCategoryMut = useMutation({
    mutationFn: (name: string) => api.createArchiveCategory({ name }),
    onSuccess: (res) => {
      if (res.ok) {
        setNewCategoryName("");
        setMsg("分类已新建");
        invalidateAll();
      } else {
        setMsg(res.error ?? "新建分类失败");
      }
    },
    onError: (e) => setMsg(`新建分类失败：${describeThrownError(e)}`),
  });
  const renameCategoryMut = useMutation({
    mutationFn: (args: { id: number; name: string }) =>
      api.renameArchiveCategory(args),
    onSuccess: (res, args) => {
      if (res.ok) {
        setRenamingId(null);
        if (activeCategory !== "全部") {
          const old = categories.find((c) => c.id === args.id);
          if (old && activeCategory === old.name) setActiveCategory(args.name);
        }
        setMsg("分类已改名，其下项目的分类名已同步");
        invalidateAll();
      } else {
        setMsg(res.error ?? "改名失败");
      }
    },
    onError: (e) => setMsg(`改名失败：${describeThrownError(e)}`),
  });
  const deleteCategoryMut = useMutation({
    mutationFn: (id: number) => api.deleteArchiveCategory({ id }),
    onSuccess: (res) => {
      setDeletingCategory(null);
      if (res.ok) {
        if (deletingCategory && activeCategory === deletingCategory.name) {
          setActiveCategory("全部");
        }
        setMsg("分类已删除，其下项目已移回「暂时不用」");
        invalidateAll();
      } else {
        setMsg(res.error ?? "删除分类失败");
      }
    },
    onError: (e) => setMsg(`删除分类失败：${describeThrownError(e)}`),
  });

  // 分类栏 = 服务端分类 ∪ 已存项目里出现但分类表没有的名字（兜底，
  // 正常不会发生），保证每个已存项目都找得到自己的分类入口。
  const categoryNames = useMemo(() => {
    const names = categories.map((c) => c.name);
    for (const p of archived) {
      if (!names.includes(p.archiveCategory)) names.push(p.archiveCategory);
    }
    return names;
  }, [categories, archived]);
  const countOf = (name: string) =>
    archived.filter((p) => p.archiveCategory === name).length;

  const visible = useMemo(() => {
    let list = archived;
    if (activeCategory !== "全部") {
      list = list.filter((p) => p.archiveCategory === activeCategory);
    }
    const q = search.trim();
    if (q) list = list.filter((p) => p.name.includes(q));
    if (starFilter > 0) list = list.filter((p) => p.stars >= starFilter);
    const sorted = [...list];
    if (sortMode === "stars") {
      sorted.sort(
        (a, b) => b.stars - a.stars || a.name.localeCompare(b.name, "zh-CN"),
      );
    } else if (sortMode === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    } else {
      sorted.sort((a, b) =>
        (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""),
      );
    }
    return sorted;
  }, [archived, activeCategory, search, starFilter, sortMode]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-bold">项目储存箱</h2>
        <span className="text-sm text-[var(--dim)]">
          共 {archived.length} 个已存项目 · 存入 / 取回不删任何数据
        </span>
        <span className="min-w-2 flex-1" aria-hidden="true" />
        <label className="sr-only" htmlFor="archive-search">
          按项目名搜索储存箱
        </label>
        <input
          id="archive-search"
          className="field field-sm min-w-0 sm:max-w-[220px]"
          placeholder="搜索项目名"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="sr-only" htmlFor="archive-star-filter">
          按星级筛选（至少几星）
        </label>
        <select
          id="archive-star-filter"
          className="field field-sm"
          value={starFilter}
          onChange={(e) => setStarFilter(Number(e.target.value))}
        >
          <option value={0}>全部星级</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} 星及以上
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="archive-sort">
          储存箱排序方式
        </label>
        <select
          id="archive-sort"
          className="field field-sm"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
        >
          <option value="archivedAt">按存入时间（新到旧）</option>
          <option value="stars">按星级（高到低）</option>
          <option value="name">按项目名</option>
        </select>
      </div>

      {msg && (
        <p
          className="mt-2 flex items-center gap-2 text-xs text-[var(--dim)]"
          role="status"
        >
          <span className="min-w-0 flex-1">{msg}</span>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            aria-label="关闭储存箱提示"
            onClick={() => setMsg(null)}
          >
            ×
          </button>
        </p>
      )}

      <div className="mt-4 flex flex-col gap-4 md:flex-row">
        {/* 左侧分类栏 */}
        <aside
          className="shrink-0 md:w-52"
          aria-label="储存箱分类栏"
        >
          <ul className="flex flex-wrap gap-1.5 md:flex-col md:flex-nowrap">
            <li>
              <button
                type="button"
                className="btn btn-sm w-full justify-between"
                aria-pressed={activeCategory === "全部"}
                style={
                  activeCategory === "全部"
                    ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                    : undefined
                }
                onClick={() => setActiveCategory("全部")}
              >
                <span>全部</span>
                <span className="text-[var(--dim)]">{archived.length}</span>
              </button>
            </li>
            {categoryNames.map((name) => {
              const cat = categories.find((c) => c.name === name);
              const active = activeCategory === name;
              return (
                <li key={name} className="flex items-center gap-1">
                  {renamingId != null && cat && renamingId === cat.id ? (
                    <>
                      <label className="sr-only" htmlFor={`archive-cat-rename-${cat.id}`}>
                        分类改名
                      </label>
                      <input
                        id={`archive-cat-rename-${cat.id}`}
                        className="field field-sm min-w-0 flex-1"
                        value={renameDraft}
                        autoFocus
                        maxLength={40}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const v = renameDraft.trim();
                            if (v) renameCategoryMut.mutate({ id: cat.id, name: v });
                          }
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm shrink-0"
                        aria-label={`保存分类「${name}」的新名字`}
                        disabled={renameCategoryMut.isPending}
                        onClick={() => {
                          const v = renameDraft.trim();
                          if (v) renameCategoryMut.mutate({ id: cat.id, name: v });
                        }}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm shrink-0"
                        aria-label="取消改名"
                        onClick={() => setRenamingId(null)}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm min-w-0 flex-1 justify-between"
                        aria-pressed={active}
                        style={
                          active
                            ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                            : undefined
                        }
                        onClick={() => setActiveCategory(name)}
                      >
                        <span className="truncate">{name}</span>
                        <span className="text-[var(--dim)]">{countOf(name)}</span>
                      </button>
                      {cat && (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm shrink-0 px-1.5"
                            aria-label={`给分类「${name}」改名`}
                            title="改名"
                            onClick={() => {
                              setRenamingId(cat.id);
                              setRenameDraft(name);
                            }}
                          >
                            ✎
                          </button>
                          {name !== "暂时不用" && (
                            <button
                              type="button"
                              className="btn btn-sm shrink-0 px-1.5"
                              aria-label={`删除分类「${name}」（其下项目移回暂时不用，不删项目）`}
                              title="删除分类"
                              onClick={() =>
                                setDeletingCategory({
                                  id: cat.id,
                                  name,
                                  count: countOf(name),
                                })
                              }
                            >
                              🗑
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center gap-1.5">
            <label className="sr-only" htmlFor="archive-new-category">
              新分类名称
            </label>
            <input
              id="archive-new-category"
              className="field field-sm min-w-0 flex-1"
              placeholder="新分类名"
              value={newCategoryName}
              maxLength={40}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = newCategoryName.trim();
                  if (v) createCategoryMut.mutate(v);
                }
              }}
            />
            <button
              type="button"
              className="btn btn-sm shrink-0"
              aria-label="新建储存箱分类"
              disabled={!newCategoryName.trim() || createCategoryMut.isPending}
              onClick={() => {
                const v = newCategoryName.trim();
                if (v) createCategoryMut.mutate(v);
              }}
            >
              新建分类
            </button>
          </div>
        </aside>

        {/* 右侧项目卡片墙 */}
        <div className="min-w-0 flex-1">
          {projectsQuery.isPending ? (
            <p className="py-10 text-center text-sm text-[var(--dim)]">加载中…</p>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--dim)]">
              {archived.length === 0
                ? "储存箱是空的。在剧本工作台的项目列表里点「存入储存箱」，项目就会到这里来。"
                : "当前分类 / 搜索 / 星级筛选下没有项目，换个条件看看。"}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((p) => (
                <li key={p.id} className="card flex flex-col gap-2 p-3.5">
                  <p className="font-display text-[15px] font-bold leading-6">
                    {p.name}
                  </p>
                  <p className="text-xs leading-5 text-[var(--dim)]">
                    {p.hasScript ? "已有剧本" : "暂无剧本"} · 人物 {p.characterCount} 位
                    <br />
                    存入时间：{fmtTime(p.archivedAt)}
                  </p>
                  <div
                    className="flex items-center gap-0.5"
                    role="group"
                    aria-label={`给项目「${p.name}」打星（当前 ${p.stars} 星）`}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className="px-0.5 text-lg leading-none"
                        style={{
                          color: n <= p.stars ? "var(--accent)" : "var(--dim)",
                        }}
                        aria-label={`把「${p.name}」设为 ${n} 星`}
                        aria-pressed={p.stars === n}
                        disabled={starsMut.isPending}
                        onClick={() =>
                          starsMut.mutate({
                            id: p.id,
                            stars: p.stars === n ? 0 : n,
                          })
                        }
                      >
                        {n <= p.stars ? "★" : "☆"}
                      </button>
                    ))}
                    <span className="ml-1 text-xs text-[var(--dim)]">
                      {p.stars > 0 ? `${p.stars} 星` : "未打星"}
                    </span>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    <label
                      className="sr-only"
                      htmlFor={`archive-move-${p.id}`}
                    >
                      把「{p.name}」移到分类
                    </label>
                    <select
                      id={`archive-move-${p.id}`}
                      className="field field-sm min-w-0 flex-1"
                      value={p.archiveCategory}
                      onChange={(e) =>
                        moveMut.mutate({ id: p.id, category: e.target.value })
                      }
                    >
                      {categoryNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm shrink-0"
                      aria-label={`把项目「${p.name}」取回工作区`}
                      disabled={unarchiveMut.isPending}
                      onClick={() => unarchiveMut.mutate(p.id)}
                    >
                      取回工作区
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {deletingCategory && (
        <ConfirmDialog
          title={`删除分类「${deletingCategory.name}」？`}
          body={
            <>
              <p>
                这个分类下有 {deletingCategory.count}{" "}
                个项目，删分类不会删项目——它们会自动移回「暂时不用」分类。
              </p>
              <p className="mt-1.5">分类本身删掉后不能恢复（可以重新新建同名分类）。</p>
            </>
          }
          confirmLabel="删除分类"
          pending={deleteCategoryMut.isPending}
          onConfirm={() => deleteCategoryMut.mutate(deletingCategory.id)}
          onCancel={() => setDeletingCategory(null)}
        />
      )}
    </div>
  );
}
