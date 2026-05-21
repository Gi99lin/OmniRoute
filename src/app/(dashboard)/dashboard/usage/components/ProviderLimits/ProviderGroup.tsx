"use client";

import { useTranslations } from "next-intl";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { translateUsageOrFallback, type UsageTranslationValues } from "./i18nFallback";
import type { ResolvedColumn } from "./providerColumns";

/**
 * One provider section: header (logo + display name + counts + bulk refresh)
 * and a column-aligned table of account rows.
 *
 * Column resolution is *per group*, not per row — same provider means same
 * columns. Account-level missing windows render as empty cells inside
 * `AccountRow`. This keeps the visual grid stable.
 *
 * The grid template threaded through `gridTemplateColumns` is the same one
 * `AccountRow` receives, so headers and cells line up.
 */
interface ProviderGroupProps {
  providerKey: string;
  providerLabel: string;
  accountCount: number;
  /** Worst status across accounts in this group; drives the header dot color. */
  worstStatus: "critical" | "alert" | "ok" | "empty";
  /** Resolved column schema for this provider. Shared by all rows here. */
  columns: ResolvedColumn[];
  overflowMax: number;
  isExpanded: boolean;
  isRefreshing: boolean;
  onToggle: () => void;
  onRefreshGroup: () => void;
  children: React.ReactNode;
}

const STATUS_DOT: Record<"critical" | "alert" | "ok" | "empty", string> = {
  critical: "#ef4444",
  alert: "#eab308",
  ok: "#22c55e",
  empty: "var(--color-text-muted)",
};

/**
 * Grid layout shared between the group's column header and each account row.
 * Builds: identity | tier | columns... | overflow | cutoff | refresh.
 *
 * Identity gets wider when there are fewer columns so we don't waste row
 * width on tiny providers like MiniMax (1 column).
 */
export function buildGridTemplate(columnCount: number): string {
  const identityWidth = columnCount <= 1 ? "minmax(260px, 2fr)" : "minmax(220px, 2.5fr)";
  const tierWidth = "minmax(64px, 80px)";
  const columnsTpl =
    columnCount > 0 ? Array(columnCount).fill("minmax(68px, 1fr)").join(" ") : "minmax(120px, 1fr)"; // fallback so layout doesn't collapse
  const overflowWidth = "36px";
  const cutoffWidth = "minmax(76px, 96px)";
  const refreshWidth = "32px";
  return [identityWidth, tierWidth, columnsTpl, overflowWidth, cutoffWidth, refreshWidth].join(" ");
}

export default function ProviderGroup({
  providerKey,
  providerLabel,
  accountCount,
  worstStatus,
  columns,
  overflowMax,
  isExpanded,
  isRefreshing,
  onToggle,
  onRefreshGroup,
  children,
}: ProviderGroupProps) {
  const t = useTranslations("usage");
  const tr = (key: string, fallback: string, values?: UsageTranslationValues) =>
    translateUsageOrFallback(t, key, fallback, values);

  const grid = buildGridTemplate(columns.length);

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-surface">
      {/* Group header — clickable to expand/collapse */}
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
        className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-bg-subtle/60 hover:bg-bg-subtle transition-colors text-left cursor-pointer"
        aria-expanded={isExpanded}
      >
        <span className="material-symbols-outlined text-[18px] text-text-muted">
          {isExpanded ? "expand_more" : "chevron_right"}
        </span>
        <div className="w-7 h-7 rounded-md flex items-center justify-center overflow-hidden shrink-0">
          <ProviderIcon
            providerId={providerKey}
            size={28}
            type="color"
            className="object-contain"
          />
        </div>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[13px] font-semibold text-text-main">{providerLabel}</span>
          <span className="text-[11px] text-text-muted">
            {tr("groupAccountsCount", "{count} accounts", { count: accountCount })}
          </span>
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: STATUS_DOT[worstStatus] }}
            aria-hidden
            title={tr(`statusDot_${worstStatus}`, worstStatus)}
          />
        </div>

        {/* Bulk refresh for this provider — stop propagation so header click doesn't toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isRefreshing) return;
            onRefreshGroup();
          }}
          disabled={isRefreshing}
          title={tr("refreshGroup", "Refresh all accounts in this group")}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <span
            className={`material-symbols-outlined text-[14px] ${isRefreshing ? "animate-spin" : ""}`}
          >
            refresh
          </span>
          {tr("refreshGroupShort", "Refresh")}
        </button>
      </div>

      {isExpanded && (
        <>
          {/* Column header row */}
          <div
            className="px-3 py-1.5 border-t border-border bg-bg-subtle/30 text-[10px] uppercase tracking-wider text-text-muted font-semibold"
            style={{
              display: "grid",
              gridTemplateColumns: grid,
              gap: "12px",
              borderLeft: "3px solid transparent",
            }}
          >
            <div>{tr("columnAccount", "Account")}</div>
            <div>{tr("columnTier", "Tier")}</div>
            {columns.length > 0 ? (
              columns.map((c) => (
                <div key={c.key} className="truncate" title={c.label}>
                  {c.label}
                </div>
              ))
            ) : (
              <div>{tr("columnQuota", "Quota")}</div>
            )}
            <div className="text-center" title={tr("overflowHint", "Additional quotas")}>
              {overflowMax > 0 ? "+" : ""}
            </div>
            <div className="text-center">{tr("columnCutoff", "Cutoff")}</div>
            <div className="text-center">{tr("columnRefresh", "↻")}</div>
          </div>

          {/* Account rows */}
          <div>{children}</div>
        </>
      )}
    </div>
  );
}
