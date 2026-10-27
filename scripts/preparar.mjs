#!/usr/bin/env node
// Confere docs/jogo/config.js e gera, a partir dele, o manifest da PWA e os ícones PNG.
// Rode sempre que mudar o config:   node scripts/preparar.mjs
// Só conferir, sem gerar nada:       node scripts/preparar.mjs --conferir
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA_JOGO = join(RAIZ, 'docs', 'jogo');

export const MODOS = ['local', 'persistente', 'nuvem'];
export const ORIENTACOES = ['retrato', 'paisagem', 'livre'];
export const URL_EXEC = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

/** Lê o objeto JSON de config.js do mesmo jeito que o Gradle lê (do primeiro { ao último }). */
export function lerConfig(caminho = join(PASTA_JOGO, 'config.js')) {
  const texto = readFileSync(caminho, 'utf8');
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio < 0 || fim < inicio) throw new Error('config.js precisa ter um objeto { ... }.');
  try {
    return JSON.parse(texto.slice(inicio, fim + 1));
  } catch (erro) {
    throw new Error('config.js não está em formato JSON (aspas duplas, sem vírgula sobrando): ' + erro.message);
  }
}

export function problemasDaConfig(c) {
  const problemas = [];
  if (typeof c.nome !== 'string' || !/^[\p{L}\p{N} !?.,:'’-]{1,30}$/u.test(c.nome)) {
    problemas.push('nome: de 1 a 30 caracteres (letras, números, espaço e . , ! ? : \' -).');
  }
  if (typeof c.pacote !== 'string' || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(c.pacote) || c.pacote.length > 100) {
    problemas.push('pacote: algo como io.github.seuusuario.nomedojogo (minúsculas, sem hífen; troque - por _).');
  }
  if (!MODOS.includes(c.modo)) problemas.push('modo: use "local", "persistente" ou "nuvem".');
  if (c.modo === 'nuvem' && !URL_EXEC.test(String(c.urlExec || ''))) {
    problemas.push('urlExec: no modo nuvem, cole a URL do Apps Script terminada em /exec.');
  }
  if (c.urlExec && !URL_EXEC.test(String(c.urlExec))) {
    problemas.push('urlExec: precisa ser https://script.google.com/macros/s/.../exec');
  }
  if (typeof c.cor !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(c.cor)) problemas.push('cor: use o formato #RRGGBB.');
  if (!ORIENTACOES.includes(c.orientacao)) problemas.push('orientacao: use "retrato", "paisagem" ou "livre".');
  if (typeof c.emoji !== 'string' || c.emoji.length < 1 || c.emoji.length > 8) problemas.push('emoji: um emoji.');
  if (typeof c.descricao !== 'string' || c.descricao.length > 160) problemas.push('descricao: até 160 caracteres.');
  return problemas;
}

export function manifest(c) {
  return {
    name: c.nome,
    short_name: c.nome.slice(0, 12),
    description: c.descricao,
    lang: 'pt-BR',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: c.orientacao === 'paisagem' ? 'landscape' : c.orientacao === 'retrato' ? 'portrait' : 'any',
    background_color: c.cor,
    theme_color: c.cor,
    icons: [
      { src: 'icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: 'icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ]
  };
}

// ------------------------------------------------------------- ícone em PNG

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

/** Fundo na cor do jogo, círculo branco e um "play" vazado no meio. */
export function iconePng(tamanho, corHex) {
  const fundo = [1, 3, 5].map((i) => parseInt(corHex.slice(i, i + 2), 16));
  const linhas = [];
  const amostras = 4;
  const dentroDoTriangulo = (x, y) => {
    const [ax, ay, bx, by, cx, cy] = [0.42, 0.34, 0.42, 0.66, 0.68, 0.5];
    const lado = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    const d1 = lado(x, y, ax, ay, bx, by);
    const d2 = lado(x, y, bx, by, cx, cy);
    const d3 = lado(x, y, cx, cy, ax, ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  for (let py = 0; py < tamanho; py++) {
    const linha = Buffer.alloc(1 + tamanho * 4);
    for (let px = 0; px < tamanho; px++) {
      let branco = 0;
      for (let sy = 0; sy < amostras; sy++) {
        for (let sx = 0; sx < amostras; sx++) {
          const x = (px + (sx + 0.5) / amostras) / tamanho;
          const y = (py + (sy + 0.5) / amostras) / tamanho;
          const noCirculo = (x - 0.5) ** 2 + (y - 0.5) ** 2 <= 0.3 ** 2;
          if (noCirculo && !dentroDoTriangulo(x, y)) branco++;
        }
      }
      const t = branco / (amostras * amostras);
      const o = 1 + px * 4;
      for (let i = 0; i < 3; i++) linha[o + i] = Math.round(fundo[i] * (1 - t) + 255 * t);
      linha[o + 3] = 255;
    }
    linhas.push(linha);
  }
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(tamanho, 0);
  cabecalho.writeUInt32BE(tamanho, 4);
  cabecalho[8] = 8;
  cabecalho[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', cabecalho),
    bloco('IDAT', deflateSync(Buffer.concat(linhas), { level: 9 })),
    bloco('IEND', Buffer.alloc(0))
  ]);
}

function principal() {
  const soConferir = process.argv.includes('--conferir');
  const config = lerConfig();
  const problemas = problemasDaConfig(config);
  if (problemas.length) {
    console.error('Arrume docs/jogo/config.js:\n- ' + problemas.join('\n- '));
    process.exit(1);
  }
  if (soConferir) {
    console.log('config.js OK');
    return;
  }
  writeFileSync(join(PASTA_JOGO, 'manifest.webmanifest'), JSON.stringify(manifest(config), null, 2) + '\n');
  writeFileSync(join(PASTA_JOGO, 'icone-192.png'), iconePng(192, config.cor));
  writeFileSync(join(PASTA_JOGO, 'icone-512.png'), iconePng(512, config.cor));
  console.log('Pronto: config conferida, manifest.webmanifest e ícones gerados para "' + config.nome + '".');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) principal();
