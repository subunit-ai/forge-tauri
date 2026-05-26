import type { CSSProperties } from "react";

export type BridgeStatus = {
  online: boolean;
  version: string | null;
  paired?: boolean | null;
};

type BridgeStatusCardProps = {
  status: BridgeStatus | null;
  lastChecked: Date | null;
  error: string | null;
};

const styles: Record<string, CSSProperties> = {
  card: {
    width: "min(440px, calc(100vw - 40px))",
    border: "1px solid rgba(6, 182, 212, 0.28)",
    borderRadius: 8,
    background: "rgba(255, 255, 255, 0.94)",
    boxShadow: "0 24px 70px rgba(0, 0, 0, 0.28)",
    color: "#0a1424",
    padding: 28,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 28,
  },
  title: {
    margin: 0,
    fontSize: 28,
    lineHeight: "34px",
    fontWeight: 700,
  },
  badge: {
    alignItems: "center",
    borderRadius: 999,
    display: "inline-flex",
    fontSize: 13,
    fontWeight: 700,
    gap: 8,
    lineHeight: "18px",
    padding: "7px 11px",
    whiteSpace: "nowrap",
  },
  dot: {
    borderRadius: "50%",
    height: 9,
    width: 9,
  },
  sectionLabel: {
    color: "#476174",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0,
    lineHeight: "16px",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  bridgeLine: {
    alignItems: "baseline",
    display: "flex",
    gap: 10,
    justifyContent: "space-between",
    marginBottom: 18,
  },
  bridgeName: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: "24px",
  },
  bridgeState: {
    fontSize: 15,
    fontWeight: 700,
    lineHeight: "22px",
  },
  detailGrid: {
    borderTop: "1px solid rgba(10, 20, 36, 0.11)",
    display: "grid",
    gap: 12,
    paddingTop: 18,
  },
  detailRow: {
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
  },
  detailLabel: {
    color: "#476174",
    fontSize: 14,
    lineHeight: "20px",
  },
  detailValue: {
    color: "#0a1424",
    fontSize: 14,
    fontWeight: 700,
    lineHeight: "20px",
    textAlign: "right",
  },
  error: {
    background: "rgba(220, 38, 38, 0.08)",
    border: "1px solid rgba(220, 38, 38, 0.2)",
    borderRadius: 8,
    color: "#991b1b",
    fontSize: 13,
    lineHeight: "18px",
    marginTop: 18,
    padding: 12,
  },
};

export function BridgeStatusCard({
  status,
  lastChecked,
  error,
}: BridgeStatusCardProps) {
  const online = status?.online === true;
  const stateLabel = online ? "Online" : "Offline";
  const badgeStyle: CSSProperties = {
    ...styles.badge,
    background: online ? "rgba(6, 182, 212, 0.13)" : "rgba(220, 38, 38, 0.1)",
    color: online ? "#075d6d" : "#991b1b",
  };
  const dotStyle: CSSProperties = {
    ...styles.dot,
    background: online ? "#06b6d4" : "#dc2626",
  };
  const checkedLabel = lastChecked
    ? lastChecked.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "Pending";
  const pairingLabel =
    status?.paired === undefined || status.paired === null
      ? "Unknown"
      : status.paired
        ? "Paired"
        : "Not paired";

  return (
    <section style={styles.card} aria-label="Bridge status">
      <div style={styles.header}>
        <h1 style={styles.title}>u1 Forge</h1>
        <span style={badgeStyle}>
          <span style={dotStyle} />
          {stateLabel}
        </span>
      </div>

      <div style={styles.sectionLabel}>Bridge</div>
      <div style={styles.bridgeLine}>
        <div style={styles.bridgeName}>Subunit bridge</div>
        <div style={styles.bridgeState}>{stateLabel}</div>
      </div>

      <div style={styles.detailGrid}>
        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Version</span>
          <span style={styles.detailValue}>{status?.version ?? "Unknown"}</span>
        </div>
        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Pairing</span>
          <span style={styles.detailValue}>{pairingLabel}</span>
        </div>
        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Last check</span>
          <span style={styles.detailValue}>{checkedLabel}</span>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
    </section>
  );
}
