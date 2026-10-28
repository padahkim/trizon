import { loadSaved } from "./saved";

// Snapshots are primitive strings so useSyncExternalStore can compare them without reparsing.
export const STORAGE_UNAVAILABLE = Symbol("storage-unavailable");
export const STORAGE_RECOVERED = Symbol("storage-recovered");
const KEY = "trizon";
const CHANGE = "trizon:change";
let recovered = false;

export function getSavedSnapshot(): string | null | typeof STORAGE_UNAVAILABLE | typeof STORAGE_RECOVERED {
  try { return localStorage.getItem(KEY) ?? (recovered ? STORAGE_RECOVERED : null); } catch { return STORAGE_UNAVAILABLE; }
}
export function getServerSnapshot(): undefined { return undefined; }
export function subscribeSaved(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) { recovered = false; onChange(); }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE, onChange);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(CHANGE, onChange); };
}
export function writeSavedSnapshot(raw: string): void {
  localStorage.setItem(KEY, raw);
  recovered = false;
  window.dispatchEvent(new Event(CHANGE));
}

export function recoverSavedSnapshot(): void {
  const raw = localStorage.getItem(KEY);
  if (raw === null || loadSaved(raw).status !== "unreadable") return;
  // Removing the active value is safe only after its backup has been saved.
  backupSavedSnapshot(raw);
  // Another tab may have saved a newer snapshot while the backup was written.
  if (localStorage.getItem(KEY) !== raw) return;
  localStorage.removeItem(KEY);
  recovered = true;
  window.dispatchEvent(new Event(CHANGE));
}

export function clearSavedSnapshot(): void {
  const backups = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => key === `${KEY}:backup` || Boolean(key?.startsWith(`${KEY}:backup:`)));
  for (const key of backups) localStorage.removeItem(key);
  localStorage.removeItem(KEY);
  recovered = false;
  window.dispatchEvent(new Event(CHANGE));
}

export function backupSavedSnapshot(raw: string): void {
  const backupKey = `${KEY}:backup`;
  const previous = localStorage.getItem(backupKey);
  if (previous === raw) return;
  // Keep earlier recoveries too; never replace an existing, different backup.
  const destination = previous === null ? backupKey : `${backupKey}:${crypto.randomUUID()}`;
  localStorage.setItem(destination, raw);
}
