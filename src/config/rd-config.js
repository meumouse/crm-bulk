/**
 * Static configuration extracted from the user's mapping.
 * - IDs are stage IDs (stage_id) from RD Station CRM.
 * - Custom fields updates are done by SLUG (not by ID).
 */

export const DEAL_FIELD_SLUGS = {
  produtoInteresse: 'produto-de-interesse',
  produtoAdquirido: 'produto-adquirido',
  modeloProduto: 'modelo-do-produto',
  pipelineAtual: 'pipeline-atual',
};

export const PRODUCT_MODELS = {
  GRATUITO: 'Gratuito',
  FREEMIUM: 'Freemium',
  PAGO: 'Pago',
  EM_DESENVOLVIMENTO: 'Em desenvolvimento',
};

export const PRODUCT_MODEL_BY_PRODUCT = {
  'Parcelas Customizadas': PRODUCT_MODELS.FREEMIUM,
  'Flexify Checkout': PRODUCT_MODELS.FREEMIUM,
  'Flexify Dashboard': PRODUCT_MODELS.PAGO,
  'Account Genius': PRODUCT_MODELS.PAGO,

  // Not used by default in phase rules (only if you expand rules later)
  'Joinotify': PRODUCT_MODELS.PAGO,
  'Clube M': PRODUCT_MODELS.PAGO,
  'HubGo': PRODUCT_MODELS.GRATUITO,
  'AutomateChat': PRODUCT_MODELS.EM_DESENVOLVIMENTO,
};

export const SOURCE_FUNNELS = {
  // Interest funnels
  'Parcelas Customizadas': {
    type: 'interest',
    stages: {
      SEM_CONTATO: '660f0b8e342d130018be8cdd',
      MENSAGEM_AUTOMATICA: '6683007ae5e01300130510c1',
      MENSAGEM_ENVIADA: '660f0b8e342d130018be8cde',
      DEMONSTROU_INTERESSE: '660f0b8e342d130018be8cdf',
      OFERTA_ENVIADA: '660f0b8e342d130018be8ce0',
      FOLLOW_UP_OFERTA: '660f0b8e342d130018be8ce1',
      COMPROU: '66146b243ea29a0020248f7a',
      DOWNSELL: '66146b3dbbd78b001f7b4c02',
    },
  },
  'Flexify Checkout': {
    type: 'interest',
    stages: {
      SEM_CONTATO: '661443948473f20020c09905',
      MENSAGEM_AUTOMATICA: '66835a8236e31700107d4e10',
      MENSAGEM_ENVIADA: '661443948473f20020c09906',
      DEMONSTROU_INTERESSE: '661443948473f20020c09907',
      OFERTA_ENVIADA: '661443948473f20020c09908',
      FOLLOW_UP_OFERTA: '661443958473f20020c0990a',
      COMPROU: '66146bfcee0388000e0f63cf',
      DOWNSELL: '66146c060b7821000d0bbb91',
    },
  },
  'Flexify Dashboard': {
    type: 'interest',
    stages: {
      SEM_CONTATO: '661443a83ea29a0014245f9f',
      MENSAGEM_AUTOMATICA: '66835abf06871900176357ab',
      MENSAGEM_ENVIADA: '661443a83ea29a0014245fa0',
      DEMONSTROU_INTERESSE: '661443a83ea29a0014245fa1',
      OFERTA_ENVIADA: '661443a83ea29a0014245fa2',
      FOLLOW_UP_OFERTA: '661443a83ea29a0014245fa3',
      COMPROU: '66847f5d4951890010fd2c7f',
      DOWNSELL: '66146c510b58e5000df76f64',
    },
  },
  'Account Genius': {
    type: 'interest',
    stages: {
      SEM_CONTATO: '661443dacf5ad40014330a3c',
      MENSAGEM_AUTOMATICA: '66835ae3b9963200224d010c',
      MENSAGEM_ENVIADA: '661443dacf5ad40014330a3d',
      DEMONSTROU_INTERESSE: '661443dacf5ad40014330a3e',
      OFERTA_ENVIADA: '661443dacf5ad40014330a3f',
      FOLLOW_UP_OFERTA: '661443dacf5ad40014330a40',
      COMPROU: '66146cd50b782100190bbe13',
      DOWNSELL: '66146ce37e71260014125aaa',
    },
  },

  // Customer funnels (anything with "Clientes" goes to Assinaturas / Recorrente)
  'Clientes Parcelas Customizadas': {
    type: 'customer',
    stages: {
      SEM_CONTATO: '6614440ee39e860014e99f96',
      MENSAGEM_AUTOMATICA: '66835b2214d4ea000f771da8',
      MENSAGEM_ENVIADA: '6614440ee39e860014e99f97',
      DEMONSTROU_INTERESSE: '6614440ee39e860014e99f98',
      OFERTA_ENVIADA: '6614440ee39e860014e99f99',
      FOLLOW_UP_OFERTA: '6614440ee39e860014e99f9a',
      COMPROU: '66146d324dadf4001bdf157b',
      DOWNSELL: '66146d4442c13a00133e1ba3',
    },
  },
  'Clientes Flexify Checkout': {
    type: 'customer',
    stages: {
      SEM_CONTATO: '6614441d14083a0010a4d091',
      MENSAGEM_AUTOMATICA: '66835b51b57ae2001047efe2',
      MENSAGEM_ENVIADA: '6614441d14083a0010a4d092',
      DEMONSTROU_INTERESSE: '6614441d14083a0010a4d093',
      OFERTA_ENVIADA: '6614441d14083a0010a4d094',
      FOLLOW_UP_OFERTA: '6614441d14083a0010a4d095',
      COMPROU: '66146d7ea8ae31000d45629a',
      DOWNSELL: '66146d8abbd78b001f7b4cdb',
    },
  },
  'Clientes Flexify Dashboard': {
    type: 'customer',
    stages: {
      SEM_CONTATO: '66144431c0e4e7002088e214',
      MENSAGEM_AUTOMATICA: '66835b790c9f250010056ba1',
      MENSAGEM_ENVIADA: '66144431c0e4e7002088e215',
      DEMONSTROU_INTERESSE: '66144431c0e4e7002088e216',
      OFERTA_ENVIADA: '66144431c0e4e7002088e217',
      FOLLOW_UP_OFERTA: '66144431c0e4e7002088e218',
      COMPROU: '66146dc9fe2d1a0020acee3e',
      DOWNSELL: '66146dde27131f000dd1b2c5',
    },
  },
  'Clientes Account Genius': {
    type: 'customer',
    stages: {
      SEM_CONTATO: '66144440120c0a00170a464e',
      MENSAGEM_AUTOMATICA: '66835b9094b600001abb3fd3',
      MENSAGEM_ENVIADA: '66144440120c0a00170a4656',
      DEMONSTROU_INTERESSE: '66144440120c0a00170a4657',
      OFERTA_ENVIADA: '66144441120c0a00170a4658',
      FOLLOW_UP_OFERTA: '66144441120c0a00170a4659',
      COMPROU: '66146e093c6f7e0014492bef',
      DOWNSELL: '66146e180b58e50014f76fdf',
    },
  },
};

// Destination stages (stage_id)
export const TARGET_FUNNELS = {
  LOW_TICKET: {
    name: 'Low Ticket',
    stages: {
      SEM_CONTATO: '699f370e74af8e001dae7d9c',
      CONTATO_FEITO: '699f370e74af8e001dae7d9d',
      IDENTIFICACAO_INTERESSE: '699f370e74af8e001dae7d9e',
      PERIODO_GRATIS: '699f370e74af8e001dae7d9f',
      ASSINOU: '699f370e74af8e001dae7da0',
      DOWNSELL: '69a5ecd0bd4e940013e2735b',
    },
  },
  ASSINATURAS_RECORRENTE: {
    name: 'Assinaturas / Recorrente',
    stages: {
      CLIENTE_ATIVO: '699f384f74daa900167dbb06',
    },
  },
};

// Stage key -> readable label
export const STAGE_LABELS = {
  SEM_CONTATO: 'Sem contato',
  MENSAGEM_AUTOMATICA: 'Mensagem automática',
  MENSAGEM_ENVIADA: 'Mensagem enviada',
  DEMONSTROU_INTERESSE: 'Demonstrou interesse',
  OFERTA_ENVIADA: 'Oferta enviada',
  FOLLOW_UP_OFERTA: 'Follow-up',
  COMPROU: 'Comprou',
  DOWNSELL: 'Downsell',
};
