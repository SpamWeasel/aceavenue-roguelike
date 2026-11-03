import type { AppInfo, DataFile, SlotData, SlotInfo } from "../../shared/bridge";
import { SAVE_SLOTS } from "../../shared/bridge";

/**
 * Saves go to files through Electron (with rolling backups), or to browser storage in the web
 * preview (with one backup per slot).
 */
const bridge = () => window.aceavenue;
const slotKey = (slot: number) => `aceavenue-slot-${slot + 1}`;

interface SaveFile {
  title: string;
  savedAt: string;
  data: string;
}

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parse(text: string | null): SaveFile | null {
  if (!text) return null;
  try {
    const file = JSON.parse(text) as SaveFile;
    const game = JSON.parse(file.data) as { version?: unknown; cash?: unknown };
    return typeof game.version === "number" && typeof game.cash === "number" ? file : null;
  } catch {
    return null;
  }
}

export async function listSlots(): Promise<SlotInfo[]> {
  const b = bridge();
  if (b) return b.listSlots();
  const ls = local();
  if (!ls) return [];
  const out: SlotInfo[] = [];
  for (let slot = 0; slot < SAVE_SLOTS; slot++) {
    const raw = ls.getItem(slotKey(slot));
    const file = parse(raw);
    if (file) out.push({ slot, title: file.title, savedAt: file.savedAt });
    else if (raw || ls.getItem(`${slotKey(slot)}-backup`))
      out.push({
        slot,
        title: "Damaged save - a backup can be loaded",
        savedAt: "",
        damaged: true,
      });
  }
  return out;
}

export async function readSlot(slot: number): Promise<SlotData | null> {
  const b = bridge();
  if (b) return b.readSlot(slot);
  const ls = local();
  const main = parse(ls?.getItem(slotKey(slot)) ?? null);
  if (main) return { data: main.data, recovered: false };
  const backup = parse(ls?.getItem(`${slotKey(slot)}-backup`) ?? null);
  return backup ? { data: backup.data, recovered: true } : null;
}

/** Sync version for the browser's "page is closing" moment. */
export function writeSlotNow(slot: number, title: string, data: string): void {
  const ls = local();
  if (!ls) return;
  try {
    const prev = ls.getItem(slotKey(slot));
    if (parse(prev)) ls.setItem(`${slotKey(slot)}-backup`, prev as string);
    ls.setItem(slotKey(slot), JSON.stringify({ title, savedAt: new Date().toISOString(), data }));
  } catch {
    // Storage full or blocked: the game still plays, it just isn't saved.
  }
}

export async function writeSlot(slot: number, title: string, data: string): Promise<void> {
  const b = bridge();
  if (b) return b.writeSlot(slot, title, data);
  writeSlotNow(slot, title, data);
}

export async function deleteSlot(slot: number): Promise<void> {
  const b = bridge();
  if (b) return b.deleteSlot(slot);
  local()?.removeItem(slotKey(slot));
  local()?.removeItem(`${slotKey(slot)}-backup`);
}

export async function readData(name: DataFile): Promise<string | null> {
  const b = bridge();
  if (b) return b.readData(name);
  return local()?.getItem(`aceavenue-${name}`) ?? null;
}

export async function writeData(name: DataFile, text: string): Promise<void> {
  const b = bridge();
  if (b) return b.writeData(name, text);
  try {
    local()?.setItem(`aceavenue-${name}`, text);
  } catch {
    // Not saved; fine.
  }
}

export async function copyText(text: string): Promise<boolean> {
  const b = bridge();
  try {
    if (b) await b.copyText(text);
    else await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function appInfo(): Promise<AppInfo> {
  const b = bridge();
  if (b) return b.appInfo();
  return { version: __APP_VERSION__, platform: "web", arch: "" };
}
