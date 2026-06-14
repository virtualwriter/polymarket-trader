export interface MonotonicPackageLegForInvariant {
  role?: string | null;
  instrumentType?: string | null;
  instrumentId?: string | null;
}

export interface MonotonicPositionForInvariant {
  id: string;
  openedAt?: string | null;
  asset: string;
  venue: string;
  direction: string;
  signalType: string;
  instrumentType?: string | null;
  instrumentId?: string | null;
  instrumentLabel?: string | null;
  packageLegs?: readonly MonotonicPackageLegForInvariant[] | null;
}

export interface MalformedMonotonicPosition {
  id: string;
  openedAt: string | null;
  asset: string;
  venue: string;
  direction: string;
  instrumentType: string | null;
  instrumentId: string | null;
  instrumentLabel: string | null;
  reasons: string[];
  recommendedAction: "operator_review_quarantine";
}

export interface MonotonicPreflightReport {
  generatedAt: string;
  checkedPositions: number;
  monotonicOpenPositions: number;
  validPackages: number;
  malformedPositions: MalformedMonotonicPosition[];
}

export function monotonicPackageInvariantReasons(position: MonotonicPositionForInvariant): string[] {
  if (position.signalType !== "MONOTONIC_ARB") return [];

  const reasons: string[] = [];
  if (position.instrumentType !== "pm_package") {
    reasons.push(`instrumentType=${position.instrumentType ?? "missing"} is not pm_package`);
  }

  const legs = position.packageLegs ?? [];
  if (!Array.isArray(legs) || legs.length < 2) {
    reasons.push(`packageLegs has ${Array.isArray(legs) ? legs.length : 0} leg(s); expected >=2`);
    return reasons;
  }

  const broadYes = legs.find((leg) => leg.role === "broad_yes");
  const narrowNo = legs.find((leg) => leg.role === "narrow_no");
  if (!broadYes) reasons.push("missing broad_yes leg");
  if (!narrowNo) reasons.push("missing narrow_no leg");
  if (broadYes && broadYes.instrumentType !== "pm_yes") {
    reasons.push(`broad_yes instrumentType=${broadYes.instrumentType ?? "missing"} is not pm_yes`);
  }
  if (narrowNo && narrowNo.instrumentType !== "pm_no") {
    reasons.push(`narrow_no instrumentType=${narrowNo.instrumentType ?? "missing"} is not pm_no`);
  }

  return reasons;
}

export function isValidMonotonicArbPackage(position: MonotonicPositionForInvariant): boolean {
  return position.signalType === "MONOTONIC_ARB"
    && monotonicPackageInvariantReasons(position).length === 0;
}

export function buildMonotonicPreflightReport(
  positions: readonly MonotonicPositionForInvariant[],
  generatedAt: string,
): MonotonicPreflightReport {
  const monotonicPositions = positions.filter((position) => position.signalType === "MONOTONIC_ARB");
  const malformedPositions = monotonicPositions
    .map((position): MalformedMonotonicPosition | null => {
      const reasons = monotonicPackageInvariantReasons(position);
      if (reasons.length === 0) return null;
      return {
        id: position.id,
        openedAt: position.openedAt ?? null,
        asset: position.asset,
        venue: position.venue,
        direction: position.direction,
        instrumentType: position.instrumentType ?? null,
        instrumentId: position.instrumentId ?? null,
        instrumentLabel: position.instrumentLabel ?? null,
        reasons,
        recommendedAction: "operator_review_quarantine",
      };
    })
    .filter((position): position is MalformedMonotonicPosition => position !== null);

  return {
    generatedAt,
    checkedPositions: positions.length,
    monotonicOpenPositions: monotonicPositions.length,
    validPackages: monotonicPositions.length - malformedPositions.length,
    malformedPositions,
  };
}
