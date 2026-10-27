// Este projeto Android só embala o jogo de docs/jogo num WebView. Não edite o jogo aqui:
// edite docs/jogo. Nome, pacote, cor e orientação vêm de docs/jogo/config.js.
import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
}

val arquivoConfig = rootProject.file("../docs/jogo/config.js")
val textoConfig = arquivoConfig.readText()
@Suppress("UNCHECKED_CAST")
val config = JsonSlurper().parseText(
    textoConfig.substring(textoConfig.indexOf('{'), textoConfig.lastIndexOf('}') + 1)
) as Map<String, Any?>

fun textoDaConfig(chave: String, padrao: String): String =
    (config[chave] as? String)?.takeIf { it.isNotBlank() } ?: padrao

val nomeDoJogo = textoDaConfig("nome", "Meu Jogo")
val pacoteDoJogo = textoDaConfig("pacote", "br.iape.jogo.exemplo")
val corDoJogo = textoDaConfig("cor", "#2F6FDB")
val orientacao = when (textoDaConfig("orientacao", "retrato")) {
    "paisagem" -> "sensorLandscape"
    "livre" -> "unspecified"
    else -> "sensorPortrait"
}
// O GitHub Actions numera cada compilação; o número vira a versão do APK.
val numeroDaVersao = (System.getenv("VERSAO") ?: "1").toIntOrNull() ?: 1

val chaveArquivo = System.getenv("ANDROID_CHAVE_ARQUIVO")?.takeIf { it.isNotBlank() }
val chaveSenha = System.getenv("ANDROID_CHAVE_SENHA") ?: ""

android {
    namespace = "br.iape.jogo"
    compileSdk = 36

    defaultConfig {
        applicationId = pacoteDoJogo
        minSdk = 26
        targetSdk = 35
        versionCode = numeroDaVersao
        versionName = "1.$numeroDaVersao"
        resValue("string", "app_name", nomeDoJogo.replace("\\", "\\\\").replace("'", "\\'").replace("\"", "\\\""))
        resValue("color", "cor_jogo", corDoJogo)
        manifestPlaceholders["orientacao"] = orientacao
    }

    signingConfigs {
        if (chaveArquivo != null) {
            create("jogo") {
                storeFile = file(chaveArquivo)
                storeType = "pkcs12"
                storePassword = chaveSenha
                keyAlias = "jogo"
                keyPassword = chaveSenha
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Sem a chave guardada nos Secrets do GitHub, usa a chave de depuração (temporária).
            signingConfig = signingConfigs.findByName("jogo") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("jogo-assets"))
}

// Copia o jogo (docs/jogo) para dentro do APK, em assets/www.
val copiarJogo by tasks.registering(Sync::class) {
    from(rootProject.file("../docs/jogo"))
    into(layout.buildDirectory.dir("jogo-assets/www"))
}
tasks.named("preBuild") { dependsOn(copiarJogo) }
