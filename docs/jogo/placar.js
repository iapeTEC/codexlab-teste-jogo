/*
 * Placar: guarda o progresso do jogo num dos três modos escolhidos em config.js ("modo").
 *
 *   "local"        Só neste aparelho (localStorage). Apagou o app, perdeu.
 *   "persistente"  Num arquivo numa pasta do celular (Documents). Apagou o app e instalou
 *                  de novo: o jogador escolhe a mesma pasta e o progresso volta.
 *   "nuvem"        Na Planilha Google, pelo Apps Script (/exec). Volta em qualquer aparelho
 *                  com o mesmo apelido e PIN. Tem ranking com todos os jogadores.
 *
 * NÃO PRECISA MEXER NESTE ARQUIVO. O jogo usa só estas funções:
 *
 *   await Placar.iniciar()                    uma vez, quando a página abre
 *   Placar.progresso()                        { melhor, partidas, recordes, dados }
 *   await Placar.registrarPartida(pontos, dados)   no fim de cada partida
 *   await Placar.salvar(dados)                guarda dados livres (nível, moedas...)
 *   await Placar.ranking()                    [{ apelido, pontos }] (maior primeiro)
 *   Placar.aoMudar(funcao)                    avisa quando o progresso muda sozinho
 *
 * "dados" é um objeto livre do jogo (ex.: { nivel: 3, moedas: 120 }), com até 1500
 * caracteres em JSON. A tela de login, a escolha de pasta e o ranking ficam prontos em
 * placar-ui.js.
 */
(function (raiz, fabrica) {
  const api = fabrica(raiz);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    raiz.Placar = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function (raiz) {
  'use strict';

  const MODOS = ['local', 'persistente', 'nuvem'];
  const LIMITE_RECORDES = 10;
  const LIMITE_DADOS = 1500;
  const TEMPO_LIMITE_MS = 15000;
  const URL_EXEC = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

  // ---------------------------------------------------------------- funções puras

  function numeroSeguro(valor) {
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1e12) : 0;
  }

  function progressoVazio() {
    return { melhor: 0, partidas: 0, recordes: [], dados: {}, atualizadoEm: '' };
  }

  function porPontos(a, b) {
    return b.pontos - a.pontos || String(a.data).localeCompare(String(b.data));
  }

  function normalizarRecorde(recorde) {
    if (!recorde || typeof recorde !== 'object') return null;
    return {
      apelido: String(recorde.apelido || 'Você').slice(0, 16),
      pontos: numeroSeguro(recorde.pontos),
      data: String(recorde.data || '').slice(0, 40)
    };
  }

  function normalizarProgresso(bruto) {
    const p = progressoVazio();
    if (!bruto || typeof bruto !== 'object') return p;
    p.melhor = numeroSeguro(bruto.melhor);
    p.partidas = Math.floor(numeroSeguro(bruto.partidas));
    if (Array.isArray(bruto.recordes)) {
      p.recordes = bruto.recordes.map(normalizarRecorde).filter(Boolean)
        .sort(porPontos).slice(0, LIMITE_RECORDES);
    }
    if (bruto.dados && typeof bruto.dados === 'object' && !Array.isArray(bruto.dados)) {
      p.dados = bruto.dados;
    }
    p.atualizadoEm = typeof bruto.atualizadoEm === 'string' ? bruto.atualizadoEm.slice(0, 40) : '';
    return p;
  }

  function aplicarPartida(progresso, pontos, apelido, agoraIso) {
    const p = normalizarProgresso(progresso);
    const pts = numeroSeguro(pontos);
    p.partidas += 1;
    p.melhor = Math.max(p.melhor, pts);
    p.recordes = p.recordes
      .concat([{ apelido: apelido || 'Você', pontos: pts, data: agoraIso }])
      .sort(porPontos)
      .slice(0, LIMITE_RECORDES);
    p.atualizadoEm = agoraIso;
    return p;
  }

  /** Junta dois progressos sem perder recorde: fica o maior de cada número. */
  function mesclar(a, b) {
    const x = normalizarProgresso(a);
    const y = normalizarProgresso(b);
    const maisNovo = String(y.atualizadoEm) > String(x.atualizadoEm) ? y : x;
    const chaves = new Set();
    const recordes = x.recordes.concat(y.recordes).filter((r) => {
      const chave = r.apelido + '|' + r.pontos + '|' + r.data;
      if (chaves.has(chave)) return false;
      chaves.add(chave);
      return true;
    }).sort(porPontos).slice(0, LIMITE_RECORDES);
    return {
      melhor: Math.max(x.melhor, y.melhor),
      partidas: Math.max(x.partidas, y.partidas),
      recordes,
      dados: maisNovo.dados,
      atualizadoEm: maisNovo.atualizadoEm
    };
  }

  function validarApelido(texto) {
    const valor = String(texto || '').trim().replace(/\s+/g, ' ');
    if (!/^[\p{L}\p{N}_][\p{L}\p{N}_ -]{1,15}$/u.test(valor)) {
      return { ok: false, erro: 'Apelido: de 2 a 16 letras ou números (pode ter espaço, _ ou -).' };
    }
    return { ok: true, valor };
  }

  function validarPin(texto) {
    const valor = String(texto || '').trim();
    if (!/^\d{4,8}$/.test(valor)) {
      return { ok: false, erro: 'O PIN tem de 4 a 8 números.' };
    }
    return { ok: true, valor };
  }

  function dadosCabem(dados) {
    try {
      return JSON.stringify(dados === undefined ? {} : dados).length <= LIMITE_DADOS;
    } catch (erro) {
      return false;
    }
  }

  function montarUrl(base, parametros) {
    const url = new URL(base);
    Object.keys(parametros).forEach((chave) => {
      const valor = parametros[chave];
      if (valor !== undefined && valor !== null) url.searchParams.set(chave, String(valor));
    });
    return url.toString();
  }

  async function derivarChave(apelido, pin, pacote) {
    const texto = apelido.toLowerCase() + ':' + pin + ':' + pacote;
    const resumo = await raiz.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(resumo)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function novoPedido() {
    if (raiz.crypto && typeof raiz.crypto.randomUUID === 'function') return raiz.crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  // ------------------------------------------------------------- configuração

  function config() {
    return raiz.JOGO_CONFIG || {};
  }

  function modo() {
    return MODOS.indexOf(config().modo) >= 0 ? config().modo : 'local';
  }

  function chaveLocal(sufixo) {
    return 'placar:' + (config().pacote || 'jogo') + ':' + sufixo;
  }

  function lerLocal(sufixo, padrao) {
    try {
      const texto = raiz.localStorage.getItem(chaveLocal(sufixo));
      return texto ? JSON.parse(texto) : padrao;
    } catch (erro) {
      return padrao;
    }
  }

  function gravarLocal(sufixo, valor) {
    try {
      raiz.localStorage.setItem(chaveLocal(sufixo), JSON.stringify(valor));
      return true;
    } catch (erro) {
      return false;
    }
  }

  function nativo() {
    return raiz.AndroidSave || null;
  }

  // ---------------------------------------------------------------- servidor

  let contadorJsonp = 0;

  /** Chama o Apps Script por JSONP (uma tag script), que funciona no Pages e no APK. */
  function chamarServidor(parametros) {
    return new Promise((resolve, reject) => {
      const url = config().urlExec;
      if (!URL_EXEC.test(String(url || ''))) {
        reject(new Error('Falta a URL /exec do Apps Script em config.js.'));
        return;
      }
      const nome = '__placar_' + Date.now().toString(36) + '_' + (contadorJsonp++);
      const script = raiz.document.createElement('script');
      let terminou = false;
      const terminar = () => {
        terminou = true;
        clearTimeout(relogio);
        raiz[nome] = function () {};
        script.remove();
      };
      const relogio = setTimeout(() => {
        if (terminou) return;
        terminar();
        reject(new Error('O servidor demorou para responder. Confira a internet.'));
      }, TEMPO_LIMITE_MS);
      raiz[nome] = (resposta) => {
        if (terminou) return;
        terminar();
        if (resposta && resposta.ok) resolve(resposta);
        else reject(new Error((resposta && resposta.erro) || 'Resposta inválida do servidor.'));
      };
      script.onerror = () => {
        if (terminou) return;
        terminar();
        reject(new Error('Sem conexão com o servidor do placar.'));
      };
      script.src = montarUrl(url, Object.assign({}, parametros, { callback: nome }));
      raiz.document.head.appendChild(script);
    });
  }

  // ------------------------------------------------------------------ estado

  let progressoAtual = progressoVazio();
  const ouvintes = [];
  let esperaDaPasta = null;

  function avisar() {
    const copia = Placar.progresso();
    ouvintes.forEach((funcao) => {
      try { funcao(copia); } catch (erro) { console.error(erro); }
    });
  }

  function definirProgresso(novo) {
    progressoAtual = normalizarProgresso(novo);
    gravarLocal('progresso', progressoAtual);
    if (modo() === 'persistente' && nativo() && nativo().temPasta()) {
      nativo().escrever(JSON.stringify(progressoAtual));
    }
  }

  function sessao() {
    const s = lerLocal('sessao', null);
    return s && typeof s.apelido === 'string' && /^[0-9a-f]{64}$/.test(String(s.chave)) ? s : null;
  }

  function pacoteParaServidor(p) {
    return {
      melhor: p.melhor,
      partidas: p.partidas,
      dados: JSON.stringify(p.dados || {})
    };
  }

  async function enviarPendentes() {
    const s = sessao();
    if (modo() !== 'nuvem' || !s) return;
    const pendentes = lerLocal('pendentes', []);
    while (pendentes.length) {
      const item = pendentes[0];
      await chamarServidor(Object.assign({ acao: 'partida', apelido: s.apelido, chave: s.chave }, item));
      pendentes.shift();
      gravarLocal('pendentes', pendentes);
    }
  }

  function lerArquivoDaPasta() {
    const n = nativo();
    if (!n || !n.temPasta()) return null;
    try {
      const texto = n.ler();
      return texto ? normalizarProgresso(JSON.parse(texto)) : null;
    } catch (erro) {
      return null;
    }
  }

  const Placar = {
    modo,

    async iniciar() {
      progressoAtual = normalizarProgresso(lerLocal('progresso', null));
      if (modo() === 'persistente') {
        const doArquivo = lerArquivoDaPasta();
        if (doArquivo) progressoAtual = mesclar(progressoAtual, doArquivo);
        definirProgresso(progressoAtual);
      }
      if (modo() === 'nuvem' && sessao()) {
        const s = sessao();
        try {
          await enviarPendentes();
          const resposta = await chamarServidor({ acao: 'entrar', apelido: s.apelido, chave: s.chave });
          definirProgresso(mesclar(progressoAtual, resposta.progresso));
        } catch (erro) {
          console.warn('Placar: seguindo sem internet.', erro.message);
        }
      }
      avisar();
      return Placar.progresso();
    },

    progresso() {
      return JSON.parse(JSON.stringify(progressoAtual));
    },

    aoMudar(funcao) {
      if (typeof funcao === 'function') ouvintes.push(funcao);
    },

    async registrarPartida(pontos, dados) {
      if (dados !== undefined && !dadosCabem(dados)) {
        throw new Error('Os dados do jogo passaram de ' + LIMITE_DADOS + ' caracteres.');
      }
      const s = sessao();
      const agora = new Date().toISOString();
      const novo = aplicarPartida(progressoAtual, pontos, s ? s.apelido : 'Você', agora);
      if (dados !== undefined) novo.dados = dados;
      definirProgresso(novo);
      avisar();
      if (modo() === 'nuvem' && s) {
        const item = Object.assign({ pontos: numeroSeguro(pontos), pedido: novoPedido() },
          pacoteParaServidor(novo));
        const pendentes = lerLocal('pendentes', []);
        pendentes.push(item);
        gravarLocal('pendentes', pendentes.slice(-20));
        try {
          await enviarPendentes();
        } catch (erro) {
          return { salvoNaNuvem: false, erro: erro.message };
        }
        return { salvoNaNuvem: true };
      }
      return { salvoNaNuvem: false };
    },

    async salvar(dados) {
      if (!dadosCabem(dados)) {
        throw new Error('Os dados do jogo passaram de ' + LIMITE_DADOS + ' caracteres.');
      }
      const novo = normalizarProgresso(progressoAtual);
      novo.dados = dados || {};
      novo.atualizadoEm = new Date().toISOString();
      definirProgresso(novo);
      const s = sessao();
      if (modo() === 'nuvem' && s) {
        await chamarServidor(Object.assign({ acao: 'salvar', apelido: s.apelido, chave: s.chave,
          pedido: novoPedido() }, pacoteParaServidor(novo)));
      }
      return Placar.progresso();
    },

    async ranking() {
      if (modo() === 'nuvem' && config().urlExec) {
        try {
          const resposta = await chamarServidor({ acao: 'ranking', limite: 10 });
          return { global: true, lista: resposta.ranking };
        } catch (erro) {
          return { global: false, erro: erro.message, lista: progressoAtual.recordes };
        }
      }
      return { global: false, lista: progressoAtual.recordes };
    },

    // ---------------------------------------------------- modo nuvem: conta

    jogador() {
      const s = sessao();
      return s ? s.apelido : '';
    },

    async entrar(apelidoDigitado, pinDigitado) {
      const apelido = validarApelido(apelidoDigitado);
      if (!apelido.ok) throw new Error(apelido.erro);
      const pin = validarPin(pinDigitado);
      if (!pin.ok) throw new Error(pin.erro);
      const chave = await derivarChave(apelido.valor, pin.valor, config().pacote || 'jogo');
      const resposta = await chamarServidor({ acao: 'entrar', apelido: apelido.valor, chave });
      gravarLocal('sessao', { apelido: resposta.apelido || apelido.valor, chave });
      const juntos = mesclar(progressoAtual, resposta.progresso);
      definirProgresso(juntos);
      try {
        await chamarServidor(Object.assign({ acao: 'salvar', apelido: apelido.valor, chave,
          pedido: novoPedido() }, pacoteParaServidor(juntos)));
      } catch (erro) {
        console.warn('Placar: não consegui enviar o progresso deste aparelho.', erro.message);
      }
      avisar();
      return { novo: Boolean(resposta.novo), apelido: resposta.apelido || apelido.valor };
    },

    sair() {
      try { raiz.localStorage.removeItem(chaveLocal('sessao')); } catch (erro) { /* sem storage */ }
      avisar();
    },

    // ------------------------------------------------ modo persistente: pasta

    noAplicativo() {
      return Boolean(nativo());
    },

    pasta() {
      const n = nativo();
      if (!n) return { escolhida: false, nome: '' };
      return { escolhida: n.temPasta(), nome: n.nomeDaPasta(), arquivo: n.nomeDoArquivo() };
    },

    escolherPasta() {
      const n = nativo();
      if (!n) return Promise.reject(new Error('A pasta só pode ser escolhida no aplicativo.'));
      return new Promise((resolve, reject) => {
        esperaDaPasta = { resolve, reject };
        n.escolherPasta();
      });
    },

    _retornoDaPasta(resposta) {
      const espera = esperaDaPasta;
      esperaDaPasta = null;
      if (!resposta || !resposta.ok) {
        if (espera) espera.reject(new Error((resposta && resposta.erro) || 'Pasta não escolhida.'));
        return;
      }
      const doArquivo = lerArquivoDaPasta();
      definirProgresso(doArquivo ? mesclar(progressoAtual, doArquivo) : progressoAtual);
      avisar();
      if (espera) espera.resolve({ restaurado: Boolean(doArquivo) });
    },

    // ----------------------------- modo persistente no navegador: arquivo

    exportar() {
      return JSON.stringify(Object.assign({ jogo: config().pacote || 'jogo' }, progressoAtual), null, 2);
    },

    importar(texto) {
      let bruto;
      try {
        bruto = JSON.parse(texto);
      } catch (erro) {
        throw new Error('Esse arquivo não é um progresso válido.');
      }
      if (bruto.jogo && bruto.jogo !== (config().pacote || 'jogo')) {
        throw new Error('Esse arquivo é de outro jogo.');
      }
      definirProgresso(mesclar(progressoAtual, bruto));
      avisar();
      return Placar.progresso();
    },

    // Usado pelos testes automáticos (tests/placar.test.js).
    _interno: {
      progressoVazio, normalizarProgresso, aplicarPartida, mesclar, validarApelido, validarPin,
      dadosCabem, montarUrl, derivarChave, LIMITE_DADOS, URL_EXEC
    }
  };

  return Placar;
});
