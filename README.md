# Configurar projeto

O projeto necessita que o python esteja instalado na máquina portanto, é necessário que baixar o mesmo pelo google ou rodando o código abaixo

    winget install Python.Python.3.14

---
Em seguida, após clonar o projeto, rode no terminal o seguinte código que instala as dependencias necessárias para que o código funcione devidamente: 

    pip install pyinstaller


    pip install -r requirements.txt

Após a instalação, a estrutura da pasta deve estar dessa forma:

    AuditoriaPlanilhas\
    │
    ├── app_corrigido.py               (Código responsável pela lógica do sistema)
    ├── launcher.py                    (Código responsável pela interface)
    ├── README.md
    ├── requirements.txt               (Arquivo que contem as dependencias)
    ├── pasta-arquivos-excel           (Arquivos de exemplo)
    │
    └── _internal\                     (Pasta onde são armazenamdas as dependências)
        ├── ...
        ├── streamlit
        ├── pandas
        ├── numpy
        ├── openpyxl
        └── ...

Caso o conteúdo esteja diferente, execute os códigos abaixo no powershell:

    pip install streamlit==1.64.0 pandas numpy openpyxl

## Criar um executavel 

Rode o código abaixo para iniciar a compilação para um ".exe":

    python -m PyInstaller --clean --onedir --windowed --name AuditoriaPlanilhas --collect-all streamlit --add-data "app_corrigido.py;." launcher.py

---

Após o processo finalizar, a estrutura do projeto deverá estar nesse formato:

    AuditoriaPlanilhas\
    │
    ├── app_corrigido.py               (Lógica principal do sistema)
    ├── launcher.py                    (Inicialização/configuração do Streamlit)
    ├── README.md                      (Documentação)
    ├── requirements.txt               (Dependências Python)
    ├── AuditoriaPlanilhas.spec        (Configuração da compilação do PyInstaller)
    ├── pasta-arquivos-excel           (Arquivos de exemplo/teste)
    │
    ├── build\                         (Arquivos temporários da compilação)
    └── dist\                          (Resultado da compilação)
        ├── AuditoriaPlanilhas.exe     (Executável do sistema)            
        └──_internal\                  (Python e dependências empacotadas pelo PyInstaller)           
            ├── ...
            ├── streamlit
            ├── pandas
            ├── numpy
            ├── openpyxl
            └── ...

---
## Alteração após compilação
No caso de ser necessária a manutenção do código, execute os seguintes comandos:

    Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue

    Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue

    Remove-Item AuditoriaPlanilhas.spec -ErrorAction SilentlyContinue   

Após as alterações no cógido principal, faça a compilação novamente: