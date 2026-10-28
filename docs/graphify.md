# Graphify nel progetto

La skill Codex è versionabile in `.agents/skills/graphify/`, con i riferimenti e
le licenze originali. Proviene da
[Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify), versione 0.9.97.

## CLI locale

Il pacchetto ufficiale si chiama `graphifyy`; il comando è `graphify`.
Per preparare la CLI su un altro computer:

```bash
pipx install graphifyy==0.9.97
graphify --version
```

La CLI usa un ambiente Python isolato da pipx e non aggiunge dipendenze al gioco.
La skill è già nel repository: non occorre registrarla globalmente.

## Uso in Codex

Dal progetto, richiamare `$graphify .` per costruire il grafo, oppure
`$graphify query "domanda sul progetto"` dopo averlo generato.

Gli output sono raccolti in `graphify-out/` ed esclusi da Git. L'installazione
non genera automaticamente il grafo, non avvia watcher, non registra hook e non
configura servizi cloud o MCP. `PROJECT_MEMORY.md` resta il riferimento per le
decisioni di prodotto.
