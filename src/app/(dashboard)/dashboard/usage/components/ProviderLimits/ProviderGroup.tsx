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
  columns: ResolvedColumn[];
  overflowMax: number;
  isRefreshing: boolean;
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
 * Builds: provider | identity | tier | columns... | overflow | cutoff | refresh.
 */
export function buildGridTemplate(columnCount: number): string {
  const providerWidth = "minmax(120px, 1.2fr)";
  const identityWidth = columnCount <= 1 ? "minmax(200px, 2fr)" : "minmax(160px, 2fr)";
  const tierWidth = "minmax(64px, 80px)";
  const columnsTpl =
    columnCount > 0 ? Array(columnCount).fill("minmax(68px, 1fr)").join(" ") : "minmax(120px, 1fr)"; // fallback so layout doesn't collapse
  const overflowWidth = "36px";
  const cutoffWidth = "minmax(76px, 96px)";
  const refreshWidth = "32px";
  return [
    providerWidth,
    identityWidth,
    tierWidth,
    columnsTpl,
    overflowWidth,
    cutoffWidth,
    refreshWidth,
  ].join(" ");
}

export default function ProviderGroup({
  providerKey,
  columns,
  overflowMax,
  isRefreshing,
  onRefreshGroup,
  children,
}: ProviderGroupProps) {
  const t = useTranslations("usage");
  const tr = (key: string, fallback: string, values?: UsageTranslationValues) =>
    translateUsageOrFallback(t, key, fallback, values);

  const grid = buildGridTemplate(columns.length);

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-surface">
      {/* Column header row */}
      <div
        className="px-3 py-1.5 bg-bg-subtle/30 text-[10px] uppercase tracking-wider text-text-muted font-semibold"
        style={{
          display: "grid",
          gridTemplateColumns: grid,
          gap: "12px",
          borderLeft: "3px solid transparent",
        }}
      >
        <div>{tr("columnProvider", "Provider")}</div>
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
        <div className="flex justify-center items-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isRefreshing) return;
              onRefreshGroup();
            }}
            disabled={isRefreshing}
            title={tr("refreshGroup", "Refresh all accounts in this group")}
            className="p-0.5 rounded-md flex items-center justify-center transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-text-muted hover:text-text-main"
          >
            <span
              className={`material-symbols-outlined text-[14px] ${isRefreshing ? "animate-spin" : ""}`}
            >
              refresh
            </span>
          </button>
        </div>
      </div>

      {/* Account rows */}
      <div>{children}</div>
    </div>
  );
}
