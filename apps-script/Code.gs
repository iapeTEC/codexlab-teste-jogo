/**
 * Placar do jogo — "banco de dados" grátis com Planilha Google + Apps Script.
 *
 * COMO INSTALAR (uma vez):
 *  1. Crie uma Planilha Google nova (ex.: "Placar - Meu Jogo").
 *  2. Na planilha: Extensões > Apps Script. Apague o que estiver lá e cole este arquivo.
 *  3. Escolha a função "instalar" na barra de cima e clique em Executar. Autorize com SUA conta.
 *  4. Implantar > Nova implantação > tipo "App da Web".
 *     Executar como: Eu.  Quem pode acessar: Qualquer pessoa.
 *  5. Copie a URL que termina em /exec e cole em docs/jogo/config.js ("urlExec").
 *
 * Teste no navegador: <URL /exec>?acao=saude
 *
 * LIMITES: é um backend público de demonstração. Quem tiver a URL pode tentar enviar
 * pontuações falsas. Não guarde aqui dados pessoais, notas ou senhas de verdade.
 */

const PONTOS_MAXIMOS = 1000000; // maior pontuação possível numa partida: ajuste ao seu jogo
const LIMITE_DADOS = 1500;
const ABA_JOGADORES = 'Jogadores';
const ABA_PARTIDAS = 'Partidas';
const CABECALHO_JOGADORES = ['apelido', 'chave', 'melhor', 'partidas', 'dados', 'criadoEm', 'atualizadoEm'];
const CABECALHO_PARTIDAS = ['data', 'apelido', 'pontos', 'pedido'];
const COL = { apelido: 1, chave: 2, melhor: 3, partidas: 4, dados: 5, criadoEm: 6, atualizadoEm: 7 };

function instalar() {
  prepararAbas_();
  sal_();
  return 'Pronto! Agora faça Implantar > Nova implantação > App da Web.';
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  let resposta;
  try {
    resposta = executar_(p);
  } catch (erro) {
    if (!(erro && erro.publico)) console.error(erro);
    resposta = { ok: false, erro: erro && erro.publico ? erro.message : 'Erro no servidor. Tente de novo.' };
  }
  return responder_(resposta, String(p.callback || ''));
}

function responder_(objeto, callback) {
  const json = JSON.stringify(objeto);
  if (/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function erroPublico_(mensagem) {
  const erro = new Error(mensagem);
  erro.publico = true;
  return erro;
}

function executar_(p) {
  const acao = String(p.acao || '');
  if (acao === 'saude') return { ok: true, jogo: 'placar', hora: new Date().toISOString() };
  if (acao === 'ranking') return ranking_(p);
  if (acao === 'entrar' || acao === 'salvar' || acao === 'partida') {
    const pedido = String(p.pedido || '');
    if (pedido && !/^[A-Za-z0-9-]{8,64}$/.test(pedido)) throw erroPublico_('Pedido inválido.');
    const cache = CacheService.getScriptCache();
    if (pedido) {
      const repetida = cache.get('pedido:' + pedido);
      if (repetida) return JSON.parse(repetida); // o celular repetiu um envio: não grava duas vezes
    }
    const trava = LockService.getScriptLock();
    if (!trava.tryLock(10000)) throw erroPublico_('Servidor ocupado. Tente de novo.');
    try {
      const resposta = acao === 'entrar' ? entrar_(p) : acao === 'salvar' ? salvar_(p, false) : salvar_(p, true);
      if (pedido) cache.put('pedido:' + pedido, JSON.stringify(resposta), 21600);
      return resposta;
    } finally {
      trava.releaseLock();
    }
  }
  throw erroPublico_('Ação desconhecida.');
}

// ------------------------------------------------------------------ validação

function apelido_(texto) {
  const valor = String(texto || '').trim().replace(/\s+/g, ' ');
  if (!/^[\p{L}\p{N}_][\p{L}\p{N}_ -]{1,15}$/u.test(valor)) throw erroPublico_('Apelido inválido.');
  return valor;
}

function chaveDoCliente_(texto) {
  const valor = String(texto || '');
  if (!/^[0-9a-f]{64}$/.test(valor)) throw erroPublico_('Chave inválida.');
  return valor;
}

function numero_(valor, maximo) {
  const n = Number(valor);
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n * 100) / 100, maximo);
}

function dados_(texto) {
  const valor = String(texto || '{}');
  if (valor.length > LIMITE_DADOS) throw erroPublico_('Dados do jogo grandes demais.');
  let objeto;
  try {
    objeto = JSON.parse(valor);
  } catch (erro) {
    throw erroPublico_('Dados do jogo inválidos.');
  }
  if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto)) throw erroPublico_('Dados do jogo inválidos.');
  return JSON.stringify(objeto);
}

/** Evita que um texto vire fórmula na planilha (=, +, - ou @ no começo). */
function texto_(valor) {
  const s = String(valor);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// --------------------------------------------------------------- planilha

function planilha_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function prepararAbas_() {
  const p = planilha_();
  [[ABA_JOGADORES, CABECALHO_JOGADORES], [ABA_PARTIDAS, CABECALHO_PARTIDAS]].forEach(function (par) {
    let aba = p.getSheetByName(par[0]);
    if (!aba) aba = p.insertSheet(par[0]);
    if (aba.getLastRow() === 0) {
      aba.getRange(1, 1, 1, par[1].length).setValues([par[1]]);
      aba.setFrozenRows(1);
    }
  });
  p.getSheetByName(ABA_JOGADORES).getRange('A:B').setNumberFormat('@');
  p.getSheetByName(ABA_JOGADORES).getRange('E:G').setNumberFormat('@');
  p.getSheetByName(ABA_PARTIDAS).getRange('A:B').setNumberFormat('@');
  p.getSheetByName(ABA_PARTIDAS).getRange('D:D').setNumberFormat('@');
}

function aba_(nome) {
  let aba = planilha_().getSheetByName(nome);
  if (!aba) {
    prepararAbas_();
    aba = planilha_().getSheetByName(nome);
  }
  return aba;
}

function sal_() {
  const propriedades = PropertiesService.getScriptProperties();
  let sal = propriedades.getProperty('SAL');
  if (!sal) {
    sal = Utilities.getUuid();
    propriedades.setProperty('SAL', sal);
  }
  return sal;
}

function resumo_(texto) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}

function acharJogador_(apelido) {
  const aba = aba_(ABA_JOGADORES);
  const total = aba.getLastRow() - 1;
  if (total < 1) return null;
  const alvo = apelido.toLowerCase();
  // getValues (e não getDisplayValues): numa planilha em português, 12,5 viria como texto.
  const linhas = aba.getRange(2, 1, total, CABECALHO_JOGADORES.length).getValues();
  for (let i = 0; i < linhas.length; i++) {
    if (String(linhas[i][0]).replace(/^'/, '').toLowerCase() === alvo) {
      return { linha: i + 2, valores: linhas[i].map(celula_) };
    }
  }
  return null;
}

function celula_(valor) {
  if (valor instanceof Date) return valor.toISOString();
  return typeof valor === 'number' ? valor : String(valor);
}

function progressoDe_(valores) {
  let dados = {};
  try { dados = JSON.parse(valores[COL.dados - 1] || '{}'); } catch (erro) { dados = {}; }
  return {
    melhor: numero_(valores[COL.melhor - 1], PONTOS_MAXIMOS),
    partidas: Math.floor(numero_(valores[COL.partidas - 1], 1e9)),
    dados: dados,
    atualizadoEm: String(valores[COL.atualizadoEm - 1] || '')
  };
}

function conferirChave_(jogador, apelido, chave) {
  const cache = CacheService.getScriptCache();
  const chaveDeFalhas = 'falhas:' + apelido.toLowerCase();
  const falhas = Number(cache.get(chaveDeFalhas) || 0);
  if (falhas >= 8) throw erroPublico_('Muitas tentativas erradas. Espere 10 minutos.');
  if (resumo_(sal_() + ':' + chave) !== jogador.valores[COL.chave - 1]) {
    cache.put(chaveDeFalhas, String(falhas + 1), 600);
    throw erroPublico_('PIN errado para esse apelido.');
  }
}

// ------------------------------------------------------------------- ações

function entrar_(p) {
  const apelido = apelido_(p.apelido);
  const chave = chaveDoCliente_(p.chave);
  const jogador = acharJogador_(apelido);
  if (jogador) {
    conferirChave_(jogador, apelido, chave);
    return { ok: true, novo: false, apelido: String(jogador.valores[0]).replace(/^'/, ''), progresso: progressoDe_(jogador.valores) };
  }
  const agora = new Date().toISOString();
  aba_(ABA_JOGADORES).appendRow([texto_(apelido), resumo_(sal_() + ':' + chave), 0, 0, '{}', agora, agora]);
  return { ok: true, novo: true, apelido: apelido, progresso: { melhor: 0, partidas: 0, dados: {}, atualizadoEm: agora } };
}

function salvar_(p, ehPartida) {
  const apelido = apelido_(p.apelido);
  const chave = chaveDoCliente_(p.chave);
  const jogador = acharJogador_(apelido);
  if (!jogador) throw erroPublico_('Apelido não encontrado. Entre de novo.');
  conferirChave_(jogador, apelido, chave);
  const atual = progressoDe_(jogador.valores);
  const agora = new Date().toISOString();
  const pontos = numero_(p.pontos, PONTOS_MAXIMOS);
  const melhor = Math.max(atual.melhor, numero_(p.melhor, PONTOS_MAXIMOS), ehPartida ? pontos : 0);
  const partidas = Math.max(atual.partidas + (ehPartida ? 1 : 0), Math.floor(numero_(p.partidas, 1e9)));
  const dados = p.dados === undefined ? JSON.stringify(atual.dados) : dados_(p.dados);
  aba_(ABA_JOGADORES).getRange(jogador.linha, COL.melhor, 1, 5)
    .setValues([[melhor, partidas, dados, jogador.valores[COL.criadoEm - 1], agora]]);
  if (ehPartida) {
    aba_(ABA_PARTIDAS).appendRow([agora, texto_(apelido), pontos, String(p.pedido || '')]);
    CacheService.getScriptCache().remove('ranking');
  }
  return { ok: true, progresso: { melhor: melhor, partidas: partidas, dados: JSON.parse(dados), atualizadoEm: agora } };
}

function ranking_(p) {
  const limite = Math.max(1, Math.min(50, Math.floor(numero_(p.limite, 50)) || 10));
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('ranking');
  let lista;
  if (guardado) {
    lista = JSON.parse(guardado);
  } else {
    const aba = aba_(ABA_JOGADORES);
    const total = aba.getLastRow() - 1;
    const linhas = total > 0 ? aba.getRange(2, 1, total, COL.melhor).getValues() : [];
    lista = linhas
      .map(function (l) { return { apelido: String(l[0]).replace(/^'/, ''), pontos: numero_(l[COL.melhor - 1], PONTOS_MAXIMOS) }; })
      .filter(function (l) { return l.pontos > 0; })
      .sort(function (a, b) { return b.pontos - a.pontos; })
      .slice(0, 50);
    cache.put('ranking', JSON.stringify(lista), 20);
  }
  return { ok: true, ranking: lista.slice(0, limite) };
}
