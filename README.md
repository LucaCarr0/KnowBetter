# Know Better

Party game multiplayer per smartphone, con nickname e avatar, stanze private e una prima fase di cinque round trivia sincronizzati.

Progetto sviluppato in collaborazione da [Luca](https://github.com/LucaCarr0) e [Marco](https://github.com/MarcoCanonico). Il [repository GitHub](https://github.com/LucaCarr0/KnowBetter) conserva l'intero progetto: applicazione, sorgenti dei cataloghi, asset, licenze e documentazione. Il codice dell'applicazione si trova in [`web/`](web/README.md).

## Autori

- **Luca** ([@LucaCarr0](https://github.com/LucaCarr0))
- **Marco** ([@MarcoCanonico](https://github.com/MarcoCanonico))

## Struttura del repository

```text
KnowBetter/
├── docs/                   Piani e guide operative
├── PROJECT_MEMORY.md       Visione e decisioni del prodotto
└── web/                    Applicazione e comandi pnpm
    ├── src/
    │   ├── app/            Pagine, layout e stili Next.js
    │   ├── features/       Home, stanze e partita
    │   ├── components/     Componenti condivisi
    │   ├── lib/            Utilità condivise
    │   └── server/         Coordinatore, database e cataloghi
    ├── scripts/            Comandi per database e importazioni
    ├── public/             Avatar, conduttore e icone
    └── .data/              Database e backup locali, esclusi da Git
```

La precedente directory `pwa-homepage-design/` è stata rinominata `web/`. Tutti i comandi dell'applicazione vanno eseguiti da `web/`.

## Avvio locale

Richiede Node.js 22.18 o successivo e pnpm. Per il database PGlite locale serve Linux con `flock` (`util-linux`); in alternativa configurare PostgreSQL tramite `DATABASE_URL`.

```sh
cd web
pnpm install --frozen-lockfile
pnpm dev
```

Aprire [localhost:3000](http://localhost:3000). La configurazione facoltativa è documentata in `.env.example`.

**Una nuova clone contiene tutto il necessario per creare il database e giocare:** al primo avvio il server applica lo schema e le migrazioni, poi importa automaticamente le **7.497 domande** dal catalogo incluso nella repo. Non occorre copiare un database esistente, eseguire importazioni manuali o scaricare le domande da servizi esterni. Il database creato si trova in `web/.data/knowbetter`.

## Documentazione

- [Guida dell'applicazione e comandi di verifica](web/README.md).
- [Visione del prodotto e decisioni confermate](PROJECT_MEMORY.md).
- [Piano di menu e stanze](docs/plans/01-menu-e-stanze.md).
- [Piano della prima fase trivia](docs/plans/02-fase-1-trivia.md).
- [Consultazione del database locale](docs/db-local.md).
- [Cataloghi delle domande e relative licenze](web/src/server/content/README.md).

## Versionamento

Il repository è pubblico. Il branch iniziale è `main`.

Dipendenze, build, cache, file `.env` personali e database locali con i relativi backup sono esclusi da Git. Il catalogo sorgente delle domande è incluso per consentire la ricostruzione del database. Le sessioni e le partite locali richiedono backup separati.

Per salvare e caricare una modifica, dalla radice del progetto:

```sh
git status
git add <file-o-directory>
git commit -m "Descrizione della modifica"
git push
```
