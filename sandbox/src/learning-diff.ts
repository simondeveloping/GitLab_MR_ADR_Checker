/** Diff-Aufteilung mit expliziten Originalzeilen für den mehrstufigen Lernreview. */

export interface DiffLine {
  kind: "+" | "-" | " ";
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface LearningFile {
  path: string;
  oldPath: string;
  hunks: DiffHunk[];
}

export interface LearningChunk {
  id: string;
  paths: string[];
  diff: string;
  oversized: boolean;
}

/** Git quotet unter anderem Unicode-Pfade als oktale UTF-8-Bytes. */
function gitPath(value: string): string {
  const raw = value.trim();
  if (!raw.startsWith('"')) return raw;
  const bytes: number[] = [];
  const escapes: Record<string, string> = { a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r" };
  for (let i = 1; i < raw.length - 1; i += 1) {
    if (raw[i] === "\\") {
      const octal = /^[0-7]{1,3}/.exec(raw.slice(i + 1));
      if (octal) {
        bytes.push(parseInt(octal[0], 8));
        i += octal[0].length;
        continue;
      }
      i += 1;
      bytes.push(...Buffer.from(escapes[raw[i]] ?? raw[i]));
    } else {
      const character = String.fromCodePoint(raw.codePointAt(i)!);
      bytes.push(...Buffer.from(character));
      i += character.length - 1;
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

export function parseLearningDiff(patch: string): LearningFile[] {
  const files: LearningFile[] = [];
  let file: LearningFile | undefined;
  let hunk: DiffHunk | undefined;
  let oldLine = 0;
  let newLine = 0;
  let oldLeft = 0;
  let newLeft = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      file = { path: "", oldPath: "", hunks: [] };
      files.push(file);
      hunk = undefined;
      oldLeft = newLeft = 0;
      continue;
    }
    if (!file) continue;
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header) {
      oldLine = Number(header[1]);
      oldLeft = Number(header[2] ?? 1);
      newLine = Number(header[3]);
      newLeft = Number(header[4] ?? 1);
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
    } else if (hunk && (oldLeft > 0 || newLeft > 0)) {
      // Innerhalb eines Hunks sind auch +++/--- ganz normale Codezeilen.
      const kind = line[0];
      if (kind !== "+" && kind !== "-" && kind !== " ") continue;
      hunk.lines.push({
        kind,
        text: line.slice(1),
        oldLine: kind === "+" ? undefined : oldLine++,
        newLine: kind === "-" ? undefined : newLine++,
      });
      if (kind !== "+") oldLeft -= 1;
      if (kind !== "-") newLeft -= 1;
    } else if (line.startsWith("--- ")) {
      const path = gitPath(line.slice(4));
      file.oldPath = path === "/dev/null" ? "" : path.replace(/^a\//, "");
    } else if (line.startsWith("+++ ")) {
      const path = gitPath(line.slice(4));
      file.path = path === "/dev/null" ? file.oldPath : path.replace(/^b\//, "");
    }
  }
  return files.filter((file) => file.path && file.hunks.length > 0);
}

function renderLine(line: DiffLine): string {
  return `alt:${line.oldLine ?? "-"} neu:${line.newLine ?? "-"} | ${line.kind}${line.text}\n`;
}

function renderHeader(file: LearningFile, hunk: DiffHunk): string {
  return `\nDatei: ${JSON.stringify(file.path)} (vorher: ${JSON.stringify(file.oldPath)})\n${hunk.header}\n`;
}

/** Hunkgrenzen bevorzugen; riesige Hunks zeilenweise teilen, ohne Zeilen zu verlieren. */
export function chunkLearningDiff(files: LearningFile[], maxBytes: number): LearningChunk[] {
  const chunks: LearningChunk[] = [];
  let content = "";
  let paths = new Set<string>();
  const flush = () => {
    if (!content) return;
    chunks.push({
      id: `chunk-${chunks.length + 1}`,
      paths: [...paths],
      diff: content,
      oversized: Buffer.byteLength(content) > maxBytes,
    });
    content = "";
    paths = new Set();
  };
  for (const file of files) {
    for (const hunk of file.hunks) {
      const header = renderHeader(file, hunk);
      const rendered = hunk.lines.map(renderLine);
      const whole = header + rendered.join("");
      if (Buffer.byteLength(whole) <= maxBytes) {
        if (Buffer.byteLength(content) + Buffer.byteLength(whole) > maxBytes) flush();
        content += whole;
        paths.add(file.path);
        continue;
      }
      flush();
      for (const line of rendered) {
        if (content && Buffer.byteLength(content) + Buffer.byteLength(line) > maxBytes) flush();
        if (!content) content = header;
        paths.add(file.path);
        content += line;
        // Einzelne überlange Codezeilen werden explizit als offene Einheit gemeldet.
        if (Buffer.byteLength(content) > maxBytes) flush();
      }
      flush();
    }
  }
  flush();
  return chunks;
}

export function addedLinesByPath(files: LearningFile[]): Map<string, Set<number>> {
  return new Map(files.map((file) => [file.path, new Set(file.hunks.flatMap((hunk) =>
    hunk.lines.filter((line) => line.kind === "+").map((line) => line.newLine!),
  ))]));
}

/** Originaldiff um einen Kandidaten, unabhängig von Modell-Zusammenfassungen. */
export function candidateDiff(files: LearningFile[], path: string, line: number): string {
  const file = files.find((entry) => entry.path === path);
  if (!file) return "";
  for (const hunk of file.hunks) {
    const index = hunk.lines.findIndex((entry) => entry.kind === "+" && entry.newLine === line);
    if (index < 0) continue;
    let start = index;
    let end = index + 1;
    let bytes = Buffer.byteLength(renderLine(hunk.lines[index]));
    for (let distance = 1; distance <= 12; distance += 1) {
      for (const next of [index - distance, index + distance]) {
        if (next < 0 || next >= hunk.lines.length) continue;
        const size = Buffer.byteLength(renderLine(hunk.lines[next]));
        if (bytes + size > 12_000) continue;
        // Nur zusammenhängende Bereiche ausgeben.
        if (next === start - 1) start = next;
        else if (next === end) end = next + 1;
        else continue;
        bytes += size;
      }
    }
    return renderHeader(file, hunk) + hunk.lines.slice(start, end).map(renderLine).join("");
  }
  return "";
}
