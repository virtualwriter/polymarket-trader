#!/usr/bin/env python3
"""Register FIND+H+DEC for informed-flow direction gate and smart-flow disagreement.

Idempotent: upserts FIND by clusterKey with a schema-valid body, and skips
hypotheses/decision when already present.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from registry import (  # noqa: E402
    VALID_STATUS,
    default_registry_path,
    find_finding_by_cluster_key,
    load_registry,
    next_id,
    upsert_finding,
    validate_record,
    write_registry,
)

FIND_TITLE = (
    "Informed flow asymmetry: dip-YES flow is smart money, high-YES flow is dumb money (wallet-level study)"
)
CLUSTER_KEY = "INFORMED_FLOW|TOUCH|DIRECTION_ASYMMETRY|no"
H_HIGH_DESC_PREFIX = "Smart-flow disagreement fade on highs"
H_DIP_DESC_PREFIX = "Residual dip fade only when smart wallets disagree"
SOURCE = "informed_flow_study_v1"


def git_sha() -> str:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return out.strip() or "unknown"
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return "unknown"


def finding_body(now: str) -> dict:
    return {
        "clusterKey": CLUSTER_KEY,
        "summary": (
            "Wallet-level study of resolved touch markets: walk-forward wallet skill is persistent "
            "(Spearman ~0.22). Smart-wallet share of net-YES is higher on dips than highs; dumb-wallet "
            "share is higher on highs. Lead-lag: dip-YES richening precedes spot declines; high-YES "
            "richening does not precede rallies. Entry-time flow adds little AUC beyond PM price."
        ),
        "implication": (
            "Sell-YES / buy-NO edges vs the options model are trustworthy on highs (fading dumb lottery "
            "flow) and unreliable on dips (fighting informed fear flow). Gate one-touch and NO-bias "
            "entries by direction: keep highs, downweight or block dips; when smart_flow_stance is "
            "known, require stance <= 0 to fade."
        ),
        "evidence": {
            "n": 222,
            "winRate": 0.626,
            "sumPnl": 0.0,
            "smart_share_dips": 0.0664,
            "smart_share_highs": 0.0261,
            "dumb_share_dips": 0.0974,
            "dumb_share_highs": 0.1833,
            "persistence_spearman": 0.2162,
        },
        "provenance": {
            "generatedBy": SOURCE,
            "inputWindow": {"start": "2026-05-26", "end": "2026-07-22"},
            "featureSet": "informed_flow_wallet_study_v1",
            "scoringVersion": "informed_flow_v1",
            "gitSha": git_sha(),
            "inputArtifacts": [
                "relative-value/flow-study/report.md",
                "data/flow-study/results/informed_flow_results.json",
                "data/flow-study/results/lead_lag_results.json",
            ],
            "filters": {
                "resolvedTouchMarketsOnly": True,
                "walkForwardWalletSkill": True,
            },
            "reproducibleCommand": (
                "python3 scripts/flow_study/pull_trade_tapes.py && "
                "python3 scripts/flow_study/wallet_track_records.py && "
                "python3 scripts/flow_study/informed_flow_tests.py && "
                "python3 scripts/flow_study/lead_lag_test.py && "
                "python3 scripts/flow_study/build_report.py && "
                "python3 scripts/register_informed_flow_hypotheses.py"
            ),
        },
        "operationalPolicy": {
            "directionGate": "sell_yes_buy_no_highs_only",
            "smartFlowDisagreement": "require_smart_flow_stance_leq_0_when_available",
            "modelVersion": "relative_value_heatmap_v3_one_touch",
        },
        "detectedAt": now,
        "lastSeenAt": now,
    }


def upsert_find(registry_path: Path, now: str) -> str:
    """Upsert by clusterKey, or repair a legacy title-matched FIND in place."""
    data = load_registry(registry_path)
    records = data.setdefault("records", [])
    body = finding_body(now)

    existing = find_finding_by_cluster_key(records, CLUSTER_KEY)
    if existing is None:
        for rec in records:
            if rec.get("type") == "finding" and rec.get("title") == FIND_TITLE:
                existing = rec
                break

    if existing is None:
        record = upsert_finding(
            registry_path,
            body=body,
            title=FIND_TITLE,
            source=SOURCE,
            evidence_class="DERIVED",
            links={},
        )
        print(f"created {record['id']}")
        return record["id"]

    # Repair / refresh in place so FIND-0020 (legacy status=new, missing fields)
    # does not spawn a duplicate id.
    kept_status = existing.get("status")
    if kept_status not in VALID_STATUS:
        kept_status = "open"
    existing["status"] = kept_status
    existing.setdefault("created", now)
    existing["source"] = SOURCE
    existing["title"] = FIND_TITLE
    existing.setdefault("links", {})
    existing["evidenceClass"] = "DERIVED"

    old_body = dict(existing.get("body") or {})
    merged = dict(old_body)
    for key in (
        "clusterKey",
        "summary",
        "implication",
        "evidence",
        "provenance",
        "operationalPolicy",
        "lastSeenAt",
    ):
        merged[key] = body[key]
    merged.setdefault("detectedAt", body["detectedAt"])
    # Preserve scorer-written fields when present.
    for key in (
        "opportunityScore",
        "confidenceScore",
        "scoreHistory",
        "themeId",
        "hypothesisIds",
        "provenanceHistory",
    ):
        if key in old_body and key not in merged:
            merged[key] = old_body[key]
    existing["body"] = merged

    errors = validate_record(existing)
    if errors:
        raise ValueError(f"{existing['id']} still invalid: " + "; ".join(errors))
    write_registry(registry_path, data)
    print(f"repaired {existing['id']}")
    return existing["id"]


def ensure_hypotheses(path: Path, find_id: str, now_date: str) -> None:
    hyps = json.loads(path.read_text()) if path.exists() else []
    existing_ids = {h.get("id") for h in hyps}
    existing_descs = {h.get("description", "") for h in hyps}

    def next_hid() -> str:
        nums = [int(i.split("-")[1]) for i in existing_ids if isinstance(i, str) and i.startswith("H-")]
        n = max(nums) + 1 if nums else 549
        while f"H-{n}" in existing_ids:
            n += 1
        return f"H-{n}"

    added = []
    if not any(d.startswith(H_HIGH_DESC_PREFIX) for d in existing_descs):
        hid = next_hid()
        existing_ids.add(hid)
        hyps.append(
            {
                "id": hid,
                "created": now_date,
                "description": (
                    f"{H_HIGH_DESC_PREFIX}: sell YES / buy NO on upside one-touch barriers when "
                    f"sell_yes_edge_pts is large, touch_direction=above (high), and smart_flow_stance <= 0 "
                    f"(smart wallets not confirming YES). Origin {find_id}."
                ),
                "conditions": {
                    "touch_direction": "= 1",
                    "sell_yes_edge_pts": ">= 8",
                    "smart_flow_stance": "<= 0",
                    "liquidity": ">= 5000",
                },
                "prediction": (
                    "YES reprices down within 14d (gap compresses) because Poly optimism is dumb-money "
                    "lottery flow that smart wallets are not confirming."
                ),
                "timeframeDays": 14,
                "confidence": 0.72,
                "direction": "short",
                "originFindingId": find_id,
                "themeId": "THEME-0001",
                "tests": [
                    {
                        "date": now_date,
                        "triggered": True,
                        "outcome": "pending",
                        "actualMove": "Shadow test 1/20 queued for smart-flow disagreement on highs.",
                    }
                ],
                "winRate": 0,
                "status": "active",
                "promotedToSignal": False,
                "postMortem": None,
                "source": SOURCE,
                "setupId": find_id.lower().replace("-", "_"),
                "setupLabel": f"FIND-linked {find_id}",
            }
        )
        added.append(hid)

    if not any(d.startswith(H_DIP_DESC_PREFIX) for d in existing_descs):
        hid = next_hid()
        existing_ids.add(hid)
        hyps.append(
            {
                "id": hid,
                "created": now_date,
                "description": (
                    f"{H_DIP_DESC_PREFIX}: on downside barriers (touch_direction=-1), only fade "
                    f"(sell YES) when smart_flow_stance < 0 (smart wallets selling YES / absent-short). "
                    f"Engine hard-blocks generic dip fades; this hyp tests the residual disagreement case. "
                    f"Origin {find_id}."
                ),
                "conditions": {
                    "touch_direction": "= -1",
                    "sell_yes_edge_pts": ">= 10",
                    "smart_flow_stance": "< 0",
                    "liquidity": ">= 5000",
                },
                "prediction": (
                    "When smart wallets disagree with Poly fear on dips, YES can still reprice down "
                    "within 14d — residual edge after the informed-flow gate."
                ),
                "timeframeDays": 14,
                "confidence": 0.55,
                "direction": "short",
                "originFindingId": find_id,
                "themeId": "THEME-0001",
                "tests": [
                    {
                        "date": now_date,
                        "triggered": True,
                        "outcome": "pending",
                        "actualMove": "Shadow test 1/20 queued for residual dip fade with smart disagreement.",
                    }
                ],
                "winRate": 0,
                "status": "active",
                "promotedToSignal": False,
                "postMortem": None,
                "source": SOURCE,
                "setupId": find_id.lower().replace("-", "_"),
                "setupLabel": f"FIND-linked {find_id}",
            }
        )
        added.append(hid)

    path.write_text(json.dumps(hyps, indent=2) + "\n")
    print(f"hypotheses: added={added} total={len(hyps)}")


def ensure_decision(records: list, find_id: str, now: str) -> None:
    title = "Informed-flow policy: highs-only sell-YES fades + smart-flow disagreement + dip IV uplift"
    for rec in records:
        if rec.get("type") == "decision" and rec.get("title") == title:
            print(f"skip decision ({rec['id']})")
            return
    dec_id = next_id(records, "decision")
    records.append(
        {
            "id": dec_id,
            "type": "decision",
            "evidenceClass": "DERIVED",
            "status": "final",
            "title": title,
            "body": {
                "rationale": (
                    "FIND wallet study showed dip-YES flow is informed and high-YES flow is lottery money. "
                    "Engine now hard-blocks sell-YES/buy-NO on direction=below; keeps highs; when "
                    "smart_flow_stance is available requires stance<=0 (smart wallets not confirming YES). "
                    "Options model v3 uplifts put-wing IV on dips so fake 'Poly too scared' edges shrink."
                ),
                "engineGates": [
                    "oneTouchNoShadowEligible",
                    "noBiasAdjustedGapEligible",
                    "strictOneTouchHighEdgeEligible",
                    "staleLotteryTicketNoEligible",
                ],
                "modelVersion": "relative_value_heatmap_v3_one_touch",
                "artifacts": [
                    "scripts/flow_study/export_smart_wallets.py",
                    "scripts/flow_study/score_smart_flow.py",
                    "scripts/cross_venue_relative_value_report.py",
                    "scripts/trading-engine.ts",
                ],
            },
            "links": {"relatedRecords": [find_id]},
            "created": now,
            "source": "register_informed_flow_hypotheses.py",
        }
    )
    print(f"created {dec_id}")


def main() -> int:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    now_date = now[:10]
    registry_path = default_registry_path()
    if not registry_path.exists():
        alt = Path("/opt/polymarket-trader/data/registry.json")
        registry_path = alt if alt.exists() else registry_path
    if not registry_path.exists():
        print(f"skip: registry not found at {registry_path}")
        return 1

    find_id = upsert_find(registry_path, now)

    # Decision write uses load/write separately so upsert_finding's own write is preserved.
    data = load_registry(registry_path)
    records = data.setdefault("records", [])
    ensure_decision(records, find_id, now)
    write_registry(registry_path, data)

    for hyp_path in (
        Path("/opt/polymarket-trader/data/hypotheses.json"),
        ROOT / "data" / "hypotheses.json",
    ):
        if hyp_path.exists():
            ensure_hypotheses(hyp_path, find_id, now_date)
            break
    else:
        print("warn: hypotheses.json not found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
