const DEFAULT_SOCIAL_POLICY = Object.freeze({
  minScoreStrong: 75,
  minScorePromising: 60,
  maxRiskStrong: 35,
  maxRiskPromising: 55,
  maxSpamRisk: 60,
  minMomentumEmerging: 12,
  providerPenaltyPerDegraded: 2.5,
  providerPenaltyPerBlocked: 6,
  sourceBonusCap: 8,
  sentimentWeight: 0.18,
  momentumWeight: 0.24,
  scoreWeight: 0.46,
  riskWeight: 0.38,
  spamWeight: 0.22,
  alertPenaltyHigh: 6,
  alertPenaltyCritical: 12,
});

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeAsset(row = {}) {
  return {
    symbol: String(row.symbol || '').toUpperCase(),
    classification: String(row.classification || 'NEUTRA').toUpperCase(),
    socialScore: toNumber(row.socialScore ?? row.social_score),
    socialRisk: toNumber(row.socialRisk ?? row.social_risk),
    sentiment: toNumber(row.sentiment),
    momentum: toNumber(row.momentum),
    spamRisk: toNumber(row.spamRisk ?? row.spam_risk),
    sourceCount: Math.max(0, Math.trunc(toNumber(row.sourceCount ?? row.source_count))),
    sources: Array.isArray(row.sources) ? row.sources : [],
    notes: Array.isArray(row.notes) ? row.notes : [],
    raw: row.raw || {},
    updatedAt: row.updatedAt || row.updated_at || null,
  };
}

function normalizeAlert(row = {}) {
  return {
    symbol: String(row.symbol || '').toUpperCase(),
    severity: String(row.severity || 'info').toLowerCase(),
    alertType: String(row.alertType || row.alert_type || 'unknown').toLowerCase(),
    action: row.action || null,
    message: row.message || '',
    payload: row.payload || {},
    createdAt: row.createdAt || row.created_at || null,
  };
}

function normalizeProvider(row = {}) {
  return {
    providerKey: String(row.providerKey || row.provider_key || '').toLowerCase(),
    providerName: row.providerName || row.provider_name || row.providerKey || row.provider_key || 'provider',
    status: String(row.status || 'unknown').toLowerCase(),
    mode: String(row.mode || 'free').toLowerCase(),
    lastSuccessAt: row.lastSuccessAt || row.last_success_at || null,
    lastFailureAt: row.lastFailureAt || row.last_failure_at || null,
    lastHttpStatus: row.lastHttpStatus ?? row.last_http_status ?? null,
    retryAfterAt: row.retryAfterAt || row.retry_after_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
    payload: row.payload || {},
  };
}

function getProviderPenalty(providerStatuses = [], policy = DEFAULT_SOCIAL_POLICY) {
  return providerStatuses.reduce((total, item) => {
    const provider = normalizeProvider(item);
    if (provider.status === 'blocked' || provider.status === 'rate_limited') {
      return total + policy.providerPenaltyPerBlocked;
    }
    if (provider.status === 'degraded' || provider.status === 'error' || provider.status === 'warning') {
      return total + policy.providerPenaltyPerDegraded;
    }
    return total;
  }, 0);
}

function countAlertsBySymbol(alerts = []) {
  return alerts.reduce((acc, item) => {
    const alert = normalizeAlert(item);
    if (!alert.symbol) return acc;
    if (!acc[alert.symbol]) {
      acc[alert.symbol] = { total: 0, high: 0, critical: 0, latestAt: null, items: [] };
    }
    acc[alert.symbol].total += 1;
    if (alert.severity === 'high') acc[alert.symbol].high += 1;
    if (alert.severity === 'critical') acc[alert.symbol].critical += 1;
    if (!acc[alert.symbol].latestAt || String(alert.createdAt) > String(acc[alert.symbol].latestAt)) {
      acc[alert.symbol].latestAt = alert.createdAt;
    }
    acc[alert.symbol].items.push(alert);
    return acc;
  }, {});
}

function getNarrativeState(asset, alertSummary, policy = DEFAULT_SOCIAL_POLICY) {
  if ((alertSummary?.critical || 0) > 0 || asset.socialRisk >= 80 || asset.classification === 'ALTO_RISCO') {
    return 'high-risk';
  }
  if (asset.momentum >= policy.minMomentumEmerging && asset.socialScore >= policy.minScorePromising && asset.socialRisk <= policy.maxRiskPromising) {
    return 'emerging';
  }
  if (asset.momentum <= -8 || asset.sentiment <= -15 || (alertSummary?.high || 0) >= 2) {
    return 'cooling';
  }
  if (asset.socialScore >= policy.minScoreStrong && asset.socialRisk <= policy.maxRiskStrong) {
    return 'stable-strong';
  }
  return 'neutral';
}

function buildWatchlist(items = [], alerts = [], providerStatuses = [], policy = DEFAULT_SOCIAL_POLICY) {
  const providerPenalty = getProviderPenalty(providerStatuses, policy);
  const alertsBySymbol = countAlertsBySymbol(alerts);
  const ranked = items
    .map((row) => normalizeAsset(row))
    .filter((asset) => asset.symbol)
    .map((asset) => {
      const symbolAlerts = alertsBySymbol[asset.symbol] || { total: 0, high: 0, critical: 0, items: [] };
      const sourceBonus = Math.min(asset.sourceCount, policy.sourceBonusCap);
      const rawScore =
        asset.socialScore * policy.scoreWeight +
        asset.momentum * policy.momentumWeight +
        asset.sentiment * policy.sentimentWeight +
        sourceBonus -
        asset.socialRisk * policy.riskWeight -
        asset.spamRisk * policy.spamWeight -
        providerPenalty -
        symbolAlerts.high * policy.alertPenaltyHigh -
        symbolAlerts.critical * policy.alertPenaltyCritical;
      const opportunityScore = clamp(Number(rawScore.toFixed(2)), 0, 100);
      const narrativeState = getNarrativeState(asset, symbolAlerts, policy);
      const confidenceBand =
        opportunityScore >= 75 ? 'alta' : opportunityScore >= 50 ? 'media' : 'baixa';
      const discoveryLabel =
        narrativeState === 'emerging'
          ? 'promissora'
          : narrativeState === 'stable-strong'
            ? 'forte'
            : narrativeState === 'high-risk'
              ? 'alto-risco'
              : 'monitorar';
      return {
        ...asset,
        alertCount: symbolAlerts.total,
        alertHighCount: symbolAlerts.high,
        alertCriticalCount: symbolAlerts.critical,
        providerPenalty,
        opportunityScore,
        narrativeState,
        confidenceBand,
        discoveryLabel,
      };
    })
    .sort((left, right) => {
      if (right.opportunityScore !== left.opportunityScore) {
        return right.opportunityScore - left.opportunityScore;
      }
      if (left.socialRisk !== right.socialRisk) {
        return left.socialRisk - right.socialRisk;
      }
      return right.socialScore - left.socialScore;
    })
    .map((item, index) => ({ ...item, watchlistRank: index + 1 }));

  return {
    policy,
    providerPenalty,
    items: ranked,
  };
}

function buildRiskRadar(items = [], alerts = [], providerStatuses = [], policy = DEFAULT_SOCIAL_POLICY) {
  const watchlist = buildWatchlist(items, alerts, providerStatuses, policy);
  const highRiskItems = watchlist.items
    .filter(
      (item) =>
        item.classification === 'ALTO_RISCO' ||
        item.socialRisk >= 70 ||
        item.alertCriticalCount > 0 ||
        item.spamRisk >= policy.maxSpamRisk,
    )
    .map((item) => ({
      symbol: item.symbol,
      socialRisk: item.socialRisk,
      spamRisk: item.spamRisk,
      alertCount: item.alertCount,
      alertCriticalCount: item.alertCriticalCount,
      narrativeState: item.narrativeState,
      recommendation:
        item.alertCriticalCount > 0 || item.socialRisk >= 85 ? 'bloquear' : 'monitorar-de-perto',
    }));

  const providerHealth = buildProviderHealth(providerStatuses);

  return {
    generatedAt: new Date().toISOString(),
    highRiskCount: highRiskItems.length,
    providerHealth,
    items: highRiskItems,
  };
}

function buildProviderHealth(providerStatuses = []) {
  const providers = providerStatuses.map((row) => normalizeProvider(row));
  const counts = providers.reduce(
    (acc, item) => {
      acc.total += 1;
      acc.byStatus[item.status] = (acc.byStatus[item.status] || 0) + 1;
      return acc;
    },
    { total: 0, byStatus: {} },
  );

  const degraded = (counts.byStatus.degraded || 0) + (counts.byStatus.error || 0) + (counts.byStatus.warning || 0);
  const blocked = (counts.byStatus.blocked || 0) + (counts.byStatus.rate_limited || 0);
  const score = clamp(100 - degraded * 12 - blocked * 22, 0, 100);
  const status = blocked > 0 ? 'degraded' : degraded > 0 ? 'warning' : 'ok';

  return {
    status,
    score,
    counts,
    providers,
  };
}

function buildNarrativeBoard(items = [], alerts = [], providerStatuses = [], policy = DEFAULT_SOCIAL_POLICY) {
  const watchlist = buildWatchlist(items, alerts, providerStatuses, policy);
  const grouped = {
    emerging: [],
    cooling: [],
    'high-risk': [],
    'stable-strong': [],
    neutral: [],
  };

  for (const item of watchlist.items) {
    grouped[item.narrativeState] = grouped[item.narrativeState] || [];
    grouped[item.narrativeState].push({
      symbol: item.symbol,
      watchlistRank: item.watchlistRank,
      opportunityScore: item.opportunityScore,
      socialScore: item.socialScore,
      socialRisk: item.socialRisk,
      momentum: item.momentum,
      sentiment: item.sentiment,
      alertCount: item.alertCount,
      discoveryLabel: item.discoveryLabel,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    providerHealth: buildProviderHealth(providerStatuses),
    groups: grouped,
  };
}

function filterRankedItems(items = [], query = {}, policy = DEFAULT_SOCIAL_POLICY) {
  const classification = query.classification ? String(query.classification).toUpperCase() : null;
  const minScore = query.minScore == null ? null : toNumber(query.minScore, null);
  const maxRisk = query.maxRisk == null ? null : toNumber(query.maxRisk, null);
  const discoveryLabel = query.discoveryLabel ? String(query.discoveryLabel).toLowerCase() : null;
  const confidenceBand = query.confidenceBand ? String(query.confidenceBand).toLowerCase() : null;
  const limit = clamp(Math.trunc(toNumber(query.limit, 20)), 1, 100);

  return items
    .filter((item) => !classification || item.classification === classification)
    .filter((item) => minScore == null || item.socialScore >= minScore)
    .filter((item) => maxRisk == null || item.socialRisk <= maxRisk)
    .filter((item) => !discoveryLabel || String(item.discoveryLabel).toLowerCase() === discoveryLabel)
    .filter((item) => !confidenceBand || String(item.confidenceBand).toLowerCase() === confidenceBand)
    .slice(0, limit);
}

module.exports = {
  DEFAULT_SOCIAL_POLICY,
  normalizeAsset,
  normalizeAlert,
  normalizeProvider,
  buildWatchlist,
  buildRiskRadar,
  buildProviderHealth,
  buildNarrativeBoard,
  filterRankedItems,
};
