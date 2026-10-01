# Auditoria de Planilhas

Aplicativo desktop para comparar duas planilhas Excel, revisar diferenças e salvar uma cópia corrigida. A interface usa CustomTkinter, com controles arredondados e cartões visuais, e abre como uma janela local, sem Streamlit, navegador ou servidor localhost.

## Executar durante o desenvolvimento

Instale o Python para Windows e, na pasta do projeto, rode:

```powershell
& "C:\Program Files\Python314\python.exe" -m pip install -r requirements.txt
& "C:\Program Files\Python314\python.exe" launcher.py
```

Selecione o arquivo original e o modificado, escolha uma aba comum e clique em **Comparar planilhas**. Clique em uma célula da coluna **Decisão** para abrir as opções. O botão **Aplicar** define a mesma escolha para todas as diferenças.

O aplicativo permite exportar o relatório de diferenças, as escolhas aplicadas, uma cópia do Arquivo 1 com as alterações escolhidas e o arquivo corrigido com as linhas novas do Arquivo 2.

## Gerar a pasta distribuível

Em Windows, gere uma pasta autocontida com:

```powershell
& "C:\Program Files\Python314\python.exe" -m PyInstaller --clean --noconfirm --onedir --windowed --name AuditoriaPlanilhas --collect-all customtkinter --collect-all darkdetect launcher.py
```

O executável fica em `dist\AuditoriaPlanilhas\AuditoriaPlanilhas.exe`. Para distribuição pelo Inno Setup, use **todo o conteúdo** de `dist\AuditoriaPlanilhas`, incluindo a subpasta `_internal`; o executável depende dos arquivos dessa pasta. Configure o Inno Setup para copiar a pasta inteira para `{app}` e crie um atalho para `AuditoriaPlanilhas.exe`.

O Tkinter é incluído na instalação oficial do Python para Windows. Caso o PyInstaller indique ausência do Tcl/Tk, repare a instalação do Python e habilite o componente Tcl/Tk antes de compilar novamente. A compilação deve ser feita no Windows para gerar um executável Windows.

## Atualizar a versão distribuível

Depois de alterar o código, rode novamente o comando do PyInstaller. O instalador do Inno Setup deve apontar para os arquivos atualizados dentro de `dist\AuditoriaPlanilhas`.
