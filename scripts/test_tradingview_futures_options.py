#!/usr/bin/env python3
import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("tradingview_futures_options.py")
SPEC = importlib.util.spec_from_file_location("tradingview_futures_options", MODULE_PATH)
assert SPEC and SPEC.loader
tradingview = importlib.util.module_from_spec(SPEC)
sys.modules["tradingview_futures_options"] = tradingview
SPEC.loader.exec_module(tradingview)


class TradingViewFuturesOptionsTest(unittest.TestCase):
    def test_row_to_quote_prefers_bid_ask_implied_volatility(self) -> None:
        row = {
            "name": "EW260630C7750",
            "expiration": 20260630,
            "strike": 7750,
            "option-type": "call",
            "bid": 44,
            "ask": 45.75,
            "iv": 0.7160290854675879,
            "bid_iv": 0.13381911690500192,
            "ask_iv": 0.1360611149646605,
        }

        quote = tradingview.row_to_quote(row)

        self.assertIsNotNone(quote)
        assert quote is not None
        self.assertAlmostEqual(
            quote["impliedVolatility"],
            (0.13381911690500192 + 0.1360611149646605) / 2,
        )


if __name__ == "__main__":
    unittest.main()
