# Contexto do projeto: Auditoria de Planilhas

Leia este arquivo antes de alterar o projeto. Use-o como referência para conferir se uma mudança atende ao pedido do usuário e respeita a arquitetura, as regras de negócio e o comportamento atual. Se o pedido explícito divergir deste contexto, siga o pedido e atualize este documento quando a mudança alterar o comportamento permanente do sistema.

## Objetivo

Aplicativo desktop para Windows que compara duas planilhas Excel, permite revisar e decidir diferenças, exporta relatórios e gera uma cópia corrigida do Arquivo 1. O processamento é local; não há serviço web nem banco de dados remoto.

## Arquitetura e responsabilidades

- `electron/main.js`: processo principal. Cria a janela, abre e salva arquivos, persiste preferências, inicia o processo Python e atende chamadas IPC.
- `electron/preload.js`: ponte mínima entre a interface e o processo principal. Mantém `contextIsolation: true`, `nodeIntegration: false` e `sandbox: true` na janela.
- `renderer/`: interface HTML/CSS/JavaScript, em português do Brasil. Mantém o estado da sessão, renderiza a tabela, filtra e envia decisões para a ponte.
- `python/bridge.py`: recebe e responde a mensagens JSON Lines do Electron; converte datas e valores para transporte JSON; chama a lógica central e codifica arquivos gerados em Base64.
- `app_corrigido.py`: leitura, comparação e geração das planilhas. É também usado diretamente por outras rotinas Python, portanto preserve suas funções públicas e compatibilidade com bytes de arquivos.
- `scripts/build-windows.ps1` e `installer/AuditoriaPlanilhas.iss`: empacotamento Windows e instalador.

Fluxo principal:

```text
renderer → preload/API limitada → Electron main/IPC → processo Python (JSON Lines)
         ← resultado JSON/Base64 ← Electron main/IPC ← ponte Python → app_corrigido.py
```

Não escreva logs ou mensagens de depuração em `stdout` da ponte Python: esse canal é reservado ao protocolo JSON Lines. Use `stderr` para diagnóstico. Mantenha os nomes localizados do relatório consistentes entre `app_corrigido.py`, `python/bridge.py` e `renderer/renderer.js`.

## Regras de negócio atuais

- Os arquivos são comparados na aba escolhida, alinhando registros pela posição da linha após o cabeçalho por padrão. Opcionalmente, a configuração “Alinhar pela primeira coluna” usa os valores preenchidos dessa coluna como chaves. A validação de chaves únicas é opcional; sem ela, valores repetidos são pareados na ordem de ocorrência. Chaves vazias sempre geram erro explícito.
- Diferenças em linhas existentes nos dois arquivos podem ser decididas como `Pendente`, `Manter Arquivo 1` ou `Usar Arquivo 2`.
- Se uma célula tem valor no Arquivo 1 e está vazia no Arquivo 2, o valor do Arquivo 1 é mantido automaticamente e a diferença não aparece na tabela.
- Linhas que existem apenas no Arquivo 1 são preservadas e não aparecem para decisão.
- Linhas adicionais existentes apenas no Arquivo 2 são acrescentadas ao final do arquivo gerado quando a opção de incluir linhas novas está habilitada. Elas não aparecem como diferenças célula a célula.
- A busca da tabela considera os campos exibidos, ignora acentos e, por padrão, ignora maiúsculas/minúsculas. O controle `Aa` pode ativar a distinção de caixa.
- A aplicação em massa pode atingir todas as diferenças ou apenas os itens filtrados, conforme `bulk-scope`. Não altere decisões fora do escopo escolhido.
- `Salvar alterações` gera uma cópia baseada no Arquivo 1, aplica as escolhas e marca as células alteradas com a cor configurada. `Gerar arquivo corrigido` inclui as linhas adicionais do Arquivo 2 e não usa essa marcação.
- Exportações de diferenças e escolhas podem usar modelos `.xlsx` configurados. Os dados são escritos no primeiro separador do modelo.
- Arquivos `.xlsm` devem preservar macros ao gerar o arquivo corrigido (`keep_vba=True`).

Ao mudar uma regra, atualize a lógica Python e, se necessário, a ponte e a interface para que o valor exibido, exportado e gravado seja coerente.

## Bibliotecas e ferramentas

Python (3.10 ou superior no build Windows):

- `pandas`: leitura e estruturação tabular.
- `numpy<2.4`: operações vetorizadas e compatibilidade com CPUs mais antigas.
- `openpyxl`: leitura, escrita, estilos e preservação de VBA em `.xlsm`.
- `PyInstaller`: empacota `python/bridge.py` como executável no build; é instalado pelo script de build.

JavaScript/desktop:

- Electron (`package.json`, série 44): janela, IPC e integração nativa com o sistema.
- `electron-builder` (série 26): empacotamento do aplicativo.
- Interface sem framework: HTML, CSS e JavaScript nativos.
- Inno Setup 6 (`ISCC.exe`): instalador Windows; não é necessário no modo portátil.

As dependências Python de execução estão em `requirements.txt`; as dependências Node e comandos estão em `package.json`. Evite adicionar bibliotecas para tarefas que a pilha atual resolve sem elas.

## Preferências e arquivos locais

- Configurações persistentes ficam em `app.getPath('userData')/settings.json`, não na pasta do projeto. Incluem caminhos de modelos de exportação, a cor de destaque das células, a preferência de alinhamento pela primeira coluna e a validação de chaves únicas.
- A preferência de cor altera o preenchimento das células no arquivo gerado, não a aparência do botão da interface.
- Entradas Excel são selecionadas por diálogo do sistema. Caminhos não devem ser presumidos nem codificados no projeto.
- Não inclua planilhas de usuário, configurações pessoais ou saídas de build no repositório sem solicitação explícita.

## Interface e convenções visuais

- Preserve os textos da interface em português do Brasil.
- Siga a paleta atual: fundo cinza-esverdeado claro, cartões brancos e verde como cor de ação; consulte `renderer/styles.css` e as folhas específicas antes de adicionar estilos.
- `renderer/filter.css` contém estilos da busca e da tabela; `renderer/settings-control.css` mantém neutro o botão “Salvar alterações” em relação à cor usada nas células.
- Preserve acessibilidade básica: rótulos associados aos controles, nomes acessíveis, foco visível e mensagens de estado quando apropriado.
- Evite reformatar ou reescrever arquivos inteiros ao fazer uma mudança pontual, principalmente arquivos com textos acentuados.

## Comandos de desenvolvimento e distribuição

```powershell
npm install
python -m pip install -r requirements.txt
npm start
```

Para escolher um interpretador Python específico durante o desenvolvimento, defina `PYTHON` para o caminho do executável antes de executar `npm start`.

Build Windows:

```powershell
npm run build:windows
npm run build:portable
```

O build empacota a ponte Python com PyInstaller e o aplicativo com Electron Builder. O instalador completo também requer Inno Setup 6. Os comandos segmentados estão definidos em `package.json` e `scripts/build-windows.ps1`.

## Diretrizes para alterações futuras

1. Antes de editar, localize o fluxo e os consumidores envolvidos; uma mudança de formato pode afetar simultaneamente renderer, ponte e lógica Python.
2. Preserve o protocolo JSON Lines e serialização segura de datas, valores vazios e tipos mistos do Excel.
3. Mantenha a interface responsiva a filtros sem perder decisões armazenadas em `state.report`.
4. Trate `NaN`/`pd.NA` explicitamente; não avalie valores ausentes diretamente como booleanos.
5. Preserve estilos, fórmulas e macros quando o fluxo atual exige isso; não converta todos os valores de planilha para texto.
6. Não altere o formato do instalador, caminhos de recursos ou persistência de preferências sem atualizar os arquivos de empacotamento correspondentes.
7. Atualize o `README.md` quando comandos, requisitos ou instruções de uso mudarem. Este `AGENTS.md` deve refletir regras e arquitetura atuais, não decisões temporárias de uma única tarefa.
