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

Selecione o arquivo original e o modificado, escolha uma aba comum e clique em **Comparar planilhas**. Clique na decisão de uma linha para escolher entre manter o Arquivo 1, usar o Arquivo 2 ou deixar pendente. As listas de aba, filtros, aplicação em massa e paginação usam o mesmo estilo de menu da decisão. **Aplicar** define a mesma escolha para todas as diferenças ou somente os itens filtrados, conforme **Aplicar em**.

Para escrever uma terceira alternativa, selecione **Valor personalizado** na decisão da linha. O popup exibe o valor do Arquivo 1, o do Arquivo 2 e o campo editável. **Usar este valor** salva o texto e o mostra centralizado sobre as duas colunas; escolher outra decisão restaura os valores originais. Selecione novamente a opção para editar. **Cancelar** ou Escape preserva a escolha anterior. O valor é gravado como texto literal (preservando zeros à esquerda e quebras de linha); vazio limpa a célula. Ele é usado nos dois arquivos finais e nas exportações, e é preservado na sessão salva.

Para revisões longas, combine a busca com os filtros **Decisão** e **Coluna**. **Próxima pendência** leva o foco à próxima decisão pendente nos filtros atuais e volta ao início ao chegar ao final. **Desfazer** restaura a última alteração individual ou aplicação em massa, mesmo que os filtros tenham mudado; o resultado também é salvo automaticamente. O histórico guarda até 100 ações durante a revisão aberta e é limpo ao comparar novamente ou retomar uma sessão. Ele não desfaz arquivos Excel já gerados.

A tabela mostra 50 diferenças por página por padrão, com opções de 100 ou 250. A busca é aplicada após uma pausa de 200 ms na digitação. Filtros e aplicações em massa abrangem todas as páginas; **Próxima pendência** abre a página do item encontrado. As decisões são mantidas ao navegar. Os resultados dos filtros são reutilizados durante a paginação.

Durante operações Python, a tela de processamento informa a etapa atual e permite **Cancelar processamento**. O cancelamento encerra o processo Python e interrompe todas as solicitações pendentes; a próxima operação inicia um processo novo. A última sessão já salva é preservada. Operações têm limite de 10 minutos, com interrupção real ao excedê-lo. A indicação é por etapas, sem estimativa percentual. A leitura e o relatório completo ainda ficam em memória: a paginação reduz os elementos da tabela, mas não elimina o custo de processar arquivos muito grandes.

**Ver linhas novas** abre uma prévia paginada (50 linhas por página), com a linha de origem no Arquivo 2 e os valores nas colunas do Arquivo 1. A prévia também aparece antes de gerar um arquivo corrigido com linhas novas: escolha **Gerar com estas linhas** ou volte à revisão. Arquivos de origem alterados bloqueiam a prévia. O resumo distingue células a alterar de linhas novas disponíveis; gerar um arquivo apenas com marcação de alterações não acrescenta essas linhas.

O aplicativo exporta o relatório de diferenças, as escolhas aplicadas, uma cópia do Arquivo 1 com as alterações escolhidas e o arquivo corrigido com as linhas novas do Arquivo 2. Arquivos `.xlsm` mantêm as macros ao gerar a cópia corrigida.

**Limpar arquivos** remove as duas seleções, as decisões e a sessão salva, sem excluir as planilhas Excel. **Inverter arquivos 1 e 2** troca o original pelo modificado e refaz a comparação na mesma aba. Ambas as ações pedem confirmação se houver decisões tomadas. A inversão exige os dois arquivos selecionados e aplica as validações novamente, pois o novo Arquivo 1 passa a definir a estrutura da saída.

Alterar a cor de destaque ou os modelos de exportação preserva as decisões da revisão. Mudar o alinhamento das linhas ou a validação de chaves com alinhamento ativo exige uma nova comparação. Se já houver decisões tomadas, o aplicativo pede confirmação antes de descartá-las, inclusive ao comparar novamente ou trocar arquivo/aba. Cancelar mantém a revisão atual.

A última sessão de auditoria é salva automaticamente neste computador após uma comparação válida e a cada decisão, inclusive aplicações em massa. Ao reabrir o aplicativo, os arquivos, a aba, as regras de comparação e as decisões são retomados automaticamente. A faixa de sessão mostra o estado do salvamento; **Salvar sessão** permite tentar novamente após uma falha e **Retomar sessão** repete a recuperação. Uma nova comparação válida substitui a sessão anterior; não há histórico de múltiplas sessões.

Para retomar, os arquivos de origem precisam continuar nos mesmos caminhos e com o mesmo conteúdo. Se forem alterados ou estiverem indisponíveis, o aplicativo exibe um erro e mantém a sessão salva. Restaure os arquivos originais e use **Retomar sessão**, ou selecione os arquivos atuais e faça uma nova comparação. A geração do Excel também verifica se os arquivos mudaram desde a revisão. A sessão fica em `audit-session.json` na pasta de dados do aplicativo do usuário, com os valores das diferenças e decisões, sem enviar dados para serviços externos. O fechamento normal aguarda o salvamento; encerramentos forçados podem perder a última gravação ainda em andamento.

Antes de listar diferenças, o aplicativo valida a estrutura da aba. A primeira linha deve conter cabeçalhos preenchidos e únicos. Colunas exclusivas do Arquivo 2 bloqueiam a comparação: ajuste os nomes correspondentes ou remova as colunas extras nesse arquivo. Colunas exclusivas do Arquivo 1 são preservadas. Os nomes diferenciam maiúsculas/minúsculas e acentos, ignorando apenas espaços nas extremidades. A ordem das colunas pode variar; ao alinhar pela primeira coluna, porém, a mesma coluna de chave deve ocupar a primeira posição nos dois arquivos. Os erros aparecem em uma janela sobreposta com a descrição completa. Use Fechar ou Escape para voltar à tela principal; a mensagem não é repetida no resumo nem nos avisos temporários.

## Estrutura

Áreas de anotações à direita da tabela são desconsideradas na comparação quando não possuem cabeçalhos e estão separadas por uma coluna inteiramente vazia. As anotações do Arquivo 1 são preservadas na cópia gerada. Colunas com dados sem cabeçalho dentro da tabela continuam sendo sinalizadas como erro.

- `electron/`: janela, diálogos nativos do sistema e comunicação segura com a interface.
- `renderer/`: interface visual do aplicativo.
- `python/bridge.py`: protocolo JSON Lines entre Electron e Python.
- `app_corrigido.py`: lógica de leitura, comparação e geração de planilhas.

Os arquivos são processados localmente. O Electron chama o Python como um processo filho e transfere somente os dados necessários para as operações.

A interface agrupa os dois arquivos e a aba em um único cartão, com **Limpar arquivos** e **Inverter arquivos 1 e 2** visíveis. Busca, filtros, navegação, paginação e botões de geração permanecem na tela. Os ícones para exportar as tabelas de diferenças e escolhas ficam no cabeçalho da coluna **Decisão**. **Decisão em massa** permanece em um grupo expansível. **Salvar sessão** e **Retomar sessão** ficam à esquerda dos botões de geração, com o estado do salvamento logo abaixo, sem uma seção separada. **Gerar arquivo marcando alterações** e **Gerar arquivo corrigido** mantêm seus nomes e comportamentos. As seções de Configurações também são preservadas.

## Testes automatizados

Execute `npm test` para rodar os testes JavaScript e Python. O comando usa o interpretador definido em `PYTHON`, quando informado; caso contrário, prefere `.venv` e depois o Python do sistema. Instale as dependências de `requirements.txt` nesse interpretador antes de executar. Não há bibliotecas de teste adicionais.

Os testes usam planilhas sintéticas e arquivos temporários, sem alterar as planilhas de usuário. Cobrem comparação, decisões em massa com filtros, estruturas, sessões, transporte JSON de datas e geração de Excel com estilos e fórmulas preservados. O teste de `.xlsm` verifica a preservação do componente VBA, sem executar macros. Os testes da interface usam uma simulação do DOM e da ponte desktop; a aparência e os diálogos nativos ainda exigem verificação manual no Electron.

Para executar separadamente: `node --test tests/*.test.js` e `python -m unittest discover -s tests -p "test_*.py" -v`.

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



