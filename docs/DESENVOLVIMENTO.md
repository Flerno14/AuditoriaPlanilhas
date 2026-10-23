# Desenvolvimento e distribuição

[Voltar ao guia de uso](../README.md) · [Regras do projeto](../AGENTS.md)

Este documento reúne preparação do ambiente, arquitetura, testes e publicação. Para alterar o projeto, leia também as regras de AGENTS.md.

## 1. Preparar o ambiente

Use Node.js/npm e Python 3.10 ou superior. O build do instalador requer Windows e Inno Setup 6 (`ISCC.exe` no `PATH`); a versão portátil dispensa Inno Setup.

Na pasta do projeto, instale as dependências da interface e as bibliotecas Python:

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm start
```

O aplicativo usa automaticamente `.venv`, sem precisar ativá-lo. Para escolher outro interpretador, defina `PYTHON` com o caminho do executável antes de iniciar e instale `requirements.txt` nesse mesmo Python. A variável `PYTHON` tem prioridade sobre `.venv`:

```powershell
$env:PYTHON = "C:\Program Files\Python314\python.exe"
npm start
```

No modo de desenvolvimento, `electron/main.js` inicia `python/bridge.py` usando `PYTHON`, depois `.venv` quando disponível e, por último, o comando Python do sistema. No aplicativo instalado, inicia `resources/python/bridge.exe` sem depender de Python no computador.

## 2. Conhecer a arquitetura

- `electron/main.js`: janela, diálogos nativos, preferências, sessões, IPC e processo Python.
- `electron/preload.js`: API limitada entre interface e processo principal.
- `renderer/`: interface em português, revisão, filtros e paginação.
- `python/bridge.py`: protocolo JSON Lines entre Electron e Python.
- `app_corrigido.py`: leitura, comparação e geração de planilhas.
- `python/translation_audit.py`: análise de traduções, relatório e cópia corrigida.
- `scripts/build-windows.ps1` e `installer/AuditoriaPlanilhas.iss`: distribuição Windows.

O processamento é local. O fluxo é renderer → preload → Electron/IPC → ponte Python → lógica de planilhas. O `stdout` da ponte é reservado ao protocolo JSON Lines; diagnóstico deve usar `stderr`. As regras completas de segurança, cache, persistência e compatibilidade estão em [AGENTS.md](../AGENTS.md).

### Processamento, cache e persistência

Os detalhes e a prévia de linhas novas reutilizam os dados da comparação em um cache local na memória do Python, limitado a um par de abas e a 64 MiB estimados. Isso evita interpretar o Excel novamente a cada abertura. Os conteúdos dos arquivos continuam sendo verificados por SHA-256 em cada consulta; arquivos modificados ou ausentes bloqueiam a exibição. Mudanças de contexto substituem o cache, e dados acima do limite são processados sem ficar armazenados nele.

A tabela mostra 50 diferenças por página por padrão, com opções de 100 ou 250. A busca é aplicada após uma pausa de 200 ms na digitação. Filtros e aplicações em massa abrangem todas as páginas; **Próxima pendência** abre a página do item encontrado. As decisões são mantidas ao navegar. Os resultados dos filtros são reutilizados durante a paginação.

Durante operações Python, a tela de processamento informa a etapa atual e permite **Cancelar processamento**. O cancelamento encerra o processo Python e interrompe todas as solicitações pendentes; a próxima operação inicia um processo novo. A última sessão já salva é preservada. Operações têm limite de 10 minutos, com interrupção real ao excedê-lo. A indicação é por etapas, sem estimativa percentual. A leitura e o relatório completo ainda ficam em memória: a paginação reduz os elementos da tabela, mas não elimina o custo de processar arquivos muito grandes.

A última sessão de auditoria é salva automaticamente neste computador após uma comparação válida. Decisões, aplicações em massa e desfazer são agrupados por 250 ms sem novas alterações, salvando a revisão mais recente. Se houver uma gravação em andamento, as alterações seguintes são reunidas em uma única revisão pendente. Ao reabrir o aplicativo, os arquivos, a aba, as regras de comparação e as decisões são retomados automaticamente. A faixa de sessão distingue alterações aguardando salvamento, gravação em andamento e revisão salva. **Salvar sessão** salva imediatamente e permite tentar novamente após uma falha; **Retomar sessão** repete a recuperação. Uma nova comparação válida substitui a sessão anterior; não há histórico de múltiplas sessões.

Ao fechar normalmente, o aplicativo antecipa o salvamento pendente e aguarda sua conclusão. Se houver falha, a janela permanece aberta para tentar novamente. A gravação em disco é assíncrona, preservando a substituição do arquivo por uma cópia temporária; encerramentos forçados ainda podem perder alterações não salvas.

Para retomar, os arquivos de origem precisam continuar nos mesmos caminhos e com o mesmo conteúdo. Se forem alterados ou estiverem indisponíveis, o aplicativo exibe um erro e mantém a sessão salva. Restaure os arquivos originais e use **Retomar sessão**, ou selecione os arquivos atuais e faça uma nova comparação. A geração do Excel também verifica se os arquivos mudaram desde a revisão. A sessão fica em `audit-session.json` na pasta de dados do aplicativo do usuário, com os valores das diferenças e decisões, sem enviar dados para serviços externos. O fechamento normal aguarda o salvamento; encerramentos forçados podem perder a última gravação ainda em andamento.

## 3. Preparar a análise semântica opcional

Sem modelo, o aplicativo executa somente alertas objetivos e mostra **Não calculada** na proximidade. Para habilitar o modelo no ambiente de desenvolvimento, instale no mesmo Python usado pelo Electron:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-translation.txt
.\.venv\Scripts\python.exe -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2').save('models/translation-minilm')"
```

O segundo comando baixa os pesos uma vez e precisa de internet. Na tela, use **Selecionar modelo local** e escolha a pasta gerada. A análise usa CPU, não baixa modelos automaticamente e não envia textos à internet. Não adicione os pesos ao Git. A distribuição padrão continua sem as dependências e pesos opcionais de IA; o empacotamento do modo semântico ainda precisa de validação específica.

Consulte [Auditar traduções](../README.md#auditar-traducoes) para selecionar o modelo e interpretar as notas. Glossário, segmentação de textos longos e alinhamento entre arquivos separados não fazem parte desta versão. A utilidade das notas precisa ser calibrada com traduções revisadas do domínio de uso.

## 4. Executar os testes

Execute `npm test` para rodar os testes JavaScript e Python. O comando usa o interpretador definido em `PYTHON`, quando informado; caso contrário, prefere `.venv` e depois o Python do sistema. Instale as dependências de `requirements.txt` nesse interpretador antes de executar. Não há bibliotecas de teste adicionais.

Os testes usam planilhas sintéticas e arquivos temporários, sem alterar as planilhas de usuário. Cobrem comparação, decisões em massa com filtros, estruturas, sessões, transporte JSON de datas e geração de Excel com estilos e fórmulas preservados. O teste de `.xlsm` verifica a preservação do componente VBA, sem executar macros. Os testes da interface usam uma simulação do DOM e da ponte desktop; a aparência e os diálogos nativos ainda exigem verificação manual no Electron.

Para executar separadamente: `node --test tests/*.test.js` e `python -m unittest discover -s tests -p "test_*.py" -v`.

## 5. Definir a versão do lançamento

Use um dos comandos abaixo **antes de gerar um novo lançamento**. Eles atualizam `package.json` e `package-lock.json`, sem criar commit ou tag Git:

| Tipo de mudança | Comando | Exemplo |
| --- | --- | --- |
| Atualização habitual: incrementa a última parte | `npm version patch --no-git-tag-version` | `1.1.2` → `1.1.3` |
| Mudança grande: incrementa a segunda parte e zera a última | `npm version minor --no-git-tag-version` | `1.1.3` → `1.2.0` |
| Mudança muito grande: incrementa a primeira parte e zera as demais | `npm version major --no-git-tag-version` | `1.2.0` → `2.0.0` |

Depois execute `npm run build:windows` ou `npm run build:portable`. O build usa a versão definida e não a incrementa: repetir uma compilação ou gerar as duas distribuições mantém a mesma versão. Não edite a versão no arquivo `.iss` nem no nome do ZIP.

## 6. Gerar o instalador ou a versão portátil

O instalador Windows inclui o aplicativo Electron e a ponte Python empacotada; a máquina de quem instala não precisa ter Python, Node.js ou bibliotecas Python. Para compilar, use Windows com Python 3.10+, Node.js/npm e Inno Setup 6 instalado (com `ISCC.exe` no `PATH`). Na pasta do projeto, execute:

```powershell
npm run build:windows
```

Para gerar somente a versão portátil, sem Inno Setup, execute `npm run build:portable`. O arquivo `release/AuditoriaDePlanilhas-Portable-<versão>.zip` pode ser extraído em uma pasta e iniciado por `Auditoria de Planilhas.exe`. O instalador Inno Setup instala para o usuário atual e não exige permissão de administrador.

O script instala as dependências, gera `dist/python/bridge.exe` com PyInstaller, empacota o Electron em `release/win-unpacked` e cria `release/installer/AuditoriaDePlanilhas-Setup-<versão>.exe` com Inno Setup. `<versão>` vem do campo `version` do `package.json`, usado também pelo aplicativo e pelo ZIP portátil.

### Build em etapas

Para executar o build em etapas, use `npm run build:python`, `npm run build:electron` e, no PowerShell a partir da pasta do projeto:

```powershell
$appVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
ISCC.exe "/DAppVersion=$appVersion" installer/AuditoriaPlanilhas.iss
```

O compilador do instalador exige esse parâmetro para evitar uma versão fixa divergente. Se alterar a versão, gere novamente o aplicativo antes de compilar o instalador.
