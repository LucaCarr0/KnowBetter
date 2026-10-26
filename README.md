# Know Better

Party game multiplayer per smartphone, con nickname e avatar, stanze private e una prima fase di cinque round trivia sincronizzati.

Il [repository GitHub privato](https://github.com/LucaCarr0/KnowBetter) conserva l'intero progetto: applicazione, sorgenti dei cataloghi, asset, licenze e documentazione. Il codice dell'applicazione si trova in [`pwa-homepage-design/`](pwa-homepage-design/README.md).

## Avvio locale

Richiede Node.js 22.18 o successivo e pnpm. Per il database PGlite locale serve Linux con `flock` (`util-linux`); in alternativa configurare PostgreSQL tramite `DATABASE_URL`.

```sh
cd pwa-homepage-design
pnpm install --frozen-lockfile
pnpm dev
```

Aprire [localhost:3000](http://localhost:3000). La configurazione facoltativa è documentata in `.env.example`.

**Una nuova clone contiene tutto il necessario per creare il database e giocare:** al primo avvio il server applica lo schema e le migrazioni, poi importa automaticamente le **7.497 domande** dal catalogo incluso nella repo. Non occorre copiare un database esistente, eseguire importazioni manuali o scaricare le domande da servizi esterni. Il database creato si trova in `pwa-homepage-design/.data/knowbetter`.

## Documentazione

- [Guida dell'applicazione e comandi di verifica](pwa-homepage-design/README.md).
- [Visione del prodotto e decisioni confermate](PROJECT_MEMORY.md).
- [Piano di menu e stanze](docs/plans/01-menu-e-stanze.md).
- [Piano della prima fase trivia](docs/plans/02-fase-1-trivia.md).
- [Consultazione del database locale](docs/db-local.md).
- [Cataloghi delle domande e relative licenze](pwa-homepage-design/server/content/README.md).

## Versionamento

Il repository GitHub deve rimanere **privato**. Il branch iniziale è `main`.

Dipendenze, build, cache, file `.env` personali e database locali con i relativi backup sono esclusi da Git. Il catalogo sorgente delle domande è incluso per consentire la ricostruzione del database. Le sessioni e le partite locali richiedono backup separati.

Per salvare e caricare una modifica, dalla radice del progetto:

```sh
git status
git add <file-o-directory>
git commit -m "Descrizione della modifica"
git push
```
