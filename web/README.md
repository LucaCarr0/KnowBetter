# Know Better

Party game multiplayer con nickname e avatar, senza account: home, lobby privata e prima fase di cinque round trivia, con Jerry, votazioni e classifica sincronizzata.

## Avvio locale

Richiede Node.js 22.18 o successivo e pnpm. Per PGlite locale è richiesto Linux con `flock` (pacchetto `util-linux`, già disponibile sulla macchina di sviluppo); su altre piattaforme configurare PostgreSQL esterno tramite `DATABASE_URL`. Le versioni delle dipendenze sono registrate nel lockfile.

1. Dalla directory `web`, eseguire `pnpm install --frozen-lockfile`.
2. Facoltativamente copiare `.env.example` in `.env.local` e personalizzare le impostazioni.
3. Eseguire `pnpm dev` e aprire [localhost:3000](http://localhost:3000).

Il comando avvia sia Next.js sia il coordinatore Socket.IO. `next dev` e `next start` da soli non avviano le API ospite e il servizio delle stanze.

Al primo avvio vengono applicate le migrazioni e importato nel database il catalogo locale delle domande. L'importazione è idempotente; durante la partita non vengono interrogati servizi trivia esterni. Dopo questo aggiornamento riavviare il coordinatore già aperto per caricare protocollo, motore e frontend aggiornati.

In sviluppo il server seleziona Webpack, come workaround da verificare sui telefoni per un blocco dell'interattività con Turbopack su Android. La compilazione iniziale può richiedere più tempo. Il comando di build di produzione rimane quello esistente.

Per arrestare il server usare `Ctrl+C`: vengono chiuse anche le connessioni HMR di Next.js, poi vengono attese le operazioni e la chiusura del database prima di rilasciare il blocco. Il messaggio **«Chiusura completata: database chiuso.»** viene stampato solo a chiusura riuscita; attendere questo messaggio e il ritorno del prompt prima di riavviare o aprire la console SQL. Un secondo `Ctrl+C` forza l'uscita; anche un arresto che resta bloccato termina forzatamente dopo 10 secondi. Le uscite forzate non garantiscono il completamento della pulizia.

Per provare più giocatori usare browser o profili browser differenti. Schede dello stesso browser condividono l'identità ospite: «Continue here» sposta il controllo mantenendo un unico posto. Lo stesso collegamento funziona su altri telefoni che possono raggiungere il server; `localhost` identifica sempre il dispositivo corrente.

Per i test sulla stessa Wi-Fi, avviare `pnpm dev` e aprire `http://<IP-del-computer>:3000` dal telefono. Su Linux, `hostname -I` mostra gli indirizzi del computer: usare quello della connessione Wi-Fi attiva. All'avvio, `next.config.mjs` rileva automaticamente gli indirizzi IPv4 delle interfacce di rete e li include in `allowedDevOrigins`, permettendo anche il collegamento HMR di Next.js. Se si cambia rete o IP, basta riavviare `pnpm dev` e usare il nuovo indirizzo; non occorre modificare il codice. Next.js controlla l'hostname dell'origine, non l'IP di ciascun telefono: non serve elencare tutti i dispositivi o autorizzare un'intera sottorete. La rilevazione avviene solo in modalità sviluppo.

## Dati

Senza `DATABASE_URL`, il server usa PostgreSQL incorporato tramite PGlite e conserva i dati nella directory `.data/knowbetter`, esclusa dal versionamento. Le stanze e le sessioni si recuperano anche dopo un riavvio. Non cancellare questa directory per un normale riavvio.

Il coordinatore, l'importazione e i comandi di consultazione acquisiscono un blocco del sistema operativo prima di aprire PGlite. Un secondo processo riceve `DB_IN_USE`; il blocco viene rilasciato dopo la chiusura del database o alla terminazione del processo. Il file `.data/.knowbetter.lock` può rimanere sul disco anche quando il database è chiuso: non è un errore e non va cancellato.

Per verificare i dati dal terminale, a server fermo:

```sh
pnpm db:inspect
pnpm db:sql 'SELECT count(*) AS totale FROM kb_trivia_questions'
pnpm db:console
```

La console è in sola lettura e supporta `.tables`, `.schema kb_trivia_questions`, query SQL terminate con `;` e `.exit`. La [guida completa](../docs/db-local.md) contiene esempi per categorie, domande, importazioni, migrazioni e partite. PGlite non espone una porta a cui collegare direttamente `psql`.

Un errore PostgreSQL di checkpoint/WAL impedisce l'apertura: il messaggio ora conserva la diagnostica interna invece del solo `RuntimeError: Aborted()`. Non viene eseguito un reset automatico dei dati. Il 26 ottobre 2026 è stato recuperato il database da un backup verificato e ricostruito il catalogo di 7.497 domande; le copie danneggiate sono state eliminate su richiesta dell'utente, mentre il backup sano precedente è conservato in `.data/backups/`.

Con `DATABASE_URL` il server usa PostgreSQL esterno attraverso `pg` e prepara le tabelle del modulo. La connessione deve appartenere a un database di questa applicazione con permessi per creare le tabelle. Nessun database cloud viene creato automaticamente.

Gli ospiti ricevono un cookie HttpOnly; nel database viene conservato l'hash del segreto. Nickname e avatar sono attributi della partecipazione, senza profilo permanente. Le preferenze dell'ultima identità sono salvate facoltativamente nel browser.

Default configurabili: sessione 24 ore, riserva del posto per riconnessione 90 secondi, chiusura della lobby dopo 60 minuti senza attività. Avatar riutilizzabili, nickname univoci nella singola stanza, massimo dieci partecipanti incluso il creatore. Le uscite liberano subito il posto; l'organizzatore viene riassegnato se necessario.

## Prima fase di gioco

L'organizzatore può premere **«Inizia partita!»** quando ci sono almeno due giocatori connessi. La rosa viene fissata all'avvio e i nuovi ingressi vengono chiusi; i concorrenti già riconosciuti possono rientrare con la propria sessione. Se durante i cinque secondi di countdown il gruppo scende sotto due connessi, l'avvio viene annullato.

Jerry presenta le regole **senza countdown**. Qualsiasi concorrente attivo può trascinare verso destra il pulsante per saltare le istruzioni e iniziare il primo round. Dopo ogni classifica di 5 secondi, nei round 1–4 il gioco aspetta senza scadenza: uno swipe di un solo concorrente apre il voto del round successivo per tutti. Il comando funziona anche da tastiera con Invio/Spazio e con lettori di schermo.

Ognuno dei cinque round comprende voto fra tre categorie (12 secondi), annuncio (3 secondi), domanda con quattro risposte (15 secondi), soluzione (5 secondi) e classifica (5 secondi). Voti e risposte sono modificabili fino alla conferma; la prima conferma accettata è definitiva. Vince la categoria più votata; parità o assenza di voti sono risolte con sorteggio del server. Il voto o la domanda si chiudono prima se tutti i concorrenti ancora in gara hanno risposto.

Una risposta giusta vale 500 punti più un bonus fino a 500 per la rapidità; errore e mancata risposta valgono zero. Il tempo viene misurato dal server alla ricezione. Classifica completa e punteggio personale sono disponibili su ciascun telefono. I pari punti condividono la posizione. Dopo il quinto round appare il riepilogo della Fase 1; l'organizzatore può riportare il gruppo nella lobby. Le fasi successive non vengono avviate e non viene proclamato il vincitore dell'intera partita.

La connessione temporaneamente persa non cancella punti o partecipazione e non ferma il timer aperto. Nelle pause manuali servono almeno due concorrenti connessi per proseguire; l'attesa non scade e il rientro del secondo giocatore richiede comunque uno swipe. L'uscita esplicita ritira il concorrente conservandone la classifica. Dopo un riavvio, una domanda aperta viene annullata e sostituita mantenendo categoria e indice del round; gli esiti già confermati rimangono invariati. Le istruzioni e le pause prima dei round restano senza countdown; le altre fasi attendono fino a 90 secondi il rientro di almeno due concorrenti. Due schede dello stesso browser continuano a rappresentare lo stesso concorrente, con trasferimento esplicito del controllo.

## Catalogo delle domande

Le domande, le opzioni e le soluzioni sono conservate nel database in `kb_trivia_categories` e `kb_trivia_questions`. Il catalogo sorgente normalizzato, gli originali, le licenze e i criteri d'importazione si trovano in [src/server/content/](src/server/content/README.md). Ogni domanda mantiene fonte, licenza, lingua e identificativo originale; tali informazioni sono visibili insieme alla soluzione.

Per popolare o aggiornare il database senza avviare il sito, **a coordinatore fermo**:

```sh
pnpm trivia:import
```

Il comando usa `.env.local`, `DATABASE_URL` o `LOBBY_DATA_DIR` esattamente come il server. Non aprire PGlite con due processi contemporaneamente. Non occorre cancellare il database o reinstallare dipendenze per aggiornare il catalogo. La rigenerazione dei dati normalizzati dagli originali fissati si esegue con `node --import tsx src/server/content/import-trivia.ts`.

Nel database sono importate **7.497 domande italiane**, da ITALIC (MIT) e da una selezione tradotta di OpenTriviaQA (CC BY-SA 4.0). Per le finestre di 15 secondi, il motore seleziona quelle con testo entro 300 caratteri, ciascuna opzione entro 120 e totale entro 600; esclude inoltre 82 quesiti di attualità privi di revisione temporale. Rimangono **7.155 domande estraibili in 9 categorie**: animali, arte, cinema, educazione civica, geografia, letteratura, lingua italiana, sport e storia. Tutte le altre domande compatibili sono conservate nel database. Il controllo del formato e dei duplicati non equivale a una revisione editoriale di ogni fatto contenuto nelle fonti.

## Avatar

Il pacchetto scelto dall'utente il 26 ottobre 2026 è [Kenney Animal Pack Remastered](https://kenney.nl/assets/animal-pack-remastered), distribuito sotto CC0. L'integrazione usa 30 animali della variante `PNG/Round` come file locali in `public/avatars/kenney/`, con panda come avatar iniziale e catalogo condiviso tra selezione, home e lobby. Variante, numero di animali e default sono scelte tecniche dell'integrazione.

La directory degli asset conserva la licenza originale in `License.txt` e la provenienza nel proprio `README.md`. Per mantenere le preferenze e le sessioni precedenti, `fox` diventa `dog`, `tiger` diventa `bear`, `unicorn` diventa `narwhal` e `octopus` diventa `whale`; `frog` e `panda` restano validi. Dopo l'aggiornamento riavviare `pnpm dev` per ricaricare il catalogo anche nel coordinatore.

Verificati tutti i 30 PNG e la licenza rispetto agli originali dell'archivio. Superati controllo TypeScript, 15 test della lobby (inclusi alias e recupero da avatar persistiti) e build con `pnpm build --webpack`. La build Turbopack incontra un limite dell'ambiente sulle porte interne (`EPERM`); Webpack completa la build con controllo TypeScript attivo. La verifica visiva sui telefoni resta all'utente; per questo aggiornamento non sono stati avviati server applicativi o browser.

## Struttura

- `src/app/`: routing e composizione Next.js.
- `src/features/home/components/`: sezioni di presentazione della home.
- `src/features/rooms/`: componenti interattivi, catalogo avatar, convalida, tipi e comunicazione client.
- `src/features/session/`: unica connessione e passaggio dalla home/lobby alla partita a tutta pagina.
- `src/features/game/`: tre viste della partita, regia di Jerry, timer visivi e classifica.
- `src/server/`: coordinatore, sessioni, persistenza e test del dominio e delle connessioni reali.
- `src/server/game/`: motore autorevole; `src/server/content/`: cataloghi privati e importazione; `src/server/trivia.ts`: seed e lettura dal database.
- `src/components/ui/`, `src/lib/`, `public/`: risorse generiche e asset esistenti.

## Verifiche

Ultimo aggiornamento del 26 ottobre 2026: **76 test senza listener**, controllo TypeScript e build Webpack superati dopo lo swipe e il riordino in `web/src/`. Coperti anche swipe simultanei, ripresa delle pause e ritorno in lobby dopo l'abbandono di un concorrente. Prova visiva e gesto sui telefoni restano da verificare dall'utente.

- `pnpm typecheck`: controllo TypeScript senza bypass.
- `pnpm test:unit`: test del motore, catalogo, migrazioni, lobby e integrazione del dominio senza listener di rete.
- `pnpm test`: test con un vero motore PostgreSQL incorporato, incluse richieste simultanee e integrazione HTTP/Socket.IO.
- `pnpm build --webpack`: build di produzione Next.js con controllo TypeScript attivo.
- `pnpm start`: avvio della build con il coordinatore, su sistemi con shell POSIX.

Verifica della Fase 1 del 26 ottobre 2026: 54 test senza listener e controllo TypeScript superati; build Webpack con controllo dei tipi superata. Verificati importazione e seconda esecuzione idempotente nel database locale reale, oltre a migrazione e recupero sui database di prova. Il controllo visivo sui telefoni e PostgreSQL esterno non sono stati eseguiti. Per rispettare le indicazioni del proprietario non sono stati avviati server applicativi o browser.

## Distribuzione

Questo modulo usa **un singolo processo coordinatore**, anche con PostgreSQL esterno. Più repliche richiedono un progetto aggiuntivo per proprietà delle stanze, presenza e diffusione degli aggiornamenti; un database condiviso da solo non lo sostituisce. PGlite locale richiede un volume persistente e non deve essere aperto contemporaneamente da più processi.

Per la produzione servono un ambiente Node con connessioni persistenti, HTTPS, `APP_ORIGIN` impostato all'origine pubblica e un database/volume durevole. I cookie di produzione sono Secure. Il servizio non è distribuibile come sole pagine statiche o come funzioni che terminano dopo una richiesta.

Installazione PWA, account, stato «Pronto», jolly, minisfide e corsa finale rimangono fuori dal modulo attuale. Il conduttore usa una copia WebP lossless di `../Gerry.png`, conservato come originale; la provenienza dell'effetto punti da [OriginKit](https://www.originkit.dev/components/emojiburst) è documentata in `src/components/originkit/README.md`.
