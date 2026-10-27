import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { lerConfig, manifest, problemasDaConfig } from '../scripts/preparar.mjs';

const pasta = new URL('../docs/jogo/', import.meta.url).pathname;

test('config.js está completo e válido', () => {
  assert.deepEqual(problemasDaConfig(lerConfig()), []);
});

test('manifest e ícones foram gerados a partir do config (rode node scripts/preparar.mjs)', () => {
  const gerado = JSON.parse(readFileSync(pasta + 'manifest.webmanifest', 'utf8'));
  assert.deepEqual(gerado, manifest(lerConfig()));
  assert.ok(existsSync(pasta + 'icone-192.png'));
  assert.ok(existsSync(pasta + 'icone-512.png'));
});

test('o jogo funciona dentro do APK: caminhos relativos e placar carregado', () => {
  const htmls = readdirSync(pasta).filter((nome) => nome.endsWith('.html'));
  for (const nome of htmls) {
    const html = readFileSync(pasta + nome, 'utf8');
    assert.ok(!/(src|href)=["']\/(?!\/)/.test(html), nome + ': use caminhos relativos (sem / no começo)');
  }
  const index = readFileSync(pasta + 'index.html', 'utf8');
  for (const script of ['config.js', 'placar.js', 'placar-ui.js']) {
    assert.ok(index.includes('src="' + script + '"'), 'index.html precisa carregar ' + script);
  }
});
