# Jak to dostat na GitHub (bez příkazové řádky)

1. Jdi na **github.com/new**. Název `anse-podklady`, zaškrtni **Private**, nic dalšího nevyplňuj
   (žádné README ani .gitignore — máš je tady). Klikni **Create repository**.
2. Na prázdné stránce repa klikni odkaz **uploading an existing file**.
3. Rozbal tenhle zip a **přetáhni do okna prohlížeče obsah složky** — tedy `data`, `docs`,
   `README.md`, `CLAUDE.md`, `PROMPT-CLAUDE-CODE.md`, `.gitignore`. Ne tu složku samotnou,
   ale to, co je v ní. GitHub podsložky zvládne.
4. Dole klikni **Commit changes**.

Hotovo. Pak už jen otevři `PROMPT-CLAUDE-CODE.md`, doplň v něm řádek „Kontext projektu"
a pošli to Claude Code.

**Poznámka:** `.gitignore` je skrytý soubor. Když ho ve složce nevidíš, nevadí — bez něj to
funguje taky, jen se do repa můžou časem připlést systémové soubory `.DS_Store`.
