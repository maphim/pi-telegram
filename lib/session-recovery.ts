import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export interface OcrStripResult {
  ok: boolean;
  path?: string;
  backup?: string | null;
  changed_images?: number;
  changed_entries?: number;
  saved_chars_approx?: number;
  dry_run?: boolean;
  error?: string;
  stderr?: string;
}

const DEFAULT_SCRIPT = "/media/anhnc/Data/Workspace/brain/scripts/ocr-strip-session.py";

export function stripSessionImagesWithOcr(
  sessionPath: string | undefined,
  opts?: { scriptPath?: string; lang?: string; dryRun?: boolean; maxImages?: number },
): OcrStripResult {
  if (!sessionPath) return { ok: false, error: "no_session_path" };
  if (!existsSync(sessionPath)) return { ok: false, error: "session_not_found", path: sessionPath };
  const scriptPath = opts?.scriptPath || process.env.PI_OCR_STRIP_SCRIPT || DEFAULT_SCRIPT;
  if (!existsSync(scriptPath)) return { ok: false, error: "ocr_script_not_found", path: sessionPath };
  const args = [scriptPath, sessionPath, "--json", "--lang", opts?.lang || process.env.PI_OCR_LANG || "eng+vie"];
  if (opts?.dryRun) args.push("--dry-run");
  if (typeof opts?.maxImages === "number") args.push("--max-images", String(opts.maxImages));
  try {
    const r = spawnSync("python3", args, { encoding: "utf8", timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
    const out = (r.stdout || "").trim();
    const err = (r.stderr || "").trim();
    if (r.status !== 0) {
      return { ok: false, error: "ocr_strip_failed", path: sessionPath, stderr: (err || out).slice(0, 500) };
    }
    try {
      const j = JSON.parse(out || "{}") as OcrStripResult;
      return j;
    } catch {
      return { ok: false, error: "ocr_strip_bad_output", path: sessionPath, stderr: (err || out).slice(0, 500) };
    }
  } catch (e) {
    return { ok: false, error: "ocr_strip_exception", path: sessionPath, stderr: String(e).slice(0, 300) };
  }
}

export function formatOcrStripNotice(res: OcrStripResult): string | undefined {
  if (!res.ok) return undefined;
  const n = res.changed_images || 0;
  if (n <= 0) return undefined;
  const saved = res.saved_chars_approx || 0;
  const mb = saved > 0 ? `, giảm ~${(saved / 1024 / 1024).toFixed(1)} MB payload` : "";
  return `\n\n🧾 Tự xử lý 413: đã OCR và thay ${n} ảnh bằng text trong phiên${mb}. Backup: ${res.backup || "(n/a)"}. Anh gửi lại tin nhắn (hoặc /compact) để tiếp tục.`;
}
