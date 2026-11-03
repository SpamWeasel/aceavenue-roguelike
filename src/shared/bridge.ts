/** Messages between the game window and the Electron main process. */
export const IPC = {
  appInfo: "aceavenue:app-info",
  listSlots: "aceavenue:list-slots",
  readSlot: "aceavenue:read-slot",
  writeSlot: "aceavenue:write-slot",
  deleteSlot: "aceavenue:delete-slot",
  readData: "aceavenue:read-data",
  writeData: "aceavenue:write-data",
  copyText: "aceavenue:copy-text",
  setFullscreen: "aceavenue:set-fullscreen",
  quit: "aceavenue:quit",
  closing: "aceavenue:closing",
  closeReady: "aceavenue:close-ready",
  rendererReady: "aceavenue:renderer-ready",
} as const;

export const SAVE_SLOTS = 3;
/** Small data files kept beside the saves. */
export const DATA_FILES = ["settings", "records"] as const;
export type DataFile = (typeof DATA_FILES)[number];

export interface AppInfo {
  version: string;
  platform: string;
  arch: string;
}

export interface SlotInfo {
  slot: number;
  /** e.g. "Ace - The Rusty Spur - Normal - $1,240" */
  title: string;
  savedAt: string;
  damaged?: boolean;
}

export interface SlotData {
  data: string;
  /** The main file was damaged, so this came from the newest good backup. */
  recovered: boolean;
}

export interface SmokeReport {
  ok: boolean;
  scene: string;
  detail?: string;
}

export interface AceBridge {
  appInfo(): Promise<AppInfo>;
  listSlots(): Promise<SlotInfo[]>;
  readSlot(slot: number): Promise<SlotData | null>;
  writeSlot(slot: number, title: string, data: string): Promise<void>;
  deleteSlot(slot: number): Promise<void>;
  readData(name: DataFile): Promise<string | null>;
  writeData(name: DataFile, text: string): Promise<void>;
  copyText(text: string): Promise<void>;
  setFullscreen(on: boolean): Promise<void>;
  quit(): void;
  /** Called when the window is about to close, so the game can save first. */
  onClosing(handler: () => Promise<void> | void): void;
  /** Smoke tests: the window has drawn the requested screen. */
  signalReady(report: SmokeReport): void;
  /** Smoke tests: which screen to show, if any. */
  smokeScene: string | null;
}

declare global {
  interface Window {
    aceavenue?: AceBridge;
  }
}
