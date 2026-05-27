import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { BridgeStatusCard, type BridgeStatus, type ConsentState } from "./BridgeStatusCard";
import { ConsentPrompt, type ConsentRequest } from "./ConsentPrompt";

const BRIDGE_POLL_INTERVAL_MS = 3000;
const CONSENT_POLL_INTERVAL_MS = 1000;

const appStyle: CSSProperties = {
  alignItems: "center",
  background: "linear-gradient(160deg, #0a1424 0%, #0e2333 62%, #062a36 100%)",
  boxSizing: "border-box",
  color: "#ecfeff",
  display: "flex",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  inset: 0,
  justifyContent: "center",
  padding: 20,
  position: "fixed",
};

function App() {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [consentState, setConsentState] = useState<ConsentState | null>(null);
  const [pendingConsentRequests, setPendingConsentRequests] = useState<
    ConsentRequest[]
  >([]);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [consentActionError, setConsentActionError] = useState<string | null>(
    null,
  );
  const [consentAction, setConsentAction] = useState<string | null>(null);

  const refreshConsentState = useCallback(async () => {
    const nextState = await invoke<ConsentState>("consent_state");
    setConsentState(nextState);
    setConsentError(null);
    if ((nextState.pending_count ?? 0) === 0) {
      setPendingConsentRequests([]);
    }
    return nextState;
  }, []);

  const upsertPendingConsentRequest = useCallback((request: ConsentRequest) => {
    if (!request.id) {
      return;
    }

    setPendingConsentRequests((current) => {
      const existingIndex = current.findIndex((row) => row.id === request.id);
      if (existingIndex === -1) {
        return [...current, request];
      }

      const next = [...current];
      next[existingIndex] = request;
      return next;
    });
  }, []);

  const removePendingConsentRequest = useCallback((id: string) => {
    setPendingConsentRequests((current) =>
      current.filter((request) => request.id !== id),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    async function refreshStatus() {
      try {
        const nextStatus = await invoke<BridgeStatus>("bridge_status");
        if (!cancelled) {
          setStatus(nextStatus);
          setLastChecked(new Date());
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setStatus({ online: false, version: null, paired: null });
          setLastChecked(new Date());
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(refreshStatus, BRIDGE_POLL_INTERVAL_MS);
        }
      }
    }

    refreshStatus();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    async function refresh() {
      try {
        const nextState = await invoke<ConsentState>("consent_state");
        if (!cancelled) {
          setConsentState(nextState);
          setConsentError(null);
          if ((nextState.pending_count ?? 0) === 0) {
            setPendingConsentRequests([]);
          }
        }
      } catch (caught) {
        if (!cancelled) {
          setConsentError(formatError(caught));
        }
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(refresh, CONSENT_POLL_INTERVAL_MS);
        }
      }
    }

    refresh();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlistenRequest: (() => void) | undefined;
    let unlistenState: (() => void) | undefined;

    listen<ConsentRequest>("consent://request", (event) => {
      upsertPendingConsentRequest(event.payload);
      setConsentActionError(null);
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        unlistenRequest = unlisten;
      }
    });

    listen<ConsentState>("consent://state", (event) => {
      setConsentState(event.payload);
      setConsentError(null);
      if ((event.payload.pending_count ?? 0) === 0) {
        setPendingConsentRequests([]);
      }
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        unlistenState = unlisten;
      }
    });

    return () => {
      cancelled = true;
      unlistenRequest?.();
      unlistenState?.();
    };
  }, [upsertPendingConsentRequest]);

  async function decideConsent(
    id: string,
    command: "consent_allow" | "consent_deny",
    rememberForSeconds?: number,
  ) {
    setConsentAction(command);
    setConsentActionError(null);

    try {
      if (command === "consent_allow") {
        await invoke(command, {
          id,
          rememberForSeconds: rememberForSeconds ?? null,
        });
      } else {
        await invoke(command, { id });
      }
      removePendingConsentRequest(id);
      await refreshConsentState();
    } catch (caught) {
      setConsentActionError(formatError(caught));
    } finally {
      setConsentAction(null);
    }
  }

  async function revokeConsent() {
    setConsentAction("consent_revoke");
    setConsentError(null);

    try {
      await invoke("consent_revoke");
      setPendingConsentRequests([]);
      await refreshConsentState();
    } catch (caught) {
      setConsentError(formatError(caught));
    } finally {
      setConsentAction(null);
    }
  }

  async function resumeConsent() {
    setConsentAction("consent_resume");
    setConsentError(null);

    try {
      await invoke("consent_resume");
      await refreshConsentState();
    } catch (caught) {
      setConsentError(formatError(caught));
    } finally {
      setConsentAction(null);
    }
  }

  const activeConsentRequest = pendingConsentRequests[0] ?? null;
  const promptActionPending =
    consentAction === "consent_allow" || consentAction === "consent_deny";

  return (
    <main style={appStyle}>
      <BridgeStatusCard
        consentAction={consentAction}
        consentError={consentError}
        consentState={consentState}
        status={status}
        lastChecked={lastChecked}
        error={error}
        onResume={resumeConsent}
        onRevoke={revokeConsent}
      />
      <ConsentPrompt
        actionPending={promptActionPending}
        error={consentActionError}
        onAllow={(id) => decideConsent(id, "consent_allow")}
        onAllowRemember={(id) => decideConsent(id, "consent_allow", 1800)}
        onDeny={(id) => decideConsent(id, "consent_deny")}
        onExpired={removePendingConsentRequest}
        request={activeConsentRequest}
      />
    </main>
  );
}

function formatError(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

export default App;
