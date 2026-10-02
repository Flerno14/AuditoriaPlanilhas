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

Os arquivos são processados localmente. O Electron chama o Python como um processo filho e transfere somente os dados necessários para as operações.

## Distribuição

O instalador Windows inclui o aplicativo Electron e a ponte Python empacotada; a máquina de quem instala não precisa ter Python, Node.js ou bibliotecas Python. Para compilar, use Windows com Python 3.10+, Node.js/npm e Inno Setup 6 instalado (com `ISCC.exe` no `PATH`). Na pasta do projeto, execute:

```powershell
npm run build:windows
```

Para gerar somente a versao portatil, sem Inno Setup, execute `npm run build:portable`. O arquivo `release/AuditoriaDePlanilhas-Portable-1.0.0.zip` pode ser extraido em uma pasta e iniciado por `Auditoria de Planilhas.exe`. O instalador Inno Setup instala para o usuario atual e nao exige permissao de administrador.

O script instala as dependências, gera `dist/python/bridge.exe` com PyInstaller, empacota o Electron em `release/win-unpacked` e cria `release/installer/AuditoriaDePlanilhas-Setup-1.0.0.exe` com Inno Setup. O build também pode ser executado em etapas com `npm run build:python`, `npm run build:electron` e `ISCC.exe installer/AuditoriaPlanilhas.iss`.

No modo de desenvolvimento, `electron/main.js` inicia `python/bridge.py` usando `PYTHON` ou o comando Python do sistema. No aplicativo instalado, inicia `resources/python/bridge.exe` sem depender de Python no computador.

    Get-ExecutionPolicy

---

    Set-ExecutionPolicy RemoteSigned -Scope CurrentUser



