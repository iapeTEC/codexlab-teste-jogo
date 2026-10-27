// Página de download: lê o config do jogo, aponta para o APK da Release mais nova,
// mostra um QR code desta página e, no modo nuvem, o ranking da planilha.
(function () {
  'use strict';
  const config = window.JOGO_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  document.title = 'Baixar ' + (config.nome || 'o jogo');
  $('nome').textContent = config.nome || 'Jogo';
  $('descricao').textContent = config.descricao || '';
  $('emoji').textContent = config.emoji || '🎮';
  if (config.cor) document.documentElement.style.setProperty('--cor', config.cor);

  /** DONO/REPOSITORIO, descoberto pelo endereço do GitHub Pages (dono.github.io/repositorio/). */
  function repositorio() {
    if (/^[\w.-]+\/[\w.-]+$/.test(config.repositorio || '')) return config.repositorio;
    const dono = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
    const pasta = location.pathname.split('/').filter(Boolean)[0];
    return dono && pasta ? dono[1] + '/' + pasta : '';
  }

  const repo = repositorio();
  if (repo) {
    $('baixar').href = 'https://github.com/' + repo + '/releases/latest/download/jogo.apk';
    fetch('https://api.github.com/repos/' + repo + '/releases/latest')
      .then((resposta) => (resposta.ok ? resposta.json() : null))
      .then((release) => {
        if (!release) return;
        const apk = (release.assets || []).find((a) => a.name === 'jogo.apk');
        const data = new Date(release.published_at).toLocaleDateString('pt-BR');
        $('versao').textContent = release.name + ' · ' + data +
          (apk ? ' · ' + Math.max(1, Math.round(apk.size / 1024)) + ' KB · ' + apk.download_count + ' downloads' : '');
      })
      .catch(() => {});
  } else {
    $('baixar').removeAttribute('href');
    $('baixar').classList.add('desligado');
    $('versao').textContent = 'O link do APK aparece quando esta página estiver no GitHub Pages.';
  }

  window.addEventListener('load', () => {
    if (typeof window.qrcode !== 'function') return;
    const qr = window.qrcode(0, 'M');
    qr.addData(location.href.split('#')[0]);
    qr.make();
    $('qr').src = qr.createDataURL(5, 2);
    $('endereco').textContent = location.href.split('#')[0];
    $('bloco-qr').hidden = false;
  });

  if (config.modo === 'nuvem' && config.urlExec && window.Placar) {
    $('bloco-ranking').hidden = false;
    const desenhar = () => window.Placar.ranking().then((resultado) => {
      const itens = (resultado.lista || []).map((linha) => {
        const item = document.createElement('li');
        const nome = document.createElement('span');
        const pontos = document.createElement('strong');
        nome.textContent = linha.apelido;
        pontos.textContent = Number(linha.pontos).toLocaleString('pt-BR');
        item.append(nome, pontos);
        return item;
      });
      if (!itens.length) {
        const vazio = document.createElement('li');
        vazio.textContent = resultado.global ? 'Ninguém pontuou ainda.' : 'Ranking indisponível agora.';
        itens.push(vazio);
      }
      $('ranking').replaceChildren(...itens);
    });
    desenhar();
    setInterval(desenhar, 60000);
  }
})();
