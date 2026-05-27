import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BridgeStatusCard, type BridgeStatus, type ConsentState } from "./BridgeStatusCard";
import { ConsentPrompt, type ConsentRequest } from "./ConsentPrompt";

const BRIDGE_POLL_INTERVAL_MS = 3000;
const CONSENT_POLL_INTERVAL_MS = 1000;
const WINDOW_LABEL = currentWindowLabel();

type HelpRequestResult = {
  delivered: boolean;
  via: string;
  message: string;
};

type OverlayState = {
  operator: string;
};

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
  if (WINDOW_LABEL === "overlay") {
    return <OverlayWindow />;
  }

  if (WINDOW_LABEL === "overlayControl") {
    return <OverlayControl />;
  }

  return <MainStatusApp />;
}

function MainStatusApp() {
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
  const [helpActionPending, setHelpActionPending] = useState(false);
  const [helpMessage, setHelpMessage] = useState<string | null>(null);
  const [helpError, setHelpError] = useState<string | null>(null);

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

  async function requestHelp() {
    setHelpActionPending(true);
    setHelpMessage(null);
    setHelpError(null);

    try {
      const result = await invoke<HelpRequestResult>("help_request");
      setHelpMessage(result.message);
    } catch (caught) {
      setHelpError(formatError(caught));
    } finally {
      setHelpActionPending(false);
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
        helpActionPending={helpActionPending}
        helpError={helpError}
        helpMessage={helpMessage}
        onResume={resumeConsent}
        onRevoke={revokeConsent}
        onHelpRequest={requestHelp}
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

function OverlayWindow() {
  const [operator, setOperator] = useState("u1");

  useEffect(() => {
    getCurrentWindow().setIgnoreCursorEvents(true).catch(console.error);

    let cancelled = false;
    let unlistenState: (() => void) | undefined;
    listen<OverlayState>("overlay://state", (event) => {
      const nextOperator = event.payload.operator.trim();
      if (nextOperator) {
        setOperator(nextOperator);
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
      unlistenState?.();
    };
  }, []);

  return (
    <main style={overlayStyles.root} aria-label="u1 arbeitet">
      <style>{overlayCss}</style>
      <section style={overlayStyles.card}>
        <div style={overlayStyles.livePill}>
          <span className="forge-live-dot" />
          LIVE
        </div>

        <svg
          aria-hidden="true"
          className="forge-scene"
          viewBox="0 0 220 150"
        >
          <g className="forge-hammer">
            <rect
              fill="#9a6b3f"
              height="13"
              rx="6.5"
              width="98"
              x="64"
              y="51"
            />
            <rect
              fill="#cbd5e1"
              height="42"
              rx="7"
              width="44"
              x="34"
              y="36"
            />
            <rect
              fill="#94a3b8"
              height="42"
              rx="7"
              width="13"
              x="34"
              y="36"
            />
          </g>
          <g className="forge-sparks">
            <path d="M94 96 L70 76" />
            <path d="M98 96 L88 70" />
            <path d="M105 96 L120 72" />
            <path d="M110 98 L139 84" />
          </g>
          <path
            className="forge-anvil"
            d="M54 88 H153 L145 104 H78 L36 98 Z"
          />
          <rect className="forge-anvil-dark" height="28" width="42" x="86" y="104" />
          <path
            className="forge-anvil"
            d="M66 132 H148 L163 148 H48 Z"
          />
          <path className="forge-anvil-line" d="M39 90 H153" />
        </svg>

        <h1 style={overlayStyles.title}>
          {operator} arbeitet an deinem Gerät
        </h1>
        <p style={overlayStyles.subtitle}>
          Bitte einen Moment nicht eingreifen - du siehst alles live mit. Sobald
          fertig, verschwindet diese Anzeige von selbst.
        </p>
        <div style={overlayStyles.footer}>SUBUNIT · u1 Forge</div>
      </section>
    </main>
  );
}

function OverlayControl() {
  const [pending, setPending] = useState(false);

  async function dismiss() {
    setPending(true);
    try {
      await invoke("overlay_dismiss");
    } catch (caught) {
      console.error(caught);
      setPending(false);
    }
  }

  return (
    <main style={overlayControlStyles.root}>
      <button
        disabled={pending}
        onClick={dismiss}
        style={overlayControlStyles.button}
        type="button"
      >
        ✕ Ausblenden
      </button>
    </main>
  );
}

function currentWindowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

function formatError(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

export default App;

const overlayStyles: Record<string, CSSProperties> = {
  root: {
    alignItems: "center",
    background: "rgba(4, 9, 20, 0.91)",
    boxSizing: "border-box",
    color: "#e2e8f0",
    display: "flex",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    inset: 0,
    justifyContent: "center",
    padding: 24,
    position: "fixed",
  },
  card: {
    background: "linear-gradient(180deg, rgba(15, 26, 44, 0.96), rgba(8, 16, 30, 0.96))",
    border: "2px solid #06b6d4",
    borderRadius: 8,
    boxShadow: "0 32px 110px rgba(0, 0, 0, 0.58), 0 0 52px rgba(6, 182, 212, 0.14)",
    boxSizing: "border-box",
    minHeight: 360,
    padding: "26px 40px 24px",
    position: "relative",
    textAlign: "center",
    width: "min(560px, calc(100vw - 48px))",
  },
  livePill: {
    alignItems: "center",
    background: "rgba(6, 182, 212, 0.15)",
    border: "1px solid rgba(6, 182, 212, 0.55)",
    borderRadius: 999,
    color: "#e2e8f0",
    display: "inline-flex",
    fontSize: 12,
    fontWeight: 800,
    gap: 9,
    lineHeight: "18px",
    padding: "6px 12px",
    position: "absolute",
    right: 20,
    top: 18,
  },
  title: {
    color: "#f8fafc",
    fontSize: 30,
    fontWeight: 800,
    lineHeight: "38px",
    margin: "10px 0 0",
    overflowWrap: "anywhere",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 16,
    lineHeight: "24px",
    margin: "14px auto 0",
    maxWidth: 460,
  },
  footer: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0,
    lineHeight: "18px",
    marginTop: 24,
  },
};

const overlayControlStyles: Record<string, CSSProperties> = {
  root: {
    alignItems: "center",
    background: "transparent",
    boxSizing: "border-box",
    display: "flex",
    height: "100vh",
    justifyContent: "center",
    margin: 0,
    overflow: "hidden",
    width: "100vw",
  },
  button: {
    background: "rgba(6, 182, 212, 0.18)",
    border: "1px solid #06b6d4",
    borderRadius: 999,
    boxShadow: "0 18px 48px rgba(0, 0, 0, 0.35)",
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: 800,
    lineHeight: "18px",
    minHeight: 38,
    padding: "9px 20px",
    whiteSpace: "nowrap",
  },
};

const overlayCss = `
  .forge-scene {
    display: block;
    height: 150px;
    margin: 38px auto 10px;
    overflow: visible;
    width: 220px;
  }

  .forge-hammer {
    animation: forge-strike 1.1s infinite cubic-bezier(0.34, 0, 0.2, 1);
    transform-box: fill-box;
    transform-origin: 158px 58px;
  }

  .forge-sparks {
    animation: forge-sparks 1.1s infinite ease-out;
    fill: none;
    opacity: 0;
    stroke: #22d3ee;
    stroke-linecap: round;
    stroke-width: 3;
  }

  .forge-anvil {
    fill: #475569;
  }

  .forge-anvil-dark {
    fill: #3b4860;
  }

  .forge-anvil-line {
    fill: none;
    stroke: #06b6d4;
    stroke-linecap: round;
    stroke-width: 3;
  }

  .forge-live-dot {
    animation: forge-live 1.25s infinite ease-in-out;
    background: #06b6d4;
    border-radius: 50%;
    box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.45);
    display: inline-block;
    height: 9px;
    width: 9px;
  }

  @keyframes forge-strike {
    0%, 62%, 100% { transform: rotate(-35deg); }
    18% { transform: rotate(10deg); }
    28% { transform: rotate(-4deg); }
  }

  @keyframes forge-sparks {
    0%, 15%, 100% { opacity: 0; transform: scale(0.85); }
    20% { opacity: 1; transform: scale(1); }
    34% { opacity: 0; transform: scale(1.18); }
  }

  @keyframes forge-live {
    0%, 100% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.42); opacity: 0.72; }
    50% { box-shadow: 0 0 0 8px rgba(6, 182, 212, 0); opacity: 1; }
  }

  @media (max-width: 520px) {
    .forge-scene {
      height: 130px;
      margin-top: 46px;
      width: 190px;
    }
  }
`;
