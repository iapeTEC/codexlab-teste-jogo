package br.iape.jogo;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Modo "persistente": guarda o progresso num arquivo dentro de uma pasta do celular
 * (por exemplo, Documents) escolhida pelo jogador.
 *
 * O arquivo continua lá quando o app é apagado. Depois de reinstalar, o jogador escolhe a
 * mesma pasta e o jogo encontra o arquivo antigo. O Android exige essa escolha: um app
 * reinstalado não pode ler sozinho arquivos criados pela instalação anterior.
 *
 * No JavaScript, este objeto aparece como window.AndroidSave (só dentro do APK).
 */
public class PastaDeSalvamento {
    static final int PEDIDO_PASTA = 4242;
    private static final int LIMITE_BYTES = 65536;
    private static final String PREFERENCIAS = "pasta-de-salvamento";
    private static final String CHAVE_ARVORE = "arvore";
    private static final int PERMISSOES = Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    private final Activity atividade;
    private final WebView web;
    private final ContentResolver resolver;
    private final SharedPreferences preferencias;
    private final String nomeDoArquivo;

    PastaDeSalvamento(Activity atividade, WebView web) {
        this.atividade = atividade;
        this.web = web;
        this.resolver = atividade.getContentResolver();
        this.preferencias = atividade.getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE);
        this.nomeDoArquivo = "progresso-" + atividade.getPackageName() + ".json";
    }

    /** Pasta escolhida que ainda tem permissão de leitura e escrita; senão, null. */
    private Uri arvore() {
        String salvo = preferencias.getString(CHAVE_ARVORE, null);
        if (salvo == null) {
            return null;
        }
        Uri uri = Uri.parse(salvo);
        for (UriPermission permissao : resolver.getPersistedUriPermissions()) {
            if (permissao.getUri().equals(uri) && permissao.isReadPermission()
                    && permissao.isWritePermission()) {
                return uri;
            }
        }
        return null;
    }

    @JavascriptInterface
    public boolean temPasta() {
        return arvore() != null;
    }

    @JavascriptInterface
    public String nomeDaPasta() {
        Uri arvore = arvore();
        if (arvore == null) {
            return "";
        }
        String id = DocumentsContract.getTreeDocumentId(arvore);
        int doisPontos = id.indexOf(':');
        String nome = doisPontos >= 0 ? id.substring(doisPontos + 1) : id;
        return nome.isEmpty() ? "memória interna" : nome;
    }

    @JavascriptInterface
    public String nomeDoArquivo() {
        return nomeDoArquivo;
    }

    @JavascriptInterface
    public void escolherPasta() {
        atividade.runOnUiThread(() -> {
            Intent pedido = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            pedido.addFlags(PERMISSOES | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            pedido.putExtra(DocumentsContract.EXTRA_INITIAL_URI, DocumentsContract.buildDocumentUri(
                    "com.android.externalstorage.documents", "primary:Documents"));
            try {
                atividade.startActivityForResult(pedido, PEDIDO_PASTA);
            } catch (ActivityNotFoundException e) {
                avisarJogo(false, false, "Este aparelho não tem o seletor de pastas.");
            }
        });
    }

    boolean aoEscolherPasta(int pedido, int resultado, Intent dados) {
        if (pedido != PEDIDO_PASTA) {
            return false;
        }
        if (resultado != Activity.RESULT_OK || dados == null || dados.getData() == null) {
            avisarJogo(false, false, "Nenhuma pasta foi escolhida.");
            return true;
        }
        Uri escolhida = dados.getData();
        try {
            resolver.takePersistableUriPermission(escolhida, PERMISSOES);
        } catch (SecurityException e) {
            avisarJogo(false, false, "O Android não deu permissão para essa pasta. Tente outra.");
            return true;
        }
        String anterior = preferencias.getString(CHAVE_ARVORE, null);
        preferencias.edit().putString(CHAVE_ARVORE, escolhida.toString()).apply();
        if (anterior != null && !anterior.equals(escolhida.toString())) {
            try {
                resolver.releasePersistableUriPermission(Uri.parse(anterior), PERMISSOES);
            } catch (SecurityException ignorado) {
                // A permissão antiga já não existia.
            }
        }
        avisarJogo(true, acharArquivo(escolhida) != null, "");
        return true;
    }

    private Uri acharArquivo(Uri arvore) {
        String raiz = DocumentsContract.getTreeDocumentId(arvore);
        Uri filhos = DocumentsContract.buildChildDocumentsUriUsingTree(arvore, raiz);
        String[] colunas = {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME
        };
        try (Cursor cursor = resolver.query(filhos, colunas, null, null, null)) {
            while (cursor != null && cursor.moveToNext()) {
                if (nomeDoArquivo.equals(cursor.getString(1))) {
                    return DocumentsContract.buildDocumentUriUsingTree(arvore, cursor.getString(0));
                }
            }
        } catch (RuntimeException e) {
            return null;
        }
        return null;
    }

    /** Conteúdo do arquivo de progresso, ou "" se ainda não existe. */
    @JavascriptInterface
    public synchronized String ler() {
        Uri arvore = arvore();
        if (arvore == null) {
            return "";
        }
        Uri arquivo = acharArquivo(arvore);
        if (arquivo == null) {
            return "";
        }
        try (InputStream entrada = resolver.openInputStream(arquivo)) {
            if (entrada == null) {
                return "";
            }
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] bloco = new byte[4096];
            int lidos;
            while ((lidos = entrada.read(bloco)) != -1) {
                bytes.write(bloco, 0, lidos);
                if (bytes.size() > LIMITE_BYTES) {
                    return "";
                }
            }
            return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

    @JavascriptInterface
    public synchronized boolean escrever(String conteudo) {
        if (conteudo == null) {
            return false;
        }
        byte[] bytes = conteudo.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > LIMITE_BYTES) {
            return false;
        }
        Uri arvore = arvore();
        if (arvore == null) {
            return false;
        }
        try {
            Uri arquivo = acharArquivo(arvore);
            if (arquivo == null) {
                Uri pasta = DocumentsContract.buildDocumentUriUsingTree(
                        arvore, DocumentsContract.getTreeDocumentId(arvore));
                // application/octet-stream: o Android mantém o nome exatamente como pedimos.
                arquivo = DocumentsContract.createDocument(
                        resolver, pasta, "application/octet-stream", nomeDoArquivo);
                if (arquivo == null) {
                    return false;
                }
            }
            try (OutputStream saida = abrirParaSobrescrever(arquivo)) {
                if (saida == null) {
                    return false;
                }
                saida.write(bytes);
                saida.flush();
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private OutputStream abrirParaSobrescrever(Uri arquivo) throws FileNotFoundException {
        try {
            return resolver.openOutputStream(arquivo, "wt");
        } catch (IllegalArgumentException | FileNotFoundException e) {
            return resolver.openOutputStream(arquivo, "w");
        }
    }

    private void avisarJogo(boolean ok, boolean encontrouArquivo, String erro) {
        JSONObject resposta = new JSONObject();
        try {
            resposta.put("ok", ok);
            resposta.put("encontrou", encontrouArquivo);
            resposta.put("erro", erro);
        } catch (JSONException ignorado) {
            // put com tipos simples não falha.
        }
        String js = "window.Placar && window.Placar._retornoDaPasta(" + resposta + ")";
        atividade.runOnUiThread(() -> web.evaluateJavascript(js, null));
    }
}
