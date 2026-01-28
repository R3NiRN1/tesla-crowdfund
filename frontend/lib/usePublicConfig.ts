"use client";

import { useEffect, useMemo, useState } from "react";

import { getPublicConfig, type PublicConfig } from "./publicConfig";
import { getStoredConfig, type StoredConfig } from "./storedConfig";

export function usePublicConfig(): PublicConfig {
  const [storedConfig, setStoredConfig] = useState<StoredConfig | null>(null);

  useEffect(() => {
    setStoredConfig(getStoredConfig());
  }, []);

  return useMemo(() => getPublicConfig(storedConfig), [storedConfig]);
}
