// Permite instalar o jogo pelo navegador ("Adicionar à tela inicial") e jogar sem internet.
// Dentro do APK não é necessário: lá o jogo já é um aplicativo.
(function () {
  'use strict';
  const dentroDoApk = location.hostname === 'appassets.androidplatform.net' || Boolean(window.AndroidSave);
  if (dentroDoApk || location.protocol !== 'https:' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((erro) => console.warn('PWA indisponível:', erro));
  });
})();
