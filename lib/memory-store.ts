import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(name: string) {
  return path.join(DATA_DIR, `${name}.json`);
}

export function saveJSON(name: string, data: unknown): void {
  ensureDataDir();
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8");
}

export function loadJSON<T = unknown>(name: string): T | null {
  try {
    const raw = fs.readFileSync(filePath(name), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function listStored(): string[] {
  ensureDataDir();
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

export function deleteStored(name: string): boolean {
  const fp = filePath(name);
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
    return true;
  }
  return false;
}

export interface RunRecord {
  run_id: string;
  created_at: string;
  csv_filename: string;
  row_count: number;
  avatar_count: number;
  sillage_accounts_pushed: number;
  sillage_agents_created: string[];
  signal_count: number;
  icp_snapshot: unknown;
}

export function saveRun(record: RunRecord): void {
  saveJSON(`run_${record.run_id}`, record);
  const index: RunRecord[] = loadJSON<RunRecord[]>("runs_index") ?? [];
  const existing = index.findIndex((r) => r.run_id === record.run_id);
  if (existing >= 0) {
    index[existing] = record;
  } else {
    index.unshift(record);
  }
  saveJSON("runs_index", index);
}

export function loadRuns(): RunRecord[] {
  return loadJSON<RunRecord[]>("runs_index") ?? [];
}

export function loadRun(run_id: string): RunRecord | null {
  return loadJSON<RunRecord>(`run_${run_id}`);
}
