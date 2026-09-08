"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

import {
  clearBackendAuthSession,
  ensureBackendAuthSession,
  getBackendAuthSession,
  type StoredBackendAuthSession,
} from "./backendClient";

export function useBackendAuth() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [session, setSession] = useState<StoredBackendAuthSession | null>(null);
  const [authenticating, setAuthenticating] = useState(false);

  useEffect(() => {
    if (!address) {
      setSession(null);
      return;
    }
    const current = getBackendAuthSession(address);
    if (!current && getBackendAuthSession()) clearBackendAuthSession();
    setSession(current);
  }, [address]);

  const authenticate = useCallback(async () => {
    if (!address || !isConnected) throw new Error("Connect the creator wallet before backend authentication.");
    setAuthenticating(true);
    try {
      const next = await ensureBackendAuthSession(
        address,
        (message) => signMessageAsync({ message }),
      );
      setSession(next);
      return next;
    } finally {
      setAuthenticating(false);
    }
  }, [address, isConnected, signMessageAsync]);

  const ensureAuthenticated = useCallback(async () => {
    if (address) {
      const current = getBackendAuthSession(address);
      if (current) {
        setSession(current);
        return current;
      }
    }
    return authenticate();
  }, [address, authenticate]);

  return {
    address,
    isConnected,
    session,
    isAuthenticated: Boolean(session),
    authenticating,
    authenticate,
    ensureAuthenticated,
  };
}
