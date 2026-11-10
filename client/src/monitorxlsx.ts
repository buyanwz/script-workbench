// 监控页 Excel（.xlsx）导入导出（v4.44）：纯浏览器本地解析与生成，
// 不引入新依赖、不走服务端——.xlsx 本质是装着几个 XML 的 ZIP：
// 读取 = 自研 ZIP 中央目录解析（stored 直读、deflate 走浏览器
// DecompressionStream 解压）+ DOMParser 解 sharedStrings / 首个
// worksheet；模板生成 = 把最小工作簿 XML 用 scriptlib 的
// buildStoredZip 打成 stored ZIP 改名 .xlsx（Excel / WPS /
// LibreOffice 都能打开的标准 Office Open XML 结构）。
//
// 解析口径：第一行非空行 = 表头行；单元格支持共享字符串（t="s"）、
// 内联字符串（inlineStr）、公式字符串（t="str"）与普通值（<v>）；
// 带日期样式的数字单元格按 Excel 序列号转回「YYYY-MM-DD HH:mm」
// 文本（序列号 = 1899-12-30 起的天数，含小数时间），其余数字原样
// 以文本返回——字段归一（去千分位逗号、时间格式）由调用方按既有
// 粘贴管线口径处理，这里不猜。

import { buildStoredZip } from "./scriptlib";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Excel 日期序列号 → 「YYYY-MM-DD HH:mm」（按 UTC 分量拼，序列号
// 本身是无时区的地方时间表示，用户在表格里填几点就是几点）。
export function excelSerialToText(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serial);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// 看着像 Excel 日期序列号的纯数字（约 20000–70000，即 1954–2091
// 年）：发布时间 / 采集时间列里出现这种值，多半是表格软件把日期
// 存成了序列号（单元格没带日期样式时解析层认不出），调用方按
// 字段再转一次。普通计数（播放量等）不走这个判断。
export function looksLikeExcelSerial(raw: string): boolean {
  if (!/^\d{4,5}(\.\d+)?$/.test(raw.trim())) return false;
  const n = Number(raw);
  return n >= 20000 && n <= 70000;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const DS = (
    globalThis as {
      DecompressionStream?: new (
        format: string,
      ) => ReadableWritablePair<Uint8Array, Uint8Array>;
    }
  ).DecompressionStream;
  if (!DS) throw new Error("当前浏览器不支持解压这个表格文件");
  const stream = new Blob([bytes]).stream().pipeThrough(new DS("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ZIP 中央目录解析：只解出 XML / rels 条目（xlsx 读取需要的全是
// XML，其余如内嵌图片直接跳过不解压）。
async function readZipXmlEntries(
  buf: ArrayBuffer,
): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("这个文件不像是 .xlsx 表格（没找到表格结构）");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOff = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
    if (view.getUint32(localOff, true) !== 0x04034b50) continue;
    const lNameLen = view.getUint16(localOff + 26, true);
    const lExtraLen = view.getUint16(localOff + 28, true);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const comp = bytes.subarray(start, start + compSize);
    if (method === 0) out.set(name, new Uint8Array(comp));
    else if (method === 8) out.set(name, await inflateRaw(comp));
    else throw new Error(`这个表格的压缩方式读不了（方式 ${method}）`);
  }
  return out;
}

function parseXml(bytes: Uint8Array, what: string): Document {
  const doc = new DOMParser().parseFromString(
    new TextDecoder().decode(bytes),
    "text/xml",
  );
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`${what}读不出来（内容损坏）`);
  }
  return doc;
}

function allText(el: Element, tag: string): string {
  let s = "";
  const nodes = el.getElementsByTagName(tag);
  for (let i = 0; i < nodes.length; i++) s += nodes[i]?.textContent ?? "";
  return s;
}

// 样式里哪些 xf 是日期格式：内置日期 numFmtId（14–22、27–36、
// 45–47、50、57）或自定义格式串里带年月日时分秒标记。
function dateStyleIndexes(stylesDoc: Document | null): Set<number> {
  const out = new Set<number>();
  if (!stylesDoc) return out;
  const custom = new Map<string, string>();
  const fmts = stylesDoc.getElementsByTagName("numFmt");
  for (let i = 0; i < fmts.length; i++) {
    const el = fmts[i];
    if (el) custom.set(el.getAttribute("numFmtId") ?? "", el.getAttribute("formatCode") ?? "");
  }
  const builtinDate = (id: number) =>
    (id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || id === 50 || id === 57;
  const xfsRoot = stylesDoc.getElementsByTagName("cellXfs")[0];
  if (!xfsRoot) return out;
  const xfs = xfsRoot.getElementsByTagName("xf");
  for (let i = 0; i < xfs.length; i++) {
    const idText = xfs[i]?.getAttribute("numFmtId") ?? "0";
    const id = Number(idText);
    if (builtinDate(id)) {
      out.add(i);
      continue;
    }
    const fmt = custom.get(idText) ?? "";
    if (fmt && /[ymdhHs]/i.test(fmt) && /[md]/i.test(fmt)) out.add(i);
  }
  return out;
}

function colIndexFromCellRef(ref: string): number {
  const m = ref.match(/^[A-Z]+/i);
  if (!m) return -1;
  let idx = 0;
  for (const ch of (m[0] ?? "").toUpperCase()) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1;
}

export type ParsedXlsx = {
  headers: string[];
  // 每行 = 表头名 → 单元格文本（缺列 / 空单元格不在键里）。
  rows: Record<string, string>[];
};

// 解析一个 .xlsx 文件：取第一个工作表，第一行非空行作表头，
// 其余非空行逐行成记录。表头认不出 / 没有数据行时由调用方按
// headers 与 rows 的实际情况提示，这里只对文件级损坏抛错。
export async function parseMonitorXlsx(file: File): Promise<ParsedXlsx> {
  const entries = await readZipXmlEntries(await file.arrayBuffer());
  const sheetNames = [...entries.keys()]
    .filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k))
    .sort();
  const sheetName = sheetNames[0];
  if (!sheetName) throw new Error("这个表格里没找到工作表");
  const sheetBytes = entries.get(sheetName);
  if (!sheetBytes) throw new Error("这个表格的工作表读不出来");

  const shared: string[] = [];
  const sharedBytes = entries.get("xl/sharedStrings.xml");
  if (sharedBytes) {
    const sharedDoc = parseXml(sharedBytes, "表格的共享文本");
    const sis = sharedDoc.getElementsByTagName("si");
    for (let i = 0; i < sis.length; i++) {
      const si = sis[i];
      shared.push(si ? allText(si, "t") : "");
    }
  }
  const stylesBytes = entries.get("xl/styles.xml");
  const dateStyles = dateStyleIndexes(
    stylesBytes ? parseXml(stylesBytes, "表格的样式") : null,
  );

  const sheetDoc = parseXml(sheetBytes, "表格的工作表");
  const rowEls = sheetDoc.getElementsByTagName("row");
  const grid: string[][] = [];
  for (let r = 0; r < rowEls.length; r++) {
    const rowEl = rowEls[r];
    if (!rowEl) continue;
    const cells: string[] = [];
    const cellEls = rowEl.getElementsByTagName("c");
    let nextCol = 0;
    for (let c = 0; c < cellEls.length; c++) {
      const cell = cellEls[c];
      if (!cell) continue;
      const ref = cell.getAttribute("r") ?? "";
      const colIdx = ref ? colIndexFromCellRef(ref) : nextCol;
      const idx = colIdx >= 0 ? colIdx : nextCol;
      nextCol = idx + 1;
      const t = cell.getAttribute("t") ?? "";
      let value = "";
      if (t === "s") {
        const raw = allText(cell, "v").trim();
        value = raw === "" ? "" : (shared[Number(raw)] ?? "");
      } else if (t === "inlineStr") {
        const is = cell.getElementsByTagName("is")[0];
        value = is ? allText(is, "t") : "";
      } else {
        value = allText(cell, "v");
        if (value !== "" && t !== "str" && t !== "e") {
          const styleIdx = Number(cell.getAttribute("s") ?? "-1");
          const num = Number(value);
          if (dateStyles.has(styleIdx) && Number.isFinite(num)) {
            value = excelSerialToText(num);
          }
        }
      }
      cells[idx] = value;
    }
    grid.push(cells);
  }

  const headerRowIdx = grid.findIndex((row) => row.some((v) => (v ?? "").trim() !== ""));
  if (headerRowIdx < 0) return { headers: [], rows: [] };
  const headers = (grid[headerRowIdx] ?? []).map((h) => (h ?? "").trim());
  const rows: Record<string, string>[] = [];
  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (!row.some((v) => (v ?? "").trim() !== "")) continue;
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (!h || rec[h] !== undefined) return;
      const v = (row[i] ?? "").trim();
      if (v !== "") rec[h] = v;
    });
    rows.push(rec);
  }
  return { headers, rows };
}

function xmlEscapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colName(idx: number): string {
  let n = idx + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// 生成只有一行表头的空模板 .xlsx（列名 = 传入的 18 项规范名），
// 并以固定文件名触发一次下载。
export function downloadMonitorTemplateXlsx(headers: string[]): void {
  const enc = new TextEncoder();
  const headerCells = headers
    .map(
      (h, i) =>
        `<c r="${colName(i)}1" t="inlineStr"><is><t>${xmlEscapeText(h)}</t></is></c>`,
    )
    .join("");
  const files: { filename: string; content: string }[] = [
    {
      filename: "[Content_Types].xml",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `</Types>`,
    },
    {
      filename: "_rels/.rels",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      filename: "xl/workbook.xml",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="监控视频" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      filename: "xl/_rels/workbook.xml.rels",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `</Relationships>`,
    },
    {
      filename: "xl/worksheets/sheet1.xml",
      content:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<sheetData><row r="1">${headerCells}</row></sheetData></worksheet>`,
    },
  ];
  const zip = buildStoredZip(
    files.map((f) => ({ filename: f.filename, bytes: enc.encode(f.content) })),
  );
  const blob = new Blob([zip], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "监控视频导入模板.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
