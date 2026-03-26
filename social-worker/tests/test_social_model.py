import unittest

from social_model import classify_asset, opportunity_score, rank_assets, should_emit_alert


class SocialModelTests(unittest.TestCase):
    def test_classify_asset_marks_strong_symbol(self):
        asset = {'socialScore': 88, 'socialRisk': 24, 'momentum': 18, 'spamRisk': 10}
        self.assertEqual(classify_asset(asset), 'FORTE')

    def test_rank_assets_orders_by_opportunity(self):
        ranked = rank_assets([
            {'symbol': 'pepe', 'socialScore': 72, 'socialRisk': 50, 'momentum': 14, 'sentiment': 10, 'spamRisk': 18, 'sourceCount': 4},
            {'symbol': 'sol', 'socialScore': 85, 'socialRisk': 22, 'momentum': 16, 'sentiment': 12, 'spamRisk': 7, 'sourceCount': 6},
        ])
        self.assertEqual(ranked[0]['symbol'], 'SOL')
        self.assertEqual(ranked[0]['watchlistRank'], 1)

    def test_should_emit_alert_for_high_risk_asset(self):
        asset = {'socialScore': 40, 'socialRisk': 90, 'momentum': -12, 'spamRisk': 85}
        self.assertTrue(should_emit_alert(asset))

    def test_opportunity_score_is_clamped(self):
        asset = {'socialScore': 999, 'socialRisk': 0, 'momentum': 999, 'sentiment': 999, 'spamRisk': 0, 'sourceCount': 99}
        self.assertEqual(opportunity_score(asset), 100.0)


if __name__ == '__main__':
    unittest.main()
