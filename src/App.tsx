import { useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BridgeStatusCard, type BridgeStatus } from "./BridgeStatusCard";

const POLL_INTERVAL_MS = 3000;

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
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          timeoutId = window.setTimeout(refreshStatus, POLL_INTERVAL_MS);
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

  return (
    <main style={appStyle}>
      <BridgeStatusCard
        status={status}
        lastChecked={lastChecked}
        error={error}
      />
    </main>
  );
}

export default App;
