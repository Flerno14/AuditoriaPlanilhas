# Auditoria de Planilhas

Aplicativo para Windows que compara planilhas Excel, permite revisar traduções e salva cópias corrigidas. Os arquivos são processados localmente, sem envio do conteúdo à internet.

## Por onde começar

- [Abrir o aplicativo](#abrir-o-aplicativo)
- [Comparar duas planilhas](#comparar-planilhas)
- [Auditar e corrigir traduções](#auditar-traducoes)
- [Salvar e retomar o trabalho](#salvar-e-retomar)
- [Definir nomes e datas dos arquivos gerados](#nomes-dos-arquivos)
- [Resolver problemas comuns](#problemas-comuns)

## Documentação técnica

- [Desenvolvimento e distribuição — DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md): ambiente, arquitetura, testes, versão e build.
- [Regras e contexto do projeto — AGENTS.md](AGENTS.md): arquitetura, regras de negócio e orientações para manutenção.

<a id="abrir-o-aplicativo"></a>

## 1. Abrir o aplicativo e escolher a auditoria

Se recebeu o instalador, execute `AuditoriaDePlanilhas-Setup-<versão>.exe` e abra o aplicativo instalado. A instalação é feita para o usuário atual e não exige permissão de administrador. Se recebeu o ZIP portátil, extraia todo o conteúdo de `AuditoriaDePlanilhas-Portable-<versão>.zip` e abra `Auditoria de Planilhas.exe` na pasta extraída. Essas distribuições não exigem Python nem Node.js no computador.

Se você tem o código-fonte, siga primeiro a [preparação do ambiente de desenvolvimento](docs/DESENVOLVIMENTO.md).

No canto superior esquerdo, clique no ícone de navegação e escolha:

| Área | Quando usar | Resultado |
| --- | --- | --- |
| **Auditoria de planilhas** | Comparar um arquivo original com outro modificado | Cópia do Arquivo 1 com as decisões aplicadas e relatórios da comparação |
| **Auditoria de traduções** | Revisar inglês e português em duas colunas da mesma aba | Relatório de revisão e cópia com as traduções escolhidas |

A área ativa fica destacada. Trocar de área preserva o trabalho das duas telas. Feche o painel pelo botão, por Escape ou clicando no fundo. A navegação fica indisponível durante processamento ou retomada.

<a id="comparar-planilhas"></a>

## 2. Comparar duas planilhas

### 2.1. Selecionar arquivos e preparar a comparação

1. Abra **Auditoria de planilhas**.
2. Selecione o original como **Arquivo 1** e a versão a comparar como **Arquivo 2**.
3. Escolha uma aba comum aos dois arquivos.
4. Confira as regras de alinhamento em **Configurações**, se necessário.
5. Clique em **Comparar planilhas**.

Antes de listar diferenças, o aplicativo valida a estrutura da aba. A primeira linha deve conter cabeçalhos preenchidos e únicos. Colunas exclusivas do Arquivo 2 bloqueiam a comparação: ajuste os nomes correspondentes ou remova as colunas extras nesse arquivo. Colunas exclusivas do Arquivo 1 são preservadas. Os nomes diferenciam maiúsculas/minúsculas e acentos, ignorando apenas espaços nas extremidades. A ordem das colunas pode variar; ao alinhar pela primeira coluna, porém, a mesma coluna de chave deve ocupar a primeira posição nos dois arquivos. Os erros aparecem em uma janela sobreposta com a descrição completa. Use Fechar ou Escape para voltar à tela principal; a mensagem não é repetida no resumo nem nos avisos temporários.

Por padrão, as linhas são pareadas pela posição. **Alinhar pela primeira coluna** usa os valores dessa coluna como chaves. Chaves vazias geram erro. A validação de chaves únicas é opcional; sem ela, repetições são pareadas na ordem em que aparecem.

Áreas de anotações à direita da tabela são desconsideradas na comparação quando não possuem cabeçalhos e estão separadas por uma coluna inteiramente vazia. As anotações do Arquivo 1 são preservadas na cópia gerada. Colunas com dados sem cabeçalho dentro da tabela continuam sendo sinalizadas como erro.

### 2.2. Entender a tabela e localizar diferenças

Cada item representa uma diferença entre células de linhas presentes nos dois arquivos. Algumas situações são tratadas automaticamente:

- Valor preenchido no Arquivo 1 e vazio no Arquivo 2: mantém o valor do Arquivo 1, sem mostrar diferença para decidir.
- Linha presente somente no Arquivo 1: preserva a linha.
- Linha adicional do Arquivo 2: aparece na prévia **Ver linhas novas**, sem decisões célula a célula na tabela principal.

Combine a busca com os filtros **Decisão** e **Coluna**. A busca ignora acentos e, por padrão, maiúsculas/minúsculas; **Aa** ativa a distinção de caixa.

A tabela mostra 50 diferenças por página por padrão, com opções de 100 ou 250. A busca é aplicada após uma pausa na digitação. Filtros e aplicações em massa abrangem todas as páginas; **Próxima pendência** abre a página do próximo item pendente nos filtros atuais e volta ao início ao chegar ao final. As decisões são mantidas ao navegar.

### 2.3. Decidir e editar os valores

Na coluna **Decisão**, escolha:

| Decisão | Efeito |
| --- | --- |
| **Pendente** | Deixa a diferença para revisão posterior |
| **Manter Arquivo 1** | Preserva o valor original |
| **Usar Arquivo 2** | Aplica o valor do segundo arquivo |
| **Valor personalizado** | Aplica o texto informado por você |

Para escrever uma terceira alternativa, selecione **Valor personalizado** na decisão da linha. O popup exibe o valor do Arquivo 1, o do Arquivo 2 e o campo editável. **Usar este valor** salva o texto e o mostra centralizado sobre as duas colunas; escolher outra decisão restaura os valores originais. Selecione novamente a opção para editar. **Cancelar** ou Escape preserva a escolha anterior. O valor é gravado como texto literal (preservando zeros à esquerda e quebras de linha); vazio limpa a célula. Ele é usado no arquivo corrigido com ou sem marcação e nas exportações, e é preservado na sessão salva.

Dê **duplo clique em uma célula de dados** da tabela para abrir o conteúdo completo da linha. O popup mostra todas as colunas dos dois arquivos lado a lado, com textos completos, números das linhas de origem e decisões atuais. A coluna selecionada fica destacada. Pelo teclado, foque o número da linha e pressione **Enter**. **Voltar à revisão** ou Escape fecha o popup sem alterar decisões, filtros ou página.

No popup **Conteúdo completo da linha**, todas as colunas usam o mesmo menu de decisão da tabela: **Manter Arquivo 1**, **Usar Arquivo 2**, **Valor personalizado** e **Pendente**. Células sem diferença começam em Manter Arquivo 1 e só entram na revisão ao confirmar uma escolha; aparecem então na tabela, nos filtros, na sessão e nas exportações. Desfazer essa primeira escolha remove o registro acrescentado. Se a coluna não existir no Arquivo 2, essa opção fica desabilitada; ainda é possível editar um valor personalizado. Escolher explicitamente um valor vazio do Arquivo 2 limpa a célula. O editor personalizado abre sobre o popup; confirmar atualiza a decisão, e cancelar ou Escape preserva a escolha anterior sem acrescentar registros. O contexto da linha continua aberto.

### 2.4. Aplicar decisões em massa e desfazer

Abra **Decisão em massa**, escolha **Pendente**, **Manter Arquivo 1** ou **Usar Arquivo 2**, defina o escopo em **Aplicar em** e clique em **Aplicar**. O escopo pode ser todas as diferenças ou somente os itens filtrados, incluindo todas as páginas. Voltar a pendente remove o valor personalizado ativo e restaura as duas colunas. As alterações são salvas automaticamente.

**Desfazer** restaura a última alteração individual ou aplicação em massa, mesmo que os filtros tenham mudado. O histórico guarda até 100 ações durante a revisão aberta e é limpo ao comparar novamente ou retomar uma sessão. Ele não desfaz arquivos Excel já gerados.

Essas decisões usam o mesmo salvamento automático e histórico da tabela. **Desfazer última decisão** restaura a última ação da revisão, inclusive de outra linha ou uma ação em massa. Fechar o popup não cancela decisões já confirmadas.

### 2.5. Usar os recursos opcionais de revisão

Para facilitar a leitura de textos longos, ative **Configurações → Comparação de textos → Destacar trechos diferentes nos textos**. A preferência começa desativada e fica salva neste computador. Na tabela, rosa com sublinhado tracejado indica trechos removidos ou substituídos do Arquivo 1; verde com sublinhado contínuo indica trechos adicionados ou substituídos no Arquivo 2. A legenda identifica os símbolos de espaços, tabulações e quebras de linha alterados. Tags são exibidas literalmente.

Ativar ou desativar preserva as decisões e não refaz a comparação. O destaque é apenas visual, não altera os valores copiados ou gerados e não muda a cor de marcação no Excel. Células personalizadas mantêm sua apresentação centralizada. Em textos muito extensos, o destaque pode abranger blocos maiores e omitir os símbolos individuais de espaços para manter a navegação responsiva.

Em **Configurações → Validação de traduções**, ative **Verificar marcadores, tags e URLs**. A opção fica salva neste computador e começa desativada. Sinaliza elementos removidos ou adicionados, incluindo repetições: marcadores simples (`{name}`, `{0}`, `{{name}}`), formatos como `%s` e `%d`, tags e URLs HTTP/HTTPS ou `www`. Também sinaliza mudanças na ordem das tags e de formatos sem posição explícita.

Na tabela, clique em **aviso(s)** ao lado da decisão para ver os detalhes. Os avisos também aparecem no popup de conteúdo completo da linha. A verificação compara o Arquivo 1 com o Arquivo 2 nas decisões pendentes ou “Usar Arquivo 2”, e com o texto personalizado nessa escolha; “Manter Arquivo 1” não gera avisos. Salvar a opção preserva a revisão, sem refazer a comparação.

Os avisos são orientativos: não alteram decisões nem bloqueiam a geração. A verificação abrange as células da tabela de diferenças, não as linhas novas, e não é exportada nos relatórios. Não valida toda sintaxe de tradução ou a disponibilidade de links; mudanças intencionais também podem gerar avisos.


### 2.6. Conferir linhas novas, gerar e exportar

Antes de gerar a cópia corrigida, resolva todas as diferenças **Pendentes**. Use o filtro de decisão e **Próxima pendência** para encontrá-las.

1. Use **Ver linhas novas** para conferir as linhas adicionais do Arquivo 2. A prévia mostra a linha de origem e os valores nas colunas do Arquivo 1, com 50 linhas por página.
2. Clique em **Gerar arquivo corrigido**.
3. No popup, ative **Marcar células alteradas** se quiser destacar as alterações com a cor definida em Configurações. A opção começa desativada e não modifica as decisões.
4. Clique em **Continuar**. Se houver linhas novas, confirme a prévia em **Gerar com estas linhas** ou volte à revisão.
5. Escolha o nome e o local para salvar a cópia.

**Cancelar** ou Escape no popup não gera arquivo nem altera a revisão. Linhas novas são incluídas com ou sem marcação; o resumo distingue as células a alterar das linhas novas disponíveis. Arquivos de origem alterados bloqueiam a prévia.

O aplicativo exporta o relatório de diferenças, as escolhas aplicadas, o arquivo corrigido baseado no Arquivo 1, com as alterações escolhidas e as linhas novas do Arquivo 2. Arquivos `.xlsm` mantêm as macros ao gerar a cópia corrigida.

As linhas novas herdam a formatação da última linha original, incluindo cores já existentes no arquivo. Elas não recebem a marcação aplicada às células alteradas durante a revisão.

Os ícones para exportar os relatórios de diferenças e escolhas ficam no cabeçalho da coluna **Decisão**. A exportação de escolhas também exige resolver todas as pendências. Modelos `.xlsx` podem ser definidos em Configurações; os dados são escritos na primeira aba do modelo. As regras de data dos nomes estão na seção 5.

### 2.7. Começar outra comparação

**Limpar arquivos** remove as duas seleções, as decisões e a sessão salva, sem excluir as planilhas Excel. **Inverter arquivos 1 e 2** troca o original pelo modificado e refaz a comparação na mesma aba. Ambas as ações pedem confirmação se houver decisões tomadas. A inversão exige os dois arquivos selecionados e aplica as validações novamente, pois o novo Arquivo 1 passa a definir a estrutura da saída.

Alterar a cor de destaque ou os modelos de exportação preserva as decisões da revisão. Mudar o alinhamento das linhas ou a validação de chaves com alinhamento ativo exige uma nova comparação. Se já houver decisões tomadas, o aplicativo pede confirmação antes de descartá-las, inclusive ao comparar novamente ou trocar arquivo/aba. Cancelar mantém a revisão atual.

<a id="auditar-traducoes"></a>

## 3. Auditar e corrigir traduções

### 3.1. Selecionar a planilha e as colunas

1. Abra **Auditoria de traduções** pelo menu de navegação.
2. Clique em **Escolher planilha** e selecione o arquivo.
3. Escolha a aba, a coluna em inglês e a coluna em português. As duas colunas devem ser diferentes e estar na mesma aba.
4. Se desejar, escolha uma coluna de identificação para reconhecer as linhas.
5. Configure a proximidade semântica opcional, se disponível, e clique em **Analisar traduções**.

A análise objetiva funciona sem modelo. A seção **Proximidade semântica** aceita uma pasta local preparada conforme o [guia de desenvolvimento](docs/DESENVOLVIMENTO.md). Use **Selecionar modelo local** para escolhê-la ou **Usar somente alertas** para analisar sem modelo. As dependências e os pesos de IA não fazem parte da distribuição padrão. Nenhuma análise baixa pesos ou envia textos à internet.

### 3.2. Interpretar os resultados

A análise verifica todas as linhas: traduções vazias, marcadores, formatos printf, tags, URLs, números, textos idênticos e diferenças acentuadas de comprimento. Os avisos orientam a revisão humana; não confirmam automaticamente que a tradução está errada.

Para reduzir falsos alertas, o detector distingue printf de porcentagens seguidas de prosa, prefixos de palavras, variáveis de ambiente e escapes em URLs. Aceita mudanças de espaços externos, aspas e ordem de atributos nas mesmas tags, preservando a conferência dos valores e da ordem das tags. Números seguem as convenções inglês → português (`1,234.50` e `1.234,50` são equivalentes); mudanças de sinal, valor e quantidade continuam sinalizadas. Sintaxes ambíguas ou não suportadas ainda exigem revisão humana: esta checagem não interpreta datas, unidades ou todas as linguagens de formatação.

A proximidade exibida é similaridade de cosseno, não percentual de acerto. Para pelo menos cinco pares avaliados, a faixa inferior de 20% do documento (incluindo empates) recebe prioridade de conferência; isso não classifica automaticamente traduções como erradas. Alertas estruturais continuam prioritários mesmo com nota alta. Textos acima do limite de tokens do modelo recebem aviso e ficam sem nota, sem truncamento silencioso. Glossário, segmentação de textos longos e alinhamento entre arquivos separados não fazem parte desta primeira versão. Ainda é necessário calibrar a utilidade das notas com traduções revisadas do domínio de uso.

Sem modelo, a proximidade aparece como **Não calculada**. Os alertas objetivos continuam disponíveis.

### 3.3. Localizar e revisar as linhas

Na revisão, use **Alerta** para exibir um tipo de ocorrência (por exemplo, Tags, Números divergentes ou Tradução vazia) ou **Sem alertas**. As opções são preenchidas com os tipos encontrados na análise. O filtro combina-se com busca, prioridade e revisão, incluindo a navegação por **Próximo não revisado**. A exportação continua contendo todas as linhas.

Na auditoria de traduções, **Itens por página** permite escolher 50, 100 ou 250 linhas. Use **Anterior** e **Próxima** para navegar pelos resultados filtrados. Alterar a quantidade volta à primeira página e preserva as revisões; **Próximo não revisado** abre a página correspondente ao tamanho escolhido.

A busca considera inglês, português, identificação e alertas. Use **Ver linha** ou duplo clique em uma célula para ler os textos completos. Na coluna **Revisão**, escolha **Não revisado**, **Revisado** ou **Precisa corrigir**.

Em **Revisão em massa**, escolha **Não revisado**, **Revisado** ou **Precisa corrigir** e aplique a **Todas as traduções** ou aos **Itens filtrados**. A ação abrange todas as páginas do escopo escolhido, preserva as demais linhas e salva as alterações automaticamente.

### 3.4. Editar uma tradução

1. Clique em **Editar**, na coluna entre **Prioridade / alertas** e **Revisão**, ou abra **Ver linha**.
2. Confira o inglês e o português original.
3. Digite o novo texto em **Valor para substituir a tradução**.
4. Clique em **Confirmar substituição**.

A linha passa automaticamente para **Revisado**. A tradução escolhida aparece na tabela, os alertas são recalculados e a nota semântica anterior é invalidada, sem nova inferência automática. As escolhas são salvas na sessão.

Texto vazio limpa a célula; texto iniciado por `=` permanece literal. **Fechar / cancelar edição** ou Escape descarta apenas o que ainda não foi confirmado e preserva o estado anterior. **Restaurar original** remove a substituição e volta a linha para **Não revisado**.

### 3.5. Substituir texto em massa nos itens filtrados

Exemplo: trocar `Screenshot` por `Captura de tela`.

1. Pesquise **Screenshot** e combine outros filtros, se necessário.
2. Abra **Substituir texto nos itens filtrados**.
3. Em **Localizar na tradução**, informe `Screenshot`.
4. Em **Substituir por**, informe `Captura de tela`.
5. Clique em **Substituir nos filtrados** e confira a quantidade de traduções alteradas.

A ação substitui todas as ocorrências exatas no português dos itens filtrados, em todas as páginas, preservando o restante do texto. Usa o valor editado, quando houver, e distingue maiúsculas/minúsculas. Deixar **Substituir por** vazio remove o trecho; deixar **Localizar na tradução** vazio não aplica alterações. O conjunto de linhas é definido antes da substituição, mesmo que o novo texto ou estado deixe de corresponder aos filtros.

A busca pode encontrar `Screenshot` somente no inglês; nesse caso, uma tradução sem esse trecho não é modificada. Apenas as linhas cujo texto muda são marcadas como **Revisado**. Suas notas semânticas são invalidadas, os alertas são recalculados e as escolhas são salvas. A ação é recusada sem alterações se algum resultado ultrapassar 32.767 caracteres.

### 3.6. Exportar o relatório e gerar a cópia corrigida

**Exportar relatório** inclui todas as linhas, mesmo com filtros ativos, com textos originais, revisões, alertas, notas disponíveis e valores escolhidos. Textos iniciados por `=` são escritos literalmente.

Depois de confirmar uma ou mais substituições, clique em **Gerar traduções corrigidas**, à direita de **Exportar relatório**, e escolha o nome e o local da cópia. A geração aplica as substituições de todas as páginas, inclusive itens ocultos pelos filtros, apenas na coluna de tradução selecionada na análise. As outras células, estilos e macros de arquivos `.xlsm` são preservados. As regras de data dos nomes estão na seção 5.

Marcar uma linha como **Revisado** ou **Precisa corrigir** não cria, por si só, uma substituição de texto. O botão de geração fica disponível quando existe uma substituição confirmada. A cópia usa essas escolhas; as demais traduções permanecem como no arquivo de entrada.

<a id="salvar-e-retomar"></a>

## 4. Salvar, interromper e retomar o trabalho

As duas auditorias mantêm sessões separadas neste computador. **Salvar sessão** força o salvamento pendente e permite tentar novamente após falhas. Fechar normalmente aguarda as gravações. Se o salvamento falhar, a janela permanece aberta; encerramentos forçados podem perder alterações ainda não gravadas.

### Auditoria de planilhas

A última comparação válida é salva automaticamente, incluindo arquivos, aba, regras e decisões. Ao reabrir o aplicativo, a sessão é retomada automaticamente; **Retomar sessão** repete a recuperação. A faixa de sessão indica alterações pendentes, gravação em andamento ou revisão salva. Há somente uma sessão por área, sem histórico de várias sessões. Uma comparação válida substitui a anterior; falhas de comparação ou retomada não apagam a sessão salva.

### Auditoria de traduções

As revisões e substituições são salvas automaticamente, e a análise mantém pontos de recuperação. Use **Retomar sessão** para recuperar resultados, revisões e substituições, inclusive resultados parciais. A inferência semântica pendente não continua automaticamente. Iniciar outra análise exige confirmar o descarte dos resultados existentes.

### Arquivos de origem e cancelamento

Para retomar ou gerar arquivos, mantenha as planilhas de origem nos mesmos caminhos e com o mesmo conteúdo. A verificação usa SHA-256. Se um arquivo mudou ou está ausente, restaure o original ou inicie uma nova análise com o arquivo atual. Não é suficiente manter somente o nome do arquivo.

Durante o processamento, use **Cancelar processamento** na comparação ou **Cancelar análise** na tradução. O processo Python é interrompido; a próxima operação inicia outro. A sessão já salva permanece disponível. A auditoria de traduções conserva resultados parciais; conclua ou cancele a operação antes de fechar. Operações Python têm limite de 10 minutos. A paginação facilita a navegação, mas a leitura completa ainda ocupa memória, sobretudo em arquivos grandes.

As sessões ficam em `audit-session.json` e `translation-session.json`, e as preferências em `settings.json`, na pasta de dados do aplicativo do usuário. Detalhes de persistência estão no [guia técnico](docs/DESENVOLVIMENTO.md).

<a id="nomes-dos-arquivos"></a>

## 5. Definir nomes e datas dos arquivos gerados

Todos os arquivos gerados recebem a data local do dia no nome sugerido, no formato `_AAAAMMDD`, antes da extensão. O nome anterior é preservado, incluindo datas antigas e outros sufixos. Por exemplo, uma geração em 12/10/2026 pode resultar em `All Translations of Defense_IA_20260817_corrigido_20261012.xlsx` ou `diferencas_entre_arquivos_20261012.xlsx`. Você pode editar o nome no diálogo de salvamento.

Em **Configurações → Nomes dos arquivos gerados**, ative **Substituir datas existentes no nome pela data atual** para atualizar as datas válidas em `AAAAMMDD`, em qualquer posição do nome, sem acrescentar outra data. Por exemplo, `Planilha_20260817_corrigido.xlsx` passa a `Planilha_20261012_corrigido.xlsx` em 12/10/2026. Se houver várias datas, todas são atualizadas nas posições existentes; se não houver nenhuma, a data é acrescentada ao final. A opção vale para todos os arquivos gerados, fica salva neste computador e não altera as decisões da revisão.

<a id="problemas-comuns"></a>

## 6. Resolver problemas comuns

| Situação | Como continuar |
| --- | --- |
| Cabeçalhos vazios, repetidos ou colunas incompatíveis | Leia o diálogo de erro, ajuste as planilhas conforme a etapa 2.1 e compare novamente. Fechar ou Escape retorna à interface. |
| Arquivo alterado ou não encontrado | Restaure o arquivo usado na análise ou selecione o atual e inicie uma nova revisão. |
| Geração da comparação bloqueada por pendências | Use o filtro de decisão e **Próxima pendência** para concluir as escolhas. |
| Botão **Gerar traduções corrigidas** desabilitado | Confirme uma substituição de texto; mudar apenas o estado de revisão não modifica a tradução. |
| Substituição em massa não alterou linhas | Confira o texto em português, a distinção de caixa e os filtros. A busca pode ter encontrado apenas o inglês, a identificação ou um alerta. |
| Linhas desapareceram depois de editar | O texto ou estado pode ter deixado de corresponder ao filtro. Limpe os filtros para encontrá-las. |
| Falha ao salvar sessão | Use **Salvar sessão** para tentar novamente antes de fechar. |
| Proximidade não calculada | Verifique se há modelo local disponível, se o texto excede seu limite, se a análise foi interrompida ou se a tradução foi editada. Os alertas objetivos continuam disponíveis. |

Para manutenção do aplicativo, consulte [Desenvolvimento e distribuição](docs/DESENVOLVIMENTO.md) e as [regras do projeto](AGENTS.md).
