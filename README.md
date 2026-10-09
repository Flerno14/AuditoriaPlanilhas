# Auditoria de Planilhas

Aplicativo desktop para comparar duas planilhas Excel, revisar diferenças e salvar uma cópia corrigida. A interface é feita com Electron, HTML e CSS. A leitura, comparação e geração dos arquivos continuam usando a lógica Python existente em `app_corrigido.py`.

## Requisitos

- Node.js e npm
- Python 3.10 ou superior

## Executar durante o desenvolvimento

Na pasta do projeto, instale as dependências da interface e as bibliotecas Python:

```powershell
npm install
python -m pip install -r requirements.txt
npm start
```

Se o comando `python` não apontar para a instalação correta, defina `PYTHON` com o caminho do executável antes de iniciar:

```powershell
$env:PYTHON = "C:\Program Files\Python314\python.exe"
npm start
```

Selecione o arquivo original e o modificado, escolha uma aba comum e clique em **Comparar planilhas**. Clique em uma célula da coluna **Decisão** para escolher entre manter o Arquivo 1, usar o Arquivo 2 ou deixar pendente. **Aplicar** define a mesma escolha para todas as diferenças.

O aplicativo exporta o relatório de diferenças, as escolhas aplicadas, uma cópia do Arquivo 1 com as alterações escolhidas e o arquivo corrigido com as linhas novas do Arquivo 2. Arquivos `.xlsm` mantêm as macros ao gerar a cópia corrigida.

## Estrutura

- `electron/`: janela, diálogos nativos do sistema e comunicação segura com a interface.
- `renderer/`: interface visual do aplicativo.
- `python/bridge.py`: protocolo JSON Lines entre Electron e Python.
- `app_corrigido.py`: lógica de leitura, comparação e geração de planilhas.

Os arquivos são processados localmente. O Electron chama o Python como um processo filho e transfere somente os dados necessários para as operações. Apenas a verificação e o download de atualizações usam a rede; as planilhas não são enviadas ao GitHub.

## Distribuição

O instalador Windows inclui o aplicativo Electron e a ponte Python empacotada; a máquina de quem instala não precisa ter Python, Node.js ou bibliotecas Python. Para compilar, use Windows com Python 3.10+ e Node.js/npm. O electron-builder obtém as ferramentas NSIS automaticamente; Inno Setup não é necessário. Na pasta do projeto, execute:

```powershell
npm run build:windows
```

Para gerar somente a versão portátil, execute `npm run build:portable`. O arquivo `release/AuditoriaDePlanilhas-Portable-<versão>.zip` pode ser extraído em uma pasta e iniciado por `Auditoria de Planilhas.exe`. O instalador NSIS instala para o usuário atual e não exige permissão de administrador.

O script instala as dependências, gera `dist/python/bridge.exe` com PyInstaller e empacota o Electron em `release/win-unpacked`. O build completo também gera o ZIP portátil e os seguintes artefatos pelo electron-builder:

- `release/AuditoriaDePlanilhas-Setup-<versão>.exe`: instalador NSIS.
- `release/AuditoriaDePlanilhas-Setup-<versão>.exe.blockmap`: dados para download diferencial.
- `release/latest.yml`: versão, nome, tamanho e hash do instalador para atualização.

A versão de todos os artefatos vem de `package.json`. Para incrementá-la e sincronizar o lockfile, use `npm version patch --no-git-tag-version` (ou `minor`/`major`). Não edite versões em scripts de build.

Com as dependências instaladas e PyInstaller disponível no PATH, o build pode ser executado em etapas com `npm run build:python` e `npm run build:electron`. Para gerar apenas a pasta do aplicativo na segunda etapa, use `npm run build:electron:dir`.

### Atualizações pelo aplicativo

Em **Configurações → Atualizações**, a versão atual vem de `app.getVersion()` (a mesma de `package.json`). Clique em **Verificar atualizações**, depois em **Baixar atualização** e, após concluir, em **Instalar e reiniciar**. Salve seu trabalho antes de confirmar a instalação: decisões e configurações não salvas não são restauradas após reiniciar. A instalação aguarda o término do processamento das planilhas.

O `electron-updater` consulta releases estáveis publicadas de `Flerno14/AuditoriaPlanilhas`, aceita somente versões semanticamente maiores, verifica a integridade do download e usa atualização diferencial quando disponível. Rascunhos e pré-releases não são oferecidos. A verificação e o download são manuais; fechar o aplicativo não instala uma atualização pendente. A interface usa apenas a ponte IPC e não recebe tokens, URLs de download ou caminhos de instaladores. Falhas ficam em `app.getPath('userData')/updates.log`.

As atualizações ficam desabilitadas em `npm start` e na cópia portátil; use uma instalação NSIS para testar o ciclo completo. Instalações antigas feitas com Inno Setup precisam ser desinstaladas antes da instalação NSIS; não há migração automática entre os instaladores. O ZIP portátil permanece destinado à substituição manual. Uma versão antiga sem o atualizador precisa receber a primeira instalação NSIS manualmente.

### Publicar uma versão no GitHub

O campo `build.publish` aponta para GitHub Releases de `Flerno14/AuditoriaPlanilhas`. Os comandos `build:*` continuam locais (`--publish never`). O workflow `.github/workflows/release.yml`, acionado por tags `v*`, instala dependências, executa `npm test`, empacota a ponte Python e usa `npm run publish:electron` para enviar o instalador NSIS, `.blockmap` e `latest.yml` a uma release em rascunho. Depois de conferir todos os arquivos, publica a release como estável. Se qualquer etapa falhar, a release permanece em rascunho e não é oferecida aos usuários.

Antes da primeira publicação, envie estes arquivos de código e o workflow ao repositório. Para a versão atual, crie e envie a tag `v1.0.3` no commit correspondente. Para versões seguintes, incremente a versão, faça commit do `package.json` e do lockfile e envie a nova tag:

```powershell
npm version patch --no-git-tag-version
# Faça commit das alterações antes de criar a tag.
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
git tag "v$version"
git push origin "v$version"
```

A tag precisa corresponder exatamente à versão estável em `package.json`; versões já publicadas não são sobrescritas. O workflow usa o `GITHUB_TOKEN` temporário com permissão `contents: write`. As releases precisam estar acessíveis publicamente para a atualização sem autenticação; não distribua tokens privados dentro do aplicativo.

Para publicar manualmente, prepare `dist/python/bridge.exe`, disponibilize `GH_TOKEN` no ambiente e execute `npm run publish:electron`. Esse comando cria/envia para um rascunho: confira os três artefatos no GitHub e publique a release para torná-la detectável. Não grave tokens no projeto. Veja a [documentação de publicação do electron-builder 26](https://www.electron.build/v26/docs/publish/).

### Assinatura digital e validação

Recomenda-se assinar o aplicativo e o instalador antes de distribuir. Configure os secrets `CSC_LINK` (certificado de assinatura em Base64 ou localização aceita pelo electron-builder) e `CSC_KEY_PASSWORD` no repositório. Quando o certificado estiver configurado, o workflow exige assinatura bem-sucedida (`forceCodeSigning=true`); sem ele, gera artefatos sem assinatura e registra um aviso. Não há certificado incluído no projeto. Mantenha a identidade do editor nas próximas versões para a verificação de assinatura do atualizador. A validação padrão de assinatura do Windows não foi desativada; um build sem certificado não oferece a mesma garantia de identidade do editor.

Execute `npm test` para validar o fluxo de atualização. Para testar ponta a ponta, instale uma versão NSIS e publique uma versão maior com os três artefatos. Verifique download, confirmação de reinício e manutenção das preferências. Consulte a [documentação de atualização](https://www.electron.build/v26/docs/features/auto-update/) e a [documentação de assinatura digital](https://www.electron.build/v26/docs/features/code-signing/).

No modo de desenvolvimento, `electron/main.js` inicia `python/bridge.py` usando `PYTHON` ou o comando Python do sistema. No aplicativo instalado, inicia `resources/python/bridge.exe` sem depender de Python no computador.

    Get-ExecutionPolicy

---

    Set-ExecutionPolicy RemoteSigned -Scope CurrentUser



