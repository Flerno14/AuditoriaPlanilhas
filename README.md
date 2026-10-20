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

Selecione o arquivo original e o modificado, escolha uma aba comum e clique em **Comparar planilhas**. Clique na decisão de uma linha para escolher entre manter o Arquivo 1, usar o Arquivo 2 ou deixar pendente. As listas de aba, filtros, aplicação em massa e paginação usam o mesmo estilo de menu da decisão. **Aplicar** define a mesma escolha para todas as diferenças ou somente os itens filtrados, conforme **Aplicar em**. A decisão em massa também oferece **Pendente** para reabrir a revisão dos itens no escopo escolhido, com salvamento automático e suporte a **Desfazer**.

Para escrever uma terceira alternativa, selecione **Valor personalizado** na decisão da linha. O popup exibe o valor do Arquivo 1, o do Arquivo 2 e o campo editável. **Usar este valor** salva o texto e o mostra centralizado sobre as duas colunas; escolher outra decisão restaura os valores originais. Selecione novamente a opção para editar. **Cancelar** ou Escape preserva a escolha anterior. O valor é gravado como texto literal (preservando zeros à esquerda e quebras de linha); vazio limpa a célula. Ele é usado no arquivo corrigido com ou sem marcação e nas exportações, e é preservado na sessão salva.

Para revisões longas, combine a busca com os filtros **Decisão** e **Coluna**. **Próxima pendência** leva o foco à próxima decisão pendente nos filtros atuais e volta ao início ao chegar ao final. **Desfazer** restaura a última alteração individual ou aplicação em massa, mesmo que os filtros tenham mudado; o resultado também é salvo automaticamente. O histórico guarda até 100 ações durante a revisão aberta e é limpo ao comparar novamente ou retomar uma sessão. Ele não desfaz arquivos Excel já gerados.

Dê **duplo clique em uma célula de dados** da tabela para abrir o conteúdo completo da linha. O popup mostra todas as colunas dos dois arquivos lado a lado, com textos completos, números das linhas de origem e decisões atuais. A coluna selecionada fica destacada. Pelo teclado, foque o número da linha e pressione **Enter**. **Voltar à revisão** ou Escape fecha o popup sem alterar decisões, filtros ou página.

A tabela mostra 50 diferenças por página por padrão, com opções de 100 ou 250. A busca é aplicada após uma pausa de 200 ms na digitação. Filtros e aplicações em massa abrangem todas as páginas; **Próxima pendência** abre a página do item encontrado. As decisões são mantidas ao navegar. Os resultados dos filtros são reutilizados durante a paginação.

Durante operações Python, a tela de processamento informa a etapa atual e permite **Cancelar processamento**. O cancelamento encerra o processo Python e interrompe todas as solicitações pendentes; a próxima operação inicia um processo novo. A última sessão já salva é preservada. Operações têm limite de 10 minutos, com interrupção real ao excedê-lo. A indicação é por etapas, sem estimativa percentual. A leitura e o relatório completo ainda ficam em memória: a paginação reduz os elementos da tabela, mas não elimina o custo de processar arquivos muito grandes.

**Ver linhas novas** abre uma prévia paginada (50 linhas por página), com a linha de origem no Arquivo 2 e os valores nas colunas do Arquivo 1. A prévia também aparece antes de gerar um arquivo corrigido com linhas novas: escolha **Gerar com estas linhas** ou volte à revisão. Arquivos de origem alterados bloqueiam a prévia. O resumo distingue células a alterar de linhas novas disponíveis. **Gerar arquivo corrigido** inclui essas linhas com ou sem marcação. Ao clicar em **Gerar arquivo corrigido**, um popup permite ativar **Marcar células alteradas** para destacar as células alteradas com a cor definida em Configurações. A opção começa desativada e não modifica as decisões da revisão. Clique em **Continuar** para prosseguir; **Cancelar** ou Escape fecha o popup sem gerar arquivo.

O aplicativo exporta o relatório de diferenças, as escolhas aplicadas, o arquivo corrigido baseado no Arquivo 1, com as alterações escolhidas e as linhas novas do Arquivo 2. Arquivos `.xlsm` mantêm as macros ao gerar a cópia corrigida.

As linhas novas herdam a formatação da última linha original, incluindo cores já existentes no arquivo. Elas não recebem a marcação aplicada às células alteradas durante a revisão.

Todos os arquivos gerados recebem a data local do dia no nome sugerido, no formato `_AAAAMMDD`, antes da extensão. O nome anterior é preservado, incluindo datas antigas e outros sufixos. Por exemplo, uma geração em 12/10/2026 pode resultar em `All Translations of Defense_IA_20260817_corrigido_20261012.xlsx` ou `diferencas_entre_arquivos_20261012.xlsx`. Você pode editar o nome no diálogo de salvamento.

Em **Configurações → Nomes dos arquivos gerados**, ative **Substituir datas existentes no nome pela data atual** para atualizar as datas válidas em `AAAAMMDD`, em qualquer posição do nome, sem acrescentar outra data. Por exemplo, `Planilha_20260817_corrigido.xlsx` passa a `Planilha_20261012_corrigido.xlsx` em 12/10/2026. Se houver várias datas, todas são atualizadas nas posições existentes; se não houver nenhuma, a data é acrescentada ao final. A opção vale para todos os arquivos gerados, fica salva neste computador e não altera as decisões da revisão.

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

A interface agrupa os dois arquivos e a aba em um único cartão, com **Limpar arquivos** e **Inverter arquivos 1 e 2** visíveis. Busca, filtros, navegação, paginação e controles de geração permanecem na tela. Os ícones para exportar as tabelas de diferenças e escolhas ficam no cabeçalho da coluna **Decisão**. **Decisão em massa** permanece em um grupo expansível. **Salvar sessão** e **Retomar sessão** ficam à esquerda dos controles de geração, com o estado do salvamento logo abaixo, sem uma seção separada. Há um único botão **Gerar arquivo corrigido**, que abre um popup com a opção **Marcar células alteradas**. As seções de Configurações também são preservadas.

## Testes automatizados

Execute `npm test` para rodar os testes JavaScript e Python. O comando usa o interpretador definido em `PYTHON`, quando informado; caso contrário, prefere `.venv` e depois o Python do sistema. Instale as dependências de `requirements.txt` nesse interpretador antes de executar. Não há bibliotecas de teste adicionais.

Os testes usam planilhas sintéticas e arquivos temporários, sem alterar as planilhas de usuário. Cobrem comparação, decisões em massa com filtros, estruturas, sessões, transporte JSON de datas e geração de Excel com estilos e fórmulas preservados. O teste de `.xlsm` verifica a preservação do componente VBA, sem executar macros. Os testes da interface usam uma simulação do DOM e da ponte desktop; a aparência e os diálogos nativos ainda exigem verificação manual no Electron.

Para executar separadamente: `node --test tests/*.test.js` e `python -m unittest discover -s tests -p "test_*.py" -v`.

## Distribuição

O instalador Windows inclui o aplicativo Electron e a ponte Python empacotada; a máquina de quem instala não precisa ter Python, Node.js ou bibliotecas Python. Para compilar, use Windows com Python 3.10+, Node.js/npm e Inno Setup 6 instalado (com `ISCC.exe` no `PATH`). Na pasta do projeto, execute:

```powershell
npm run build:windows
```

Para gerar somente a versão portátil, sem Inno Setup, execute `npm run build:portable`. O arquivo `release/AuditoriaDePlanilhas-Portable-<versão>.zip` pode ser extraído em uma pasta e iniciado por `Auditoria de Planilhas.exe`. O instalador Inno Setup instala para o usuário atual e não exige permissão de administrador.

O script instala as dependências, gera `dist/python/bridge.exe` com PyInstaller, empacota o Electron em `release/win-unpacked` e cria `release/installer/AuditoriaDePlanilhas-Setup-<versão>.exe` com Inno Setup. `<versão>` vem do campo `version` do `package.json`, usado também pelo aplicativo e pelo ZIP portátil.

### Atualizar a versão de um lançamento

Use um dos comandos abaixo **antes de gerar um novo lançamento**. Eles atualizam `package.json` e `package-lock.json`, sem criar commit ou tag Git:

| Tipo de mudança | Comando | Exemplo |
| --- | --- | --- |
| Atualização habitual: incrementa a última parte | `npm version patch --no-git-tag-version` | `1.1.2` → `1.1.3` |
| Mudança grande: incrementa a segunda parte e zera a última | `npm version minor --no-git-tag-version` | `1.1.3` → `1.2.0` |
| Mudança muito grande: incrementa a primeira parte e zera as demais | `npm version major --no-git-tag-version` | `1.2.0` → `2.0.0` |

Depois execute `npm run build:windows` ou `npm run build:portable`. O build usa a versão definida e não a incrementa: repetir uma compilação ou gerar as duas distribuições mantém a mesma versão. Não edite a versão no arquivo `.iss` nem no nome do ZIP.

Para executar o build em etapas, use `npm run build:python`, `npm run build:electron` e, no PowerShell a partir da pasta do projeto:

```powershell
$appVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
ISCC.exe "/DAppVersion=$appVersion" installer/AuditoriaPlanilhas.iss
```

O compilador do instalador exige esse parâmetro para evitar uma versão fixa divergente. Se alterar a versão, gere novamente o aplicativo antes de compilar o instalador.

No modo de desenvolvimento, `electron/main.js` inicia `python/bridge.py` usando `PYTHON` ou o comando Python do sistema. No aplicativo instalado, inicia `resources/python/bridge.exe` sem depender de Python no computador.

    Get-ExecutionPolicy

---

    Set-ExecutionPolicy RemoteSigned -Scope CurrentUser



