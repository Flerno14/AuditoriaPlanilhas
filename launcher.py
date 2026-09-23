import os
import sys

from streamlit.web.cli import main


PORTA = 3000


def obter_caminho_app():
    if getattr(sys, "frozen", False):
        diretorio = sys._MEIPASS
    else:
        diretorio = os.path.dirname(os.path.abspath(__file__))

    return os.path.join(diretorio, "app_corrigido.py")


def main_launcher():
    aplicativo = obter_caminho_app()

    argumentos = [
        "run",
        aplicativo,
        "--server.port=3000",
        "--server.address=localhost",
        "--server.headless=false",
        "--browser.gatherUsageStats=false",
        "--server.fileWatcherType=none",
        "--global.developmentMode=false",
    ]

    main(
        args=argumentos,
        prog_name="streamlit",
        standalone_mode=False,
    )


if __name__ == "__main__":
    main_launcher()