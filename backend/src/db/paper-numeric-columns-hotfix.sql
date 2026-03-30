ALTER TABLE paper_accounts ALTER COLUMN starting_balance TYPE NUMERIC(28, 12) USING starting_balance::NUMERIC(28, 12);
ALTER TABLE paper_accounts ALTER COLUMN cash_balance TYPE NUMERIC(28, 12) USING cash_balance::NUMERIC(28, 12);
ALTER TABLE paper_accounts ALTER COLUMN realized_pnl TYPE NUMERIC(28, 12) USING realized_pnl::NUMERIC(28, 12);
ALTER TABLE paper_accounts ALTER COLUMN fees_paid TYPE NUMERIC(28, 12) USING fees_paid::NUMERIC(28, 12);
ALTER TABLE paper_accounts ALTER COLUMN last_equity TYPE NUMERIC(28, 12) USING last_equity::NUMERIC(28, 12);

ALTER TABLE paper_positions ALTER COLUMN quantity TYPE NUMERIC(28, 12) USING quantity::NUMERIC(28, 12);
ALTER TABLE paper_positions ALTER COLUMN avg_entry_price TYPE NUMERIC(28, 12) USING avg_entry_price::NUMERIC(28, 12);
ALTER TABLE paper_positions ALTER COLUMN cost_basis TYPE NUMERIC(28, 12) USING cost_basis::NUMERIC(28, 12);
ALTER TABLE paper_positions ALTER COLUMN last_price TYPE NUMERIC(28, 12) USING last_price::NUMERIC(28, 12);
ALTER TABLE paper_positions ALTER COLUMN market_value TYPE NUMERIC(28, 12) USING market_value::NUMERIC(28, 12);
ALTER TABLE paper_positions ALTER COLUMN unrealized_pnl TYPE NUMERIC(28, 12) USING unrealized_pnl::NUMERIC(28, 12);
ALTER TABLE paper_positions ALTER COLUMN realized_pnl TYPE NUMERIC(28, 12) USING realized_pnl::NUMERIC(28, 12);

ALTER TABLE paper_orders ALTER COLUMN requested_notional TYPE NUMERIC(28, 12) USING requested_notional::NUMERIC(28, 12);
ALTER TABLE paper_orders ALTER COLUMN executed_notional TYPE NUMERIC(28, 12) USING executed_notional::NUMERIC(28, 12);
ALTER TABLE paper_orders ALTER COLUMN requested_quantity TYPE NUMERIC(28, 12) USING requested_quantity::NUMERIC(28, 12);
ALTER TABLE paper_orders ALTER COLUMN executed_quantity TYPE NUMERIC(28, 12) USING executed_quantity::NUMERIC(28, 12);
ALTER TABLE paper_orders ALTER COLUMN price TYPE NUMERIC(28, 12) USING price::NUMERIC(28, 12);
ALTER TABLE paper_orders ALTER COLUMN fee_amount TYPE NUMERIC(28, 12) USING fee_amount::NUMERIC(28, 12);
ALTER TABLE paper_orders ALTER COLUMN slippage_pct TYPE NUMERIC(18, 8) USING slippage_pct::NUMERIC(18, 8);
ALTER TABLE paper_orders ALTER COLUMN realized_pnl TYPE NUMERIC(28, 12) USING realized_pnl::NUMERIC(28, 12);
ALTER TABLE paper_orders ALTER COLUMN pnl_pct TYPE NUMERIC(18, 8) USING pnl_pct::NUMERIC(18, 8);

ALTER TABLE portfolio_snapshots ALTER COLUMN cash_balance TYPE NUMERIC(28, 12) USING cash_balance::NUMERIC(28, 12);
ALTER TABLE portfolio_snapshots ALTER COLUMN positions_value TYPE NUMERIC(28, 12) USING positions_value::NUMERIC(28, 12);
ALTER TABLE portfolio_snapshots ALTER COLUMN equity TYPE NUMERIC(28, 12) USING equity::NUMERIC(28, 12);
ALTER TABLE portfolio_snapshots ALTER COLUMN realized_pnl TYPE NUMERIC(28, 12) USING realized_pnl::NUMERIC(28, 12);
ALTER TABLE portfolio_snapshots ALTER COLUMN unrealized_pnl TYPE NUMERIC(28, 12) USING unrealized_pnl::NUMERIC(28, 12);
