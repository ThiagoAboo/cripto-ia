import { useEffect, useMemo, useRef, useState } from 'react';
import Section from '../components/Section';
import Pill from '../components/Pill';
import SparklineChart from '../components/SparklineChart';
import { getApiBaseUrl } from '../lib/api';
import { formatMoney, formatNumber, formatPercent } from '../lib/format';
import { signedClassName } from '../lib/ui';

const STORAGE_KEY = 'criptoia.mercado.v3';
const MAX_SELECTED = 6;
const MAX_FAVORITES = 20;
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

function uniqueSymbols(values = [], max = MAX_FAVORITES) {
  return Array.from(
    new Set(
      safeArray(values)
        .map((item) => String(item || '').trim().toUpperCase())
        .filter(Boolean),
    ),
  ).slice(0, max);
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

async function requestJson(path, options = {}) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

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
    createdAt: new Date().toISOString(),
  };
}

function readChartValues(candles = []) {
  return safeArray(candles)
    .map((item) => safeNumber(item.close ?? item[4], NaN))
    .filter((value) => Number.isFinite(value));
}

export default function MercadoPage({ ctx = {} }) {
  const stored = loadStoredState();
  const [quoteAsset, setQuoteAsset] = useState(stored?.quoteAsset || DEFAULT_QUOTE);
  const [interval, setInterval] = useState(stored?.interval || DEFAULT_INTERVAL);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [selectedSymbols, setSelectedSymbols] = useState(uniqueSymbols(stored?.selectedSymbols, MAX_SELECTED));
  const [favorites, setFavorites] = useState(uniqueSymbols(stored?.favorites, MAX_FAVORITES));
  const [presets, setPresets] = useState(safeArray(stored?.presets));
  const [symbols, setSymbols] = useState([]);
  const [tickersBySymbol, setTickersBySymbol] = useState({});
  const [candlesBySymbol, setCandlesBySymbol] = useState({});
  const [loading, setLoading] = useState({ universe: false, cards: false, preferences: false });
  const [error, setError] = useState('');

  const favoritesHydratedRef = useRef(false);
  const lastSavedFavoritesRef = useRef(JSON.stringify(uniqueSymbols(stored?.favorites, MAX_FAVORITES)));

  const baseCurrency = ctx.baseCurrency || 'USDT';
  const goToPage = ctx.goToPage || (() => {});

  useEffect(() => {
    persistState({
      quoteAsset,
      interval,
      selectedSymbols,
      favorites,
      presets,
    });
  }, [quoteAsset, interval, selectedSymbols, favorites, presets]);

  useEffect(() => {
    let cancelled = false;

    async function loadStoredFavorites() {
      setLoading((current) => ({ ...current, preferences: true }));
      try {
        const payload = await requestJson('/api/market/preferences');
        if (cancelled) return;
        const backendFavorites = uniqueSymbols(payload?.favorites, MAX_FAVORITES);
        lastSavedFavoritesRef.current = JSON.stringify(backendFavorites);
        setFavorites((current) => uniqueSymbols([...backendFavorites, ...current], MAX_FAVORITES));
      } catch (_error) {
        // keep local fallback silently
      } finally {
        if (!cancelled) {
          favoritesHydratedRef.current = true;
          setLoading((current) => ({ ...current, preferences: false }));
        }
      }
    }

    loadStoredFavorites();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!favoritesHydratedRef.current) {
      return undefined;
    }

    const serialized = JSON.stringify(uniqueSymbols(favorites, MAX_FAVORITES));
    if (serialized === lastSavedFavoritesRef.current) {
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading((current) => ({ ...current, preferences: true }));
      try {
        const payload = await requestJson('/api/market/preferences', {
          method: 'PUT',
          body: JSON.stringify({ favorites: uniqueSymbols(favorites, MAX_FAVORITES) }),
        });
        if (cancelled) return;
        const normalizedFavorites = uniqueSymbols(payload?.favorites, MAX_FAVORITES);
        lastSavedFavoritesRef.current = JSON.stringify(normalizedFavorites);
        setFavorites(normalizedFavorites);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || 'Falha ao salvar favoritos de mercado.');
        }
      } finally {
        if (!cancelled) {
          setLoading((current) => ({ ...current, preferences: false }));
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [favorites]);

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
          const filtered = uniqueSymbols(current.filter((symbol) => availableSymbols.has(symbol)), MAX_SELECTED);
          if (filtered.length) return filtered;
          const seeded = nextItems.slice(0, 4).map((item) => item.symbol);
          return uniqueSymbols(seeded, MAX_SELECTED);
        });
        setFavorites((current) => uniqueSymbols(current.filter((symbol) => availableSymbols.has(symbol)), MAX_FAVORITES));
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

  function toggleFavorite(symbol) {
    setFavorites((current) =>
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : uniqueSymbols([symbol, ...current], MAX_FAVORITES),
    );
  }

  function toggleSelectedSymbol(symbol) {
    setSelectedSymbols((current) => {
      if (current.includes(symbol)) {
        return current.filter((item) => item !== symbol);
      }

      if (current.length >= MAX_SELECTED) {
        return current;
      }

      return [...current, symbol];
    });
  }

  function applyPreset(preset) {
    setQuoteAsset(preset.quoteAsset || DEFAULT_QUOTE);
    setInterval(preset.interval || DEFAULT_INTERVAL);
    setSelectedSymbols(uniqueSymbols(preset.selectedSymbols, MAX_SELECTED));
    setFavorites(uniqueSymbols(preset.favorites, MAX_FAVORITES));
  }

  function saveCurrentPreset() {
    const name = window.prompt('Nome do preset de mercado:', `Mercado ${quoteAsset} ${interval}`);
    if (!name) return;
    setPresets((current) => [
      buildPresetPayload(name, { quoteAsset, interval, selectedSymbols, favorites }),
      ...current,
    ].slice(0, 8));
  }

  function removePreset(presetId) {
    setPresets((current) => current.filter((item) => item.id !== presetId));
  }

  function openFilteredPage(page, symbol) {
    goToPage(page, {
      symbol,
      origin: 'mercado',
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <div className="page-stack mercado-page-v2">
      <Section
        title="Radar de mercado"
        subtitle="Selecione a base de conversão, monte a lista de moedas com filtro interno e acompanhe os cards com mini gráfico e atalhos contextuais."
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

          <div className="market-toolbar__badges">
            <Pill tone={loading.universe ? 'warning' : 'info'}>
              {loading.universe ? 'Atualizando universo…' : `Pares ${quoteAsset}: ${symbols.length}`}
            </Pill>
            <Pill tone={loading.cards ? 'warning' : 'success'}>
              {loading.cards ? 'Atualizando cards…' : `Selecionados: ${selectedSymbols.length}`}
            </Pill>
            <Pill tone={loading.preferences ? 'warning' : 'success'}>
              {loading.preferences ? 'Salvando favoritos…' : 'Favoritos sincronizados'}
            </Pill>
          </div>
        </div>

        <div className="market-select-grid">
          <div className="market-select-card">
            <div className="market-selector-toolbar">
              <div>
                <span>Pares disponíveis na Binance</span>
                <small>Selecione até {MAX_SELECTED} pares para acompanhar.</small>
              </div>
              <input
                className="market-selector-search"
                value={symbolSearch}
                onChange={(event) => setSymbolSearch(event.target.value)}
                placeholder={`Filtrar pares ${quoteAsset}`}
              />
            </div>

            <div className="market-selector-list" role="listbox" aria-multiselectable="true" aria-label="Pares disponíveis na Binance">
              {filteredSymbols.length ? (
                filteredSymbols.map((item) => {
                  const isSelected = selectedSymbols.includes(item.symbol);
                  return (
                    <label
                      key={item.symbol}
                      className={`market-selector-option ${isSelected ? 'is-selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectedSymbol(item.symbol)}
                        disabled={!isSelected && selectedSymbols.length >= MAX_SELECTED}
                      />
                      <span className="market-selector-option__main">
                        <strong>{item.symbol}</strong>
                        <small>{item.baseAsset || item.symbol.replace(quoteAsset, '')}</small>
                      </span>
                      {favorites.includes(item.symbol) ? (
                        <span className="market-selector-option__meta">★ favorito</span>
                      ) : null}
                    </label>
                  );
                })
              ) : (
                <div className="empty-state compact">Nenhum par encontrado para o filtro informado.</div>
              )}
            </div>
            <small>
              {selectedSymbols.length === MAX_SELECTED
                ? 'Limite de pares atingido. Desmarque um item para adicionar outro.'
                : `Base ativa: ${quoteAsset}.`}
            </small>
          </div>

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
                      onClick={() => setSelectedSymbols((current) => uniqueSymbols([symbol, ...current], MAX_SELECTED))}
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="empty-note">Marque estrelas nos cards para manter uma watchlist rápida e persistida no banco.</p>
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
        title="Cards de mercado"
        subtitle="Os cards abaixo mostram preço, variação 24h, volume, mini gráfico e atalhos com filtro direto para outras telas do painel."
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
                    <span className={signedClassName(item.changePct)}>
                      Momentum: {item.positive ? 'positivo' : 'negativo'}
                    </span>
                    <span>Trades: {formatNumber(ticker.tradeCount || 0, 0)}</span>
                  </div>

                  <div className="market-card__actions">
                    <button type="button" className="button button--ghost button--small" onClick={() => openFilteredPage('operacoes', item.symbol)}>
                      Operações
                    </button>
                    <button type="button" className="button button--ghost button--small" onClick={() => openFilteredPage('execucao', item.symbol)}>
                      Execução
                    </button>
                    <button type="button" className="button button--ghost button--small" onClick={() => openFilteredPage('social', item.symbol)}>
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
