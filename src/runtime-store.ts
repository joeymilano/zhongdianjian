import { AsyncLocalStorage } from 'node:async_hooks';
export type CloudStore = {
  reserve(provider: 'flyai' | 'bailian' | 'amap', fen: number, limitFen: number, cap: number): Promise<void>;
  saveComparison(id: string, value: unknown): Promise<void>;
  loadComparison(id: string): Promise<unknown>;
};
export const runtimeStore = new AsyncLocalStorage<CloudStore>();
