export const STORED_CONFIG_KEY = "teslaCrowdfundConfig:v1";

export type StoredConfig = {
  chainId: number | null;
  rpcUrl: string | null;
  factoryAddress: string;
  tokenAddress: string;
  bscscanBase: string | null;
  wcEnabled: boolean;
  wcProjectId: string | null;
};

export function getStoredConfig(): StoredConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORED_CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredConfig;
  } catch (error) {
    console.warn("Failed to read stored config", error);
    return null;
  }
}

export function setStoredConfig(config: StoredConfig | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!config) {
      window.localStorage.removeItem(STORED_CONFIG_KEY);
      return;
    }
    window.localStorage.setItem(STORED_CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn("Failed to save stored config", error);
  }
}
