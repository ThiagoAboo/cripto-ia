import Section from '../components/Section';
import Pill from '../components/Pill';
import SparklineChart from '../components/SparklineChart';
import { formatMoney, formatNumber, formatPercent } from '../lib/format';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getTickerForSymbol(tickers = [], symbol) {
  return safeArray(tickers).find((item) => item.symbol === symbol) || null;
}

function readChartValues(candles = []) {
  return safeArray(candles).map((item) => Number(item.close || 0)).filter((value) => Number.isFinite(value));
}

function selectValuesFromEvent(event) {
  return Array.from(event.target.selectedOptions || []).map((item) => item.value);
}

export default function MercadoPage({ ctx }) {
  const {
    baseCurrency,
    marketQuoteAsset,
    setMarketQuoteAsset,
    marketQuoteAssetOptions = [],
    marketSymbols = [],
    selectedMarketSymbols = [],
    setSelectedMarketSymbols,
    marketTickers = [],
    marketCandlesBySymbol = {},
    marketLoading,
    refreshMarketUniverse,
    goToPage,
  } = ctx;

  const selectedSymbolRows = selectedMarketSymbols.map((symbol) => {
    const ticker = getTickerForSymbol(marketTickers, symbol);
    const candles = safeArray(marketCandlesBySymbol?.[symbol]);
    const values = readChartValues(candles);
    return {
      symbol,
      ticker,
      candles,
      values,
      isPositive: Number(ticker?.priceChangePercent || 0) >= 0,
    };
  });

  return (
    <div className="page-stack">
      <Section
        title="Mercado"
        subtitle="Acompanhe moedas da Binance por base de conversão, com mini gráficos e variação das últimas 24h."
        actions={(
          <div className="button-row">
            <button type="button" className="button button--ghost" onClick={() => goToPage('operacoes')}>Ir para operações</button>
            <button type="button" className="button button--ghost" onClick={() => goToPage('execucao')}>Ir para execução</button>
            <button type="button" className="button button--ghost" onClick={refreshMarketUniverse}>Atualizar lista</button>
          </div>
        )}
      >
        <div className="market-toolbar">
          <div className="field">
            <label className="field__label" htmlFor="market-quote-asset">Conversão base</label>
            <select
              id="market-quote-asset"
              value={marketQuoteAsset}
              onChange={(event) => setMarketQuoteAsset(event.target.value)}
            >
              {marketQuoteAssetOptions.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
            <span className="field__hint">Escolha a base do par, como USDT ou BRL.</span>
          </div>

          <div className="field field--wide">
            <label className="field__label" htmlFor="market-symbols">Moedas monitoradas</label>
            <select
              id="market-symbols"
              multiple
              value={selectedMarketSymbols}
              onChange={(event) => setSelectedMarketSymbols(selectValuesFromEvent(event))}
              className="market-multiselect"
            >
              {marketSymbols.map((item) => (
                <option key={item.symbol} value={item.symbol}>{item.symbol}</option>
              ))}
            </select>
            <span className="field__hint">Selecione até 6 pares. A lista é carregada da Binance pelo backend, filtrando pela base escolhida.</span>
          </div>
        </div>

        <div className="button-row market-selection-pills">
          <Pill tone="info">Base ativa: {marketQuoteAsset}</Pill>
          <Pill tone="info">Pares disponíveis: {marketSymbols.length}</Pill>
          <Pill tone="info">Selecionados: {selectedMarketSymbols.length}</Pill>
          <Pill tone={marketLoading.cards ? 'warning' : 'buy'}>{marketLoading.cards ? 'carregando cards' : 'cards atualizados'}</Pill>
        </div>
      </Section>

      <Section
        title="Mini gráficos"
        subtitle="Cards com preço atual, variação 24h e sparkline dos candles mais recentes."
      >
        {selectedSymbolRows.length ? (
          <div className="market-cards-grid">
            {selectedSymbolRows.map((item) => {
              const ticker = item.ticker || {};
              const price = Number(ticker.price || item.values[item.values.length - 1] || 0);
              const priceChange = Number(ticker.priceChangePercent || 0);
              const quoteCurrency = marketQuoteAsset || baseCurrency || 'USDT';

              return (
                <article key={item.symbol} className="market-card panel">
                  <div className="market-card__header">
                    <div>
                      <p className="eyebrow">{item.symbol}</p>
                      <h3>{formatMoney(price, quoteCurrency)}</h3>
                    </div>
                    <Pill tone={item.isPositive ? 'buy' : 'sell'}>
                      {item.isPositive ? '+' : ''}{formatPercent(priceChange, 2)}
                    </Pill>
                  </div>

                  <SparklineChart
                    values={item.values}
                    positive={item.isPositive}
                    ariaLabel={`Mini gráfico do par ${item.symbol}`}
                  />

                  <div className="market-card__meta">
                    <span>Último preço: {formatMoney(price, quoteCurrency)}</span>
                    <span>Volume: {formatNumber(ticker.quoteVolume || 0, 2)}</span>
                    <span>Trades: {formatNumber(ticker.tradeCount || 0, 0)}</span>
                  </div>

                  <div className="market-card__actions button-row">
                    <button type="button" className="button button--ghost" onClick={() => goToPage('operacoes')}>
                      Operações
                    </button>
                    <button type="button" className="button button--ghost" onClick={() => goToPage('execucao')}>
                      Execução
                    </button>
                    <button type="button" className="button button--ghost" onClick={() => goToPage('social')}>
                      Social
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">Selecione um ou mais pares para visualizar os mini gráficos.</div>
        )}
      </Section>
    </div>
  );
}
