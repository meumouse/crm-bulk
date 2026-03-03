# RD Station CRM - Bulk Migration Script

Script em **Node.js** para realizar modificações em massa no **RD
Station CRM (API v2)**.

Este projeto foi desenvolvido para:

1.  **Fase 1** -- Preencher campos personalizados das negociações com
    base no funil/etapa antiga.
2.  **Fase 2** -- Migrar negociações para novos funis e etapas (Low
    Ticket, Assinaturas, Clube M, High Ticket).

------------------------------------------------------------------------

## 🚀 Objetivo

Automatizar a reestruturação do CRM sem sobrecarregar a API, utilizando:

-   Requisições com delay configurável
-   Retry com backoff exponencial
-   Modo seguro (DRY_RUN)
-   Checkpoint automático
-   Logs e relatórios

------------------------------------------------------------------------

## 📦 Estrutura do Projeto

    crm-bulk/
      .env
      package.json
      bulk.js
      state.json        # Gerado automaticamente
      reports/          # Logs gerados automaticamente

------------------------------------------------------------------------

## ⚙️ Requisitos

-   Node.js 18+
-   Access Token válido da API do RD Station CRM
-   Permissão para atualizar negociações

Documentação oficial da API:
https://developers.rdstation.com/reference/crm-v2-introduction

------------------------------------------------------------------------

## 🔐 Configuração

### 1️⃣ Criar arquivo `.env`

``` env
RD_ACCESS_TOKEN=SEU_ACCESS_TOKEN_AQUI
RD_BASE_URL=https://api.rd.services
REQUEST_DELAY_MS=250
MAX_RETRIES=5
DRY_RUN=true
```

### Variáveis

  Variável           Descrição
  ------------------ ---------------------------------------------
  RD_ACCESS_TOKEN    Token Bearer da API
  RD_BASE_URL        URL base da API
  REQUEST_DELAY_MS   Intervalo entre requisições
  MAX_RETRIES        Número máximo de tentativas em caso de erro
  DRY_RUN            true = apenas simula, false = executa

------------------------------------------------------------------------

## 📥 Instalação

``` bash
npm install
```

Dependências utilizadas:

-   axios
-   dotenv
-   cross-env

------------------------------------------------------------------------

## 🧪 Execução

### 🔍 Teste (simulação)

``` bash
node bulk.js --phase=1 --limit=20
node bulk.js --phase=2 --limit=20
```

ou via scripts:

``` bash
npm run phase1:dry
npm run phase2:dry
```

------------------------------------------------------------------------

### 🚀 Execução Real

Altere no `.env`:

``` env
DRY_RUN=false
```

Depois execute:

``` bash
npm run phase1
npm run phase2
```

------------------------------------------------------------------------

## 📌 Fases da Migração

### 🥇 Fase 1 -- Atualização de Campos

Preenche os seguintes campos personalizados da negociação:

-   Produto de Interesse (multi)
-   Produto Adquirido (multi)
-   Modelo do Produto (single)
-   Pipeline Atual (single)

A lógica é baseada na etapa antiga da negociação.

------------------------------------------------------------------------

### 🥈 Fase 2 -- Migração de Funis

Move negociações para novos funis:

#### 🎯 Low Ticket

-   Sem contato
-   Contato feito
-   Identificação do interesse
-   Período grátis
-   Assinou
-   Downsell

#### 🔁 Assinaturas / Recorrente

-   Cliente ativo
-   Tentativa de upsell
-   Proposta upgrade
-   Negociação upgrade
-   Upgrade realizado

#### 🏆 Clube M

-   Lead elegível
-   Apresentação
-   Proposta enviada
-   Negociação
-   Assinou

#### 💼 High Ticket / Serviços

-   Lead qualificado
-   Diagnóstico enviado
-   Reunião
-   Proposta enviada
-   Negociação
-   Fechado ganho

------------------------------------------------------------------------

## 🔄 Controle de Execução

### ✅ Checkpoint automático

Arquivo:

    state.json

Evita reprocessar negociações já atualizadas.

------------------------------------------------------------------------

### 📊 Relatórios

Gerados na pasta:

    /reports

Arquivos: - phase1_ok.jsonl - phase2_ok.jsonl - errors_phase_1.log -
errors_phase_2.log

------------------------------------------------------------------------

## 🛡️ Segurança

O script implementa:

-   Retry com backoff exponencial
-   Tratamento de erro HTTP 429 (rate limit)
-   Delay configurável
-   Execução em modo simulação
-   Logs detalhados

------------------------------------------------------------------------

## 🧠 Boas Práticas

Antes de rodar em produção:

1.  Execute sempre primeiro com `DRY_RUN=true`
2.  Teste com `--limit=10`
3.  Teste com `--onlyStage=ID_DA_ETAPA`
4.  Faça backup/export das negociações

------------------------------------------------------------------------

## 📚 API Utilizada

-   GET /crm/v2/deals
-   PUT /crm/v2/deals/{id}
-   GET /crm/v2/custom_fields

Base URL:

    https://api.rd.services

------------------------------------------------------------------------

## 👨‍💻 Autor

Projeto desenvolvido para reestruturação de CRM da MeuMouse.com

------------------------------------------------------------------------

## 📄 Licença

Uso interno / privado.
