# ETAPA 30 — observabilidade e governança operacional

## Objetivo
Elevar a base já existente de observabilidade, readiness, alertas e incidentes para uma camada operacional consolidada, com relatório formal de governança, histórico e integração com o scheduler.

## O que entra
- avaliação consolidada de governança operacional
- score operacional e status `healthy` / `degraded` / `blocked`
- persistência de histórico em `operational_governance_reports`
- endpoints de overview, histórico e execução manual
- resumo de alertas por severidade e source
- job agendado `governance_assessment`
- testes backend e frontend

## Endpoints novos
- `GET /api/observability/governance`
- `GET /api/observability/governance/history?limit=20&status=`
- `POST /api/observability/governance/run`
- `GET /api/alerts/summary?status=open`

## Regras principais
A avaliação considera:
- readiness
- emergency stop
- maintenance mode
- workers stale
- alertas críticos e high
- falhas recentes do scheduler
- healthcheck e reconciliação de execução

## Status
- `healthy`: sem bloqueios e sem degradação relevante
- `degraded`: operação permitida com correções pendentes
- `blocked`: operação supervisionada deve permanecer bloqueada

## Como aplicar
1. mesclar os arquivos no repositório
2. subir backend para executar `initializeDatabase`
3. rodar `npm test` em backend e frontend
4. chamar `POST /api/observability/governance/run`
5. validar `GET /api/observability/governance`
