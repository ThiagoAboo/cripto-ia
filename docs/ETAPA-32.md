# Etapa 32 — testnet/live com governança forte

## Objetivo

Preparar a transição real do paper/testnet para live com menos risco operacional, usando governança explícita antes, durante e depois da ativação.

## O que entra nesta etapa

- checklist obrigatório de ativação por alvo (`testnet` ou `live`);
- pedidos formais de ativação com persistência;
- aprovação dupla para `live`;
- revalidação do checklist antes da ativação;
- frase obrigatória de confirmação na hora de armar `live`;
- rollback operacional rápido para `paper`;
- supervisão contínua de `testnet/live` com recomendação de rollback;
- job agendado `testnet_supervision`.

## Arquivos do pacote

### Backend
- `backend/src/services/liveGovernance.service.js`
- `backend/src/routes/control.routes.js`
- `backend/src/services/scheduler.service.js`
- `backend/src/db/migrations/032_live_governance.sql`
- testes em `backend/tests/`

### Frontend
- `frontend/src/lib/live-governance.js`
- `frontend/src/lib/live-governance.test.js`

## Novos endpoints

### `GET /api/control/live/policy/defaults`
Retorna a policy padrão de ativação e supervisão.

### `GET /api/control/live/checklist?targetMode=live`
Retorna o checklist consolidado para o modo solicitado.

### `GET /api/control/live/requests`
Lista pedidos de ativação.

### `POST /api/control/live/requests`
Cria um novo pedido de ativação.

Payload sugerido:
```json
{
  "targetMode": "live",
  "reason": "go_live_after_testnet",
  "requestedBy": "thiago"
}
```

### `POST /api/control/live/requests/:id/revalidate`
Reavalia o checklist do pedido com o estado atual do sistema.

### `POST /api/control/live/requests/:id/approve`
Registra aprovação. Para `live`, o solicitante não pode se autoaprovar.

### `POST /api/control/live/requests/:id/activate`
Ativa o modo solicitado depois de aprovações e checklist.

Payload mínimo para `live`:
```json
{
  "activatedBy": "ops",
  "confirmationPhrase": "CONFIRMAR_LIVE"
}
```

### `POST /api/control/live/rollback`
Executa rollback rápido para `paper` por padrão.

### `GET /api/control/live/supervision`
Lista relatórios de supervisão.

### `POST /api/control/live/supervision/run`
Executa supervisão manual e pode disparar auto-rollback.

## Resultado esperado

- menos chance de ligar `live` em estado degradado;
- trilha explícita de quem pediu, aprovou e ativou;
- proteção extra via rollback operacional;
- base pronta para endurecer a ida para operação real.
