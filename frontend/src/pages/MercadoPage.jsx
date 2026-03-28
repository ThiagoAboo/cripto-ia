import { useEffect, useMemo, useState } from 'react';
import Section from '../components/Section';
import Pill from '../components/Pill';
import SparklineChart from '../components/SparklineChart';
import { getApiBaseUrl } from '../lib/api';
import { formatMoney, formatNumber, formatPercent } from '../lib/format';
import { signedClassName } from '../lib/ui';

const STORAGE_KEY = 'criptoia.mercado.v2';
const MAX_SELECTED = 6;
const DEFAULT_QUOTE = 'USDT';
const DEFAULT_INTERVAL = '5m';
const DEFAULT_LIMIT = 48;
const INTERVAL_OPTIONS = ['1m', '5m', '15m', '1h', '4h'];
const QUOTE_OPTIONS = ['USDT', 'BRL', 'BTC', 'ETH', 'BNB'];

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function loadStoredState() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

function persistState(nextState) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch (_error) {
    // ignore localStorage errors
  }
}

async function requestJson(path) {
  const response = await fetch(`${getApiBaseUrl()}${path}`);
  if (!response.ok) {
    let message = `Falha na requisição (${response.status})`;
    try {
      const payload = await response.json();
      message = payload.message || payload.error || message;
    } catch (_error) {
      // ignore parse error
    }
    throw new Error(message);
  }
  return response.json();
}

function buildPresetPayload(name, state) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    quoteAsset: state.quoteAsset,
    interval: state.interval,
    selectedSymbols: state.selectedSymbols,
    favorites: state.favorites,
    compareSymbols: state.compareSymbols,
    createdAt: new Date().toISOString(),
  };
}

function readChartValues(candles = []) {
  return safeArray(candles)
    .map((item) => safeNumber(item.close ?? item[4], NaN))
    .filter((value) => Number.isFinite(value));
}

function selectValuesFromEvent(event) {
  return Array.from(event.target.selectedOptions || []).map((item) => item.value);
}

function buildComparison(leftSymbol, rightSymbol, tickersBySymbol, quoteAsset) {
  const leftTicker = tickersBySymbol[leftSymbol] || null;
  const rightTicker = tickersBySymbol[rightSymbol] || null;
  if (!leftTicker || !rightTicker) {
    return null;
  }

  const leftPrice = safeNumber(leftTicker.price);
  const rightPrice = safeNumber(rightTicker.price);
  const leftChange = safeNumber(leftTicker.priceChangePercent);
  const rightChange = safeNumber(rightTicker.priceChangePercent);

  return {
    leftSymbol,
    rightSymbol,
    priceGapPct: rightPrice ? ((leftPrice - rightPrice) / rightPrice) * 100 : 0,
    changeGapPct: leftChange - rightChange,
    leaderByPriceChange: leftChange >= rightChange ? leftSymbol : rightSymbol,
    leaderByVolume:
      safeNumber(leftTicker.quoteVolume) >= safeNumber(rightTicker.quoteVolume)
        ? leftSymbol
        : rightSymbol,
    quoteAsset,
  };
}

export default function MercadoPage({ ctx = {} }) {
  const stored = loadStoredState();
  const [quoteAsset, setQuoteAsset] = useState(stored?.quoteAsset || DEFAULT_QUOTE);
  const [interval, setInterval] = useState(stored?.interval || DEFAULT_INTERVAL);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [selectedSymbols, setSelectedSymbols] = useState(safeArray(stored?.selectedSymbols).slice(0, MAX_SELECTED));
  const [favorites, setFavorites] = useState(safeArray(stored?.favorites));
  const [presets, setPresets] = useState(safeArray(stored?.presets));
  const [compareSymbols, setCompareSymbols] = useState(safeArray(stored?.compareSymbols).slice(0, 2));
  const [symbols, setSymbols] = useState([]);
  const [tickersBySymbol, setTickersBySymbol] = useState({});
  const [candlesBySymbol, setCandlesBySymbol] = useState({});
  const [loading, setLoading] = useState({ universe: false, cards: false });
  const [error, setError] = useState('');

  const baseCurrency = ctx.baseCurrency || 'USDT';
  const goToPage = ctx.goToPage || (() => {});

  useEffect(() => {
    persistState({
      quoteAsset,
      interval,
      selectedSymbols,
      favorites,
      presets,
      compareSymbols,
    });
  }, [quoteAsset, interval, selectedSymbols, favorites, presets, compareSymbols]);

  useEffect(() => {
    let cancelled = false;

    async function loadUniverse() {
      setLoading((current) => ({ ...current, universe: true }));
      setError('');
      try {
        const payload = await requestJson(`/api/market/symbols?quoteAsset=${encodeURIComponent(quoteAsset)}`);
        if (cancelled) return;
        const nextItems = safeArray(payload.items);
        setSymbols(nextItems);
        const availableSymbols = new Set(nextItems.map((item) => item.symbol));
        setSelectedSymbols((current) => {
          const filtered = current.filter((symbol) => availableSymbols.has(symbol)).slice(0, MAX_SELECTED);
          if (filtered.length) return filtered;
          const seeded = nextItems.slice(0, 4).map((item) => item.symbol);
          return seeded;
        });
        setFavorites((current) => current.filter((symbol) => availableSymbols.has(symbol)));
        setCompareSymbols((current) => current.filter((symbol) => availableSymbols.has(symbol)).slice(0, 2));
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || 'Falha ao carregar os pares disponíveis.');
        }
      } finally {
        if (!cancelled) {
          setLoading((current) => ({ ...current, universe: false }));
        }
      }
    }

    loadUniverse();
    return () => {
      cancelled = true;
    };
  }, [quoteAsset]);

  useEffect(() => {
    let cancelled = false;

    async function loadCards() {
      if (!selectedSymbols.length) {
        setTickersBySymbol({});
        setCandlesBySymbol({});
        return;
      }

      setLoading((current) => ({ ...current, cards: true }));
      setError('');
      try {
        const tickerPayload = await requestJson(
          `/api/market/tickers?symbols=${encodeURIComponent(selectedSymbols.join(','))}`,
        );

        const candlePayloads = await Promise.all(
          selectedSymbols.map(async (symbol) => {
            const payload = await requestJson(
              `/api/market/candles/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&limit=${DEFAULT_LIMIT}`,
            );
            return [symbol, safeArray(payload.items || payload.candles || payload)];
          }),
        );

        if (cancelled) return;

        setTickersBySymbol(
          safeArray(tickerPayload.items).reduce((accumulator, item) => {
            accumulator[item.symbol] = item;
            return accumulator;
          }, {}),
        );
        setCandlesBySymbol(Object.fromEntries(candlePayloads));
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || 'Falha ao carregar os dados de mercado.');
        }
      } finally {
        if (!cancelled) {
          setLoading((current) => ({ ...current, cards: false }));
        }
      }
    }

    loadCards();
    return () => {
      cancelled = true;
    };
  }, [interval, selectedSymbols]);

  const filteredSymbols = useMemo(() => {
    const term = symbolSearch.trim().toUpperCase();
    if (!term) return symbols;
    return symbols.filter((item) => item.symbol.includes(term) || String(item.baseAsset || '').includes(term));
  }, [symbolSearch, symbols]);

  const selectedRows = useMemo(
    () =>
      selectedSymbols.map((symbol) => {
        const ticker = tickersBySymbol[symbol] || null;
        const candles = safeArray(candlesBySymbol[symbol]);
        const values = readChartValues(candles);
        const price = safeNumber(ticker?.price || values[values.length - 1]);
        const changePct = safeNumber(ticker?.priceChangePercent);
        return {
          symbol,
          ticker,
          values,
          price,
          changePct,
          positive: changePct >= 0,
          isFavorite: favorites.includes(symbol),
        };
      }),
    [candlesBySymbol, favorites, selectedSymbols, tickersBySymbol],
  );

  const comparison = useMemo(() => {
    if (compareSymbols.length < 2) return null;
    return buildComparison(compareSymbols[0], compareSymbols[1], tickersBySymbol, quoteAsset || baseCurrency);
  }, [baseCurrency, compareSymbols, quoteAsset, tickersBySymbol]);

  function toggleFavorite(symbol) {
    setFavorites((current) =>
      current.includes(symbol) ? current.filter((item) => item !== symbol) : [symbol, ...current].slice(0, 20),
    );
  }

  function handleSymbolsSelection(event) {
    setSelectedSymbols(selectValuesFromEvent(event).slice(0, MAX_SELECTED));
  }

  function applyPreset(preset) {
    setQuoteAsset(preset.quoteAsset || DEFAULT_QUOTE);
    setInterval(preset.interval || DEFAULT_INTERVAL);
    setSelectedSymbols(safeArray(preset.selectedSymbols).slice(0, MAX_SELECTED));
    setFavorites(safeArray(preset.favorites));
    setCompareSymbols(safeArray(preset.compareSymbols).slice(0, 2));
  }

  function saveCurrentPreset() {
    const name = window.prompt('Nome do preset de mercado:', `Mercado ${quoteAsset} ${interval}`);
    if (!name) return;
    setPresets((current) => [buildPresetPayload(name, { quoteAsset, interval, selectedSymbols, favorites, compareSymbols }), ...current].slice(0, 8));
  }

  function removePreset(presetId) {
    setPresets((current) => current.filter((item) => item.id !== presetId));
  }

  function setComparisonSymbol(side, symbol) {
    setCompareSymbols((current) => {
      const next = [...current];
      next[side] = symbol;
      return next.filter(Boolean).slice(0, 2);
    });
  }

  const universeActions = (
    <div className="market-actions-inline">
      <button type="button" className="button button--ghost" onClick={() => goToPage('dashboard')}>
        Ir para dashboard
      </button>
      <button type="button" className="button button--ghost" onClick={() => goToPage('operacoes')}>
        Abrir operações
      </button>
      <button type="button" className="button button--ghost" onClick={() => goToPage('execucao')}>
        Ir para execução
      </button>
    </div>
  );

  return (
    <div className="page-stack mercado-page-v2">
      <Section
        title="Radar de mercado"
        subtitle="Selecione a base de conversão, escolha os pares disponíveis na Binance e compare rapidamente os ativos com mini gráficos e atalhos operacionais."
        actions={universeActions}
      >
        <div className="market-toolbar">
          <label className="field field--compact">
            <span>Base de conversão</span>
            <select value={quoteAsset} onChange={(event) => setQuoteAsset(event.target.value)}>
              {QUOTE_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="field field--compact">
            <span>Intervalo do mini gráfico</span>
            <select value={interval} onChange={(event) => setInterval(event.target.value)}>
              {INTERVAL_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="field field--grow field--compact">
            <span>Filtrar lista de pares</span>
            <input
              value={symbolSearch}
              onChange={(event) => setSymbolSearch(event.target.value)}
              placeholder={`Ex.: BTC${quoteAsset}`}
            />
          </label>

          <div className="market-toolbar__badges">
            <Pill tone={loading.universe ? 'warning' : 'info'}>
              {loading.universe ? 'Atualizando universo…' : `Pares ${quoteAsset}: ${symbols.length}`}
            </Pill>
            <Pill tone={loading.cards ? 'warning' : 'success'}>
              {loading.cards ? 'Atualizando cards…' : `Selecionados: ${selectedSymbols.length}`}
            </Pill>
          </div>
        </div>

        <div className="market-select-grid">
          <label className="field market-select-card">
            <span>Pares disponíveis na Binance</span>
            <select
              className="market-multiselect"
              multiple
              size={12}
              value={selectedSymbols}
              onChange={handleSymbolsSelection}
            >
              {filteredSymbols.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.symbol} · {item.baseAsset || item.symbol.replace(quoteAsset, '')}
                </option>
              ))}
            </select>
            <small>Selecione até {MAX_SELECTED} pares para acompanhar. A filtragem respeita a base {quoteAsset}.</small>
          </label>

          <div className="market-side-panel">
            <div className="market-panel-card">
              <div className="market-panel-card__header">
                <strong>Favoritos</strong>
                <button type="button" className="button button--ghost button--small" onClick={saveCurrentPreset}>
                  Salvar preset
                </button>
              </div>
              {favorites.length ? (
                <div className="tag-list">
                  {favorites.map((symbol) => (
                    <button
                      key={symbol}
                      type="button"
                      className="tag tag--button"
                      onClick={() => setSelectedSymbols((current) => Array.from(new Set([symbol, ...current])).slice(0, MAX_SELECTED))}
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="empty-note">Marque estrelas nos cards para manter uma watchlist rápida.</p>
              )}
            </div>

            <div className="market-panel-card">
              <div className="market-panel-card__header">
                <strong>Presets rápidos</strong>
              </div>
              {presets.length ? (
                <div className="preset-list">
                  {presets.map((preset) => (
                    <div key={preset.id} className="preset-item">
                      <div>
                        <strong>{preset.name}</strong>
                        <small>
                          {preset.quoteAsset} · {preset.interval} · {safeArray(preset.selectedSymbols).length} pares
                        </small>
                      </div>
                      <div className="preset-item__actions">
                        <button type="button" className="button button--ghost button--small" onClick={() => applyPreset(preset)}>
                          Aplicar
                        </button>
                        <button type="button" className="button button--ghost button--small" onClick={() => removePreset(preset.id)}>
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-note">Salve presets para trocar entre listas como swing, scalp ou moedas favoritas.</p>
              )}
            </div>
          </div>
        </div>

        {error ? <div className="callout callout--danger">{error}</div> : null}
      </Section>

      <Section
        title="Comparação lado a lado"
        subtitle="Escolha dois pares dentre os selecionados para comparar preço, força relativa e volume."
      >
        <div className="market-compare-toolbar">
          <label className="field field--compact">
            <span>Par 1</span>
            <select value={compareSymbols[0] || ''} onChange={(event) => setComparisonSymbol(0, event.target.value)}>
              <option value="">Selecione</option>
              {selectedSymbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="field field--compact">
            <span>Par 2</span>
            <select value={compareSymbols[1] || ''} onChange={(event) => setComparisonSymbol(1, event.target.value)}>
              <option value="">Selecione</option>
              {selectedSymbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </label>
        </div>

        {comparison ? (
          <div className="market-compare-grid">
            <article className="market-compare-card">
              <strong>Maior variação 24h</strong>
              <span>{comparison.leaderByPriceChange}</span>
              <small>Diferença: <span className={signedClassName(comparison.changeGapPct)}>{formatPercent(comparison.changeGapPct, 2)}</span></small>
            </article>
            <article className="market-compare-card">
              <strong>Maior volume</strong>
              <span>{comparison.leaderByVolume}</span>
              <small>Leitura útil para priorizar operação.</small>
            </article>
            <article className="market-compare-card">
              <strong>Diferença de preço</strong>
              <span className={signedClassName(comparison.priceGapPct)}>{formatPercent(comparison.priceGapPct, 2)}</span>
              <small>Comparação em {comparison.quoteAsset}</small>
            </article>
          </div>
        ) : (
          <div className="empty-state compact">Selecione dois pares acima para habilitar a comparação lado a lado.</div>
        )}
      </Section>

      <Section
        title="Cards de mercado"
        subtitle="Os cards abaixo mostram preço, variação 24h, volume, mini gráfico e atalhos para outras telas do painel."
      >
        {selectedRows.length ? (
          <div className="market-card-grid">
            {selectedRows.map((item) => {
              const ticker = item.ticker || {};
              const quoteCurrency = quoteAsset || baseCurrency || 'USDT';
              return (
                <article key={item.symbol} className="market-card">
                  <div className="market-card__header">
                    <div>
                      <h3>{item.symbol}</h3>
                      <p>{item.positive ? 'Movimento positivo em 24h' : 'Movimento negativo em 24h'}</p>
                    </div>
                    <button
                      type="button"
                      className={`favorite-toggle ${item.isFavorite ? 'is-active' : ''}`}
                      onClick={() => toggleFavorite(item.symbol)}
                      aria-label={item.isFavorite ? `Remover ${item.symbol} dos favoritos` : `Adicionar ${item.symbol} aos favoritos`}
                    >
                      ★
                    </button>
                  </div>

                  <div className="market-card__metrics">
                    <div>
                      <small>Preço atual</small>
                      <strong>{formatMoney(item.price, quoteCurrency)}</strong>
                    </div>
                    <div>
                      <small>Variação 24h</small>
                      <strong className={item.positive ? 'positive' : 'negative'}>
                        {item.positive ? '+' : ''}
                        {formatPercent(item.changePct, 2)}
                      </strong>
                    </div>
                  </div>

                  <SparklineChart
                    values={item.values}
                    positive={item.positive}
                    ariaLabel={`Mini gráfico do ativo ${item.symbol}`}
                  />

                  <div className="market-card__meta">
                    <span>Volume 24h: {formatNumber(ticker.quoteVolume || 0, 2)}</span>
                    <span>Trades: {formatNumber(ticker.tradeCount || 0, 0)}</span>
                  </div>

                  <div className="market-card__actions">
                    <button type="button" className="button button--ghost button--small" onClick={() => goToPage('operacoes')}>
                      Operações
                    </button>
                    <button type="button" className="button button--ghost button--small" onClick={() => goToPage('execucao')}>
                      Execução
                    </button>
                    <button type="button" className="button button--ghost button--small" onClick={() => goToPage('social')}>
                      Social
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            Escolha um ou mais pares na lista para montar os cards com mini gráfico e variação de 24h.
          </div>
        )}
      </Section>
    </div>
  );
}
