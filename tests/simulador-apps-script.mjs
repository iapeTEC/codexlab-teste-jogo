// Simula o Google (Planilha, Cache, Lock...) para testar apps-script/Code.gs sem internet.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function novaAba(nome) {
  const linhas = [];
  const aba = {
    nome,
    linhas,
    getLastRow: () => linhas.length,
    appendRow: (valores) => { linhas.push(valores.slice()); },
    setFrozenRows: () => {},
    getRange(linha, coluna, numLinhas = 1, numColunas = 1) {
      if (typeof linha === 'string') return { setNumberFormat: () => {} };
      const ler = () => Array.from({ length: numLinhas }, (_, i) =>
        Array.from({ length: numColunas }, (_, j) => {
          const valor = (linhas[linha - 1 + i] || [])[coluna - 1 + j];
          return valor === undefined ? '' : valor;
        }));
      return {
        getValues: ler,
        getDisplayValues: () => ler().map((l) => l.map(String)),
        setNumberFormat: () => {},
        setValues(valores) {
          valores.forEach((valoresDaLinha, i) => {
            const alvo = linha - 1 + i;
            while (linhas.length <= alvo) linhas.push([]);
            valoresDaLinha.forEach((valor, j) => { linhas[alvo][coluna - 1 + j] = valor; });
          });
        }
      };
    }
  };
  return aba;
}

export function carregarAppsScript(caminho) {
  const abas = new Map();
  const cache = new Map();
  const propriedades = new Map();
  const planilha = {
    getSheetByName: (nome) => abas.get(nome) || null,
    insertSheet(nome) {
      const aba = novaAba(nome);
      abas.set(nome, aba);
      return aba;
    }
  };
  const contexto = vm.createContext({
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => planilha },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    CacheService: {
      getScriptCache: () => ({
        get: (chave) => (cache.has(chave) ? cache.get(chave) : null),
        put: (chave, valor) => { cache.set(chave, String(valor)); },
        remove: (chave) => { cache.delete(chave); }
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (chave) => (propriedades.has(chave) ? propriedades.get(chave) : null),
        setProperty: (chave, valor) => { propriedades.set(chave, String(valor)); }
      })
    },
    ContentService: {
      MimeType: { JAVASCRIPT: 'javascript', JSON: 'json' },
      createTextOutput(texto) {
        return { texto, tipo: '', setMimeType(tipo) { this.tipo = tipo; return this; }, getContent() { return this.texto; } };
      }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      getUuid: () => randomUUID(),
      computeDigest: (algoritmo, texto) =>
        Array.from(createHash(algoritmo).update(texto, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b))
    }
  });
  vm.runInContext(readFileSync(caminho, 'utf8'), contexto, { filename: 'Code.gs' });

  function chamar(parametros) {
    const saida = contexto.doGet({ parameter: parametros });
    let texto = saida.getContent();
    if (parametros.callback && saida.tipo === 'javascript') {
      const prefixo = parametros.callback + '(';
      if (!texto.startsWith(prefixo) || !texto.endsWith(');')) throw new Error('JSONP malformado: ' + texto);
      texto = texto.slice(prefixo.length, -2);
    }
    return { tipo: saida.tipo, corpo: JSON.parse(texto) };
  }

  return { contexto, abas, cache, chamar };
}
