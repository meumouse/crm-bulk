# RD Station CRM bulk migration (deals)

Este projeto faz a migração em **duas fases** no RD Station CRM (API v2):

1. **Fase 1**: Preenche os campos personalizados da negociação com base no **funil/etapa atual**.

**Importante:** por padrão, a Fase 1 só preenche campos para funis de interesse quando a negociação está em **“Sem contato”** ou **“Mensagem automática”**, exatamente como você descreveu. Para mudar isso, edite `src/config/rules.js`.
2. **Fase 2**: Move a negociação do funil antigo para a **etapa correta** nos funis novos.

Ele foi pensado para rodar em lote, com **delay entre requisições**, **retry/backoff**, **logs em .jsonl** e **retomada** por `state.json`.

> Referências:
> - Endpoints de negociações (listar/obter/atualizar).  
> - Endpoints de funis/etapas (para detectar `pipeline_id` dos funis de destino).  

## Requisitos

- Node.js 18+
- Token de acesso (Bearer) **ou** OAuth com refresh token

## Instalação

```bash
npm install
cp .env.example .env
```

## Como rodar

### Rodar fase 1 (somente preencher campos)
```bash
npm run phase1
```

### Rodar fase 2 (somente mover etapas/funis)
```bash
npm run phase2
```

### Rodar as duas fases (uma após a outra)
```bash
npm run both
```

### Flags úteis

- `--phase=1|2|both`
- `--limit=200` (processa apenas N negociações)
- `--onlyStage=<STAGE_ID>` (processa apenas uma etapa específica)
- `--dryRun=true|false` (override do .env)

Exemplo:
```bash
node src/index.js --phase=1 --limit=200 --dryRun=true
```

## OAuth (renovação automática)

Se você quiser **renovar access_token automaticamente**, crie um arquivo (padrão: `oauth_token.json`) no formato:

```json
{
  "access_token": "....",
  "refresh_token": "....",
  "expires_at": 1772566669186,
  "token_type": "bearer",
  "expires_in": 7200,
  "updated_at": "2026-03-03T17:37:49.186Z"
}
```

E defina no `.env`:

- `RD_CLIENT_ID`
- `RD_CLIENT_SECRET`
- `RD_OAUTH_STATE_FILE=oauth_token.json`

> Se `RD_ACCESS_TOKEN` estiver definido, ele é usado como fallback caso o arquivo OAuth não exista.

## Logs / relatórios

Arquivos gerados em `./reports/`:

- `phase1_ok.jsonl`, `phase1_skipped.jsonl`
- `phase2_ok.jsonl`, `phase2_skipped.jsonl`
- `errors_phase_1.log`, `errors_phase_2.log`

Cada linha dos `.jsonl` contém: timestamp, dealId e payload aplicado.

## Ajustes de regra (onde editar)

- `src/config/rd-config.js`: IDs de etapas (origem e destino), slugs, modelos, etc.
- `src/config/rules.js`: regras da Fase 1 e mapeamento da Fase 2.

