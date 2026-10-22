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
- Diferenças em linhas existentes nos dois arquivos podem ser decididas como `Pendente`, `Manter Arquivo 1`, `Usar Arquivo 2` ou `Valor personalizado`. A opção personalizada abre um modal com os dois valores originais e um campo de texto editável; confirmar guarda `Valor personalizado` no registro e cancelar/Escape preserva a decisão anterior. Texto vazio limpa a célula; o texto é literal, inclusive quando começa com `=`, e é usado na geração com ou sem marcação e nas exportações (coluna adicional no relatório de diferenças). Na tabela, ocupa uma célula centralizada com `colspan=2`; outra decisão restaura as colunas originais. Busca, filtro, resumo, desfazer e sessão incluem a escolha personalizada; selecioná-la novamente permite editar. A aplicação em massa apresenta, nesta ordem, `Pendente`, `Manter Arquivo 1` e `Usar Arquivo 2`, com `Pendente` selecionado inicialmente, respeitando o escopo de todas as diferenças ou somente as filtradas. Voltar a pendente remove o valor personalizado ativo e restaura as duas colunas; desfazer recupera a decisão e o texto anteriores.
- Alterar cor ou modelos de exportação preserva a revisão. Salvar configurações só refaz a comparação quando muda o alinhamento ou a validação de chaves com alinhamento ativo. Se houver decisões tomadas, refazer a comparação, trocar arquivo/aba ou salvar regras que exigem nova comparação requer confirmação de descarte; cancelar preserva o contexto e as decisões. Preferências em edição só entram em vigor após salvar com sucesso.
- Se uma célula tem valor no Arquivo 1 e está vazia no Arquivo 2, o valor do Arquivo 1 é mantido automaticamente e a diferença não aparece na tabela.
- Linhas que existem apenas no Arquivo 1 são preservadas e não aparecem para decisão.
- Linhas adicionais existentes apenas no Arquivo 2 são acrescentadas ao final do arquivo gerado quando a opção de incluir linhas novas está habilitada. Elas não aparecem como diferenças célula a célula.
- As linhas novas herdam a formatação da última linha original, inclusive preenchimentos preexistentes, sem herdar a cor de destaque aplicada às alterações da revisão atual.
- A busca da tabela considera os campos exibidos, ignora acentos e, por padrão, ignora maiúsculas/minúsculas. O controle `Aa` pode ativar a distinção de caixa.
- A preferência `highlightTextDifferences`, desativada por padrão e persistida em `settings.json`, destaca trechos diferentes entre os textos dos Arquivos 1 e 2 na tabela. Palavras e pontuação removidas/substituídas usam rosa e sublinhado tracejado; adicionadas/substituídas usam verde e sublinhado contínuo. Caracteres invisíveis alterados recebem símbolos visuais via CSS, preservando o texto original no DOM. A legenda aparece com a opção ativa. O cálculo por palavras ocorre somente na página visível, com limite de trabalho e destaque por bloco em textos extensos; blocos com mais de 500 partes omitem os símbolos individuais de espaços. Valores não textuais e células personalizadas mantêm sua apresentação anterior. Salvar a opção atualiza a tabela sem recomparar ou perder decisões; cancelar/falhar preserva a configuração anterior. Não altera busca, relatório, sessão, exportação ou valores gerados; a cor de marcação do Excel continua independente.
- Duplo clique em uma célula de dados da tabela abre um popup com todas as colunas da linha dos dois arquivos, sem truncar textos, e as decisões atuais (inclusive valores personalizados). O número da linha pode receber foco e Enter abre o mesmo popup. A coluna selecionada fica destacada; os números de origem dos dois arquivos são exibidos. A ponte verifica a identificação dos arquivos antes de carregar os detalhes, respeitando alinhamento por posição ou por chave e ordem das ocorrências repetidas. Colunas exclusivas do Arquivo 1 são identificadas como ausentes no Arquivo 2. Fechar pelo botão ou Escape preserva decisões, filtros e paginação.
- A ponte Python mantém em memória somente um par de DataFrames normalizados, com limite estimado de 64 MiB (dados, índices e cabeçalhos). A comparação preenche esse cache, reutilizado pelos detalhes e pela prévia de linhas novas. A chave inclui os caminhos e a identificação SHA-256 dos conteúdos, aba e regras efetivas. Cada consulta continua lendo os bytes e verificando essa identificação antes de acessar o cache; não confie apenas no tamanho ou na data de modificação. Outra comparação substitui o cache; arquivos ausentes ou identidade incompatível o invalidam. Acima do limite, a operação funciona sem reter os dados. Após reiniciar o processo ou retomar uma sessão, o cache é reconstruído sob demanda. Ele não guarda decisões, bytes dos arquivos ou workbooks de saída; a geração continua validando e processando os mesmos bytes recebidos.
- A aplicação em massa pode atingir todas as diferenças ou apenas os itens filtrados, conforme `bulk-scope`. Não altere decisões fora do escopo escolhido.
- A tabela de diferenças é paginada em 50/100/250 itens (padrão 50). Filtros, aplicação em massa e próxima pendência abrangem todas as páginas. Busca usa espera de 200 ms; índices filtrados e textos normalizados são reutilizados, com invalidação após decisões, desfazer, comparação e retomada.
- A ponte pode emitir mensagens JSON Lines de progresso `{id, progress}` quando `reportProgress` estiver ativo, seguidas da resposta final normal. Cancelar processamento encerra o processo Python e rejeita todas as solicitações pendentes; eventos tardios do processo antigo são ignorados. O limite de 10 minutos também encerra o processo. A próxima operação inicia outro processo, sem apagar a sessão salva.
- Os filtros por decisão e coluna se combinam com a busca. `Próxima pendência` percorre somente os itens filtrados e retorna ao início. `Desfazer` restaura uma ação individual ou em massa, independentemente dos filtros atuais, e salva a sessão atualizada. Guarda até 100 ações em memória; o histórico é limpo ao comparar ou retomar, sem desfazer arquivos já gerados.
- `Ver linhas novas` exibe uma prévia de todas as linhas a acrescentar, paginada em 50 linhas e com o número da linha de origem. A ponte valida a identificação dos arquivos antes da prévia; prévia e geração compartilham a seleção de linhas novas. Gerar um arquivo corrigido com linhas novas exige confirmar essa prévia. O resumo separa células escolhidas para alteração e linhas novas disponíveis.
- `Gerar arquivo corrigido` é a única ação de geração na interface: cria uma cópia baseada no Arquivo 1, aplica as escolhas e inclui as linhas adicionais do Arquivo 2 após confirmar a prévia. A opção `Marcar células alteradas`, em um popup aberto pelo botão e desativada inicialmente, destaca as células alteradas com a cor configurada sem impedir a inclusão das linhas novas. O popup oferece Continuar e Cancelar; cancelar ou pressionar Escape não gera arquivo nem altera a revisão. Continuar segue para a confirmação das linhas novas, quando houver. Alternar essa opção preserva as decisões e não refaz a comparação. O nome sugerido usa `_corrigido` com ou sem marcação. A API Python mantém os parâmetros independentes de inclusão e marcação para compatibilidade com outros consumidores.
- Exportações de diferenças e escolhas podem usar modelos `.xlsx` configurados. Os dados são escritos no primeiro separador do modelo.
- Todos os arquivos Excel gerados (cópia corrigida com ou sem marcações e relatórios de diferenças/escolhas) recebem no nome sugerido a data local do dia da geração em `_AAAAMMDD`, imediatamente antes da extensão. Preserve o nome anterior completo, inclusive datas antigas e sufixos como `_corrigido` e `_somente_alteracoes`; acrescente a nova data depois deles. O usuário ainda pode editar o nome no diálogo de salvamento.
- A preferência `replaceFilenameDates`, desativada por padrão e persistida em `settings.json`, permite substituir todas as datas válidas em `AAAAMMDD` no nome sugerido pela data local atual, mantendo suas posições e os demais trechos (inclusive `_corrigido`). Datas não são reconhecidas dentro de sequências numéricas maiores. Com a opção ativa e alguma data reconhecida, não acrescente outra data ao final; sem data reconhecida, use a regra de acréscimo. Salvar essa preferência preserva decisões e não refaz a comparação; cancelar ou falhar ao salvar preserva a preferência anterior.
- Arquivos `.xlsm` devem preservar macros ao gerar o arquivo corrigido (`keep_vba=True`).

Ao mudar uma regra, atualize a lógica Python e, se necessário, a ponte e a interface para que o valor exibido, exportado e gravado seja coerente.

- A preferência `validateTranslationElements`, desativada por padrão e persistida em `settings.json`, habilita avisos orientativos nas células da tabela de diferenças e no popup de conteúdo da linha. `renderer/translation-validation.js` compara marcadores simples (`{name}`, `{0}`, `{{name}}`), formatos printf, tags e URLs HTTP/HTTPS ou www, incluindo quantidades e ordem das tags e dos formatos sem posição explícita. Compara o Arquivo 1 com o Arquivo 2 para pendente/usar Arquivo 2, ou com o valor personalizado; manter Arquivo 1 não gera avisos. O botão de avisos abre um diálogo com texto literal seguro. Salvar a preferência apenas atualiza a tabela, sem recomparar ou descartar decisões; cancelar/falhar preserva a preferência ativa. A análise ocorre na página renderizada, não altera decisões, não bloqueia geração, não abrange linhas novas nem é exportada. É uma heurística, não valida toda sintaxe de tradução ou disponibilidade de URLs.

- No popup de conteúdo da linha, todas as colunas oferecem o mesmo menu da tabela com Pendente, Manter Arquivo 1, Usar Arquivo 2 e Valor personalizado. O menu é anexado ao diálogo para permanecer acessível na camada modal. Células fora do relatório começam em Manter Arquivo 1 e só são acrescentadas ao relatório quando uma escolha é confirmada; cancelar o editor não cria registros. Essas escolhas entram na tabela, filtros, sessão, exportações e geração; desfazer a inclusão remove o registro. Usar Arquivo 2 fica desabilitado para colunas ausentes nele; valores vazios presentes podem ser escolhidos explicitamente para limpar a célula, como exceção à preservação automática. Usam `changeDecisions` e o mesmo salvamento automático e histórico da tabela; o botão Desfazer última decisão usa `undoDecision`, inclusive para ações de outras linhas ou em massa. Status e avisos são atualizados no lugar, sem reler planilhas. O editor personalizado abre sobre o popup; cancelar/Escape preserva a decisão e devolve o foco ao botão de origem. Fechar o popup não desfaz escolhas confirmadas; seu estado temporário é liberado no fechamento.

## Bibliotecas e ferramentas

### Auditoria de tradução

- Os detectores compartilhados evitam interpretar prefixos de palavras (`%discount`), escapes dentro de URLs e variáveis de ambiente `%NOME%` como printf. URLs preservam parênteses balanceados; delimitadores externos de prosa são ignorados. Marcadores com chaves incompletas ou aninhamento não suportado não são parcialmente reconhecidos. Tags equivalentes podem variar espaços externos, aspas e ordem de atributos, mas nomes/valores de atributos, duplicatas e ordem das tags continuam relevantes; nada é interpretado como HTML.
- A checagem numérica da auditoria usa convenções inglês → português: decimal ponto/vírgula, agrupamento de milhares válido e espaços inseparáveis. Compara valores e quantidades, preservando sinais, zeros iniciais de códigos e diferenças nas casas decimais; frações com zeros finais são equivalentes. Formatos desconhecidos permanecem literais. É uma heurística de números, não um parser de datas, versões, moedas ou unidades.

- O validador compartilhado de printf trata `%` seguido de espaço e texto comum de forma conservadora: não interpreta `% shared`, `% compartilhou` ou `s% adicionada` como formatos. Tokens com flag de espaço só são reconhecidos quando há posição, largura ou precisão explícita e a conversão não é prefixo de uma palavra. Formatos compactos (`%s`, `%d`, `%.2f`) continuam validados. A forma ambígua `% d`, sem outros qualificadores, é ignorada para evitar falsos alertas em prosa; a posição de símbolos literais e de `s%` não gera aviso por si só.

- A tela independente `renderer/translation-audit.js` compara duas colunas escolhidas na mesma aba Excel; sua navegação preserva o estado da comparação existente. `python/translation_audit.py` atende ações `translation-*` na ponte, sem modificar as planilhas de entrada.
- `translation-audit-rules.js` reutiliza `translation-validation.js` e acrescenta alertas de vazio, números, textos idênticos e comprimento. Varre todas as linhas; a revisão tem estados Não revisado, Revisado e Precisa corrigir, com filtros e páginas de 50/100/250 linhas (padrão 50). Alterar o tamanho volta à primeira página sem perder revisões; Próximo não revisado usa o tamanho escolhido. Exportação inclui todas as linhas e escreve strings literalmente.
- A similaridade semântica é opcional, em CPU, com Sentence Transformers instalado separadamente e pasta de pesos local selecionada pelo usuário; nenhuma análise baixa pesos ou envia conteúdo à internet. Mostra cosseno, nunca percentual de acerto. A faixa inferior de 20% das notas, incluindo empates, orienta revisão quando há ao menos cinco pares; alertas estruturais prevalecem. Textos acima do limite do modelo não são truncados: ficam sem nota e recebem aviso. Sem modelo, funciona somente a análise objetiva.
- A sessão própria `translation-session.json` usa gravação serializada e substituição atômica; salvamento de revisões é agrupado em 250 ms, com pontos de recuperação durante a análise. A retomada verifica SHA-256 e recupera resultados parciais, sem continuar automaticamente inferência. Fechar aguarda gravações das duas telas; durante operações da tradução é necessário concluir ou cancelar antes de fechar. O histórico da comparação não é compartilhado com esta tela.
- A primeira versão não oferece glossário, edição/geração de traduções corrigidas, segmentação de textos longos ou alinhamento entre arquivos separados. O pacote semântico opcional está documentado para desenvolvimento; pesos e empacotamento de IA não fazem parte da distribuição padrão.

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
- O salvamento automático de decisões individuais, em massa e desfazer aguarda 250 ms sem novas alterações. Mantém apenas a revisão pendente mais recente e clona o relatório somente ao iniciar uma gravação. Há uma gravação em andamento por vez; alterações recebidas durante ela são agrupadas na próxima. Salvar sessão e fechar a janela forçam o salvamento pendente sem esperar o intervalo; limpar/inverter e retomar também aguardam a conclusão. Falhas preservam a revisão pendente para nova tentativa e impedem o fechamento. A escrita do arquivo temporário e sua substituição são assíncronas no processo principal, com gravações serializadas por destino.
- A última sessão válida é salva automaticamente em `app.getPath('userData')/audit-session.json` após comparar e após decisões individuais ou em massa, com substituição por arquivo temporário. Inclui versão, caminhos, abas, regras, relatório com tipos JSON preservados e identificação SHA-256 dos arquivos e regras. A retomada automática e o botão `Retomar sessão` verificam a identificação antes de restaurar. Arquivos ausentes ou modificados bloqueiam a retomada; a geração também verifica os mesmos bytes que serão processados. Uma comparação válida substitui a sessão anterior; falhas de comparação ou retomada não apagam a sessão salva. O fechamento normal aguarda gravações pendentes; falhas de salvamento são exibidas no modal e podem ser repetidas com `Salvar sessão`.
- Entradas Excel são selecionadas por diálogo do sistema. Caminhos não devem ser presumidos nem codificados no projeto.
- Não inclua planilhas de usuário, configurações pessoais ou saídas de build no repositório sem solicitação explícita.

## Interface e convenções visuais

- A seleção dos dois arquivos e da aba fica em um cartão compacto, com limpar/inverter visíveis. Busca, filtros, navegação, paginação e geração permanecem na tela, inclusive antes de comparar. Os dois controles de exportação ficam como ícones acessíveis no cabeçalho da coluna Decisão. Decisão em massa fica em um grupo expansível `details`. Salvar sessão e Retomar sessão ficam no rodapé de ações, à esquerda dos controles de geração, com o estado do salvamento abaixo deles; não há seção separada para sessão. Preserve todos os controles, IDs e fluxos ao reorganizar a apresentação; ícones devem manter nomes acessíveis completos. Não remova seções de Configurações nem substitua funções por rótulos abreviados.
- Preserve os textos da interface em português do Brasil.
- A seção Revisão em massa da auditoria de traduções oferece Não revisado (inicial), Revisado e Precisa corrigir, aplicados a todas as traduções ou a todos os itens filtrados, em todas as páginas. Captura os alvos antes de modificar os estados, preserva linhas fora do escopo e aciona o salvamento agrupado existente. Os controles ficam desabilitados durante operações ou sem resultados aplicáveis.
- Na auditoria de traduções, o filtro Alerta lista os tipos presentes na análise completa, agrupando mensagens pelo prefixo antes de dois-pontos, e oferece Sem alertas. Combina-se com busca, prioridade e revisão; paginação e Próximo não revisado respeitam todos os filtros. Exportação continua incluindo todas as linhas.
- A auditoria de traduções compartilha largura, cabeçalho compacto e cartões da comparação: arquivo e colunas no primeiro cartão, modelo semântico em seção expansível, revisão com filtros/tabela/paginação no segundo, resumo e ações de sessão/exportação no rodapé. Preserve os IDs e os fluxos existentes; a tabela vazia mostra orientação e usa altura reduzida.
- O ícone no canto superior esquerdo abre um painel lateral modal com Auditoria de planilhas e Auditoria de traduções, destacando a área ativa. A navegação preserva o estado das duas telas e permanece bloqueada durante processamento ou retomada. O painel fecha pelo botão, Escape ou clique no fundo, devolvendo o foco ao ícone.
- O menu de decisão individual e as listas de aba, filtros, aplicação em massa e paginação usam o mesmo menu visual. O menu acompanha o controle ao rolar ou redimensionar a janela e fecha quando ele sai da área visível. Os controles `select` continuam sendo a fonte dos valores e eventos `change`; suas opções são lidas ao abrir o menu, para refletir abas e colunas carregadas dinamicamente. A decisão individual continua alterando `state.report`, permitindo desfazer e salvando a sessão.
- Siga a paleta atual: fundo cinza-esverdeado claro, cartões brancos e verde como cor de ação; consulte `renderer/styles.css` e as folhas específicas antes de adicionar estilos.
- `renderer/filter.css` contém estilos da busca e da tabela; `renderer/settings-control.css` estiliza a opção de marcar células alteradas. A cor configurada afeta somente as células do arquivo gerado.
- Preserve acessibilidade básica: rótulos associados aos controles, nomes acessíveis, foco visível e mensagens de estado quando apropriado.
- Evite reformatar ou reescrever arquivos inteiros ao fazer uma mudança pontual, principalmente arquivos com textos acentuados.

## Comandos de desenvolvimento e distribuição

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm start
```

Para escolher um interpretador Python específico durante o desenvolvimento, defina `PYTHON` para o caminho do executável antes de executar `npm start`. Sem essa variável, o aplicativo prefere o Python de `.venv` e depois o comando Python do sistema, seguindo a mesma ordem do executor de testes.

Build Windows:

```powershell
npm run build:windows
npm run build:portable
```

O build empacota a ponte Python com PyInstaller e o aplicativo com Electron Builder. O instalador completo também requer Inno Setup 6. Os comandos segmentados estão definidos em `package.json` e `scripts/build-windows.ps1`.

A versão de distribuição tem como fonte única `package.json` (`version`, no formato MAIOR.MENOR.CORREÇÃO). O build lê e valida esse valor, usa-o no nome do ZIP portátil e o passa ao Inno Setup por `/DAppVersion`; o `.iss` não possui versão fixa e rejeita a compilação sem esse parâmetro. Electron Builder usa a mesma versão do pacote. Para um novo lançamento, `npm version patch|minor|major --no-git-tag-version` atualiza o pacote e o lockfile: patch incrementa a última parte, minor incrementa a segunda e zera a última, major incrementa a primeira e zera as demais. O build não incrementa versões automaticamente. A documentação usa `<versão>` nos nomes das saídas para não manter cópias da versão atual.

## Diretrizes para alterações futuras

Execute `npm test` para verificar as regras essenciais com os testes nativos de Node.js e `unittest` do Python. O executor respeita `PYTHON` e prefere `.venv` quando disponível. Use planilhas sintéticas em memória/arquivos temporários; não dependa das planilhas de usuário. A suíte verifica a preservação dos bytes VBA, não a execução de macros, e os testes de renderer não substituem a validação visual no Electron.

1. Antes de editar, localize o fluxo e os consumidores envolvidos; uma mudança de formato pode afetar simultaneamente renderer, ponte e lógica Python.
2. Preserve o protocolo JSON Lines e serialização segura de datas, valores vazios e tipos mistos do Excel.
3. Mantenha a interface responsiva a filtros sem perder decisões armazenadas em `state.report`.
4. Trate `NaN`/`pd.NA` explicitamente; não avalie valores ausentes diretamente como booleanos.
5. Preserve estilos, fórmulas e macros quando o fluxo atual exige isso; não converta todos os valores de planilha para texto.
6. Não altere o formato do instalador, caminhos de recursos ou persistência de preferências sem atualizar os arquivos de empacotamento correspondentes.
7. Atualize o `README.md` quando comandos, requisitos ou instruções de uso mudarem. Este `AGENTS.md` deve refletir regras e arquitetura atuais, não decisões temporárias de uma única tarefa.
