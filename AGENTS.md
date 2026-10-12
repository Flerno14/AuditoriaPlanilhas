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

- `Limpar arquivos` remove as duas seleções, decisões, histórico e sessão persistida, aguardando gravações pendentes; não exclui arquivos Excel. `Inverter arquivos 1 e 2` troca as seleções e refaz a comparação na mesma aba, com as validações normais. Ambas confirmam o descarte se houver decisões. Essas ações não são executadas durante processamento ou retomada.
- Áreas laterais após o último cabeçalho, sem outros cabeçalhos e separadas da tabela por uma coluna inteiramente vazia, ficam fora da comparação. Anotações nessas áreas do Arquivo 1 são preservadas no workbook gerado. Cabeçalhos vazios dentro da tabela ou em colunas com dados imediatamente adjacentes continuam inválidos.
- Antes de calcular diferenças e ao gerar arquivos, valide a estrutura da aba: cabeçalhos na primeira linha devem ser preenchidos e únicos após remover espaços das extremidades. Colunas exclusivas do Arquivo 2 bloqueiam a operação com uma mensagem listando as incompatibilidades; colunas exclusivas do Arquivo 1 são preservadas. A ordem das colunas pode variar, mas o alinhamento pela primeira coluna exige o mesmo nome de chave na primeira posição dos dois arquivos. Cabeçalhos diferenciam caixa e acentos. Erros são exibidos somente em um diálogo modal sobre a interface, com descrição selecionável e fechamento por botão ou Escape; não repita os detalhes no resumo nem em avisos temporários.
- Os arquivos são comparados na aba escolhida, alinhando registros pela posição da linha após o cabeçalho por padrão. Opcionalmente, a configuração “Alinhar pela primeira coluna” usa os valores preenchidos dessa coluna como chaves. A validação de chaves únicas é opcional; sem ela, valores repetidos são pareados na ordem de ocorrência. Chaves vazias sempre geram erro explícito.
- Diferenças em linhas existentes nos dois arquivos podem ser decididas como `Pendente`, `Manter Arquivo 1`, `Usar Arquivo 2` ou `Valor personalizado`. A opção personalizada abre um modal com os dois valores originais e um campo de texto editável; confirmar guarda `Valor personalizado` no registro e cancelar/Escape preserva a decisão anterior. Texto vazio limpa a célula; o texto é literal, inclusive quando começa com `=`, e é usado nas duas gerações e nas exportações (coluna adicional no relatório de diferenças). Na tabela, ocupa uma célula centralizada com `colspan=2`; outra decisão restaura as colunas originais. Busca, filtro, resumo, desfazer e sessão incluem a escolha personalizada; selecioná-la novamente permite editar. A aplicação em massa mantém apenas as opções dos arquivos.
- Alterar cor ou modelos de exportação preserva a revisão. Salvar configurações só refaz a comparação quando muda o alinhamento ou a validação de chaves com alinhamento ativo. Se houver decisões tomadas, refazer a comparação, trocar arquivo/aba ou salvar regras que exigem nova comparação requer confirmação de descarte; cancelar preserva o contexto e as decisões. Preferências em edição só entram em vigor após salvar com sucesso.
- Se uma célula tem valor no Arquivo 1 e está vazia no Arquivo 2, o valor do Arquivo 1 é mantido automaticamente e a diferença não aparece na tabela.
- Linhas que existem apenas no Arquivo 1 são preservadas e não aparecem para decisão.
- Linhas adicionais existentes apenas no Arquivo 2 são acrescentadas ao final do arquivo gerado quando a opção de incluir linhas novas está habilitada. Elas não aparecem como diferenças célula a célula.
- A busca da tabela considera os campos exibidos, ignora acentos e, por padrão, ignora maiúsculas/minúsculas. O controle `Aa` pode ativar a distinção de caixa.
- A aplicação em massa pode atingir todas as diferenças ou apenas os itens filtrados, conforme `bulk-scope`. Não altere decisões fora do escopo escolhido.
- A tabela de diferenças é paginada em 50/100/250 itens (padrão 50). Filtros, aplicação em massa e próxima pendência abrangem todas as páginas. Busca usa espera de 200 ms; índices filtrados e textos normalizados são reutilizados, com invalidação após decisões, desfazer, comparação e retomada.
- A ponte pode emitir mensagens JSON Lines de progresso `{id, progress}` quando `reportProgress` estiver ativo, seguidas da resposta final normal. Cancelar processamento encerra o processo Python e rejeita todas as solicitações pendentes; eventos tardios do processo antigo são ignorados. O limite de 10 minutos também encerra o processo. A próxima operação inicia outro processo, sem apagar a sessão salva.
- Os filtros por decisão e coluna se combinam com a busca. `Próxima pendência` percorre somente os itens filtrados e retorna ao início. `Desfazer` restaura uma ação individual ou em massa, independentemente dos filtros atuais, e salva a sessão atualizada. Guarda até 100 ações em memória; o histórico é limpo ao comparar ou retomar, sem desfazer arquivos já gerados.
- `Ver linhas novas` exibe uma prévia de todas as linhas a acrescentar, paginada em 50 linhas e com o número da linha de origem. A ponte valida a identificação dos arquivos antes da prévia; prévia e geração compartilham a seleção de linhas novas. Gerar um arquivo corrigido com linhas novas exige confirmar essa prévia. O resumo separa células escolhidas para alteração e linhas novas disponíveis.
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
- A última sessão válida é salva automaticamente em `app.getPath('userData')/audit-session.json` após comparar e após decisões individuais ou em massa, com substituição por arquivo temporário. Inclui versão, caminhos, abas, regras, relatório com tipos JSON preservados e identificação SHA-256 dos arquivos e regras. A retomada automática e o botão `Retomar sessão` verificam a identificação antes de restaurar. Arquivos ausentes ou modificados bloqueiam a retomada; a geração também verifica os mesmos bytes que serão processados. Uma comparação válida substitui a sessão anterior; falhas de comparação ou retomada não apagam a sessão salva. O fechamento normal aguarda gravações pendentes; falhas de salvamento são exibidas no modal e podem ser repetidas com `Salvar sessão`.
- Entradas Excel são selecionadas por diálogo do sistema. Caminhos não devem ser presumidos nem codificados no projeto.
- Não inclua planilhas de usuário, configurações pessoais ou saídas de build no repositório sem solicitação explícita.

## Interface e convenções visuais

- A seleção dos dois arquivos e da aba fica em um cartão compacto, com limpar/inverter visíveis. Busca, filtros, navegação, paginação e geração permanecem na tela, inclusive antes de comparar. Os dois controles de exportação ficam como ícones acessíveis no cabeçalho da coluna Decisão. Decisão em massa fica em um grupo expansível `details`. Salvar sessão e Retomar sessão ficam no rodapé de ações, à esquerda dos botões de geração, com o estado do salvamento abaixo deles; não há seção separada para sessão. Preserve todos os controles, IDs e fluxos ao reorganizar a apresentação; ícones devem manter nomes acessíveis completos. Não remova seções de Configurações nem substitua funções por rótulos abreviados.
- Preserve os textos da interface em português do Brasil.
- O menu de decisão individual e as listas de aba, filtros, aplicação em massa e paginação usam o mesmo menu visual. O menu acompanha o controle ao rolar ou redimensionar a janela e fecha quando ele sai da área visível. Os controles `select` continuam sendo a fonte dos valores e eventos `change`; suas opções são lidas ao abrir o menu, para refletir abas e colunas carregadas dinamicamente. A decisão individual continua alterando `state.report`, permitindo desfazer e salvando a sessão.
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

Execute `npm test` para verificar as regras essenciais com os testes nativos de Node.js e `unittest` do Python. O executor respeita `PYTHON` e prefere `.venv` quando disponível. Use planilhas sintéticas em memória/arquivos temporários; não dependa das planilhas de usuário. A suíte verifica a preservação dos bytes VBA, não a execução de macros, e os testes de renderer não substituem a validação visual no Electron.

1. Antes de editar, localize o fluxo e os consumidores envolvidos; uma mudança de formato pode afetar simultaneamente renderer, ponte e lógica Python.
2. Preserve o protocolo JSON Lines e serialização segura de datas, valores vazios e tipos mistos do Excel.
3. Mantenha a interface responsiva a filtros sem perder decisões armazenadas em `state.report`.
4. Trate `NaN`/`pd.NA` explicitamente; não avalie valores ausentes diretamente como booleanos.
5. Preserve estilos, fórmulas e macros quando o fluxo atual exige isso; não converta todos os valores de planilha para texto.
6. Não altere o formato do instalador, caminhos de recursos ou persistência de preferências sem atualizar os arquivos de empacotamento correspondentes.
7. Atualize o `README.md` quando comandos, requisitos ou instruções de uso mudarem. Este `AGENTS.md` deve refletir regras e arquitetura atuais, não decisões temporárias de uma única tarefa.
