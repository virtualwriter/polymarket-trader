#!/usr/bin/env python3
"""One-shot VPS patch for DEC-0005 aux files (scanner, neon, reporting)."""
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def patch_scanner() -> None:
    p = ROOT / "scripts" / "position-exit-scanner.ts"
    t = p.read_text()
    if "entryConfidence?: number" in t and "entry_confidence" in t:
        print("scanner: already patched")
        return

    t = t.replace(
        "  peakPnlPct?: number;\n}\n\ninterface Portfolio",
        "  peakPnlPct?: number;\n  entryConfidence?: number;\n}\n\ninterface Portfolio",
        1,
    )
    t = t.replace(
        "  instrumentLabel?: string;\n}\n\ninterface PolymarketContractMark",
        "  instrumentLabel?: string;\n  entryConfidence?: number | null;\n}\n\ninterface PolymarketContractMark",
        1,
    )
    t = t.replace(
        "    instrumentLabel: position.instrumentLabel,\n  };\n\n  portfolio.cash += position.size + mark.pnl;",
        "    instrumentLabel: position.instrumentLabel,\n    entryConfidence: position.entryConfidence ?? null,\n  };\n\n  portfolio.cash += position.size + mark.pnl;",
        1,
    )
    t = t.replace(
        "signal_type,hypothesis_id,thesis,close_reason\\n",
        "signal_type,hypothesis_id,entry_confidence,thesis,close_reason\\n",
    )

    lines = t.splitlines(True)
    out: list[str] = []
    i = 0
    while i < len(lines):
        if (
            lines[i].strip() == 'trade.signalType, trade.hypothesisId ?? "",'
            and i + 1 < len(lines)
            and "trade.thesis.replace" in lines[i + 1]
            and "entryConfidence" not in lines[i + 1]
        ):
            out.append(lines[i])
            out.append(
                '    (trade.entryConfidence === null || trade.entryConfidence === undefined || !Number.isFinite(trade.entryConfidence)) ? "" : Number(trade.entryConfidence).toFixed(4),\n'
            )
            out.append(lines[i + 1])
            i += 2
            continue
        out.append(lines[i])
        i += 1
    t = "".join(out)
    if "entry_confidence" not in t or "entryConfidence: position.entryConfidence" not in t:
        raise SystemExit("scanner patch failed validation")
    p.write_text(t)
    print("scanner: patched")


def patch_neon() -> None:
    p = ROOT / "scripts" / "lib" / "db" / "neon-trades.ts"
    if not p.exists():
        print("neon: missing, skip")
        return
    t = p.read_text()
    if "entry_confidence" in t and "finiteOrNull(trade.entryConfidence)" in t:
        print("neon: already patched")
        return

    t = t.replace(
        "  hypothesis_id TEXT,\n  thesis TEXT,",
        "  hypothesis_id TEXT,\n  entry_confidence DOUBLE PRECISION,\n  thesis TEXT,",
    )
    if "ADD_ENTRY_CONFIDENCE_SQL" not in t:
        t = t.replace(
            "const CREATE_INDEXES_SQL = [",
            "const ADD_ENTRY_CONFIDENCE_SQL = `ALTER TABLE ${TRADES_TABLE} ADD COLUMN IF NOT EXISTS entry_confidence DOUBLE PRECISION`;\n\nconst CREATE_INDEXES_SQL = [",
        )
    t = t.replace(
        """INSERT INTO ${TRADES_TABLE} (
  id, opened_at, closed_at, asset, venue, direction,
  instrument_type, instrument_id, instrument_label,
  entry_price, exit_price, size,
  pnl, pnl_pct, market_pnl, funding_pnl,
  signal_type, hypothesis_id, thesis, close_reason, synced_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
  $13, $14, $15, $16, $17, $18, $19, $20, now()
)""",
        """INSERT INTO ${TRADES_TABLE} (
  id, opened_at, closed_at, asset, venue, direction,
  instrument_type, instrument_id, instrument_label,
  entry_price, exit_price, size,
  pnl, pnl_pct, market_pnl, funding_pnl,
  signal_type, hypothesis_id, entry_confidence, thesis, close_reason, synced_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
  $13, $14, $15, $16, $17, $18, $19, $20, $21, now()
)""",
    )
    t = t.replace(
        "  hypothesis_id = EXCLUDED.hypothesis_id,\n  thesis = EXCLUDED.thesis,",
        "  hypothesis_id = EXCLUDED.hypothesis_id,\n  entry_confidence = EXCLUDED.entry_confidence,\n  thesis = EXCLUDED.thesis,",
    )
    t = t.replace(
        "    trade.hypothesisId ?? null,\n    trade.thesis ?? null,\n    trade.closeReason ?? null,",
        "    trade.hypothesisId ?? null,\n    finiteOrNull(trade.entryConfidence),\n    trade.thesis ?? null,\n    trade.closeReason ?? null,",
    )
    if "await client.query(ADD_ENTRY_CONFIDENCE_SQL)" not in t:
        t = t.replace(
            "await client.query(CREATE_TRADES_TABLE_SQL)",
            "await client.query(CREATE_TRADES_TABLE_SQL)\n  await client.query(ADD_ENTRY_CONFIDENCE_SQL)",
        )
    if "entry_confidence" not in t:
        raise SystemExit("neon patch failed")
    p.write_text(t)
    print("neon: patched")


def patch_reporting() -> None:
    rb = ROOT / "scripts" / "lib" / "reporting" / "report-builders.ts"
    if rb.exists():
        t = rb.read_text()
        if "entryConfidence" not in t:
            t2 = t.replace(
                "  hypothesisId?: string | null;\n  thesis?: string | null;",
                "  hypothesisId?: string | null;\n  entryConfidence?: number | null;\n  thesis?: string | null;",
            )
            if t2 == t:
                t2 = t.replace(
                    "  hypothesisId: string | null;\n  thesis: string;",
                    "  hypothesisId: string | null;\n  entryConfidence?: number | null;\n  thesis: string;",
                )
            rb.write_text(t2)
            print("report-builders: patched")
        else:
            print("report-builders: ok")

    rd = ROOT / "scripts" / "lib" / "reporting" / "report-data.ts"
    if not rd.exists():
        print("report-data: missing")
        return
    t = rd.read_text()
    if "entryConfidence" in t or "entry_confidence" in t:
        print("report-data: ok")
        return
    # common patterns
    for old, new in [
        (
            "hypothesisId: row.hypothesis_id || null,",
            "hypothesisId: row.hypothesis_id || null,\n      entryConfidence: row.entry_confidence ? Number(row.entry_confidence) : null,",
        ),
        (
            "hypothesisId: row.hypothesis_id,",
            "hypothesisId: row.hypothesis_id,\n      entryConfidence: row.entry_confidence !== undefined && row.entry_confidence !== \"\" ? Number(row.entry_confidence) : null,",
        ),
    ]:
        if old in t:
            rd.write_text(t.replace(old, new, 1))
            print("report-data: patched")
            return
    print("report-data: needs manual review")
    for i, line in enumerate(t.splitlines(), 1):
        if "hypothesis" in line.lower():
            print(f"  {i}: {line}")


def main() -> None:
    patch_scanner()
    patch_neon()
    patch_reporting()


if __name__ == "__main__":
    main()
