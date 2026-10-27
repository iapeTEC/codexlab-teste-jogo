package br.iape.jogo;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Abre o jogo (docs/jogo, copiado para assets/www) num WebView.
 *
 * O jogo é servido no endereço https://appassets.androidplatform.net/www/, e não em file://.
 * Assim ele se comporta igual ao GitHub Pages: fetch de arquivos .json, módulos e
 * localStorage funcionam do mesmo jeito nos dois lugares.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String INICIO = "https://" + HOST + "/www/index.html";

    private static final Map<String, String> TIPOS = new HashMap<>();

    static {
        TIPOS.put("html", "text/html");
        TIPOS.put("htm", "text/html");
        TIPOS.put("js", "text/javascript");
        TIPOS.put("mjs", "text/javascript");
        TIPOS.put("css", "text/css");
        TIPOS.put("json", "application/json");
        TIPOS.put("webmanifest", "application/manifest+json");
        TIPOS.put("txt", "text/plain");
        TIPOS.put("svg", "image/svg+xml");
        TIPOS.put("png", "image/png");
        TIPOS.put("jpg", "image/jpeg");
        TIPOS.put("jpeg", "image/jpeg");
        TIPOS.put("gif", "image/gif");
        TIPOS.put("webp", "image/webp");
        TIPOS.put("ico", "image/x-icon");
        TIPOS.put("mp3", "audio/mpeg");
        TIPOS.put("ogg", "audio/ogg");
        TIPOS.put("wav", "audio/wav");
        TIPOS.put("m4a", "audio/mp4");
        TIPOS.put("mp4", "video/mp4");
        TIPOS.put("woff", "font/woff");
        TIPOS.put("woff2", "font/woff2");
        TIPOS.put("ttf", "font/ttf");
    }

    private WebView web;
    private PastaDeSalvamento pasta;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        int cor = getColor(R.color.cor_jogo);

        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(cor);
        web = new WebView(this);
        web.setBackgroundColor(cor);
        raiz.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(raiz);
        ajustarBarrasDoSistema(raiz, cor);

        WebSettings ajustes = web.getSettings();
        ajustes.setJavaScriptEnabled(true);
        ajustes.setDomStorageEnabled(true);
        ajustes.setMediaPlaybackRequiresUserGesture(false);
        ajustes.setAllowFileAccess(false);
        ajustes.setAllowContentAccess(false);

        pasta = new PastaDeSalvamento(this, web);
        web.addJavascriptInterface(pasta, "AndroidSave");
        web.setWebViewClient(new Cliente());

        if (estado == null || web.restoreState(estado) == null) {
            web.loadUrl(INICIO);
        }
    }

    private void ajustarBarrasDoSistema(View raiz, int cor) {
        Window janela = getWindow();
        boolean fundoClaro = luminancia(cor) > 0.6;
        if (Build.VERSION.SDK_INT >= 30) {
            // Android 15 desenha o app por baixo das barras: o padding devolve o espaço delas.
            janela.setDecorFitsSystemWindows(false);
            raiz.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets b = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(b.left, b.top, b.right, b.bottom);
                return WindowInsets.CONSUMED;
            });
            WindowInsetsController controle = janela.getInsetsController();
            if (controle != null) {
                int claro = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controle.setSystemBarsAppearance(fundoClaro ? claro : 0, claro);
            }
        } else {
            janela.setStatusBarColor(cor);
            janela.setNavigationBarColor(cor);
            if (fundoClaro) {
                raiz.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                        | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            }
        }
    }

    private static double luminancia(int cor) {
        return (0.299 * Color.red(cor) + 0.587 * Color.green(cor) + 0.114 * Color.blue(cor)) / 255.0;
    }

    private class Cliente extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest pedido) {
            Uri url = pedido.getUrl();
            if (HOST.equals(url.getHost())) {
                return false;
            }
            // Links para fora do jogo (GitHub, sites) abrem no navegador do celular.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, url));
            } catch (ActivityNotFoundException ignorado) {
                // Sem navegador instalado: simplesmente não abre.
            }
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest pedido) {
            Uri url = pedido.getUrl();
            if (!HOST.equals(url.getHost())) {
                return null;
            }
            return servirArquivoDoJogo(url.getPath());
        }
    }

    private WebResourceResponse servirArquivoDoJogo(String caminho) {
        if (caminho == null || caminho.contains("..")) {
            return naoEncontrado();
        }
        if (caminho.endsWith("/")) {
            caminho = caminho + "index.html";
        }
        String noApk = caminho.startsWith("/") ? caminho.substring(1) : caminho;
        String extensao = noApk.contains(".")
                ? noApk.substring(noApk.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT)
                : "";
        String tipo = TIPOS.containsKey(extensao) ? TIPOS.get(extensao) : "application/octet-stream";
        try {
            InputStream conteudo = getAssets().open(noApk);
            Map<String, String> cabecalhos = new HashMap<>();
            cabecalhos.put("Cache-Control", "no-cache");
            cabecalhos.put("Access-Control-Allow-Origin", "*");
            String codificacao = tipo.startsWith("text/") || tipo.contains("json") || tipo.contains("svg")
                    ? "UTF-8" : null;
            return new WebResourceResponse(tipo, codificacao, 200, "OK", cabecalhos, conteudo);
        } catch (IOException e) {
            return naoEncontrado();
        }
    }

    private static WebResourceResponse naoEncontrado() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                new HashMap<>(), new ByteArrayInputStream("não encontrado".getBytes()));
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent dados) {
        if (!pasta.aoEscolherPasta(pedido, resultado, dados)) {
            super.onActivityResult(pedido, resultado, dados);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
