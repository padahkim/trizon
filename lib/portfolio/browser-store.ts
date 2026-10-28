// Snapshots are primitive strings so useSyncExternalStore can compare them without reparsing.
export const STORAGE_UNAVAILABLE = Symbol("storage-unavailable");
const KEY = "trizon";
const CHANGE = "trizon:change";

export function getSavedSnapshot(): string | null | typeof STORAGE_UNAVAILABLE {
  try { return localStorage.getItem(KEY); } catch { return STORAGE_UNAVAILABLE; }
}
export function getServerSnapshot(): undefined { return undefined; }
export function subscribeSaved(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) onChange(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE, onChange);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(CHANGE, onChange); };
}
export function writeSavedSnapshot(raw: string): void {
  localStorage.setItem(KEY, raw);
  window.dispatchEvent(new Event(CHANGE));
}
