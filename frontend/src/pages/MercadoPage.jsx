
import { useEffect, useMemo, useRef, useState } from 'react';
import Section from '../components/Section';
import Pill from '../components/Pill';
import SparklineChart from '../components/SparklineChart';
import OperacoesPage from './OperacoesPage';
import ExecucaoPage from './ExecucaoPage';
import SocialPage from './SocialPage';
import { getApiBaseUrl } from '../lib/api';
import { formatMoney, formatNumber, formatPercent } from '../lib/format';

const STORAGE_KEY = 'criptoia.mercado.v4';
const DEFAULT_QUOTE = 'USDT';
const DEFAULT_INTERVAL = '5m';

const INTERVAL_OPTIONS = [
  { value: '1m', label: '1 minuto', apiInterval: '1m', limit: 48 },
  { value: '5m', label: '5 minutos', apiInterval: '5m', limit: 48 },
  { value: '15m', label: '15 minutos', apiInterval: '15m', limit: 48 },
  { value: '1h', label: '1 hora', apiInterval: '1h', limit: 48 },
  { value: '4h', label: '4 horas', apiInterval: '4h', limit: 48 },
  { value: '1d', label: '1 dia', apiInterval: '1d', limit: 48 },
  { value: '1w', label: '1 semana', apiInterval: '1w', limit: 48 },
  { value: '1M', label: '1 mês', apiInterval: '1M', limit: 48 },
  { value: '1y', label: '1 ano', apiInterval: '1w', limit: 52 },
  { value: 'all', label: 'Todo período', apiInterval: '1M', limit: 120 },
];

const QUOTE_OPTIONS = ['USDT', 'BRL', 'BTC', 'ETH', 'BNB'];

const MODAL_COMPONENTS = {
  operacoes: OperacoesPage,
  execucao: ExecucaoPage,
  social: SocialPage,
};

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function uniqueSymbols(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .map((item) => String(item || '').trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

function loadStoredState() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

function persistState(nextState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch (_error) {
    // ignore local storage failures
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

function cloneConfig(value) {
  try {
    return JSON.parse(JSON.stringify(value || {}));
  } catch (_error) {
    return {};
  }
}

function buildModalTitle(page, symbol) {
  if (page === 'operacoes') return `Operações · ${symbol}`;
  if (page === 'execucao') return `Execução · ${symbol}`;
  if (page === 'social') return `Social · ${symbol}`;
  return symbol;
}

function getIntervalConfig(intervalValue) {
  return (
    INTERVAL_OPTIONS.find((item) => item.value === intervalValue) ||
    INTERVAL_OPTIONS.find((item) => item.value === DEFAULT_INTERVAL) ||
    INTERVAL_OPTIONS[0]
  );
}

function readCloseValues(candles = []) {
  return safeArray(candles)
    .map((item) => safeNumber(item?.close ?? item?.[4], Number.NaN))
    .filter((value) => Number.isFinite(value));
}

function readHighValues(candles = []) {
  return safeArray(candles)
    .map((item) => safeNumber(item?.high ?? item?.[2], Number.NaN))
    .filter((value) => Number.isFinite(value));
}

function readLowValues(candles = []) {
  return safeArray(candles)
    .map((item) => safeNumber(item?.low ?? item?.[3], Number.NaN))
    .filter((value) => Number.isFinite(value));
}

function readQuoteVolume(candle) {
  return safeNumber(
    candle?.quoteVolume ??
      candle?.quote_asset_volume ??
      candle?.quoteAssetVolume ??
      candle?.[7] ??
      candle?.volume ??
      candle?.[5],
  );
}

function sumQuoteVolumes(candles = []) {
  return safeArray(candles).reduce((total, candle) => total + readQuoteVolume(candle), 0);
}

function inferQuoteCurrency(symbol, fallback) {
  if (symbol.endsWith('USDT')) return 'USDT';
  if (symbol.endsWith('BRL')) return 'BRL';
  if (symbol.endsWith('BTC')) return 'BTC';
  if (symbol.endsWith('ETH')) return 'ETH';
  if (symbol.endsWith('BNB')) return 'BNB';
  return fallback;
}

export default function MercadoPage({ ctx = {} }) {
  const stored = loadStoredState();

  const [quoteAsset, setQuoteAsset] = useState(stored?.quoteAsset || DEFAULT_QUOTE);
  const [interval, setInterval] = useState(stored?.interval || DEFAULT_INTERVAL);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [selectedSymbols, setSelectedSymbols] = useState(uniqueSymbols(stored?.selectedSymbols));
  const [favorites, setFavorites] = useState(uniqueSymbols(stored?.favorites));
  const [presets, setPresets] = useState(safeArray(stored?.presets));
  const [symbols, setSymbols] = useState([]);
  const [tickersBySymbol, setTickersBySymbol] = useState({});
  const [candlesBySymbol, setCandlesBySymbol] = useState({});
  const [loading, setLoading] = useState({
    universe: false,
    cards: false,
    preferences: false,
  });
  const [error, setError] = useState('');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [modalState, setModalState] = useState(null);

  const favoritesHydratedRef = useRef(false);
  const lastPersistedFavoritesRef = useRef(JSON.stringify(uniqueSymbols(stored?.favorites)));

  const baseCurrency = ctx.baseCurrency || 'USDT';
  const intervalConfig = useMemo(() => getIntervalConfig(interval), [interval]);

  const configSymbols = useMemo(
    () => uniqueSymbols(ctx?.draftConfig?.trading?.symbols),
    [ctx?.draftConfig?.trading?.symbols],
  );

  useEffect(() => {
    persistState({
      quoteAsset,
      interval,
      selectedSymbols,
      favorites,
      presets,
    });
  }, [favorites, interval, presets, quoteAsset, selectedSymbols]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFavorites() {
      setLoading((current) => ({ ...current, preferences: true }));

      try {
        const payload = await requestJson('/api/market/preferences');
        if (cancelled) return;

        const backendFavorites = uniqueSymbols(payload?.favorites);
        const mergedFavorites = uniqueSymbols([...backendFavorites, ...configSymbols, ...favorites]);

        lastPersistedFavoritesRef.current = JSON.stringify(backendFavorites);
        setFavorites(mergedFavorites);
        setSelectedSymbols((current) => uniqueSymbols([...mergedFavorites, ...current]));
      } catch (_error) {
        if (!cancelled) {
          const mergedFavorites = uniqueSymbols([...configSymbols, ...favorites]);
          setFavorites(mergedFavorites);
          setSelectedSymbols((current) => uniqueSymbols([...mergedFavorites, ...current]));
        }
      } finally {
        if (!cancelled) {
          favoritesHydratedRef.current = true;
          setLoading((current) => ({ ...current, preferences: false }));
        }
      }
    }

    hydrateFavorites();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!favoritesHydratedRef.current || !configSymbols.length) return;
    setFavorites((current) => uniqueSymbols([...configSymbols, ...current]));
  }, [configSymbols]);

  useEffect(() => {
    if (!favoritesHydratedRef.current) return undefined;

    const normalizedFavorites = uniqueSymbols(favorites);
    const serializedFavorites = JSON.stringify(normalizedFavorites);
    const serializedConfigSymbols = JSON.stringify(uniqueSymbols(configSymbols));

    if (
      serializedFavorites === lastPersistedFavoritesRef.current &&
      serializedFavorites === serializedConfigSymbols
    ) {
      return undefined;
    }

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      setLoading((current) => ({ ...current, preferences: true }));

      try {
        await requestJson('/api/market/preferences', {
          method: 'PUT',
          body: JSON.stringify({ favorites: normalizedFavorites }),
        });

        const configPayload = await requestJson('/api/config');
        const currentConfig = cloneConfig(configPayload?.config || configPayload || {});
        currentConfig.trading = currentConfig.trading || {};
        currentConfig.trading.symbols = normalizedFavorites;

        await requestJson('/api/config', {
          method: 'PUT',
          body: JSON.stringify(currentConfig),
        });

        lastPersistedFavoritesRef.current = serializedFavorites;
        ctx.handleSymbolsChange?.(normalizedFavorites.join(', '));
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || 'Falha ao sincronizar favoritos com Símbolos.');
        }
      } finally {
        if (!cancelled) {
          setLoading((current) => ({ ...current, preferences: false }));
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [configSymbols, ctx, favorites]);

  useEffect(() => {
    let cancelled = false;

    async function loadUniverse() {
      setLoading((current) => ({ ...current, universe: true }));
      setError('');

      try {
        const payload = await requestJson(
          `/api/market/symbols?quoteAsset=${encodeURIComponent(quoteAsset)}`,
        );
        if (cancelled) return;

        const nextItems = safeArray(payload.items);
        const availableSymbols = new Set(nextItems.map((item) => item.symbol));

        setSymbols(nextItems);
        setSelectedSymbols((current) =>
          uniqueSymbols(current.filter((symbol) => availableSymbols.has(symbol))),
        );
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

  const cardSymbols = useMemo(
    () => uniqueSymbols([...favorites, ...selectedSymbols]),
    [favorites, selectedSymbols],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCards() {
      if (!cardSymbols.length) {
        setTickersBySymbol({});
        setCandlesBySymbol({});
        return;
      }

      setLoading((current) => ({ ...current, cards: true }));
      setError('');

      try {
        const tickerPayload = await requestJson(
          `/api/market/tickers?symbols=${encodeURIComponent(cardSymbols.join(','))}`,
        );

        const candlePayloads = await Promise.all(
          cardSymbols.map(async (symbol) => {
            const payload = await requestJson(
              `/api/market/candles/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(
                intervalConfig.apiInterval,
              )}&limit=${intervalConfig.limit}`,
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
  }, [cardSymbols, intervalConfig.apiInterval, intervalConfig.limit]);

  const filteredSymbols = useMemo(() => {
    const term = symbolSearch.trim().toUpperCase();
    if (!term) return symbols;

    return symbols.filter(
      (item) =>
        item.symbol.includes(term) ||
        String(item.baseAsset || '').toUpperCase().includes(term),
    );
  }, [symbolSearch, symbols]);

  const selectedRows = useMemo(
    () =>
      cardSymbols.map((symbol) => {
        const ticker = tickersBySymbol[symbol] || null;
        const candles = safeArray(candlesBySymbol[symbol]);
        const values = readCloseValues(candles);
        const highValues = readHighValues(candles);
        const lowValues = readLowValues(candles);
        const firstValue = values[0];
        const lastValue = values[values.length - 1];
        const maxValue = highValues.length ? Math.max(...highValues) : lastValue;
        const minValue = lowValues.length ? Math.min(...lowValues) : lastValue;
        const price = safeNumber(ticker?.price || lastValue);
        const computedChangePct =
          Number.isFinite(firstValue) && firstValue > 0 && Number.isFinite(lastValue)
            ? ((lastValue - firstValue) / firstValue) * 100
            : safeNumber(ticker?.priceChangePercent, 0);
        const maxVariationPct =
          Number.isFinite(firstValue) && firstValue > 0 && Number.isFinite(maxValue)
            ? ((maxValue - firstValue) / firstValue) * 100
            : computedChangePct;
        const minVariationPct =
          Number.isFinite(firstValue) && firstValue > 0 && Number.isFinite(minValue)
            ? ((minValue - firstValue) / firstValue) * 100
            : computedChangePct;
        const volume = sumQuoteVolumes(candles);

        return {
          symbol,
          ticker,
          values,
          price,
          maxPrice: Number.isFinite(maxValue) ? maxValue : price,
          minPrice: Number.isFinite(minValue) ? minValue : price,
          changePct: computedChangePct,
          maxVariationPct,
          minVariationPct,
          volume,
          positive: computedChangePct >= 0,
          isFavorite: favorites.includes(symbol),
          quoteCurrency: inferQuoteCurrency(symbol, quoteAsset || baseCurrency),
        };
      }),
    [baseCurrency, candlesBySymbol, cardSymbols, favorites, quoteAsset, tickersBySymbol],
  );

  const modalCtx = useMemo(() => {
    if (!modalState) return null;

    const localFilters = {
      ...(ctx.pageFilters || {}),
      [modalState.page]: {
        symbol: modalState.symbol,
        origin: 'mercado-modal',
        createdAt: new Date().toISOString(),
      },
    };

    return {
      ...ctx,
      pageFilters: localFilters,
      clearPageFilter: (page) => {
        if (page === modalState.page) {
          setModalState(null);
          return;
        }
        ctx.clearPageFilter?.(page);
      },
    };
  }, [ctx, modalState]);

  const ModalPage = modalState ? MODAL_COMPONENTS[modalState.page] : null;

  function toggleFavorite(symbol) {
    const isFavorite = favorites.includes(symbol);

    if (isFavorite) {
      setFavorites((current) => current.filter((item) => item !== symbol));
      setSelectedSymbols((current) => uniqueSymbols([symbol, ...current]));
      return;
    }

    setFavorites((current) => uniqueSymbols([symbol, ...current]));
  }

  function toggleSelectedSymbol(symbol) {
    setSelectedSymbols((current) =>
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : uniqueSymbols([symbol, ...current]),
    );
  }

  function applyPreset(preset) {
    setQuoteAsset(preset.quoteAsset || DEFAULT_QUOTE);
    setInterval(preset.interval || DEFAULT_INTERVAL);
    setSelectedSymbols(uniqueSymbols(preset.selectedSymbols));
    setFavorites(uniqueSymbols(preset.favorites));
  }

  function saveCurrentPreset() {
    const name = window.prompt('Nome do preset de mercado:', `Mercado ${quoteAsset} ${interval}`);
    if (!name) return;

    setPresets((current) =>
      [
        buildPresetPayload(name, {
          quoteAsset,
          interval,
          selectedSymbols,
          favorites,
        }),
        ...current,
      ].slice(0, 8),
    );
  }

  function removePreset(presetId) {
    setPresets((current) => current.filter((item) => item.id !== presetId));
  }

  function openModal(page, symbol) {
    setModalState({ page, symbol });
  }

  return (
    <>
      <Section
        title="Mercado"
        subtitle="Acompanhe pares da Binance, salve favoritos e abra telas filtradas sem sair do mercado."
      >
        <div className="market-toolbar">
          <label className="field">
            <span className="field__label">Base de conversão</span>
            <select value={quoteAsset} onChange={(event) => setQuoteAsset(event.target.value)}>
              {QUOTE_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Intervalo do mini gráfico</span>
            <select value={interval} onChange={(event) => setInterval(event.target.value)}>
              {INTERVAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Filtrar lista de pares</span>
            <input
              value={symbolSearch}
              onChange={(event) => setSymbolSearch(event.target.value)}
              placeholder={`Ex.: BTC${quoteAsset}`}
            />
          </label>
        </div>

        <div className="tag-list" style={{ marginBottom: 16 }}>
          <Pill tone="neutral">{`Pares ${quoteAsset}: ${symbols.length}`}</Pill>
          <Pill tone="neutral">{`Selecionados: ${selectedSymbols.length}`}</Pill>
          <Pill tone="neutral">{`Favoritos: ${favorites.length}`}</Pill>
          {loading.preferences ? <Pill tone="info">Sincronizando favoritos…</Pill> : null}
          {loading.cards ? <Pill tone="info">Atualizando cards…</Pill> : null}
        </div>

        <div className="button-row" style={{ marginBottom: 16 }}>
          <button
            className="button button--ghost"
            type="button"
            onClick={() => setSelectorOpen((current) => !current)}
          >
            Pares disponíveis na Binance
          </button>
          <button className="button button--ghost" type="button" onClick={saveCurrentPreset}>
            Salvar preset
          </button>
        </div>

        {selectorOpen ? (
          <div className="market-card market-select-card" style={{ marginBottom: 20 }}>
            {filteredSymbols.length ? (
              <div className="market-selector-list">
                {filteredSymbols.map((item) => {
                  const checked = selectedSymbols.includes(item.symbol);
                  const isFavorite = favorites.includes(item.symbol);

                  return (
                    <label
                      key={item.symbol}
                      className={`market-selector-option ${checked ? 'is-selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelectedSymbol(item.symbol)}
                      />
                      <div className="market-selector-option__main">
                        <strong>{item.symbol}</strong>
                        <small>{item.baseAsset || item.symbol.replace(quoteAsset, '')}</small>
                      </div>
                      <div className="market-selector-option__meta">
                        {isFavorite ? 'Favorito' : checked ? 'Selecionado' : 'Disponível'}
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="callout callout--warning">
                Nenhum par encontrado para o filtro informado.
              </div>
            )}
          </div>
        ) : null}

        <div className="market-card" style={{ marginBottom: 16 }}>
          <div className="market-card__header">
            <div>
              <h3 className="market-card__title">Favoritos</h3>
            </div>
          </div>
          {favorites.length ? (
            <div className="tag-list">
              {favorites.map((symbol) => (
                <button
                  key={symbol}
                  className="chip-button"
                  type="button"
                  onClick={() =>
                    setSelectedSymbols((current) => uniqueSymbols([symbol, ...current]))
                  }
                >
                  {symbol}
                </button>
              ))}
            </div>
          ) : (
            <div className="callout callout--info">
              Marque a estrela amarela nos cards para sincronizar Favoritos e Símbolos.
            </div>
          )}
        </div>

        <div className="market-card" style={{ marginBottom: 16 }}>
          <div className="market-card__header">
            <div>
              <h3 className="market-card__title">Presets rápidos</h3>
            </div>
          </div>
          {presets.length ? (
            <div className="list-stack">
              {presets.map((preset) => (
                <article key={preset.id} className="list-item">
                  <div>
                    <strong>{preset.name}</strong>
                    <div className="muted">
                      {preset.quoteAsset} · {preset.interval} ·{' '}
                      {uniqueSymbols(preset.selectedSymbols).length} pares
                    </div>
                  </div>
                  <div className="button-row">
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => applyPreset(preset)}
                    >
                      Aplicar
                    </button>
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => removePreset(preset.id)}
                    >
                      Remover
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="callout callout--info">
              Salve presets para alternar entre listas de acompanhamento sem perder os favoritos.
            </div>
          )}
        </div>

        {error ? <div className="callout callout--danger">{error}</div> : null}

        {selectedRows.length ? (
          <div className="grid two-columns market-card-grid">
            {selectedRows.map((item) => (
              <article key={item.symbol} className="market-card">
                <div className="market-card__header">
                  <div>
                    <h3 className="market-card__title">{item.symbol}</h3>
                    <div className="tag-list" style={{ marginTop: 8 }}>
                      <Pill tone={item.positive ? 'success' : 'danger'}>
                        {item.positive ? 'Alta' : 'Baixa'}
                      </Pill>
                      {item.isFavorite ? <Pill tone="warning">Favorito</Pill> : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-label={
                      item.isFavorite
                        ? `Remover ${item.symbol} dos favoritos`
                        : `Adicionar ${item.symbol} aos favoritos`
                    }
                    onClick={() => toggleFavorite(item.symbol)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: 22,
                      lineHeight: 1,
                      cursor: 'pointer',
                      color: item.isFavorite ? '#facc15' : '#ffffff',
                    }}
                  >
                    ★
                  </button>
                </div>

                <div className="market-mini-stats market-mini-stats--six" style={{ marginBottom: 16 }}>
                  <div className="market-mini-stat-card market-mini-stat-card--compact">
                    <span className="market-mini-stat-card__label">Preço atual</span>
                    <strong className="market-mini-stat-card__value">
                      {formatMoney(item.price, item.quoteCurrency || quoteAsset || baseCurrency)}
                    </strong>
                  </div>

                  <div className="market-mini-stat-card market-mini-stat-card--compact">
                    <span className="market-mini-stat-card__label">Preço máximo</span>
                    <strong className="market-mini-stat-card__value">
                      {formatMoney(item.maxPrice, item.quoteCurrency || quoteAsset || baseCurrency)}
                    </strong>
                  </div>

                  <div className="market-mini-stat-card market-mini-stat-card--compact">
                    <span className="market-mini-stat-card__label">Preço mínimo</span>
                    <strong className="market-mini-stat-card__value">
                      {formatMoney(item.minPrice, item.quoteCurrency || quoteAsset || baseCurrency)}
                    </strong>
                  </div>

                  <div className="market-mini-stat-card market-mini-stat-card--compact">
                    <span className="market-mini-stat-card__label">Variação no período</span>
                    <strong
                      className={`market-mini-stat-card__value ${
                        item.positive ? 'text-positive' : 'text-negative'
                      }`}
                    >
                      {item.positive ? '+' : ''}
                      {formatPercent(item.changePct, 2)}
                    </strong>
                  </div>

                  <div className="market-mini-stat-card market-mini-stat-card--compact">
                    <span className="market-mini-stat-card__label">Variação máxima</span>
                    <strong
                      className={`market-mini-stat-card__value ${
                        item.maxVariationPct >= 0 ? 'text-positive' : 'text-negative'
                      }`}
                    >
                      {item.maxVariationPct >= 0 ? '+' : ''}
                      {formatPercent(item.maxVariationPct, 2)}
                    </strong>
                  </div>

                  <div className="market-mini-stat-card market-mini-stat-card--compact">
                    <span className="market-mini-stat-card__label">Variação mínima</span>
                    <strong
                      className={`market-mini-stat-card__value ${
                        item.minVariationPct >= 0 ? 'text-positive' : 'text-negative'
                      }`}
                    >
                      {item.minVariationPct >= 0 ? '+' : ''}
                      {formatPercent(item.minVariationPct, 2)}
                    </strong>
                  </div>
                </div>

                <div className="sparkline">
                  <SparklineChart values={item.values} />
                </div>

                <div className="button-row" style={{ marginTop: 16 }}>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => openModal('operacoes', item.symbol)}
                  >
                    Operações
                  </button>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => openModal('execucao', item.symbol)}
                  >
                    Execução
                  </button>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => openModal('social', item.symbol)}
                  >
                    Social
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="callout callout--info">
            Selecione pares ou favorite moedas para preencher os cards.
          </div>
        )}
      </Section>

      {ModalPage && modalCtx ? (
        <div className="modal-backdrop" onClick={() => setModalState(null)}>
          <div className="modal-shell modal-shell--xl" onClick={(event) => event.stopPropagation()}>
            <div className="modal-shell__header">
              <div>
                <h3>{buildModalTitle(modalState.page, modalState.symbol)}</h3>
                <div className="muted">
                  Visualização filtrada por moeda sem sair da página Mercado.
                </div>
              </div>
              <button className="button button--ghost" type="button" onClick={() => setModalState(null)}>
                Fechar
              </button>
            </div>
            <div className="modal-shell__body">
              <ModalPage ctx={modalCtx} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
