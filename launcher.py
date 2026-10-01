"""Interface desktop nativa para auditoria de planilhas Excel."""
from io import BytesIO
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

import customtkinter as ctk
import pandas as pd

import app_corrigido as core


DECISOES = ["Pendente", "Manter Arquivo 1", "Usar Arquivo 2"]


class AuditoriaApp:
    def __init__(self, root):
        self.root = root
        root.title("Auditoria de Planilhas")
        root.geometry("1320x850")
        root.minsize(1000, 680)
        self.arquivo1 = None
        self.arquivo2 = None
        self.relatorio = pd.DataFrame()
        self.novas = 0
        self.aba = ""
        self._montar_interface()

    def _montar_interface(self):
        ctk.set_appearance_mode("light")
        ctk.set_default_color_theme("green")
        style = ttk.Style(self.root)
        style.theme_use("clam")
        style.configure("TFrame", background="#f3f6fa")
        style.configure("Card.TFrame", background="#ffffff")
        style.configure("TLabel", background="#f3f6fa", foreground="#344054", font=("Segoe UI", 10))
        style.configure("Card.TLabel", background="#ffffff", foreground="#344054", font=("Segoe UI", 10))
        style.configure("Title.TLabel", background="#f3f6fa", foreground="#152238", font=("Segoe UI", 23, "bold"))
        style.configure("Subtitle.TLabel", background="#f3f6fa", foreground="#667085", font=("Segoe UI", 10))
        style.configure("Section.TLabel", background="#ffffff", foreground="#152238", font=("Segoe UI", 12, "bold"))
        style.configure("Treeview", background="#ffffff", fieldbackground="#ffffff", foreground="#344054", rowheight=38, font=("Segoe UI", 9), borderwidth=1, relief="solid")
        style.configure("Treeview.Heading", background="#e0eee8", foreground="#23423a", font=("Segoe UI", 9, "bold"), padding=(10, 11), borderwidth=1, relief="solid", bordercolor="#c9d9d1")
        style.map("Treeview", background=[("selected", "#d9f4e4")], foreground=[("selected", "#193336")])
        style.configure("TCombobox", padding=7, font=("Segoe UI", 9))

        area = ctk.CTkFrame(self.root, fg_color="#f5f5f5", corner_radius=0)
        area.pack(fill="both", expand=True)
        header = ctk.CTkFrame(area, fg_color="#ffffff", corner_radius=0, height=54)
        header.pack(fill="x", pady=(0, 20))
        ctk.CTkFrame(header, fg_color="#00c853", corner_radius=0, height=4).pack(fill="x", side="top")
        ctk.CTkLabel(header, text="Planilha", text_color="#00b94f", font=ctk.CTkFont("Segoe UI", 20, "bold")).pack(side="left", padx=18, pady=9)
        ctk.CTkLabel(header, text="Central de auditoria", text_color="#4c6070", font=ctk.CTkFont("Segoe UI", 10)).pack(side="left", padx=12)
        ctk.CTkLabel(area, text="AUDITORIA DE PLANILHAS", text_color="#00ad4b", font=ctk.CTkFont("Segoe UI", 9, "bold")).pack(anchor="w")
        ctk.CTkLabel(area, text="Compare versões com clareza.", text_color="#193336", font=ctk.CTkFont("Segoe UI", 28, weight="normal")).pack(anchor="w", pady=(4, 2))
        ctk.CTkLabel(area, text="Revise diferenças, escolha os dados corretos e gere uma planilha corrigida.", text_color="#59697a", font=ctk.CTkFont("Segoe UI", 11)).pack(anchor="w", pady=(0, 14))

        arquivos = ctk.CTkFrame(area, fg_color="#ffffff", corner_radius=12)
        arquivos.pack(fill="x", pady=(0, 12), ipady=10, ipadx=12)
        self.path1 = tk.StringVar(value="Nenhum arquivo selecionado")
        self.path2 = tk.StringVar(value="Nenhum arquivo selecionado")
        ctk.CTkLabel(arquivos, text="01  ARQUIVO ORIGINAL", text_color="#1d3735", font=ctk.CTkFont("Segoe UI", 11, "bold")).grid(row=0, column=0, sticky="w", padx=10, pady=8)
        ctk.CTkLabel(arquivos, textvariable=self.path1, text_color="#65746f").grid(row=0, column=1, sticky="w", padx=8)
        ctk.CTkButton(arquivos, text="Escolher arquivo", command=lambda: self.selecionar(1), fg_color="#ffffff", hover_color="#eff7f2", text_color="#24463d", border_width=1, border_color="#dce6e0", corner_radius=22).grid(row=0, column=2, padx=10)
        ctk.CTkLabel(arquivos, text="02  ARQUIVO MODIFICADO", text_color="#1d3735", font=ctk.CTkFont("Segoe UI", 11, "bold")).grid(row=1, column=0, sticky="w", padx=10, pady=8)
        ctk.CTkLabel(arquivos, textvariable=self.path2, text_color="#65746f").grid(row=1, column=1, sticky="w", padx=8)
        ctk.CTkButton(arquivos, text="Escolher arquivo", command=lambda: self.selecionar(2), fg_color="#ffffff", hover_color="#eff7f2", text_color="#24463d", border_width=1, border_color="#dce6e0", corner_radius=22).grid(row=1, column=2, padx=10)

        selecao = ctk.CTkFrame(area, fg_color="#ffffff", corner_radius=12)
        selecao.pack(fill="x", pady=(0, 12), ipady=5)
        ctk.CTkLabel(selecao, text="Aba da planilha", text_color="#344b46").pack(side="left", padx=(14, 8), pady=8)
        self.sheet = tk.StringVar()
        self.sheet_box = ctk.CTkComboBox(selecao, variable=self.sheet, values=[], state="readonly", width=220, command=lambda _value: self.comparar(), dropdown_fg_color="#ffffff", dropdown_hover_color="#e0eee8", dropdown_text_color="#193336")
        self.sheet_box.pack(side="left", padx=10)
        ctk.CTkButton(selecao, text="Comparar planilhas", command=self.comparar, fg_color="#00c853", hover_color="#00b84a", text_color="#063a27", corner_radius=22).pack(side="left", padx=(4, 16))
        ctk.CTkLabel(selecao, text="Clique em uma decisão para escolher o valor.", text_color="#697970").pack(side="left")

        area_tabela = ctk.CTkFrame(area, fg_color="#ffffff", corner_radius=12)
        area_tabela.pack(fill="both", expand=True)
        barra_tabela = ctk.CTkFrame(area_tabela, fg_color="transparent")
        barra_tabela.pack(fill="x", pady=(0, 10), padx=12)
        ctk.CTkLabel(barra_tabela, text="Diferenças encontradas", text_color="#193336", font=ctk.CTkFont("Segoe UI", 13, "bold")).pack(side="left")
        ctk.CTkLabel(barra_tabela, text="Aplicar a todas:", text_color="#344b46").pack(side="right", padx=(12, 6))
        self.bulk_choice = tk.StringVar(value=DECISOES[1])
        ctk.CTkComboBox(barra_tabela, variable=self.bulk_choice, values=DECISOES[1:], state="readonly", width=190, dropdown_fg_color="#ffffff", dropdown_hover_color="#e0eee8", dropdown_text_color="#193336").pack(side="right")
        ctk.CTkButton(barra_tabela, text="Aplicar", command=self.aplicar_todas, fg_color="#ffffff", hover_color="#eff7f2", text_color="#24463d", border_width=1, border_color="#dce6e0", corner_radius=20, width=82).pack(side="right", padx=7)

        frame = ctk.CTkFrame(area_tabela, fg_color="#ffffff", corner_radius=0)
        frame.pack(fill="both", expand=True, padx=12, pady=(0, 12))
        cols = ("linha", "coluna", "v1", "v2", "decisao")
        self.table = ttk.Treeview(frame, columns=cols, show="headings", selectmode="extended")
        titulos = {"linha": "Linha", "coluna": "Coluna", "v1": "Arquivo 1 — Original", "v2": "Arquivo 2 — Modificado", "decisao": "Decisão"}
        larguras = {"linha": 65, "coluna": 150, "v1": 260, "v2": 260, "decisao": 160}
        for c in cols:
            self.table.heading(c, text=titulos[c])
            self.table.column(c, width=larguras[c], minwidth=55, stretch=c in ("v1", "v2"))
        self.table.tag_configure("stripe_a", background="#ffffff")
        self.table.tag_configure("stripe_b", background="#f0f2f1")
        yscroll = ttk.Scrollbar(frame, orient="vertical", command=self.table.yview)
        xscroll = ttk.Scrollbar(area_tabela, orient="horizontal", command=self.table.xview)
        self.table.configure(yscrollcommand=yscroll.set, xscrollcommand=xscroll.set)
        self.table.grid(row=0, column=0, sticky="nsew")
        yscroll.grid(row=0, column=1, sticky="ns")
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)
        xscroll.pack(fill="x")
        self.table.bind("<Button-1>", self.abrir_opcoes_decisao)

        resumo = ctk.CTkFrame(area, fg_color="#ffffff", corner_radius=10)
        resumo.pack(fill="x", pady=(12, 10))
        self.summary = tk.StringVar(value="Selecione os dois arquivos Excel para começar.")
        ctk.CTkLabel(resumo, textvariable=self.summary, text_color="#344b46").pack(anchor="w", padx=14, pady=10)
        botoes = ctk.CTkFrame(area, fg_color="transparent")
        botoes.pack(fill="x")
        for text, command in (
            ("Exportar diferenças", self.exportar_diferencas),
            ("Exportar escolhas", self.exportar_escolhas),
            ("Salvar alterações", lambda: self.gerar(False, True)),
        ):
            ctk.CTkButton(botoes, text=text, command=command, fg_color="#ffffff", hover_color="#eff7f2", text_color="#24463d", border_width=1, border_color="#dce6e0", corner_radius=22).pack(side="left", padx=(0, 8))
        ctk.CTkButton(botoes, text="Gerar arquivo corrigido", command=lambda: self.gerar(True, False), fg_color="#00c853", hover_color="#00b84a", text_color="#063a27", corner_radius=22).pack(side="right")

    def selecionar(self, numero):
        caminho = filedialog.askopenfilename(title="Selecionar planilha Excel", filetypes=[("Planilhas Excel", "*.xlsx *.xlsm")])
        if not caminho:
            return
        try:
            dados = Path(caminho).read_bytes()
            abas = core.obter_abas(dados)
            if numero == 1:
                self.arquivo1 = (Path(caminho), dados, abas)
                self.path1.set(f"Arquivo 1: {Path(caminho).name}")
            else:
                self.arquivo2 = (Path(caminho), dados, abas)
                self.path2.set(f"Arquivo 2: {Path(caminho).name}")
            if self.arquivo1 and self.arquivo2:
                comuns = [a for a in self.arquivo1[2] if a in self.arquivo2[2]]
                if not comuns:
                    raise ValueError("Os arquivos não possuem abas com o mesmo nome.")
                anterior = self.sheet.get()
                self.sheet_box.configure(values=comuns)
                self.sheet.set(anterior if anterior in comuns else comuns[0])
                self.comparar()
        except Exception as exc:
            messagebox.showerror("Erro ao abrir planilha", str(exc))

    @staticmethod
    def valor_texto(valor):
        if pd.isna(valor):
            return ""
        return str(valor)

    def comparar(self):
        if not self.arquivo1 or not self.arquivo2 or not self.sheet.get():
            return
        try:
            self.aba = self.sheet.get()
            self.relatorio, self.novas = core.comparar_dataframes(self.arquivo1[1], self.arquivo2[1], self.aba)
            self.table.delete(*self.table.get_children())
            for pos, (i, row) in enumerate(self.relatorio.iterrows()):
                stripe = "stripe_a" if pos % 2 == 0 else "stripe_b"
                self.table.insert("", "end", iid=str(i), values=(row["Índice/Linha"], row["Nome da Coluna"], self.valor_texto(row["Valor no Arquivo 1"]), self.valor_texto(row["Valor no Arquivo 2"]), row["Decisão"]), tags=(stripe,))
            self.atualizar_resumo()
        except Exception as exc:
            messagebox.showerror("Erro na comparação", str(exc))

    def atualizar_resumo(self):
        if self.relatorio.empty:
            pendentes = usar = manter = 0
        else:
            escolhas = [self.table.item(iid, "values")[4] for iid in self.table.get_children()]
            pendentes = escolhas.count("Pendente")
            usar = escolhas.count("Usar Arquivo 2") + self.novas
            manter = escolhas.count("Manter Arquivo 1")
        self.summary.set(f"Diferenças: {len(self.relatorio)}   |   Pendentes: {pendentes}   |   Usar Arquivo 2: {usar}   |   Manter Arquivo 1: {manter}   |   Novas linhas adicionadas automaticamente: {self.novas}")

    def abrir_opcoes_decisao(self, event):
        item = self.table.identify_row(event.y)
        col = self.table.identify_column(event.x)
        if not item or col != "#5":
            return
        if getattr(self, "decision_popup", None) is not None:
            try:
                self.decision_popup.destroy()
            except tk.TclError:
                pass

        atual = self.table.item(item, "values")[4]
        popup = ctk.CTkToplevel(self.root)
        self.decision_popup = popup
        popup.overrideredirect(True)
        popup.geometry(f"270x166+{event.x_root}+{event.y_root}")
        popup.attributes("-topmost", True)
        popup_frame = ctk.CTkFrame(popup, fg_color="#ffffff", corner_radius=12, border_width=1, border_color="#dce6e0")
        popup_frame.pack(fill="both", expand=True, padx=2, pady=2)
        ctk.CTkLabel(popup_frame, text="ESCOLHA UMA DECISÃO", text_color="#00a64b", font=ctk.CTkFont("Segoe UI", 9, "bold")).pack(anchor="w", padx=12, pady=(10, 5))
        for decisao in DECISOES:
            selecionada = decisao == atual
            ctk.CTkButton(
                popup_frame,
                text=decisao,
                anchor="w",
                height=34,
                corner_radius=8,
                fg_color="#e1f1e9" if selecionada else "#ffffff",
                hover_color="#e1f1e9",
                text_color="#008e45" if selecionada else "#193336",
                command=lambda escolha=decisao, janela=popup: self._escolher_decisao_popup(janela, item, escolha),
            ).pack(fill="x", padx=7, pady=2)
        popup.bind("<Escape>", lambda _event: popup.destroy())
        popup.bind("<FocusOut>", lambda _event: popup.after(120, popup.destroy))
        popup.lift()
        popup.focus_force()

    def _escolher_decisao_popup(self, popup, item, decisao):
        self.definir_decisao(item, decisao)
        popup.destroy()

    def definir_decisao(self, item, decisao):
        valores = list(self.table.item(item, "values"))
        valores[4] = decisao
        self.table.item(item, values=valores)
        self.atualizar_resumo()

    def aplicar_todas(self):
        for iid in self.table.get_children():
            vals = list(self.table.item(iid, "values"))
            vals[4] = self.bulk_choice.get()
            self.table.item(iid, values=vals)
        self.atualizar_resumo()

    def decisoes_df(self):
        if self.relatorio.empty:
            return self.relatorio.copy()
        result = self.relatorio.copy()
        for iid in self.table.get_children():
            result.at[int(iid), "Decisão"] = self.table.item(iid, "values")[4]
        return result

    def salvar_bytes(self, conteudo, titulo, nome):
        destino = filedialog.asksaveasfilename(title=titulo, initialfile=nome, defaultextension=Path(nome).suffix, filetypes=[("Planilhas Excel", "*.xlsx *.xlsm")])
        if not destino:
            return
        Path(destino).write_bytes(conteudo)
        messagebox.showinfo("Arquivo salvo", f"Arquivo salvo em:\n{destino}")

    def exportar_diferencas(self):
        if self.relatorio.empty:
            messagebox.showinfo("Sem diferenças", "Não há diferenças para exportar.")
            return
        out = BytesIO()
        self.decisoes_df().to_excel(out, index=False, sheet_name="Diferenças")
        self.salvar_bytes(out.getvalue(), "Exportar diferenças", "diferencas_entre_arquivos.xlsx")

    def exportar_escolhas(self):
        decis = self.decisoes_df()
        if decis.empty:
            messagebox.showinfo("Sem diferenças", "Não há escolhas para exportar.")
            return
        if decis["Decisão"].eq("Pendente").any():
            messagebox.showwarning("Decisões pendentes", "Resolva todas as diferenças antes de exportar as escolhas.")
            return
        aplicadas = decis.apply(lambda r: r["Valor no Arquivo 2"] if r["Decisão"] == "Usar Arquivo 2" else r["Valor no Arquivo 1"], axis=1)
        out = BytesIO()
        pd.DataFrame({"Linha": decis["Índice/Linha"], "Coluna": decis["Nome da Coluna"], "Mudanças Aplicadas": aplicadas}).to_excel(out, index=False, sheet_name="Conteúdo escolhido")
        self.salvar_bytes(out.getvalue(), "Exportar escolhas", "mudancas_aplicadas.xlsx")

    def gerar(self, incluir_novas, laranja):
        if not self.arquivo1 or not self.arquivo2:
            return
        decis = self.decisoes_df()
        if decis["Decisão"].eq("Pendente").any():
            messagebox.showwarning("Decisões pendentes", "Resolva todas as diferenças antes de gerar o arquivo.")
            return
        try:
            conteudo, alteracoes, linhas = core.gerar_arquivo_corrigido(
                self.arquivo1[1], self.arquivo2[1], self.relatorio, decis, self.aba,
                self.arquivo1[0].name, incluir_linhas_novas=incluir_novas,
                marcar_alteracoes_laranja=laranja,
            )
            sufixo = "_corrigido" if incluir_novas else "_somente_alteracoes"
            nome = self.arquivo1[0].stem + sufixo + self.arquivo1[0].suffix
            self.salvar_bytes(conteudo, "Salvar arquivo gerado", nome)
            self.summary.set(f"Arquivo gerado: {alteracoes} célula(s) alterada(s), {linhas} linha(s) nova(s) adicionada(s).")
        except Exception as exc:
            messagebox.showerror("Erro ao gerar arquivo", str(exc))


def main():
    root = ctk.CTk()
    AuditoriaApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
