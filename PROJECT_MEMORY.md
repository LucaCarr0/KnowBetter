# Memoria di progetto — party game trivia multiplayer

Ultimo aggiornamento: 27 ottobre 2026.
Stato: home/lobby e Fase 1 trivia implementate in `web/`, con avatar Kenney, Jerry e cinque round sincronizzati; cataloghi di domande importati da fonti internet e conservati nel database. Istruzioni e avvio dei round sono manuali con swipe. Il 27 ottobre 2026 sono stati implementati commenti personali di Jerry, quattro poteri per ostacolare gli avversari e un'attesa con rotellina nella lobby al posto del countdown visibile. Piano di riferimento: [docs/plans/02-fase-1-trivia.md](docs/plans/02-fase-1-trivia.md). Verifica visiva sui telefoni a cura dell'utente. Accesso HMR di Next.js configurato per rilevare automaticamente gli indirizzi IPv4 locali a ogni avvio in sviluppo.
Nome nel frontend esistente: Know Better; il nome definitivo non è stato confermato separatamente.

## Scopo e uso del documento

Questo documento raccoglie la visione del gioco e le decisioni prese con il proprietario del progetto. Va consultato prima di lavorare sul progetto, per mantenere coerenza tra regole, esperienza dei giocatori e future scelte tecniche.

Le informazioni sono distinte in:

- **Confermato:** richiesto o chiarito dal proprietario del progetto.
- **Proposta:** suggerimento da discutere, non ancora una decisione.
- **Da definire:** domanda aperta che non deve essere risolta implicitamente durante lo sviluppo.

Gli esempi illustrano le possibilità del concept: non costituiscono automaticamente funzionalità da realizzare. Quando una decisione cambia, aggiornare sia la sezione interessata sia il registro finale.

Il documento descrive il prodotto e raccoglie le decisioni di progetto. Dopo la pianificazione del primo modulo, l'utente ha autorizzato l'implementazione con «procedi con il piano». Il 26 ottobre 2026 ha prima richiesto il piano della Fase 1 e poi autorizzato l'implementazione con «procedi col piano», aggiungendo il caricamento nel database di domande per categoria da cataloghi internet. Home, lobby ospite e prima fase trivia sono implementate. L'utente esegue personalmente le prove nel browser: non avviare ulteriori server o prove nel browser senza una nuova richiesta in tal senso.

## Visione del gioco

**Confermato.** Realizzare un party game competitivo basato sulla cultura generale, ispirato all'impronta sociale di *Sapere è Potere*: domande, rapidità, piccole sfide e possibilità di ostacolare gli avversari, con una progressione verso un finale su tabellone.

La partita combina tre componenti:

1. Conoscenza: rispondere a domande appartenenti a diverse sottocategorie.
2. Abilità e rapidità: completare minisfide e rispondere tempestivamente.
3. Interazione: influenzare le categorie e usare maledizioni contro gli avversari nel finale.

**Direzione creativa.** Il riferimento orienta l'esperienza di gruppo; nome definitivo, ambientazione e tono completo rimangono da scegliere. Il 26 ottobre 2026 sono stati confermati un conduttore televisivo, Jerry, basato sul PNG fornito, e transizioni rapide e cartoonose verso la plancia. Dare al gioco una propria identità attraverso testi e contenuti originali rimane una direzione proposta.

## Partecipanti e dispositivi

**Confermato.** La partita deve supportare fino a **10 giocatori**, ciascuno sul proprio dispositivo mobile e con un'interfaccia personale, personalizzata e consultabile durante il gioco.

Sono confermate entrambe le modalità di partecipazione:

- Giocatori presenti nella stessa stanza.
- Giocatori collegati a distanza.

**Confermato.** Tutto ciò che serve per giocare deve essere disponibile sui telefoni personali. Non deve essere obbligatorio uno schermo comune, una TV, una console o un computer. Le informazioni necessarie non possono essere affidate esclusivamente a ciò che vede o comunica un altro partecipante.

**Confermato il 26 ottobre 2026.** La partita è avviabile dalla stanza con almeno **2 giocatori**, tramite il pulsante «Inizia partita!», seguito da un countdown di **5 secondi**.

**Aggiornamento confermato il 27 ottobre 2026.** Durante quei cinque secondi tutti rimangono nella stessa schermata della lobby, con una semplice rotellina e senza numeri del countdown. Alla scadenza comune del server compare «Benvenuti nello studio». Non cambia la durata dell'attesa né l'annullamento se vengono meno i due connessi; modifica identità e nuovo avvio restano bloccati durante la preparazione, con uscita e recupero della connessione disponibili.

**Configurazione iniziale applicata dopo l'autorizzazione del piano.** Avvio riservato all'organizzatore, almeno due partecipanti connessi, rosa fissata all'avvio e nuovi ingressi chiusi; chi era già concorrente può rientrare. Nessuno stato «Pronto» obbligatorio. La perdita della soglia di due durante il countdown annulla l'avvio. Questi dettagli sono i default proposti nel piano e poi applicati all'implementazione, non nuove richieste indipendenti del proprietario. Dispositivi/sistemi operativi da supportare rimangono da consolidare. Uno schermo condiviso facoltativo non è stato richiesto.

## Struttura complessiva della partita

| Fase | Durata confermata | Attività principale | Risultato |
| --- | --- | --- | --- |
| 1 — Trivia | 5 round | Domande di cultura generale, con premio alla correttezza e alla velocità | Accumulo di punti |
| 2 — Sfida e domanda | 5 round | Minisfida casuale che sblocca individualmente la domanda | Ulteriore accumulo di punti |
| 3 — Corsa finale | Fino al raggiungimento del traguardo; dettagli da definire | Sfide tutti contro tutti, tabellone e maledizioni | Vince chi arriva per primo al traguardo |

I punti delle prime due fasi determinano il vantaggio iniziale nel finale. Essere primi nella classifica dei punti dopo dieci round non equivale ad avere già vinto la partita.

## Fase 1 — Cinque round di trivia

### Regole confermate

- La fase comprende cinque round di normali domande di cultura generale.
- Le domande appartengono a sottocategorie riconoscibili.
- Le risposte corrette assegnano punti; a parità di correttezza, la rapidità deve essere premiata.
- All'inizio di ogni round, compreso il primo, i giocatori possono votare la sottocategoria della domanda del round. La precisazione del 26 ottobre 2026 aggiorna la precedente descrizione del voto alla fine del round precedente.
- La scelta della sottocategoria avviene a maggioranza.
- **Aggiornamento del 26 ottobre 2026:** le istruzioni non avanzano più dopo dieci secondi. Qualsiasi concorrente attivo può trascinare un pulsante per saltarle e iniziare il primo round; lo stesso gesto avvia il round successivo dopo la classifica. Nessuna scadenza nelle pause manuali e nessuna conferma obbligatoria di tutti i giocatori. Il proprietario ha proposto lo swipe al posto della pressione prolungata.

La sequenza aggiornata è: voto della sottocategoria, annuncio e preparazione con uso facoltativo dei poteri, domanda e risposte personali, esito e punti, classifica di cinque secondi, pausa senza countdown prima del prossimo round. Lo swipe di un solo concorrente fa proseguire tutti al voto successivo. All'avvio tutti restano in lobby con una rotellina per i 5 secondi del countdown server, poi compare la presentazione con Jerry, ferma fino allo swipe che apre il primo voto. Dopo il quinto round si conclude questa fase; non viene assegnata la vittoria dell'intera partita.

**Interfaccia confermata il 26 ottobre 2026.** Ogni client alterna tre viste: plancia, scelta della categoria e risposta alla domanda. Il proprietario ha chiarito che «votazione», nell'elenco iniziale delle tre schermate, indica la scelta della risposta personale, non un secondo voto sulla categoria. La plancia contiene classifica e punti e ospita anche il conduttore, la spiegazione delle regole e i momenti di gioco collettivi. I «jolly rimanenti», inizialmente citati solo come esempio, sono stati sostituiti dalla richiesta esplicita di poteri per la Fase 1 del 27 ottobre, descritta sotto.

### Configurazione iniziale e aspetti ancora aperti

- Tre categorie per voto, estratte fra quelle con contenuti sufficienti; 12 secondi per votare. La categoria della prima domanda viene anch'essa votata.
- Vince la categoria più votata, senza ballottaggio. Parità: sorteggio server fra le prime; nessun voto: sorteggio fra le candidate.
- Eventuale scelta di categoria per la Fase 2, separata dalle cinque votazioni della Fase 1; nel piano non si propone un voto aggiuntivo dopo il quinto round.
- Quattro risposte, una corretta e 15 secondi; selezione locale modificabile prima della conferma, primo invio accettato definitivo. La stessa regola vale per il voto. Chiusura anticipata se tutti i concorrenti ancora in gara hanno confermato.
- Risposta corretta: 500 punti base e bonus fino a 500 proporzionale al tempo residuo misurato dal server. Errore o assenza: zero punti, nessuna penalità. Pari punti: stessa posizione, ordine visivo di ingresso.

Sono default applicati dal piano autorizzato, da bilanciare con le prove del gioco. L'annuncio categoria passa dai 3 secondi iniziali a una preparazione di massimo 15 secondi per i poteri; la soluzione resta di 5 secondi. Il proprietario ha confermato il mantenimento del timer attuale delle domande (15 secondi) e dei 5 secondi della classifica, sostituendo l'introduzione automatica di 10 secondi e l'apertura automatica del round successivo con lo swipe. Il voto resta di 12 secondi. Il riepilogo della fase conserva i risultati; l'organizzatore può riportare il gruppo in lobby e un nuovo avvio crea una nuova partita. Le fasi successive rimangono da definire.

### Poteri della Fase 1

**Confermato il 27 ottobre 2026.** Ogni giocatore riceve all'inizio della gara un potere casuale consumabile una sola volta. Prima di ciascuna domanda può usarlo per ostacolare un avversario. Servono quattro poteri diversi e bilanciati; l'effetto richiesto come esempio inverte le lettere interne delle parole delle risposte, mantenendo prima e ultima lettera. Ogni round prevede una possibilità di ottenere un altro potere con probabilità `p × k`, dove `k` cresce scendendo in classifica.

**Taratura espressamente accettata dal proprietario.** Un solo avversario per uso, al massimo un effetto subito per domanda, probabilità di ottenere un potere dal **20% per il primo al 60% per l'ultimo**. Si tratta della prima taratura, da valutare giocando.

**Scelte operative per l'implementazione, non ulteriori requisiti del proprietario:**

- **Lettere ribelli:** inversione delle lettere interne di ogni parola nelle risposte, con prima e ultima ferme.
- **Nebbia:** ogni alternativa va toccata per rivelarla prima di poterla scegliere.
- **Shuffle:** scambia le posizioni delle quattro risposte ogni secondo soltanto sul telefono del bersaglio, per tutta la domanda. Sostituisce il precedente potere Lucchetti su richiesta del proprietario.
- **Riflettore:** una sola alternativa visibile alla volta, con comandi per navigare fra le quattro.
- Inventario massimo di due carte e al massimo un potere giocato per round. Gli effetti valgono soltanto per la domanda corrente e non modificano correttezza, punti o timer comune.
- La preparazione riusa `category_reveal`, allungata da 3 a un massimo di 15 secondi; si conclude prima se tutti i concorrenti ancora in gara usano un potere o passano. Non viene aggiunta una schermata principale.
- Dopo la carta iniziale, estrazioni all'inizio dei round 2–5, con `p = 0,2` e `k = 1 + 2 × (rango − 1) / (N − 1)`, dove `N` comprende i concorrenti non ritirati. Pari punti danno stesso rango e stessa probabilità; i ritirati sono esclusi. L'inventario deve avere spazio per ricevere una carta.
- Estrazione ed effetti sono governati e salvati dal server: una riconnessione non ripete il sorteggio. I nuovi match attivano i poteri; i vecchi salvataggi senza inventario continuano senza assegnazioni retroattive a metà gara. I campi opzionali nello stato JSONB non richiedono una nuova migrazione SQL.

**Richiesta successiva del 27 ottobre 2026.** Il proprietario ha chiesto più tempo per scegliere potere e bersaglio e gli avatar dei possibili bersagli nel menu a tendina. La nuova durata predefinita scelta per l’implementazione è di 15 secondi, rispetto agli 8 iniziali; resta la chiusura anticipata quando tutti hanno concluso. Il selettore usa Base UI già installato e mostra avatar Kenney, nickname e posizione anche per il concorrente selezionato. Gli avversari già colpiti sono disabilitati; sé stessi, ritirati e disconnessi restano esclusi. Nessuna nuova dipendenza. Superati controllo TypeScript, 9 test dei poteri e una verifica senza browser dei limiti temporali e dell’etichetta/stato disabilitato del selettore; apertura del menu e resa degli avatar sul telefono restano alla prova UI del proprietario.

**Sostituzione confermata il 27 ottobre 2026.** Il proprietario ha richiesto Shuffle al posto di Lucchetti, per rendere più difficile leggere le risposte e scegliere la posizione corretta. L’effetto riusa l’orologio della domanda: a ogni intervallo di 1.000 ms tutte e quattro le risposte cambiano posizione. Testo, identificativi, selezione confermata e valutazione server non cambiano; soltanto l’ordine visivo del destinatario è alterato. L’ordine è ricostruibile al rientro dalla stessa istanza della domanda e dal tempo trascorso. Al riavvio del coordinatore le carte e gli effetti `locks` già salvati vengono convertiti in `shuffle`, mantenendo proprietari, bersagli e identificativi delle carte. Non servono nuove dipendenze o migrazioni SQL; il campo legacy `powerStep` resta solo per riconoscere le vecchie ricevute e non abilita nuovi sblocchi. Verificati controllo TypeScript e 100 test senza listener di rete, inclusi confini temporali, spostamento di tutte le opzioni, integrità degli ID, effetto personale e conversione dei vecchi salvataggi. Nessun server applicativo o browser avviato; prova visiva e taratura restano al proprietario. Build completa non ripetuta.

**Taratura successiva confermata il 27 ottobre 2026.** Dopo la prova, il proprietario ha chiesto di rallentare Shuffle da 0,5 a 1 secondo, giudicando troppo difficile l’intervallo iniziale. Il valore corrente è `SHUFFLE_INTERVAL_MS = 1_000`; descrizione visibile e verifiche temporali sono allineate. Controllo TypeScript e tutti i 100 test senza listener di rete superati dopo la modifica.

### Personalità e commenti di Jerry

**Confermato il 27 ottobre 2026.** Alla fine di ogni round Jerry commenta gli eventi notevoli insieme alla classifica: il primo viene spodestato, nessuno indovina, tutti indovinano o chi era ultimo sbaglia ancora. Quando menziona un concorrente usa il nickname. Il tono deve essere sbruffone, anche nelle prese in giro per gli errori.

**Scelta operativa.** Battute originali selezionate da regole pure sul server, al massimo due per round, condivise fra i client e conservate nell'esito, nella classifica e nella pausa successiva. Confronto dei punteggi prima e dopo il round, gestione delle parità e distinzione fra risposta errata e assenza evitano commenti su eventi non avvenuti. Non sono richiesti servizi AI, voce o doppiaggio. Bilanciamento dei quattro effetti e lettura delle battute sui telefoni restano da verificare giocando; le prove visive spettano al proprietario.

**Verifiche delle aggiunte del 27 ottobre.** Superati 98 test senza listener di rete e controllo TypeScript. Coperti eventi e parità nei commenti, probabilità e limiti delle carte, inventari personali, bersagli concorrenti, consumo unico, ricevute, ostacoli convalidati dal server, persistenza JSONB e domanda sostitutiva dopo riavvio. La nuova domanda conserva carte consumate e bersagli del round, ma azzera sblocchi e preparazione personale; la UI permette a chi ha già giocato soltanto di confermare di essere pronto. Nessuna nuova dipendenza o migrazione SQL; database locale attivo non aperto. Build completa non ripetuta dopo il limite della sandbox già documentato. Nessun server applicativo o browser avviato: prove UI e taratura sul campo al proprietario. Per provare i nuovi poteri occorre riavviare il coordinatore e avviare una nuova partita.

## Fase 2 — Cinque round con sblocco individuale

### Regole confermate

- La fase comprende cinque round.
- Ogni round prevede una minisfida estratta casualmente da un insieme di sfide disponibili.
- Superare la minisfida permette di accedere alla domanda trivia del round.
- **Ogni giocatore sblocca la propria possibilità di rispondere:** il primo a completare la sfida non esclude gli altri.
- Nella minisfida sono ammessi tentativi illimitati.
- La rapidità deve contribuire a ottenere più punti.
- Riordinare un puzzle e indovinare una combinazione sono esempi indicati dal proprietario del progetto.

La sequenza individuale è: affrontare la minisfida, riprovare se necessario, completarla, sbloccare la domanda e rispondere. Mentre un giocatore è già alla domanda, un altro può essere ancora impegnato nella minisfida.

### Precisazioni e decisioni aperte

I tentativi illimitati sono confermati per la minisfida; non implicano tentativi illimitati sulla risposta trivia. Il loro numero non stabilisce da solo quanto possa durare un round.

Restano da decidere:

- Tempo massimo del round e comportamento per chi non completa la minisfida.
- Disponibilità di un tempo comune per tutti o di un intervallo personale dopo lo sblocco.
- Momento in cui la domanda diventa visibile e presenza della stessa domanda per tutti.
- Peso del tempo di completamento della minisfida, del tempo di risposta e della correttezza nel punteggio.
- Assegnazione di eventuali punti per la sola minisfida, se la risposta trivia è errata.
- Stessa sfida per tutti o varianti individuali di difficoltà equivalente.
- Regole di estrazione, varietà e ripetizione delle minisfide.
- Scelta delle sottocategorie in questa fase: votazione, risultato della sfida o altra modalità.

**Proposta di equilibrio.** Le sfide dovrebbero essere brevi, comprensibili e adatte al tocco. Puzzle e combinazioni vanno progettati in modo che i tentativi illimitati non trasformino la competizione in una pressione casuale e continua dei comandi.

## Fase 3 — Corsa sul tabellone e maledizioni

### Regole confermate

- I giocatori vengono collocati su un percorso che richiama un gioco dell'oca.
- I punti accumulati nelle prime due fasi attribuiscono posizioni iniziali più o meno avanzate.
- All'inizio di ogni turno si affronta una sfida tutti contro tutti.
- Durante questa fase è possibile inviare maledizioni agli avversari per penalizzarli nella sfida.
- Vince il primo giocatore che raggiunge il traguardo.

Il termine “turno” indica qui un momento della gara con una sfida comune: non stabilisce che i giocatori debbano agire uno alla volta. Il richiamo al gioco dell'oca non conferma automaticamente dadi, movimento casuale o caselle speciali.

### Decisioni aperte

- Lunghezza, forma e caratterizzazione del percorso.
- Conversione dei punti in posizioni iniziali: punteggio assoluto, differenze tra punteggi o ordine di classifica.
- Avanzamento dopo una sfida: chi si muove, di quanto e in base a quale risultato.
- Natura delle sfide finali: trivia, minisfide oppure alternanza.
- Presenza eventuale di dadi, caselle speciali, arretramenti o altri eventi.
- Raggiungimento o superamento del traguardo, eventuale arrivo esatto e risoluzione degli arrivi simultanei.

**Proposta di equilibrio.** Il vantaggio iniziale dovrebbe rendere utili i primi dieci round, lasciando comunque una possibilità concreta di rimonta. Formula di conversione e movimento restano da discutere, senza fissare numeri arbitrari.

### Maledizioni

**Confermato.** Servono a interferire con la prestazione degli avversari nelle sfide del finale.

**Esempi da valutare, non approvati:** un ostacolo visivo temporaneo su una porzione del puzzle oppure un'azione aggiuntiva da completare per rimuovere un disturbo. Effetti, nomi e rappresentazione non sono stati scelti.

Prima di fissare queste meccaniche vanno chiariti:

- Come si ottengono le maledizioni e quante sono disponibili.
- Quando si possono usare, come si sceglie il bersaglio e quanto durano.
- Se effetti diversi si possono accumulare e se più giocatori possono colpire contemporaneamente lo stesso avversario.
- Presenza di difese, immunità temporanee o altre possibilità di contrasto.
- Rapporto tra efficacia dell'ostacolo, leggibilità dell'interfaccia e possibilità di continuare a partecipare.

## Cultura generale e sottocategorie

**Confermato.** Il contenuto principale è la cultura generale. I giocatori devono poter influenzare le sottocategorie tramite votazioni o challenge; è confermata la votazione nella prima fase, mentre gli altri impieghi delle challenge per scegliere una categoria restano da precisare.

**Esempi indicati dal proprietario il 26 ottobre 2026:** animali, arte, sport, film e storia, all'interno della cultura generale. Non costituiscono un catalogo chiuso. **Altre categorie proposte da valutare:** geografia, scienze e natura, letteratura, serie TV, musica, tecnologia e curiosità.

**Scelta d'implementazione dopo l'autorizzazione del 26 ottobre 2026.** Primo catalogo di gioco in italiano, da fonti riutilizzabili con licenza conservata e provenienza per ciascuna domanda. Categorie e domande sono salvate in tabelle PostgreSQL/PGlite; il gioco non dipende da API trivia esterne durante i round. Domande non ripetute nella stessa partita; soluzioni escluse dagli snapshot fino all'esito. Il filtro di formato e duplicati non equivale alla verifica fattuale completa delle fonti. Pubblico, difficoltà editoriale definitiva e ulteriori lingue restano da consolidare.

**Criteri proposti per le domande:** formulazione chiara, risposta verificabile, alternative non ambigue e difficoltà equilibrata. Gli argomenti la cui risposta cambia nel tempo richiedono un riferimento temporale esplicito e una revisione periodica.

## Menu, avatar e caratterizzazione

**Confermato.** Il gioco deve essere ben caratterizzato già nel menu e offrire avatar per i partecipanti, fino al massimo di dieci giocatori.

**Proposta di esperienza.** Ogni giocatore potrebbe essere riconoscibile tramite nome, avatar e colore o simbolo. L'identità scelta dovrebbe accompagnarlo dalla preparazione della partita alla classifica e alla pedina sul tabellone.

**Confermato per il primo modulo.** Partire dalla home già scritta dall'utente, organizzarne il codice in directory chiare, individuare i problemi e pianificare le relative correzioni. Completare poi creazione e ingresso nelle stanze con nickname e avatar. Le stanze sono private, accessibili tramite codice o link di invito. Le impostazioni secondarie restano possibilità da valutare.

**Confermato il 27 ottobre 2026.** Alla creazione della stanza viene generato un QR code da mostrare nella lobby insieme al codice e al link di invito. La scansione con la fotocamera del telefono apre il link e la pagina di ingresso con il codice stanza già compilato; il giocatore sceglie soltanto nickname e avatar e conferma, senza account. Il QR rappresenta lo stesso invito della stanza; non è richiesto uno scanner interno al gioco. Questa richiesta aggiorna il primo modulo e non introduce nuove fasi di gioco.

**Integrazione QR.** La lobby genera un SVG locale con `qrcode.react` 4.2.0, senza servizi esterni. QR e copia del link condividono l'URL `/?room=CODICE#room-access`, che riusa l'ingresso esistente e porta al modulo. Il link mantiene l'origine con cui è aperto il gioco; usando localhost compare l'indicazione di aprire prima la pagina tramite l'indirizzo Wi-Fi del computer. Il QR contiene soltanto la destinazione della stanza, senza credenziali personali.

**Verifiche QR.** Superati controllo TypeScript e 76 test senza listener di rete. Tre QR a 192 px, con origini HTTP LAN e HTTPS, sono stati renderizzati e decodificati con la libreria indipendente ZBar, verificando codice e destinazione. La build Webpack nella sandbox si ferma con `Could not parse output from TypeScript's --showConfig.`; l'esecuzione fuori sandbox non è stata autorizzata, quindi la build completa non è verificata. Nessun server applicativo o browser avviato dall'agente. Il proprietario ha provato il QR su Nothing Phone (3a) tramite indirizzo LAN e conferma che va bene così com'è, ritirando la segnalazione sull'apertura del link. Nessuna ulteriore modifica al flusso di scansione richiesta; autorizzati commit e push.

**Punto di partenza prima dell'implementazione.** La home fornita dall'utente comprendeva presentazione, pannello crea/entra, nickname, campo codice e sei avatar emoji con interazioni locali. Ora la pagina compone le sezioni in `src/features/home/components/` e il pannello collegato alla lobby in `src/features/rooms/`. Conservare la presentazione esistente e intervenire in modo mirato.

**Confermato il 25 ottobre 2026, aggiornamento successivo.** Nella prima versione i giocatori entrano come ospiti tramite nickname e avatar, senza profilo, registrazione o login. Il profilo sarà un'aggiunta successiva. La precedente preferenza per un account facoltativo con profilo/statistiche rimane una direzione futura e non fa parte del primo modulo.

**Confermato il 26 ottobre 2026.** Dopo aver richiesto pacchetti di avatar open source più simpatici delle sei emoji e ulteriori alternative con animali, l'utente ha scelto [Kenney Animal Pack Remastered](https://kenney.nl/assets/animal-pack-remastered) con «va bene kenney». Questa decisione sostituisce il catalogo emoji iniziale; non introduce un editor di avatar o caricamenti personali.

**Dettagli tecnici dell'integrazione, scelti dall'agente.** Integrati i 30 animali della variante `PNG/Round`, serviti dal progetto in `public/avatars/kenney/<id>.png`, con catalogo coerente tra selezione, home e lobby e panda come scelta iniziale. La stessa directory conserva `License.txt` originale e un `README.md` di provenienza. Per le identità già salvate, mantenuta compatibilità tramite gli alias `fox` → `dog`, `tiger` → `bear`, `unicorn` → `narwhal`, `octopus` → `whale`; `frog` e `panda` rimangono validi. Variante, catalogo completo, default e alias sono scelte d'implementazione, non ulteriori requisiti espressi dal proprietario.

**Verifiche dell'integrazione Kenney.** Superati controllo TypeScript separato, 15 test della lobby senza listener di rete e build Next.js con Webpack e controllo TypeScript attivo. I test includono alias precedenti e recupero di partecipazioni e ricevute con avatar già persistiti. Verificati 30 PNG distinti, tutti accettati dalla convalida, per 115.498 byte complessivi: immagini e licenza sono identiche byte per byte agli originali dell'archivio. La build Turbopack è rimasta bloccata da un limite dell'ambiente sulle porte interne (`EPERM`); la build Webpack è riuscita. Nessun server applicativo o browser avviato; la prova visiva sui telefoni resta all'utente. Riavviare `pnpm dev` per ricaricare il catalogo anche nel coordinatore.

**Confermato il 26 ottobre 2026.** Il conduttore televisivo Jerry presenta il gioco e spiega le regole sulla plancia; l'avvio comprende transizioni rapide e cartoonose. Il PNG fornito è presente come `Gerry.png` nella radice, con sfondo arancione incorporato: nome del file e nome richiesto del personaggio sono distinti. L'originale RGB 1215 × 1295 px è conservato. La copia WebP lossless in `public/hosts/jerry/jerry.webp` pesa 1.526.162 byte contro 2.382.543 del PNG (−35,9%), con identità dei pixel RGB verificata. Il riquadro scenico include lo sfondo originale. L'effetto breve sui punti rivelati adatta il componente [EmojiBurst di Originkit](https://www.originkit.dev/components/emojiburst), consultato dopo il promemoria dell'utente sul plugin UI; provenienza in `src/components/originkit/README.md`.

**Da definire.** Eventuali rifiniture della presentazione esistente, personalizzazione, dettagli delle animazioni, musica ed eventuale voce del conduttore. Il PNG non implica doppiaggio o animazione del volto. Le regole della futura registrazione e dell'associazione dei risultati all'account saranno affrontate quando verranno pianificati i profili.

## Interfaccia personale e continuità della partita

Il requisito confermato di giocare interamente dal telefono comporta che ogni partecipante possa comprendere lo stato della partita e le proprie possibilità di azione dal proprio dispositivo.

**Confermato per la Fase 1 il 26 ottobre 2026:** classifica dei punti sul client di ogni giocatore; viste alternate di plancia, voto categoria e domanda con possibili risposte. Sulla plancia sono disponibili Jerry, regole e momenti collettivi.

**Aggiornamento confermato il 27 ottobre 2026:** poteri della Fase 1 disponibili nella preparazione della domanda, con inventario personale ed effetto ricevuto consultabili dal proprio telefono. Questo sostituisce il precedente riferimento ai jolly come semplice esempio.

**Altri contenuti proposti:** fase e round correnti, categoria, domanda o minisfida personale, tempo residuo quando previsto, posizione sul percorso ed effetti delle maledizioni nelle fasi pertinenti. La consultazione deve essere compatibile con l'attività in corso e con le informazioni che devono restare private.

**Criteri proposti da discutere:**

- Avvio coordinato delle attività e una regola comprensibile per esiti quasi simultanei, soprattutto nelle partite a distanza.
- Gestione esplicita di connessione instabile, ritorno al gioco, abbandono e blocco dello schermo.
- Identica interpretazione di punti, voti, posizioni ed effetti per tutti i partecipanti.
- Risposte personali non rivelate agli avversari prima del momento previsto dalle regole.
- Attese contenute per chi finisce prima e conclusione dei round anche quando qualcuno non completa l'attività.
- Testi leggibili, comandi adatti alle dita e identificazione dei giocatori non basata esclusivamente sul colore.

Questi criteri aiutano a definire l'esperienza desiderata; non stabiliscono ancora protocolli, architettura o soluzioni tecniche.

## Web, PWA o applicazione distribuita tramite store

**Stato aggiornato.** Frontend Next.js esistente riutilizzato e coordinatore Node.js/Socket.IO implementato. Distribuzione definitiva, installabilità PWA e futura presenza negli store rimangono scelte aperte.

| Opzione | Accesso e distribuzione | Valutazione rispetto al concept |
| --- | --- | --- |
| Web app per browser mobile | Accesso tramite indirizzo o link, senza installazione obbligatoria | Riduce i passaggi necessari per riunire un gruppo; candidata consigliata |
| Web app con caratteristiche PWA | Accesso web e possibilità di aggiunta/installazione sul dispositivo, secondo browser e sistema operativo | Può aggiungere la comodità di un'icona e di un'apertura dedicata; non è una piattaforma separata dal web |
| App distribuita tramite store | Installazione dell'app; Google Play è il canale Android | Da valutare se la presenza nello store e le integrazioni con il dispositivo diventano prioritarie; la distribuzione per iPhone richiede una scelta ulteriore |

Le web app possono essere raggiunte tramite URL e funzionare su più piattaforme; le PWA possono aggiungere un'esperienza installabile. Queste possibilità sono descritte nella [panoramica MDN sulle PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/What_is_a_progressive_web_app).

**Raccomandazione attuale, non approvata:** privilegiare una web app progettata per smartphone e valutare l'installabilità PWA. È una valutazione legata a questo prodotto: fino a dieci persone devono poter entrare nella stessa partita dai propri telefoni, anche a distanza, e il link rende semplice condividere l'accesso.

Installazione e comportamento delle PWA variano tra browser e sistemi operativi; per l'installabilità è richiesto HTTPS, salvo gli ambienti locali di sviluppo. La compatibilità andrà valutata sui dispositivi scelti, senza promettere comportamento identico ovunque. Riferimento: [MDN — rendere installabile una PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

Un dominio identifica l'indirizzo del gioco. Per questo multiplayer serve anche un coordinamento condiviso della partita tra dispositivi: acquistare un dominio o ospitare soltanto pagine statiche non fornisce da solo tale funzione. Anche un'app installata avrebbe bisogno di coordinare i partecipanti. La modalità con cui farlo appartiene alle future decisioni sullo stack.

La possibilità di installare una PWA non implica che una partita multiplayer a distanza possa proseguire senza connessione. Offline e riconnessione sono aspetti distinti da definire.

La distribuzione web non esclude in assoluto una successiva presenza negli store, ma un eventuale confezionamento e la pubblicazione richiedono una valutazione dedicata. Riferimenti: [MDN — distribuzione delle PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) e [Android Developers — distribuzione su Google Play](https://developer.android.com/distribute).

Fonti consultate il 25 ottobre 2026. Questa comparazione non sceglie fornitori, tecnologie, piani di hosting o budget.

## Direzione tecnica proposta — linguaggio e dati

**Stato aggiornato.** Frontend Next.js con React, TypeScript e Tailwind, con componenti daisyUI prefissati integrati nello stile esistente. Il coordinatore Node.js/Socket.IO è implementato in `src/server/`. Il database locale persistente usa PostgreSQL incorporato tramite PGlite; `DATABASE_URL` seleziona PostgreSQL esterno tramite `pg`. Supabase rimane un possibile fornitore, senza servizi cloud creati. È supportato un singolo processo coordinatore.

### Linguaggio e componenti

| Parte | Base esistente o proposta | Responsabilità |
| --- | --- | --- |
| Linguaggio applicativo | TypeScript già nel frontend; proposto anche per il backend | Interfaccia, futura logica del server e definizioni condivise dei messaggi |
| Interfaccia sui telefoni | Next.js e React già presenti | Home esistente e future schermate di gioco |
| Coordinatore della partita | Node.js | Convalidare azioni, assegnare punti e governare fasi e scadenze |
| Comunicazione in tempo reale | Socket.IO | Inviare azioni e aggiornamenti ai partecipanti della stessa stanza |
| Database permanente | PostgreSQL | Contenuti, profili, partite, risultati e dati necessari al recupero |
| Servizio gestito candidato | Supabase | Ospitare PostgreSQL; autenticazione per i futuri account, esclusa dal primo modulo |

**Motivazione della proposta.** TypeScript consente di usare lo stesso linguaggio per interfaccia e server e di condividere le definizioni dei dati. Il controllo dei tipi aiuta a individuare errori prima dell'esecuzione; i messaggi ricevuti dai telefoni richiedono comunque convalida durante l'esecuzione. React organizza l'interfaccia in componenti, mentre Socket.IO offre comunicazione per stanze e strumenti di riconnessione. SQL rimane il linguaggio del database.

Supabase è un candidato concreto per ridurre la gestione del database e, in seguito, dell'autenticazione; non è stato scelto un fornitore o un piano commerciale. Il primo modulo non richiede un servizio per account registrati. Per il coordinatore Node.js si prevede un ambiente che possa mantenere connessioni persistenti. Il numero di partite simultanee e il budget guideranno la scelta dell'hosting.

### Distribuzione dei dati

| Dati | Dove conservarli nella proposta |
| --- | --- |
| Categorie, domande, opzioni, soluzioni e versioni dei contenuti | PostgreSQL; le soluzioni sono accessibili al server e rivelate ai telefoni solo al momento previsto |
| Futuri profili e statistiche degli utenti registrati, esclusi dal primo modulo | PostgreSQL, collegati all'identità verificata dal servizio di autenticazione |
| Identità dell'ospite e partecipazione alla partita | Sessione riconoscibile dal server e record della partecipazione; nickname e avatar non sono credenziali |
| Configurazione della partita, partecipanti, risposte accettate, voti ed esiti | PostgreSQL |
| Stato attivo della stanza, scadenze e aggiornamenti immediati | Memoria del server, sostenuta da dati persistenti per le azioni rilevanti |
| Stato recuperabile: fase, round, punteggi, posizioni, effetti e progressione personale | PostgreSQL, con salvataggi coerenti e versionati |
| Preferenze del dispositivo, come audio e animazioni | Memoria locale del browser; non determina punti o classifica |
| Avatar e media predefiniti | File distribuiti insieme al sito; un archivio separato di file può essere introdotto per contenuti gestiti o caricamenti |

I dati strutturati, come giocatori e risultati, si prestano a tabelle collegate. Le configurazioni variabili delle minisfide e le copie dello stato recuperabile possono usare campi JSONB di PostgreSQL. Non è ancora uno schema definitivo di tabelle o un obbligo di registrare ogni tocco sullo schermo.

### Autorità del server e salvataggi

**Proposta.** Il telefono invia un'azione, per esempio una risposta o il completamento di una minisfida. Il server verifica identità, fase, scadenza e validità dell'azione; calcola l'esito e comunica solo le informazioni che ciascun giocatore può vedere. I telefoni non scrivono direttamente punteggi, classifiche o stato delle sfide.

Risposte accettate, completamenti validati, uso delle maledizioni e cambi di fase devono avere un salvataggio coerente prima della conferma definitiva. Un identificativo delle azioni e una versione dello stato permettono di evitare che un reinvio dopo una disconnessione assegni punti due volte. Animazioni e movimenti puramente visivi non richiedono una scrittura nel database.

La memoria del server serve alla gestione immediata, ma non deve essere l'unica copia degli esiti già confermati. La riconnessione di un telefono richiede di recuperare la sua identità e riallinearne lo stato; un riavvio del server richiede anche dati persistenti e una regola per il round eventualmente interrotto. Il recupero offerto dal trasporto realtime, da solo, non garantisce la continuità della partita.

Le scadenze vengono governate dal server e rappresentate dai timer sui telefoni. Nelle partite remote la latenza influisce comunque sull'arrivo delle risposte: regole per tempi quasi uguali e peso della velocità restano decisioni di prodotto aperte.

### Accesso ospite ora, profili in seguito

**Confermato.** Il primo modulo prevede soltanto nickname e avatar, senza registrazione o profilo. Gli account facoltativi per conservare profilo e statistiche sono rimandati a un'aggiunta successiva.

**Proposta per il primo modulo.** L'ospite riceve una sessione riservata riconoscibile anche dopo una breve disconnessione, distinta da nickname e avatar. L'appartenenza a una stanza non dipende dall'identificativo della connessione. Non servono tabelle di account o credenziali di registrazione.

**Da definire nel primo modulo.** Durata delle sessioni ospite, finestra di rientro e scadenza delle stanze. Le future regole di associazione dei risultati all'account dovranno basarsi sulla sessione verificata, non sulla coincidenza del nickname.

### Primo piano di implementazione

**Attività richiesta:** aggiornare il piano di menu e stanze con nickname/avatar, senza profili, prendendo come base la home esistente. Il piano in [docs/plans/01-menu-e-stanze.md](docs/plans/01-menu-e-stanze.md) inizia ora da inventario, riordino delle directory, revisione dei difetti e verifiche della home; seguono integrazione delle stanze e lobby. Contiene una mappa delle responsabilità e rilievi statici con riferimenti ai file. Le tre fasi di gioco saranno affrontate separatamente.

### Piano della Fase 1 del gioco

**Richiesta del 26 ottobre 2026.** Redatto [docs/plans/02-fase-1-trivia.md](docs/plans/02-fase-1-trivia.md) per avvio dalla stanza con almeno due giocatori, countdown di cinque secondi, Jerry e tre viste sincronizzate per cinque round. In un messaggio successivo l'utente ha autorizzato l'implementazione e richiesto cataloghi internet da caricare nel database. Il piano originario resta il riferimento; la Fase 1 è ora implementata. Nessun server applicativo o browser avviato dall'agente.

**Implementazione tecnica.** Il contenitore `src/features/session/` mantiene una sola connessione e passa dalla home alla scena di gioco a tutta pagina. Il motore privato `src/server/game/engine.ts` governa fasi, scadenze, voti, risposte e punti. La migrazione SQL 2 estende gli stati stanza e aggiunge `kb_matches`, `kb_trivia_categories`, `kb_trivia_questions` e `kb_content_imports`, conservando i dati preesistenti. La rosa e lo storico di round/voti/risposte sono JSONB nel record della partita; salvataggio e ricevute condividono transazione, coda e blocco database della lobby. È supportato un solo processo coordinatore.

**Continuità applicata.** La disconnessione non cancella il concorrente dopo i 90 secondi della lobby e non ferma una finestra di voto/risposta aperta. L'uscita esplicita ritira il giocatore conservandone i punti. Le pause manuali prima dei round non scadono: per lo swipe servono almeno due concorrenti connessi, e il rientro del secondo non fa partire automaticamente il round. Dopo un riavvio una domanda esposta viene annullata e sostituita nella stessa categoria con una nuova istanza, conservando lo storico e impedendo che i reinvii della vecchia domanda modifichino la nuova. Le pause manuali restano manuali anche dopo il riavvio; la sospensione tecnica delle altre fasi mantiene la finestra di 90 secondi. Risultati già salvati immutati. Durante il gioco rimane disponibile il trasferimento del controllo fra schede.

**Cataloghi importati nel database il 26 ottobre 2026.** Importate e rilette da `.data/knowbetter` **7.497 domande italiane in 10 categorie archiviate**: tutta la parte compatibile di [ITALIC — CRISP/Milano-Bicocca](https://huggingface.co/datasets/Crisp-Unimib/ITALIC), 7.461 quesiti sotto MIT, più 36 adattamenti italiani da [OpenTriviaQA](https://github.com/uberspot/OpenTriviaQA), sotto CC BY-SA 4.0, 12 per animali/cinema/sport. Originali, licenze, hash, esclusioni e traduzioni sono conservati in `src/server/content/`; dettagli in [README del catalogo](web/src/server/content/README.md). I 10.000 quesiti originali ITALIC sono stati scaricati integralmente: 2.534 con numero di opzioni diverso da quattro, quattro con alternative duplicate e uno con testo duplicato sono esclusi dal normalizzato e censiti. Il supplemento è una selezione tradotta dichiarata, non l'intero catalogo inglese.

**Catalogo usato dal gioco.** Tutti i 7.497 record normalizzati sono nel database; 82 quesiti `current_events` sono conservati ma disattivati in attesa di revisione temporale. Il filtro per il timer di 15 secondi (testo ≤300 caratteri, opzione ≤120, totale ≤600) porta a **7.155 domande estraibili in nove categorie**. La difficoltà `medium` di ITALIC è un default tecnico, non una valutazione calibrata. Controlli strutturali e di provenienza non sono una verifica fattuale indipendente di ogni risposta. Non sono state aggiunte traduzioni inglesi silenziose alle partite italiane.

**Caricamento e protezione dei dati esistenti.** Eseguito backup locale in `web/.data/backups/before-phase1-20261026-125543` prima della migrazione/importazione. `pnpm trivia:import` importa con commit atomico ed è stato rieseguito ottenendo `imported: false`, senza duplicati. Il coordinatore esegue lo stesso seed idempotente all'avvio e usa solo il database durante la partita. Il comando va usato a coordinatore fermo sul database PGlite; le migrazioni non richiedono cancellare `.data`. Nessun servizio cloud creato e nessun dato caricato in un database remoto.

**Verifiche della Fase 1.** Superati controllo TypeScript separato e **54 test senza listener di rete**, comprendenti motore, cataloghi, importazione SQL idempotente, migrazione da versione precedente, lobby, ricevute, cinque round, punti, privacy, rientro, domanda sostitutiva dopo riavvio e arresto. Verificato che l'uscita di tutti non consenta allo scheduler di riaprire una stanza vuota e che la perdita della soglia durante il countdown annulli immediatamente l'avvio. Build Next.js/Webpack con controllo TypeScript attivo superata; nell'ambiente isolato il sottoprocesso TypeScript restituiva output vuoto, perciò la verifica è stata eseguita fuori sandbox con l'approvazione richiesta dal tool. Nessun server applicativo o browser avviato; verifica visiva e gioco su telefoni reali restano all'utente. PostgreSQL esterno non provato.

**Recupero PGlite del 26 ottobre 2026.** L'utente segnala che `pnpm dev` termina con `RuntimeError: Aborted()` durante l'avvio PGlite. Su una copia del database, la diagnostica PostgreSQL conferma `invalid checkpoint record` e `PANIC: could not locate a valid checkpoint record at 0/178E9B8`; il segmento WAL richiesto non è presente. La causa precisa della corruzione non è stata dimostrata. Il backup sano `before-phase1-20261026-125543` si apre e consente un dump logico di 9 sessioni, 3 stanze, 6 partecipazioni e 22 ricevute. Ricostruito un database nuovo da quei dati, applicate le migrazioni e reimportate le 7.497 domande; tre riaperture consecutive riuscite prima di sostituire la directory attiva. Nessun `pg_resetwal` o azzeramento forzato dei WAL eseguito. Il database ripristinato è ora in `.data/knowbetter`; le due copie danneggiate e le copie diagnostiche temporanee sono state eliminate **su esplicita richiesta dell'utente dopo le verifiche**, conservando il backup sano precedente.

**Protezione del database locale.** `src/server/database-lock.ts` usa `flock` del sistema operativo su un file stabile esterno alla directory dati; evita che coordinatore, import e console aprano contemporaneamente PGlite. Il lock resta fino alla chiusura del motore ed è rilasciato automaticamente dal kernel alla morte del processo. Il file `.data/.knowbetter.lock` non va cancellato per gestire metadati apparentemente vecchi; il PID emulato di PGlite non identifica il proprietario del processo host. Su Linux è richiesto `util-linux`; altre piattaforme possono usare PostgreSQL esterno. Questa protezione previene le aperture concorrenti, senza attribuire retroattivamente a esse la corruzione osservata. Gli errori di apertura conservano ora i messaggi PANIC/FATAL/checkpoint e non cancellano dati automaticamente.

**Consultazione da terminale richiesta dall'utente.** Aggiunti `pnpm db:inspect`, `pnpm db:sql 'SELECT ...'` e `pnpm db:console`. Query utente in transazioni `READ ONLY`; console con `.tables`, `.schema`, `.help`, `.clear`, `.exit` e chiusura su EOF/segnali. PGlite incorporato non espone una porta per `psql`: usare i comandi a coordinatore fermo. Guida: [docs/db-local.md](docs/db-local.md). La normale apertura può applicare migrazioni mancanti prima delle query utente. Verificati sul database ripristinato riepilogo, query di conteggio, console interattiva e `transaction_read_only=on`; una seconda apertura è respinta con `DB_IN_USE`. Console chiusa al termine. Superati **68 test senza listener di rete e controllo TypeScript** dopo la correzione; nessun server applicativo o browser avviato.

**Verifica di Ctrl+C richiesta dall'utente.** Il primo SIGINT attende connessioni, coda delle operazioni, `PGlite.close()` e rilascio del lock; stampa **«Chiusura completata: database chiuso.»** solo dopo il successo. Un secondo segnale o il limite di 10 secondi forza l'uscita e non garantisce la pulizia. Spostata la registrazione dei segnali prima dell'inizializzazione asincrona del server: durante l'avvio attende la preparazione e poi chiude, evitando il precedente intervallo senza handler. Aggiunta pulizia del database anche in caso di errori nella preparazione o nell'apertura della porta. Test con vero processo Node e SIGINT, senza listener: transazione aperta completata prima della chiusura, codice di uscita zero, lock rilasciato e record presente alla riapertura. Il fatto che in precedenza l'handler fosse tardivo non dimostra che sia stata questa la causa del checkpoint danneggiato.

**Esito finale della correzione.** Superati 69 test della suite senza listener di rete e controllo TypeScript. La nuova prova comprende un vero SIGINT su un processo di test, senza avviare il server applicativo. Il database locale attivo contiene ancora 7.497 domande; i processi di console/verifica sono stati chiusi, lasciando libero il blocco per `pnpm dev`.

### Verifiche e sviluppo del primo modulo

**Verifiche eseguite dopo l'implementazione.** Build Next.js con controllo TypeScript attivo e controllo tipi separato superati; 14 test del server superati, inclusa integrazione HTTP/Socket.IO e riapertura del database locale. PostgreSQL esterno e comportamento visivo sui telefoni non sono stati verificati. L'utente cura le prove manuali da localhost e dalla rete Wi-Fi.

**Accesso di sviluppo dalla rete locale.** Su richiesta dell'utente, eliminato l'IP LAN fisso da `allowedDevOrigins`: `next.config.mjs` rileva gli indirizzi IPv4 delle interfacce non interne del computer a ogni avvio in sviluppo e aggiunge `127.0.0.1`. Next.js confronta l'hostname dell'origine, non l'IP del dispositivo che si collega; consentire gli indirizzi del server permette l'accesso dai telefoni senza elencarli o autorizzare sottoreti con wildcard. Se si cambia Wi-Fi o IP, riavviare `pnpm dev` e aprire il nuovo indirizzo del computer sul telefono. La rilevazione non viene eseguita durante la build o in produzione. I controlli di Socket.IO restano quelli esistenti. Riferimento: [Next.js — allowedDevOrigins](https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins).

**Verifica della configurazione LAN.** Con interfacce simulate, verificati il passaggio da `192.168.1.30` a `10.0.0.42`, la rimozione dei duplicati, il filtro IPv4 e il confronto delle origini tramite il matcher installato di Next.js. Verificato inoltre che build e produzione non leggano le interfacce. Nessun server o browser avviato; la prova sui telefoni resta all'utente.

**Indagine sull'interattività da Android/Chrome.** Dopo la correzione HMR, l'utente segnala «Connecting…» permanente e nessuna reazione di selettore crea/entra o avatar; `/api/guest` dal telefono restituisce `{"ok":true}`. La pagina e lo script della lobby letti dal server già avviato rispondono HTTP 200 anche via IP LAN. Il problema riguarda quindi l'avvio dell'interattività, non soltanto il collegamento Socket.IO; la causa esatta sul telefono non è ancora confermata. Come workaround mirato, il custom server passa `webpack: true` a Next.js solo in sviluppo, sulla base della [segnalazione Next.js #94075](https://github.com/vercel/next.js/issues/94075) con sintomi simili su Android/Turbopack. Non è una diagnosi confermata né una modifica alla build di produzione. Occorre riavviare `pnpm dev` e verificare sul telefono; nessun nuovo server o browser viene avviato dall'agente.

L'utente conferma che il blocco avviene anche in incognito prima della prova con Webpack. Controllo TypeScript superato dopo la modifica; esito sul telefono ancora da verificare.

**Correzione dell'arresto del coordinatore.** L'utente segnala che né `Ctrl+C` né il normale `kill` terminano il processo. Individuato un blocco nell'ordine di chiusura: `io.close()` attende anche il server HTTP, che può restare aperto per le WebSocket HMR di Next.js. Il precedente gestore ignorava inoltre tutti i segnali successivi al primo. `src/server/shutdown.ts` tiene traccia delle connessioni TCP e le chiude anche dopo l'upgrade WebSocket, rende l'arresto idempotente e attende la coda lobby prima di chiudere il database. Il primo segnale tenta la pulizia, il secondo forza l'uscita; limite massimo di 10 secondi per l'arresto del processo. Il vecchio processo bloccato è stato verificato nella directory dell'app e terminato con SIGKILL; non è stato riavviato dall'agente. Otto test mirati superati senza porte in ascolto né segnali reali, insieme al controllo TypeScript. L'avvio con Webpack e la prova mobile restano a cura dell'utente.

Stanze private con codice/link, rinvio dei profili e scelta del pacchetto avatar Kenney sono confermati. Unicità del nickname, gestione dell'organizzatore e finestre di rientro sono default d'implementazione del primo modulo. La Fase 1 recepisce minimo di due giocatori e countdown di cinque secondi confermati; avvio del solo organizzatore con due connessi è il default del piano applicato dopo l'autorizzazione. Stato «Pronto» non obbligatorio; dettagli del catalogo Kenney come già descritti.

Le dipendenze dell'app hanno versioni dichiarate e un lockfile; la Fase 1 non richiede nuove dipendenze runtime. Schema SQL, partite e catalogo sono gestiti in `src/server/database.ts` e `src/server/trivia.ts`. Hosting definitivo e strumenti operativi di accesso al database restano da scegliere.

Riferimenti tecnici verificati il 25 ottobre 2026: [TypeScript](https://www.typescriptlang.org/docs/handbook/2/basic-types), [React](https://react.dev/learn), [Node.js](https://nodejs.org/learn/getting-started/introduction-to-nodejs), [stanze Socket.IO](https://socket.io/docs/v4/rooms/), [garanzie di consegna](https://socket.io/docs/v4/delivery-guarantees/), [recupero della connessione](https://socket.io/docs/v4/connection-state-recovery), [transazioni PostgreSQL](https://www.postgresql.org/docs/current/tutorial-transactions.html), [JSONB](https://www.postgresql.org/docs/current/datatype-json.html), [database Supabase](https://supabase.com/docs/guides/database/overview) e [autenticazione Supabase](https://supabase.com/docs/guides/auth).

## Versionamento del progetto

**Confermato il 26 ottobre 2026.** Il proprietario ha richiesto di pubblicare il progetto su GitHub per il versionamento, precisando che il repository deve essere **privato**. Creato [LucaCarr0/KnowBetter](https://github.com/LucaCarr0/KnowBetter), con visibilità privata verificata prima del caricamento.

**Scelte operative per il versionamento.** Il repository comprende applicazione, documentazione, asset e cataloghi sorgente con relative licenze. Dipendenze, build, cache, credenziali e database locali con i relativi backup sono esclusi; i dati delle partite locali richiedono backup separati. Una nuova clone ricrea automaticamente schema, migrazioni e 7.497 domande al primo `pnpm dev`, usando i cataloghi versionati. La pubblicazione del repository non sceglie un hosting del gioco.

### Riordino delle directory

**Confermato il 26 ottobre 2026.** Il proprietario ha richiesto un refactoring perché i nomi delle directory risultavano confusionari. Ha confermato di aver spento il server prima dello spostamento.

**Scelte operative del riordino.** La directory storica `pwa-homepage-design/` è rinominata `web/`; il codice applicativo è raccolto in `web/src/`, con `app/` per il routing Next.js, `features/` per le funzionalità, `components/` per i componenti condivisi, `lib/` per le utilità e `server/` per coordinamento, persistenza e cataloghi. `scripts/`, `public/` e le configurazioni rimangono nella radice `web/`. Comandi pnpm, alias TypeScript, import e documentazione seguono i nuovi percorsi. La directory `.data/`, con database e backup, è conservata sotto `web/`, insieme alle dipendenze e alla configurazione locale. Eseguire i comandi da `web/` per continuare a usare gli stessi dati; non sono previste nuove migrazioni SQL per questo riordino.

**Verifiche di swipe e riordino.** Superati 76 test senza listener di rete, controllo TypeScript e build Next.js/Webpack con controllo dei tipi attivo. Verificati avvio da concorrente diverso dall'organizzatore, swipe simultanei e reinvii, pause senza scadenza, recupero delle vecchie introduzioni temporizzate, soglia dei connessi, rientro e abbandono. Se un ritiro definitivo lascia meno di due concorrenti, la fase si interrompe conservando i punti e consente il ritorno in lobby; la sola disconnessione non fa scadere la pausa. Il controllo dello swipe copre trascinamento incompleto/annullato, rilascio, attivazione da tastiera e blocco degli invii concorrenti. Confermati gli spostamenti Git di cataloghi, licenze, asset e lockfile senza modifiche del contenuto; collegamenti locali della documentazione verificati. Database e backup sono stati spostati insieme alla directory, senza aprire il database reale. Nessun server applicativo o browser avviato; verifica visiva e gesto sui telefoni a cura dell'utente.

## Altre decisioni di prodotto aperte

- Durata desiderata di una partita e ritmo tra domande, sfide e riepiloghi.
- Età e tipologia del pubblico; livello di competizione desiderato.
- Eventuale comunicazione tra giocatori a distanza: non sono stati richiesti chat o audio integrati.
- Gestione di partite interrotte ed eventuale rivincita.
- Modello economico e priorità della presenza negli store.
- Budget e numero di partite contemporanee atteso, distinti dal limite di dieci giocatori per singola partita.

## Registro delle decisioni confermate

| Data | Decisione | Origine |
| --- | --- | --- |
| 25 ottobre 2026 | Party game di cultura generale, con sottocategorie e impronta sociale ispirata a Sapere è Potere | Descrizione iniziale del proprietario |
| 25 ottobre 2026 | Tre fasi: cinque round trivia, cinque round con minisfida, finale su percorso con maledizioni | Descrizione iniziale del proprietario |
| 25 ottobre 2026 | Correttezza e rapidità premiate nella prima fase; categoria successiva scelta a maggioranza | Descrizione iniziale del proprietario |
| 25 ottobre 2026 | Minisfide casuali con tentativi illimitati nella seconda fase | Descrizione iniziale del proprietario |
| 25 ottobre 2026 | Ogni giocatore sblocca individualmente la domanda nella seconda fase; più punti ai più rapidi | Risposta alla domanda di chiarimento |
| 25 ottobre 2026 | Punti accumulati convertiti in vantaggio iniziale sul percorso; vince il primo al traguardo | Descrizione iniziale del proprietario |
| 25 ottobre 2026 | Massimo dieci giocatori, avatar e interfaccia mobile personale | Descrizione iniziale del proprietario |
| 25 ottobre 2026 | Partita interamente fruibile sui telefoni, senza schermo comune obbligatorio | Risposta alla domanda di chiarimento |
| 25 ottobre 2026 | Supporto sia alla stessa stanza sia al gioco a distanza | Risposta alla domanda di chiarimento |
| 25 ottobre 2026 | Richiesta iniziale di documentare il concept senza implementazione o piano tecnico; successivamente autorizzato l'avvio della pianificazione | Indicazioni successive del proprietario |
| 25 ottobre 2026 | Avvio della pianificazione delle singole parti, iniziando da linguaggio e conservazione dei dati; nessuna implementazione richiesta | Richiesta successiva del proprietario |
| 25 ottobre 2026 | Preferenza generale per accesso ospite e account facoltativo con profilo/statistiche; l'account viene poi rinviato a un'aggiunta successiva | Risposta iniziale e successiva precisazione del proprietario |
| 25 ottobre 2026 | Primo modulo limitato a menu e accesso alle stanze con nickname/avatar, senza profilo | Richiesta esplicita successiva del proprietario |
| 25 ottobre 2026 | Stanze private, accessibili tramite codice o link di invito | Risposta alla domanda di chiarimento sul primo modulo |
| 25 ottobre 2026 | Scrivere esclusivamente il piano di implementazione, senza codice applicativo | Precisazione esplicita del proprietario durante la pianificazione |
| 25 ottobre 2026 | Home già realizzata dall'utente in `web/`, da usare come base e aggiustare in modo mirato | Comunicazione del proprietario e ispezione dei file |
| 25 ottobre 2026 | Aggiornare il piano dando priorità a directory chiare, revisione dei problemi e relative correzioni future | Richiesta successiva del proprietario |
| 25 ottobre 2026 | Consentire le prove da telefoni sulla rete locale anche quando cambia l'IP del computer, senza aggiornare manualmente la configurazione | Richiesta successiva del proprietario |
| 26 ottobre 2026 | Valutare pacchetti di avatar open source più simpatici delle emoji attuali, cercando anche alternative con animali; pacchetto e catalogo ancora da scegliere | Richiesta successiva del proprietario |
| 26 ottobre 2026 | Scelto Kenney Animal Pack Remastered per sostituire gli avatar emoji; la scelta conclude la precedente ricerca del pacchetto | Risposta del proprietario: «va bene kenney» |
| 26 ottobre 2026 | Richiesto il piano implementativo della Fase 1 del gioco; il nuovo modulo è in pianificazione, senza richiesta di implementazione immediata | Richiesta del proprietario di iniziare il piano delle meccaniche base |
| 26 ottobre 2026 | Pulsante «Inizia partita!» nella stanza con almeno due giocatori e countdown di cinque secondi | Richiesta del proprietario sulla fase di gioco |
| 26 ottobre 2026 | Conduttore televisivo Jerry basato sul PNG fornito, regole e momenti collettivi sulla plancia, transizioni rapide e cartoonose | Richiesta del proprietario sulla fase di gioco; file rilevato `Gerry.png` |
| 26 ottobre 2026 | Classifica dei punti disponibile su ogni client; jolly citati come esempio, senza regole confermate | Richiesta del proprietario sulla plancia |
| 26 ottobre 2026 | Voto della sottocategoria all'inizio di ciascuno dei cinque round, incluso il primo; aggiorna la sequenza precedente | Precisazione del proprietario nella richiesta della Fase 1 |
| 26 ottobre 2026 | Tre viste alternate: plancia, voto categoria, risposta personale alla domanda; «votazione» nell'elenco delle schermate significa scelta della risposta | Richiesta e risposta esplicita del proprietario alla domanda di chiarimento |
| 26 ottobre 2026 | Autorizzata l'implementazione del piano della Fase 1; richiesto anche di reperire cataloghi di domande da internet e caricarli nel database per categoria | «procedi col piano, bisogna anche caricare sul db tutte le domande per categoria, prendi dei cataloghi da internet» |
| 26 ottobre 2026 | Ricordata la disponibilità del plugin per componenti UI, da usare quando utile; integrato un effetto punti da Originkit | Promemoria del proprietario durante l'implementazione |
| 26 ottobre 2026 | Richiesto di poter verificare il database locale dal terminale; aggiunti riepilogo, query e console SQL in sola lettura | Richiesta del proprietario durante la correzione dell'avvio PGlite |
| 26 ottobre 2026 | Autorizzata l'eliminazione del vecchio database danneggiato dopo la verifica della copia funzionante; eliminati gli archivi danneggiati mantenendo il backup sano | «se hai creato una copia funzionante del db quello vecchio danneggiato lo puoi pure buttare se non crea problemi» |
| 26 ottobre 2026 | Pubblicare il progetto su GitHub per il versionamento in un repository privato | «pubblicami il progetto in una directory su github che mi serve versioning», seguito da «repo privata chiaramente» |
| 26 ottobre 2026 | Togliere l'avanzamento automatico dalle istruzioni e dall'avvio dei round: swipe di qualsiasi concorrente per far proseguire tutti; mantenere classifica di 5 secondi e timer attuale delle domande | Richiesta del proprietario di ridurre l'ansia da countdown, con proposta di trascinare un pulsante anziché tenerlo premuto |
| 26 ottobre 2026 | Riordinare le directory del progetto per rendere più chiari i nomi e la struttura; server spento dall'utente prima dello spostamento | «poi i nomi delle directory sono confusionari, vuoi fare un refactoring», seguito da «te l'ho spento io» |
| 27 ottobre 2026 | Generare un QR code alla creazione della stanza, oltre al codice/link; la scansione con la fotocamera apre l'ingresso con codice già compilato, poi nickname/avatar e conferma senza account | Richiesta del proprietario di semplificare l'accesso alla stanza dal telefono |
| 27 ottobre 2026 | Dare personalità a Jerry con commenti di fine round sugli eventi notevoli, nickname dei concorrenti e tono sbruffone nelle prese in giro per gli errori | Richiesta del proprietario di migliorare la Fase 1 |
| 27 ottobre 2026 | Introdurre quattro poteri nella preparazione di ogni domanda della Fase 1, una carta casuale iniziale consumabile e possibilità di ottenere altre carte secondo probabilità `p × k` crescente dal primo all'ultimo; includere inversione delle lettere interne delle risposte | Richiesta del proprietario di migliorare la Fase 1 |
| 27 ottobre 2026 | Prima taratura dei poteri: un avversario per uso, massimo un effetto subito per domanda, probabilità dal 20% per il primo al 60% per l'ultimo | Risposta del proprietario: «Sì, usa questa taratura» |
| 27 ottobre 2026 | Durante l'avvio mantenere tutti nella lobby con una rotellina; alla scadenza dei cinque secondi server mostrare «Benvenuti nello studio», senza countdown numerico | Richiesta del proprietario di migliorare l'avvio della partita |
| 27 ottobre 2026 | Allungare il tempo per scegliere potere e bersaglio e mostrare gli avatar dei possibili bersagli nel menu a tendina | Richiesta successiva del proprietario; durata di 15 secondi scelta come nuovo default d’implementazione |
| 27 ottobre 2026 | Sostituire Lucchetti con Shuffle: le quattro risposte cambiano posizione ogni 0,5 secondi per il giocatore colpito | Richiesta successiva del proprietario |
| 27 ottobre 2026 | Rallentare Shuffle da 0,5 a 1 secondo tra gli scambi di posizione, per ridurne la difficoltà | Richiesta successiva del proprietario dopo la prova |
