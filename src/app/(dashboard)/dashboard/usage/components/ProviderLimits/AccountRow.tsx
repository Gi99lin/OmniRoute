"use client";

import { useTranslations } from "next-intl";
import Badge from "@/shared/components/Badge";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { pickDisplayValue } from "@/shared/utils/maskEmail";
import { calculatePercentage, formatQuotaLabel } from "./utils";
import { translateUsageOrFallback, type UsageTranslationValues } from "./i18nFallback";
import type { ResolvedColumn } from "./providerColumns";

/**
 * One row inside a ProviderGroup table.
 *
 * Collapsed view: provider identity + account identity + tier badge + one cell per resolved
 * column + overflow count + cutoff/refresh actions.
 *
 * Expanded panel (`isExpanded`): full quota detail with progress bars,
 * countdown, credits balance, and the in-panel "Edit cutoffs" /
 * "Refresh now" buttons — same UX as the previous flat layout.
 *
 * All semantics preserved from the original `renderRow`:
 * - `pct` is *remaining* (high = green, low = red)
 * - `unlimited`, `staleAfterReset`, `isCredits` branches intact
 * - row click toggles expansion; nested controls stop propagation
 */
interface AccountRowProps {
  connection: any;
  providerLabel: string;
  quota: { quotas?: any[]; plan?: string | null; message?: string | null; stale?: any } | undefined;
  loading: boolean;
  error: string | null;
  refreshedAt: string | undefined;
  tierMeta: { key: string; label: string; variant: any };
  resolvedPlan: string | null;
  status: "all" | "critical" | "alert" | "ok" | "empty";
  statusTone: { bar: string; text: string; bg: string; ring: string; dot: string };
  columns: ResolvedColumn[];
  /** Quotas not surfaced as columns; rendered as "+N" overflow chip. */
  overflowCount: number;
  isExpanded: boolean;
  emailsVisible: boolean;
  /** Grid template that the parent ProviderGroup uses for its header.
   *  Passed in so account cells align with column headers pixel-perfectly. */
  gridTemplateColumns: string;
  onToggle: () => void;
  onRefresh: () => void;
  onOpenCutoff: () => void;
  isLast: boolean;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  CNY: "¥",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  KRW: "₩",
  INR: "₹",
};

const QUOTA_BAR_GREEN_THRESHOLD = 50;
const QUOTA_BAR_YELLOW_THRESHOLD = 20;

function getBarColor(remainingPercentage: number) {
  if (remainingPercentage > QUOTA_BAR_GREEN_THRESHOLD) {
    return { bar: "#22c55e", text: "#22c55e", bg: "rgba(34,197,94,0.12)" };
  }
  if (remainingPercentage > QUOTA_BAR_YELLOW_THRESHOLD) {
    return { bar: "#eab308", text: "#eab308", bg: "rgba(234,179,8,0.12)" };
  }
  return { bar: "#ef4444", text: "#ef4444", bg: "rgba(239,68,68,0.12)" };
}

function shortWindowLabel(key: string): string {
  const map: Record<string, string> = {
    session: "5h",
    weekly: "7d",
    code_review: "review",
  };
  return map[key] || (key.length > 8 ? `${key.slice(0, 7)}…` : key);
}

function formatCountdown(resetAt: string | null | undefined): string | null {
  if (!resetAt) return null;
  try {
    const diff = (new Date(resetAt) as any) - (new Date() as any);
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h >= 24) {
      const d = Math.floor(h / 24);
      return `${d}d ${h % 24}h`;
    }
    return `${h}h ${m}m`;
  } catch {
    return null;
  }
}

export default function AccountRow({
  connection,
  providerLabel,
  quota,
  loading,
  error,
  refreshedAt: _refreshedAt,
  tierMeta,
  resolvedPlan,
  status,
  statusTone,
  columns,
  overflowCount,
  isExpanded,
  emailsVisible,
  gridTemplateColumns,
  onToggle,
  onRefresh,
  onOpenCutoff,
  isLast,
}: AccountRowProps) {
  const t = useTranslations("usage");
  const tr = (key: string, fallback: string, values?: UsageTranslationValues) =>
    translateUsageOrFallback(t, key, fallback, values);

  const overrides = (connection.quotaWindowThresholds || null) as Record<string, number> | null;
  const hasOverrides = overrides && Object.keys(overrides).length > 0;
  const connectionWindows = (quota?.quotas || []).filter(
    (q: any) => q && typeof q.name === "string" && !q.isCredits
  );
  const connectionHasWindows = connectionWindows.length > 0;

  let cutoffLabel: string = tr("quotaCutoffsButtonDefault", "Default");
  if (hasOverrides && overrides) {
    const entries = Object.entries(overrides);
    const visible = entries
      .slice(0, 2)
      .map(([k, v]) => `${shortWindowLabel(k)}:${v}%`)
      .join(" · ");
    cutoffLabel = entries.length > 2 ? `${visible} +${entries.length - 2}` : visible;
  }

  const accountName = pickDisplayValue(
    [connection.name, connection.displayName, connection.email],
    emailsVisible,
    connection.provider
  );

  // Render one column cell — a mini bar + percentage + (optional)
  // unlimited marker. Empty cell is an em-dash so the column reads as
  // "no data" rather than "0%".
  const renderColumnCell = (col: ResolvedColumn) => {
    const q = col.quota;
    if (!q) {
      return (
        <div
          key={col.key}
          className="text-[12px] text-text-muted text-center tabular-nums"
          title={tr("noWindowForAccount", "—")}
        >
          —
        </div>
      );
    }
    if (q.isCredits) {
      // Should not happen for column cells (credits filtered out upstream),
      // but render a balance pill defensively.
      const colors = getBarColor(q.remainingPercentage ?? 0);
      const sym = CURRENCY_SYMBOLS[q.currency] ?? q.currency ?? "";
      return (
        <span
          key={col.key}
          className="text-[11px] font-semibold tabular-nums"
          style={{ color: colors.text }}
        >
          {sym}
          {(q.creditCount ?? q.remaining ?? 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      );
    }
    const pctRaw = q.unlimited
      ? 100
      : (q.remainingPercentage ?? calculatePercentage(q.used, q.total));
    const pct = Math.round(pctRaw);
    const colors = getBarColor(pct);
    const usedNum = Number(q.used || 0);
    const totalNum = Number(q.total || 0);
    const tooltip = q.unlimited
      ? `${col.label} — ${tr("unlimitedLabel", "Unlimited")}`
      : `${col.label} — ${pct}% ${tr("remainingShort", "remaining")} (${usedNum.toLocaleString()} / ${totalNum.toLocaleString()})`;

    return (
      <div key={col.key} className="flex items-center gap-1.5 min-w-0" title={tooltip}>
        <div className="flex items-center gap-0.5 shrink-0">
          <span
            className="text-[12px] font-semibold tabular-nums leading-none"
            style={{ color: colors.text }}
          >
            {q.unlimited ? "∞" : `${pct}%`}
          </span>
          {q.staleAfterReset && (
            <span
              className="material-symbols-outlined text-[12px] text-amber-500 shrink-0"
              title={t("staleQuotaTooltip")}
            >
              autorenew
            </span>
          )}
        </div>
        {!q.unlimited && (
          <div className="h-1 w-6 rounded-full bg-black/[0.06] dark:bg-white/[0.06] overflow-hidden shrink-0">
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-out"
              style={{
                width: `${Math.min(pct, 100)}%`,
                background: colors.bar,
              }}
            />
          </div>
        )}
      </div>
    );
  };

  // Detailed expanded panel — same layout as the original `renderQuotaDetail`.
  // We keep this verbatim because the panel is the primary place users see
  // raw numbers (used/total, ISO countdown).
  const renderQuotaDetail = (q: any, i: number) => {
    if (q.isCredits) {
      const colors = getBarColor(q.remainingPercentage ?? 0);
      const sym = CURRENCY_SYMBOLS[q.currency] ?? q.currency ?? "";
      const amount = (q.creditCount ?? q.remaining ?? 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return (
        <div
          key={i}
          className="rounded-md border border-border bg-bg/40 px-3 py-2.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[18px]" style={{ color: colors.text }}>
              paid
            </span>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-text-main">
                {formatQuotaLabel(q.name) || tr("creditsLabel", "Credits")}
              </div>
              <div className="text-[10px] text-text-muted">
                {tr("creditBalanceHint", "Saldo restante")}
              </div>
            </div>
          </div>
          <div className="text-[16px] font-bold tabular-nums" style={{ color: colors.text }}>
            {sym}
            {amount}
          </div>
        </div>
      );
    }
    const pctRaw = q.unlimited
      ? 100
      : (q.remainingPercentage ?? calculatePercentage(q.used, q.total));
    const pct = Math.round(pctRaw);
    const colors = getBarColor(pct);
    const cd = formatCountdown(q.resetAt);
    const shortName = q.displayName || formatQuotaLabel(q.name);
    const staleAfterReset = q.staleAfterReset === true;
    const usedNum = Number(q.used || 0);
    const totalNum = Number(q.total || 0);
    const showUsage = totalNum > 0 && !q.unlimited;
    return (
      <div key={i} className="rounded-md border border-border bg-bg/40 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-[12px] font-semibold py-0.5 px-2 rounded truncate max-w-[120px] sm:max-w-[150px] inline-block shrink-0"
              style={{ background: colors.bg, color: colors.text }}
              title={q.modelKey || q.name}
            >
              {shortName}
            </span>
            {q.unlimited && (
              <span className="text-[10px] text-text-muted shrink-0">
                {tr("unlimitedLabel", "Unlimited")}
              </span>
            )}
            {showUsage && (
              <span className="text-[10px] text-text-muted tabular-nums shrink-0">
                {usedNum.toLocaleString()} / {totalNum.toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 min-w-0">
            {staleAfterReset ? (
              <span className="text-[10px] text-text-muted shrink-0">
                ⟳ {tr("refreshing", "Refreshing")}
              </span>
            ) : cd ? (
              <span
                className="text-[10px] text-text-muted shrink-0 truncate max-w-[85px]"
                title={`${tr("resetsIn", "reset em")} ${cd}`}
              >
                ⏱ {cd}
              </span>
            ) : null}
            <span
              className="text-[12px] font-bold tabular-nums text-right shrink-0"
              style={{ color: colors.text }}
            >
              {pct}%
            </span>
          </div>
        </div>
        <div className="h-2 rounded-sm bg-black/[0.06] dark:bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-sm transition-[width] duration-300 ease-out"
            style={{ width: `${Math.min(pct, 100)}%`, background: colors.bar }}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        borderBottom: !isLast || isExpanded ? "1px solid var(--color-border)" : "none",
      }}
    >
      {/* Collapsed row */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="w-full text-left items-center px-3 py-2.5 transition-[background] duration-150 hover:bg-black/[0.03] dark:hover:bg-white/[0.02] cursor-pointer"
        style={{
          display: "grid",
          gridTemplateColumns,
          gap: "12px",
          borderLeft: `3px solid ${
            status === "all" || status === "empty" ? "transparent" : statusTone.dot
          }`,
        }}
        aria-expanded={isExpanded}
      >
        {/* Provider identity */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded flex items-center justify-center overflow-hidden shrink-0">
            <ProviderIcon
              providerId={connection.provider}
              size={18}
              type="color"
              className="object-contain"
            />
          </div>
          <span className="text-[12px] font-semibold text-text-main truncate">{providerLabel}</span>
        </div>

        {/* Account identity */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-[16px] text-text-muted shrink-0">
            {isExpanded ? "expand_less" : "expand_more"}
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-text-main truncate">{accountName}</div>
          </div>
        </div>

        {/* Tier badge */}
        <div className="flex items-center min-w-0">
          <span
            title={
              resolvedPlan ? t("rawPlanWithValue", { plan: resolvedPlan }) : t("noPlanFromProvider")
            }
          >
            <Badge variant={tierMeta.variant} size="sm" dot className="h-5 leading-none">
              {tierMeta.label}
            </Badge>
          </span>
        </div>

        {/* Quota column cells */}
        {loading ? (
          <div
            className="flex items-center gap-1.5 text-text-muted text-xs"
            style={{ gridColumn: `span ${Math.max(columns.length, 1)}` }}
          >
            <span className="material-symbols-outlined animate-spin text-[14px]">
              progress_activity
            </span>
            {t("loadingQuotas")}
          </div>
        ) : error ? (
          <div
            className="flex items-center gap-1.5 text-xs text-red-500"
            style={{ gridColumn: `span ${Math.max(columns.length, 1)}` }}
          >
            <span className="material-symbols-outlined text-[14px]">error</span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{error}</span>
          </div>
        ) : quota?.message && (!quota.quotas || quota.quotas.length === 0) ? (
          <div
            className="text-xs text-text-muted italic"
            style={{ gridColumn: `span ${Math.max(columns.length, 1)}` }}
          >
            {quota.message}
          </div>
        ) : columns.length === 0 ? (
          <div className="text-xs text-text-muted italic" style={{ gridColumn: `span 1` }}>
            {t("noQuotaData")}
          </div>
        ) : (
          columns.map(renderColumnCell)
        )}

        {/* Overflow count (e.g. "+11" for Antigravity) */}
        <div className="text-[11px] text-text-muted text-center tabular-nums">
          {overflowCount > 0 ? `+${overflowCount}` : ""}
        </div>

        {/* Cutoff cell */}
        <div className="flex justify-center items-center min-w-0">
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (!connectionHasWindows) return;
              onOpenCutoff();
            }}
            role="button"
            tabIndex={connectionHasWindows ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                if (!connectionHasWindows) return;
                onOpenCutoff();
              }
            }}
            title={
              connectionHasWindows
                ? tr(
                    "quotaCutoffsButtonHelp",
                    "Edit minimum remaining quota cutoffs for this account."
                  )
                : tr(
                    "quotaCutoffsButtonDisabled",
                    "No quota windows are available for this account yet."
                  )
            }
            className={`block w-full truncate text-center px-2 py-1 rounded-md border text-[11px] font-medium tabular-nums transition-colors ${
              !connectionHasWindows ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
            } ${
              hasOverrides
                ? "border-primary/40 text-primary bg-primary/5"
                : "border-border text-text-muted hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
            }`}
          >
            {cutoffLabel}
          </span>
        </div>

        {/* Refresh cell */}
        <div className="flex justify-center items-center">
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (loading) return;
              onRefresh();
            }}
            role="button"
            tabIndex={loading ? -1 : 0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                if (loading) return;
                onRefresh();
              }
            }}
            title={t("refreshQuota")}
            className={`p-1 rounded-md flex items-center justify-center transition-opacity duration-150 ${
              loading
                ? "cursor-not-allowed opacity-30"
                : "cursor-pointer opacity-60 hover:opacity-100"
            }`}
          >
            <span
              className={`material-symbols-outlined text-[16px] text-text-muted ${
                loading ? "animate-spin" : ""
              }`}
            >
              refresh
            </span>
          </span>
        </div>
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="px-12 py-3.5 bg-bg-subtle/30 border-t border-border flex flex-col gap-3">
          {loading ? (
            <div className="text-xs text-text-muted flex items-center gap-1.5">
              <span className="material-symbols-outlined animate-spin text-[14px]">
                progress_activity
              </span>
              {t("loadingQuotas")}
            </div>
          ) : error ? (
            <div className="text-xs text-red-500 flex items-start gap-1.5">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <span>{error}</span>
            </div>
          ) : quota?.quotas && quota.quotas.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {quota.quotas.map(renderQuotaDetail)}
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40 mt-1">
                <button
                  type="button"
                  disabled={!connectionHasWindows}
                  onClick={onOpenCutoff}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md border border-border bg-bg-subtle hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">tune</span>
                  {tr("editCutoffs", "Editar Cutoffs")}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={onRefresh}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md border border-border bg-bg-subtle hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span
                    className={`material-symbols-outlined text-[14px] ${
                      loading ? "animate-spin" : ""
                    }`}
                  >
                    refresh
                  </span>
                  {tr("forceRefresh", "Refresh agora")}
                </button>
              </div>
            </>
          ) : (
            <div className="text-xs text-text-muted italic">{t("noQuotaData")}</div>
          )}
        </div>
      )}
    </div>
  );
}
