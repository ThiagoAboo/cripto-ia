import { useEffect, useMemo, useRef, useState } from 'react';
import Section from '../components/Section';
import Pill from '../components/Pill';
import SparklineChart from '../components/SparklineChart';
import OperacoesPage from './OperacoesPage';
import ExecucaoPage from './ExecucaoPage';
import SocialPage from './SocialPage';
import { getApiBaseUrl } from '../lib/api';
import { formatMoney, formatNumber, formatPercent } from '../lib/format';

const STORAGE_KEY = 'criptoia.mercado.v5';
const DEFAULT_QUOTE = 'USDT';
const DEFAULT_CHART_RANGE = '1d';
const CHART_RANGE_OPTIONS = [
  { value: '1d', label: '1 dia', apiInterval: '1h', limit: 24 },
  { value: '1w', label: '1 semana', apiInterval: '4h', limit: 42 },
  { value: '1mo', label: '1 mês', apiInterval: '1d', limit: 30 },
  { value: '1y', label: '1 ano', apiInterval: '1d', limit: 365 },
  { value: 'all', label: 'Todo período', apiInterval: '1M', limit: 240 },
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
    chartRange: state.chartRange,
    selectedSymbols: state.selectedSymbols,
    favorites: state.favorites,
    createdAt: new Date().toISOString(),
  };
}

function readChartValues(candles = []) {
  return safeArray(candles)
    .map((item) => safeNumber(item.close ?? item[4], Number.NaN))
    .filter((value) => Number.isFinite(value));
}

function normalizeChartRange(value) {
  const normalized = String(value || '').trim();
  if (CHART_RANGE_OPTIONS.some((option) => option.value === normalized)) {
    return normalized;
  }

  if (['1m', '5m', '15m', '1h', '4h'].includes(normalized)) {
    return DEFAULT_CHART_RANGE;
  }

  return DEFAULT_CHART_RANGE;
}

function getChartRangeOption(value) {
  return (
    CHART_RANGE_OPTIONS.find((option) => option.value === normalizeChartRange(value)) ||
    CHART_RANGE_OPTIONS[0]
  );
}

function computePeriodMetrics(candles = [], ticker = null) {
  const normalizedCandles = safeArray(candles);
  const closes = normalizedCandles
    .map((item) => safeNumber(item.close ?? item[4], Number.NaN))
    .filter((value) => Number.isFinite(value));

  const firstClose = closes[0];
  const lastClose = closes[closes.length - 1];
  const fallbackChangePct = safeNumber(ticker?.priceChangePercent);

  const changePct =
    Number.isFinite(firstClose) &&
    Number.isFinite(lastClose) &&
    Math.abs(firstClose) > Number.EPSILON
      ? ((lastClose - firstClose) / firstClose) * 100
      : fallbackChangePct;

  const volume = normalizedCandles.reduce(
    (total, candle) => total + safeNumber(candle.quoteVolume ?? candle[7]),
    0,
  );

  return {
    changePct,
    volume,
    positive: changePct >= 0,
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

export default function MercadoPage({ ctx = {} }) {
  const stored = loadStoredState();
  const [quoteAsset, setQuoteAsset] = useState(stored?.quoteAsset || DEFAULT_QUOTE);
  const [chartRange, setChartRange] = useState(normalizeChartRange(stored?.chartRange || stored?.interval));
  const [symbolSearch, setSymbolSearch] = useState('');
  const [selectedSymbols, setSelectedSymbols] = useState(uniqueSymbols(stored?.selectedSymbols));
  const [favorites, setFavorites] = useState(uniqueSymbols(stored?.favorites));
  const [presets, setPresets] = useState(safeArray(stored?.presets));
  const [symbols, setSymbols] = useState([]);
  const [tickersBySymbol, setTickersBySymbol] = useState({});
  const [candlesBySymbol, setCandlesBySymbol] = useState({});
  const [loading, setLoading] = useState({ universe: false, cards: false, preferences: false });
  const [error, setError] = useState('');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [modalState, setModalState] = useState(null);

  const favoritesHydratedRef = useRef(false);
  const lastPersistedFavoritesRef = useRef(JSON.stringify(uniqueSymbols(stored?.favorites)));

  const baseCurrency = ctx.baseCurrency || 'USDT';
  const configSymbols = useMemo(
    () => uniqueSymbols(ctx?.draftConfig?.trading?.symbols),
    [ctx?.draftConfig?.trading?.symbols],
  );

  useEffect(() => {
    persistState({
      quoteAsset,
      chartRange,
      selectedSymbols,
      favorites,
      presets,
    });
  }, [chartRange, favorites, presets, quoteAsset, selectedSymbols]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFavorites() {
      setLoading((current) => ({ ...current, preferences: true }));
      try {
        const payload = await requestJson('/api/market/preferences');
        if (cancelled) return;
        const backendFavorites = uniqueSymbols(payload?.favorites);
        const merged = uniqueSymbols([...backendFavorites, ...configSymbols, ...favorites]);
        lastPersistedFavoritesRef.current = JSON.stringify(backendFavorites);
        setFavorites(merged);
        setSelectedSymbols((current) => uniqueSymbols([...merged, ...current]));
      } catch (_error) {
        if (!cancelled) {
          const merged = uniqueSymbols([...configSymbols, ...favorites]);
          setFavorites(merged);
          setSelectedSymbols((current) => uniqueSymbols([...merged, ...current]));
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
        setSelectedSymbols((current) => {
          const kept = uniqueSymbols(current.filter((symbol) => availableSymbols.has(symbol)));
          return kept;
        });
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
  }, [configSymbols, favorites, quoteAsset]);

  const cardSymbols = useMemo(
    () => uniqueSymbols([...favorites, ...selectedSymbols]),
    [favorites, selectedSymbols],
  );

  const activeRange = useMemo(() => getChartRangeOption(chartRange), [chartRange]);

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
              `/api/market/candles/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(activeRange.apiInterval)}&limit=${activeRange.limit}`,
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
  }, [activeRange.apiInterval, activeRange.limit, cardSymbols]);

  const filteredSymbols = useMemo(() => {
    const term = symbolSearch.trim().toUpperCase();
    if (!term) return symbols;
    return symbols.filter(
      (item) =>
        item.symbol.includes(term) || String(item.baseAsset || '').toUpperCase().includes(term),
    );
  }, [symbolSearch, symbols]);

  const selectedRows = useMemo(
    () =>
      cardSymbols.map((symbol) => {
        const ticker = tickersBySymbol[symbol] || null;
        const candles = safeArray(candlesBySymbol[symbol]);
        const values = readChartValues(candles);
        const price = safeNumber(ticker?.price || values[values.length - 1]);
        const metrics = computePeriodMetrics(candles, ticker);
        return {
          symbol,
          ticker,
          values,
          price,
          changePct: metrics.changePct,
          rangeVolume: metrics.volume,
          positive: metrics.positive,
          isFavorite: favorites.includes(symbol),
          quoteCurrency: symbol.endsWith('USDT')
            ? 'USDT'
            : symbol.endsWith('BRL')
              ? 'BRL'
              : symbol.endsWith('BTC')
                ? 'BTC'
                : symbol.endsWith('ETH')
                  ? 'ETH'
                  : symbol.endsWith('BNB')
                    ? 'BNB'
                    : quoteAsset || baseCurrency,
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
    setFavorites((current) =>
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : uniqueSymbols([symbol, ...current]),
    );
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
    setChartRange(normalizeChartRange(preset.chartRange || preset.interval));
    setSelectedSymbols(uniqueSymbols(preset.selectedSymbols));
    setFavorites(uniqueSymbols(preset.favorites));
  }

  function saveCurrentPreset() {
    const name = window.prompt('Nome do preset de mercado:', `Mercado ${quoteAsset} ${activeRange.label}`);
    if (!name) return;
    setPresets((current) =>
      [
        buildPresetPayload(name, { quoteAsset, chartRange, selectedSymbols, favorites }),
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
        description="Acompanhe pares, mantenha favoritos sincronizados com Símbolos e abra análises filtradas sem sair desta tela. Variação e volume acompanham o intervalo selecionado."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              alignItems: 'end',
            }}
          >
            <label>
              <div style={{ marginBottom: 6, fontWeight: 600 }}>Base de conversão</div>
              <select value={quoteAsset} onChange={(event) => setQuoteAsset(event.target.value)}>
                {QUOTE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div style={{ marginBottom: 6, fontWeight: 600 }}>Intervalo do mini gráfico</div>
              <select value={chartRange} onChange={(event) => setChartRange(event.target.value)}>
                {CHART_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div style={{ marginBottom: 6, fontWeight: 600 }}>Filtrar lista de pares</div>
              <input
                value={symbolSearch}
                onChange={(event) => setSymbolSearch(event.target.value)}
                placeholder={`Ex.: BTC${quoteAsset}`}
              />
            </label>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Pill tone="info">{`Pares ${quoteAsset}: ${symbols.length}`}</Pill>
            <Pill tone="neutral">{`Selecionados: ${selectedSymbols.length}`}</Pill>
            <Pill tone="warning">{`Favoritos: ${favorites.length}`}</Pill>
            {loading.preferences ? <Pill tone="info">Sincronizando favoritos…</Pill> : null}
            {loading.cards ? <Pill tone="info">Atualizando cards…</Pill> : null}
          </div>

          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="button" onClick={() => setSelectorOpen((current) => !current)}>
                Pares disponíveis na Binance
              </button>
              <button type="button" className="button button--ghost" onClick={saveCurrentPreset}>
                Salvar preset
              </button>
            </div>

            {selectorOpen ? (
              <div
                style={{
                  marginTop: 12,
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'rgba(15, 23, 42, 0.94)',
                  maxHeight: 360,
                  overflow: 'auto',
                }}
              >
                <div style={{ display: 'grid', gap: 10 }}>
                  {filteredSymbols.length ? (
                    filteredSymbols.map((item) => {
                      const checked = selectedSymbols.includes(item.symbol);
                      return (
                        <label
                          key={item.symbol}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: '8px 10px',
                            borderRadius: 12,
                            background: checked ? 'rgba(59, 130, 246, 0.14)' : 'rgba(15, 23, 42, 0.35)',
                          }}
                        >
                          <span style={{ display: 'grid', gap: 2 }}>
                            <strong>{item.symbol}</strong>
                            <span style={{ opacity: 0.72, fontSize: 13 }}>
                              {item.baseAsset || item.symbol.replace(quoteAsset, '')}
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelectedSymbol(item.symbol)}
                          />
                        </label>
                      );
                    })
                  ) : (
                    <div style={{ opacity: 0.75 }}>Nenhum par encontrado para o filtro informado.</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <div style={{ marginBottom: 8, fontWeight: 700 }}>Favoritos</div>
              {favorites.length ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {favorites.map((symbol) => (
                    <button
                      key={symbol}
                      type="button"
                      className="button button--ghost"
                      onClick={() => setSelectedSymbols((current) => uniqueSymbols([symbol, ...current]))}
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ opacity: 0.75 }}>
                  Marque a estrela amarela nos cards para sincronizar Favoritos e Símbolos.
                </div>
              )}
            </div>

            <div>
              <div style={{ marginBottom: 8, fontWeight: 700 }}>Presets rápidos</div>
              {presets.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {presets.map((preset) => (
                    <div
                      key={preset.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'center',
                        border: '1px solid rgba(148, 163, 184, 0.16)',
                        borderRadius: 14,
                        padding: '10px 12px',
                      }}
                    >
                      <div style={{ display: 'grid', gap: 2 }}>
                        <strong>{preset.name}</strong>
                        <span style={{ opacity: 0.72, fontSize: 13 }}>
                          {preset.quoteAsset} · {getChartRangeOption(preset.chartRange || preset.interval).label} · {uniqueSymbols(preset.selectedSymbols).length} pares
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="button button--ghost" onClick={() => applyPreset(preset)}>
                          Aplicar
                        </button>
                        <button type="button" className="button button--ghost" onClick={() => removePreset(preset.id)}>
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ opacity: 0.75 }}>
                  Salve presets para alternar entre listas de acompanhamento sem perder os favoritos.
                </div>
              )}
            </div>
          </div>

          {error ? (
            <div className="callout callout--danger" style={{ marginTop: 4 }}>
              {error}
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Cards de mercado" description="Favoritos continuam visíveis mesmo quando a base de conversão muda, e variação/volume seguem o período selecionado.">
        {selectedRows.length ? (
          <div
            style={{
              display: 'grid',
              gap: 16,
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            }}
          >
            {selectedRows.map((item) => {
              const ticker = item.ticker || {};
              const volume = safeNumber(item.rangeVolume);
              return (
                <article
                  key={item.symbol}
                  className="alert-card"
                  style={{
                    display: 'grid',
                    gap: 12,
                    alignContent: 'start',
                    minHeight: 0,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ display: 'grid', gap: 6 }}>
                      <strong style={{ fontSize: 18 }}>{item.symbol}</strong>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Pill tone={item.positive ? 'success' : 'danger'}>
                          {item.positive ? 'Alta no período' : 'Baixa no período'}
                        </Pill>
                        {item.isFavorite ? <Pill tone="warning">Favorito</Pill> : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(item.symbol)}
                      aria-label={
                        item.isFavorite
                          ? `Remover ${item.symbol} dos favoritos`
                          : `Adicionar ${item.symbol} aos favoritos`
                      }
                      style={{
                        border: 'none',
                        background: 'transparent',
                        fontSize: 22,
                        lineHeight: 1,
                        cursor: 'pointer',
                        color: item.isFavorite ? '#facc15' : 'rgba(148, 163, 184, 0.7)',
                      }}
                    >
                      ★
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ opacity: 0.72, fontSize: 13 }}>Preço atual</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>
                      {formatMoney(item.price, item.quoteCurrency || quoteAsset || baseCurrency)}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ opacity: 0.72, fontSize: 13 }}>{`Variação (${activeRange.label})`}</div>
                    <div
                      style={{
                        fontWeight: 700,
                        color: item.positive ? 'var(--success-500, #22c55e)' : 'var(--danger-500, #ef4444)',
                      }}
                    >
                      {item.positive ? '+' : ''}
                      {formatPercent(item.changePct, 2)}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ opacity: 0.72, fontSize: 13 }}>{`Volume (${activeRange.label})`}</div>
                    <div>{formatNumber(volume, 2)}</div>
                  </div>

                  <div style={{ borderRadius: 14, overflow: 'hidden', background: 'rgba(15, 23, 42, 0.35)', padding: 10 }}>
                    <SparklineChart values={item.values} />
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="button button--ghost" onClick={() => openModal('operacoes', item.symbol)}>
                      Operações
                    </button>
                    <button type="button" className="button button--ghost" onClick={() => openModal('execucao', item.symbol)}>
                      Execução
                    </button>
                    <button type="button" className="button button--ghost" onClick={() => openModal('social', item.symbol)}>
                      Social
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div style={{ opacity: 0.75 }}>Selecione pares ou favorite moedas para preencher os cards e ver a variação do período escolhido.</div>
        )}
      </Section>

      {ModalPage && modalCtx ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.72)',
            zIndex: 1000,
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
          onClick={() => setModalState(null)}
        >
          <div
            style={{
              width: 'min(1200px, 96vw)',
              maxHeight: '92vh',
              overflow: 'auto',
              background: 'var(--panel, #0f172a)',
              borderRadius: 20,
              border: '1px solid rgba(148, 163, 184, 0.18)',
              padding: 20,
              boxShadow: '0 30px 80px rgba(2, 6, 23, 0.5)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'grid', gap: 4 }}>
                <strong style={{ fontSize: 20 }}>{buildModalTitle(modalState.page, modalState.symbol)}</strong>
                <span style={{ opacity: 0.72, fontSize: 13 }}>
                  Visualização filtrada por moeda sem sair da página Mercado.
                </span>
              </div>
              <button type="button" className="button" onClick={() => setModalState(null)}>
                Fechar
              </button>
            </div>
            <ModalPage ctx={modalCtx} />
          </div>
        </div>
      ) : null}
    </>
  );
}
