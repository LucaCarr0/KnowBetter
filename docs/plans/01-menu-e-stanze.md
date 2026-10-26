# Piano di implementazione — revisione della home e accesso alle stanze

Data: 25 ottobre 2026.
Aggiornamento avatar: 26 ottobre 2026.
Stato: piano originario a partire dalla home già realizzata dall'utente, successivamente autorizzato per l'implementazione. Home, lobby e avatar Kenney sono implementati; controllo TypeScript, 15 test della lobby e build Webpack superati. La verifica visiva sui telefoni resta all'utente. I rilievi iniziali e la sequenza sotto documentano il piano di partenza, non lo stato corrente delle verifiche.
Riferimento: [memoria di progetto](../../PROJECT_MEMORY.md).

Aggiornamento di perimetro del 26 ottobre 2026: il seguito è descritto in [02-fase-1-trivia.md](02-fase-1-trivia.md). Sono ora confermati minimo di due giocatori, pulsante «Inizia partita!» e countdown di cinque secondi; queste decisioni superano i punti ancora aperti sull'avvio nel piano originario. Il nuovo modulo è stato successivamente autorizzato e implementato, con caricamento di cataloghi di domande nel database.

## 1. Obiettivo e perimetro

Partire dalla home già realizzata in `pwa-homepage-design/`, organizzarne il codice in directory chiare, individuare e correggere i problemi verificati e completare successivamente i flussi di accesso alle stanze. La home esistente è la base visiva e funzionale da riutilizzare: gli interventi devono essere mirati, preservando la sua impostazione.

Il risultato complessivo rimane permettere a un gruppo di aprire il gioco dal telefono, scegliere nickname e avatar, creare una stanza privata o entrarvi tramite codice/link e ritrovarsi nella stessa sala d'attesa.

Il risultato del modulo è una lobby funzionante fino a dieci giocatori, con identità ospite e rientro dopo una breve disconnessione. L'esecuzione delle tre fasi di gioco appartiene a moduli successivi.

**Requisiti confermati:**

- Home già scritta dall'utente, da riorganizzare e aggiustare nelle parti necessarie.
- Includere nel lavoro futuro revisione del codice, individuazione dei problemi e correzioni verificabili.
- Menu iniziale e accesso alle stanze tramite nickname e avatar.
- Pacchetto Kenney Animal Pack Remastered scelto il 26 ottobre 2026 per sostituire il catalogo iniziale di sei emoji.
- Prima versione senza profili, registrazione o login; il profilo sarà un'aggiunta successiva.
- Stanze private, accessibili tramite codice o link di invito.
- Massimo dieci giocatori per stanza.
- Esperienza completa sui telefoni personali, nella stessa stanza o a distanza.
- Durante la redazione iniziale si scriveva esclusivamente il piano; l'utente ha successivamente autorizzato implementazione e dipendenze con «procedi con il piano».

**Base tecnica rilevata:** il frontend usa già Next.js con App Router, React, TypeScript e Tailwind CSS; sono presenti configurazione shadcn/Base UI e icone Lucide. Il piano assume di proseguire da questa applicazione. Node.js con Socket.IO e PostgreSQL restano proposte per il coordinamento e la conservazione dei dati. Hosting e runtime del coordinatore sono ancora da definire; la presenza di Next.js non implica che il futuro servizio realtime sia già implementato o ospitato nello stesso processo.

### Base esistente e confine della revisione

Ispezione statica del 25 ottobre 2026:

| Presente | Stato osservato |
| --- | --- |
| Home e presentazione del gioco | Già in `pwa-homepage-design/app/page.tsx` |
| Modalità crea/entra, nickname e codice | Stato locale React, con campi già presenti |
| Avatar | Sei avatar emoji, selezione locale e anteprima |
| Stili, layout, icone e configurazione | Già presenti nell'applicazione Next.js |
| Creazione/ingresso effettivi, inviti, lobby, sessioni e realtime | Non risultano implementati nei file esaminati |

La lettura dei file non comprende esecuzione dell'app, build, controllo dei tipi o verifica visiva nel browser. Eventuali problemi di compilazione o resa su telefono devono essere verificati in seguito, senza presentarli come difetti già dimostrati.

### Organizzazione proposta delle directory

Mantenere inizialmente `pwa-homepage-design/` come radice dell'applicazione, conservando manifest delle dipendenze, lockfile e configurazioni. La memoria e questo piano rimangono nella radice del progetto e in `docs/`. Il riordino avviene dentro l'app esistente, senza creare un secondo frontend o migrare il framework.

Tutti i percorsi seguenti sono relativi a `pwa-homepage-design/`:

| Percorso | Responsabilità proposta |
| --- | --- |
| `app/` | Routing Next.js, layout, metadati e stili globali; pagina iniziale come composizione dei componenti |
| `features/home/components/` | Intestazione, presentazione, riepilogo delle tre fasi e footer estratti dalla home |
| `features/rooms/components/` | Pannello crea/entra, selezione avatar e futura lobby |
| `features/rooms/data/` | Catalogo degli avatar e valori di presentazione del modulo |
| `features/rooms/lib/` | Normalizzazione e convalida degli input del modulo, senza duplicare l'autorità del server |
| `features/rooms/hooks/` | Stato e sincronizzazione quando la loro complessità giustifica un hook separato |
| `features/rooms/services/` | Collegamento al futuro servizio delle stanze, separato dai componenti visivi |
| `features/rooms/types.ts` | Tipi di vista e messaggi relativi alle stanze, senza segreti del server |
| `components/ui/` | Componenti generici riutilizzabili, tenendo conto del pulsante già presente |
| `lib/` | Utilità realmente condivise, inclusa la funzione di composizione delle classi già presente |
| `public/` | Icone e risorse statiche, conservando i percorsi già usati dai metadati |

Creare ogni directory quando ospita responsabilità reali; non suddividere ogni etichetta o piccolo campo in un componente autonomo. Limitare stato e API del browser ai componenti interattivi, mantenendo separabili le parti statiche secondo le convenzioni Next.js. Il backend e i relativi dati riservati non devono essere importati nei moduli client.

Durante gli spostamenti aggiornare import, alias e riferimenti shadcn se coinvolti. Conservare i token e le classi necessari all'aspetto attuale; rivedere gli stili inutilizzati soltanto dopo averne verificato gli usi. Il riordino non richiede di sostituire la libreria UI o ridisegnare la home.

### Rilievi iniziali e correzioni da pianificare

I riferimenti riguardano il codice prima del riordino; le righe cambieranno con gli spostamenti.

| Tipo | Evidenza statica | Intervento futuro |
| --- | --- | --- |
| Difetto della copia | `app/page.tsx`, righe 22–25: se Clipboard API manca viene comunque mostrato lo stato di successo; un rifiuto della copia non è gestito | Confermare solo una copia riuscita, gestire indisponibilità/errore e offrire copia manuale; verificare anche il timer del messaggio |
| Controllo di qualità disattivato | `next.config.mjs`, righe 3–5: gli errori TypeScript non bloccano la build | Ripristinare il controllo e correggere gli eventuali errori effettivamente rilevati; non presumere che la build o i tipi siano già validi |
| Accessibilità della selezione | `app/page.tsx`, righe 73–74 e 81: modalità e avatar selezionati sono comunicati solo visivamente | Esporre la selezione agli strumenti assistivi e verificare uso da tastiera e focus |
| Navigazione incoerente | `app/page.tsx`, righe 38 e 99: «Categories» porta a un footer privo di categorie | Correggere o rimuovere quel collegamento; una nuova sezione categorie non è un requisito implicito |
| Testo incoerente con il concept | `app/page.tsx`, riga 93: «Three rounds» descrive il gioco come tre round | Correggere il riferimento alle tre fasi, mantenendo la lingua dei contenuti scelta |
| Funzionalità ancora dimostrativa | `app/page.tsx`, righe 83–85: pulsante crea/entra privo di invio o azione | Integrare un invio utilizzabile anche da tastiera, con convalida, attesa ed errori, quando saranno disponibili i flussi reali delle stanze |
| Installazione ancora dimostrativa | `app/page.tsx`, righe 39 e 41: pulsanti installazione senza comportamento; non risulta un manifest nei file esaminati | Valutare la PWA separatamente; nell'interfaccia definitiva mostrare il comando soltanto quando offre un comportamento effettivo |
| Codici dimostrativi | `app/page.tsx`, righe 23, 78 e 99: codice fisso e placeholder non allineati al formato proposto nel piano | Scegliere un formato coerente e copiare soltanto inviti reali nel flusso definitivo |

L'assenza del backend era una funzionalità da completare, non una regressione della home. Lingua inglese, marchio visibile «Know Better» e sei avatar erano elementi già presenti: il piano iniziale non ne prevedeva la sostituzione automatica con proposte generiche. Il 26 ottobre 2026 l'utente ha poi scelto il pacchetto Kenney per gli avatar, sostituendo esplicitamente quel vincolo sul catalogo iniziale. L'eventuale scelta definitiva del nome e della lingua resta distinta dalla revisione tecnica.

Prima di rimuovere dipendenze verificare gli usi effettivi: il pulsante generico non è importato dalla pagina, ma è una risorsa esistente. La presenza di Analytics in produzione non stabilisce automaticamente una nuova esigenza del prodotto. Compatibilità del gestore pacchetti, lockfile, build e dipendenze rimane da verificare, senza aggiornamenti indiscriminati.

## 2. Percorsi e schermate

| Punto di partenza | Percorso previsto | Risultato |
| --- | --- | --- |
| Menu → Crea stanza | Nickname, scelta avatar, conferma | Stanza creata e creatore presente nella lobby |
| Menu → Entra in una stanza | Codice, verifica della destinazione, nickname/avatar, conferma | Ingresso nella lobby se c'è posto |
| Link di invito | Verifica della stanza, nickname/avatar, conferma | Stesso ingresso, senza digitare il codice |
| Ritorno con partecipazione valida | «Rientra nella stanza» oppure ripristino della lobby già aperta | Stesso partecipante, senza occupare un altro posto |

La selezione crea/entra e i campi d'identità sono già riuniti nel pannello della home. Questi percorsi descrivono il comportamento da completare e non richiedono di sostituirlo con nuove schermate separate.

Aprire un link o visualizzare una stanza non occupa un posto. Il posto viene assegnato soltanto quando il server accetta la conferma d'ingresso.

### Menu iniziale

- Identità visiva del gioco e due azioni principali: «Crea stanza» e «Entra in una stanza».
- Accesso secondario alle regole essenziali.
- Eventuale «Rientra nella stanza» quando il server riconosce una partecipazione ancora valida.
- Nessuna sezione profilo o richiesta di registrazione.

Usare presentazione, palette e impaginazione esistenti come riferimento durante il riordino. Correzioni di testi, navigazione o accessibilità devono essere mirate e verificabili rispetto alla home di partenza.

### Nickname e avatar

- Campo nickname, galleria di avatar predefiniti e anteprima della propria identità.
- Pulsante contestuale «Crea stanza» oppure «Entra nella stanza».
- Errori accanto al campo interessato, conservando i dati inseriti per correggere e riprovare.
- Possibilità di ricordare sul dispositivo l'ultima scelta come comodità, senza presentarla come profilo.

**Default proposti:** nickname da 2 a 18 caratteri visibili, senza caratteri di controllo e con spazi iniziali/finali rimossi. Nickname univoco nella stanza, considerando equivalenti differenze di maiuscole/minuscole e spazi superflui. La verifica definitiva avviene sul server.

**Scelta avatar confermata il 26 ottobre 2026:** [Kenney Animal Pack Remastered](https://kenney.nl/assets/animal-pack-remastered) sostituisce le sei emoji che il piano iniziale conservava come catalogo di partenza. Mantenere i dati separati dal componente e gli identificativi stabili per le partecipazioni, senza legarli alla posizione nell'elenco. La proposta di consentire lo stesso avatar a più giocatori, distinti dal nickname, resta invariata; caricamento foto ed editor non fanno parte del modulo.

**Dettagli tecnici dell'integrazione completata:** 30 animali della variante `PNG/Round`, file locali `public/avatars/kenney/<id>.png`, panda iniziale e catalogo comune per selezione, home e lobby. Licenza originale e provenienza sono conservate in `public/avatars/kenney/License.txt` e nel `README.md` della stessa directory. Per preferenze e sessioni precedenti, gli identificativi `fox`, `tiger`, `unicorn`, `octopus` vengono ricondotti rispettivamente a `dog`, `bear`, `narwhal`, `whale`; `frog` e `panda` rimangono validi. Questi sono dettagli scelti dall'agente per integrare il pacchetto, non ulteriori requisiti confermati dall'utente.

**Verifiche dell'aggiornamento avatar:** controllo TypeScript separato, 15 test della lobby senza listener di rete e build Next.js con Webpack superati. Coperti gli alias precedenti e il recupero di partecipazioni e ricevute con avatar persistiti; verificati 30 PNG distinti e accettati dalla convalida, identici agli originali, insieme alla licenza. Turbopack incontra un limite dell'ambiente sulle porte interne (`EPERM`); Webpack completa la build con controllo TypeScript attivo. Nessun server applicativo o browser avviato: verifica visiva sui telefoni a cura dell'utente, dopo il riavvio di `pnpm dev` per ricaricare il catalogo nel coordinatore.

### Codice e invito

- Campo facilmente leggibile e compatibile con copia e incolla.
- Normalizzazione di spazi e maiuscole.
- Verifica preliminare della destinazione prima della conferma del giocatore.
- Ricontrollo della capienza all'ingresso: la verifica preliminare non prenota il posto.
- Link contenente la sola destinazione della stanza, senza credenziali personali.

**Formato proposto:** codice casuale di sei caratteri, escludendo simboli facilmente confondibili. Il server garantisce l'unicità e lo rigenera in caso di collisione. Il codice è condiviso tra gli invitati e non identifica il singolo giocatore.

### Sala d'attesa

- Codice stanza e azioni per copiare codice e link di invito.
- Partecipanti con nickname, avatar, indicazione «Tu» e organizzatore.
- Conteggio dei posti occupati su dieci, distinguendo quelli temporaneamente riservati a chi si sta riconnettendo.
- Stato della connessione e aggiornamento automatico di ingressi, uscite e rientri.
- Modifica della propria identità prima della partita, con le convalide già previste per l'ingresso.
- Azione esplicita «Esci dalla stanza».

Il creatore è proposto anche come giocatore e occupa uno dei dieci posti. Spettatori e presentatore separato non sono previsti in questo modulo.

Lo stato «Pronto», i permessi di avvio e il conteggio degli offline restano da definire; minimo di due giocatori e countdown di cinque secondi sono stati poi confermati e recepiti nel piano successivo. Menu e accesso alla lobby possono essere completati senza implementare ancora l'avvio del trivia.

## 3. Identità ospite, riconnessione e organizzatore

Il piano distingue sessione ospite, partecipazione alla stanza e connessione. La connessione può cambiare senza creare un nuovo giocatore; nickname e avatar sono l'identità visibile, non le credenziali di recupero.

Per l'ipotesi web si propone una sessione riservata tramite cookie protetto, non leggibile dagli script della pagina, con connessioni sicure in produzione. Sul server si conserva una rappresentazione non direttamente riutilizzabile del segreto. Nickname, codice stanza e identificativo della connessione non autorizzano a riprendere un partecipante.

Una sessione ospite può appartenere a una sola stanza attiva nella prima versione: prima di cambiarla deve uscire da quella corrente. Questa limitazione è proposta per mantenere semplice e comprensibile il comportamento sui telefoni.

| Evento | Comportamento proposto |
| --- | --- |
| Refresh o breve interruzione della rete | Ripristinare lo stesso partecipante e ricevere lo stato aggiornato |
| Interruzione temporanea | Mostrare «Riconnessione in corso» e riservare il posto per 90 secondi |
| Riserva scaduta in sala d'attesa | Liberare il posto; il ritorno richiede un nuovo ingresso con controllo della capienza |
| Uscita esplicita | Liberare subito il posto e disattivare la partecipazione precedente |
| Seconda scheda dello stesso browser | Trasferimento esplicito del controllo, mantenendo un solo partecipante |
| Dati del browser cancellati o altro dispositivo | Nuova sessione; il recupero tramite profilo sarà disponibile solo in futuro |

I 90 secondi sono un default proposto e configurabile. Un vecchio tentativo d'ingresso ritrasmesso dopo un'uscita non deve riattivare la partecipazione abbandonata.

**Organizzatore, regola proposta:** all'uscita esplicita il ruolo passa al partecipante connesso presente da più tempo. Per una disconnessione temporanea si attende la finestra di rientro, poi si trasferisce il ruolo. Un ritorno tardivo non ripristina automaticamente il vecchio ruolo.

Se tutti sono disconnessi, la stanza rimane recuperabile durante le rispettive finestre di rientro. Quando non rimangono partecipazioni valide viene chiusa. Se rientra qualcuno e l'organizzatore non è più valido, il server rivaluta l'assegnazione del ruolo, mantenendo un solo organizzatore.

**Scadenza proposta:** chiusura della sala d'attesa dopo 60 minuti senza azioni dei giocatori. Questo valore e la durata della sessione ospite sono da consolidare prima di implementare le scadenze.

## 4. Dati e responsabilità del server

| Entità prevista | Dati essenziali | Conservazione proposta |
| --- | --- | --- |
| Sessione ospite | Identificativo, verifica del segreto, scadenza | PostgreSQL; credenziale riservata nel cookie del browser |
| Stanza | Identificativo interno, codice invito, stato, organizzatore, versione e scadenza | PostgreSQL |
| Partecipazione | Stanza, sessione, nickname visualizzato e normalizzato, avatar, ingresso, uscita ed eventuale riserva | PostgreSQL |
| Esito richiesta | Sessione, identificativo richiesta, operazione, impronta dei parametri e risultato | PostgreSQL, per riconoscere reinvii e doppie conferme |
| Presenza | Collegamento tra partecipante e connessione corrente | Memoria del server, riallineata al ritorno |
| Preferenze visive | Ultimo nickname e avatar scelti | Memoria locale del browser, facoltativa |

È un modello concettuale, senza schema SQL e senza dati per account, password o statistiche personali.

Le operazioni da prevedere sono: creare stanza, verificare invito, entrare, recuperare la propria partecipazione, modificare la propria identità e uscire. Ogni modifica viene autorizzata e convalidata dal server. Il possesso del codice permette di chiedere di entrare, senza conferire il controllo di altri giocatori o i permessi dell'organizzatore.

### Capienza e richieste simultanee

- Creazione della stanza e inserimento del creatore devono riuscire o fallire insieme.
- Le operazioni concorrenti sulla stessa stanza vengono serializzate, per esempio bloccando la riga della stanza prima di verificare e modificare partecipazioni e capienza. La stessa regola vale per cambio nickname, rientro, scadenze e futuro avvio: la sola presenza di una transazione non basta.
- Creazione e ingresso coordinano atomicamente anche le richieste della stessa sessione ospite, per impedire che due operazioni verso stanze diverse la lascino attiva in entrambe. Sessione e stanza devono essere bloccate in un ordine coerente.
- Con nove posti occupati e due ingressi simultanei, soltanto uno ottiene il decimo posto. Anche i posti ancora riservati contano nella capienza.
- Richieste ripetute con lo stesso identificativo restituiscono l'esito già registrato. Lo stesso identificativo con dati differenti viene rifiutato. Un esito storico viene riallineato allo stato attuale e non riattiva una partecipazione già abbandonata.
- Ogni modifica incrementa una versione dello stato. Il telefono può ricevere una copia completa e ignorare aggiornamenti precedenti.
- Il salvataggio precede la comunicazione dell'esito definitivo. Dopo un riavvio le presenze vengono riconfermate, senza mostrare tutti automaticamente come connessi.

La convalida degli input e i limiti ai tentativi di creazione/accesso sono responsabilità del server. La credenziale ospite non viene condivisa con gli altri giocatori o inclusa nel link d'invito.

## 5. Errori e utilizzo da telefono

Prevedere messaggi distinti per codice non valido, stanza inesistente o scaduta, stanza piena, partita già iniziata, nickname occupato, sessione non più valida e rete non disponibile.

Durante una richiesta rendere visibile l'attesa ed evitare conferme ripetute. Se la risposta si perde, verificare l'esito già registrato prima di ripetere l'operazione. Nickname, avatar e destinazione rimangono disponibili per correggere e riprovare.

Tutte le schermate devono funzionare in verticale su telefono, anche con tastiera aperta, con comandi comodi al tocco e informazioni comprensibili senza dipendere solo dai colori. Copia del link e inserimento manuale del codice devono funzionare anche senza condivisione integrata del dispositivo.

## 6. Sequenza di implementazione futura

Questi passaggi descrivono lavoro futuro; non autorizzano l'esecuzione del codice durante la redazione del piano.

1. **Registrare il punto di partenza.** Inventariare sorgenti e configurazioni, verificare il progetto con il gestore pacchetti dichiarato e documentare build/tipi ed eventuali errori iniziali. Acquisire un riferimento visivo della home sui formati telefono e desktop. Risultato: distinzione tra problemi preesistenti, elementi dimostrativi e regressioni introdotte dopo.
2. **Riorganizzare il codice esistente.** Estrarre parti statiche, pannello interattivo e dati degli avatar nelle directory proposte, aggiornando i riferimenti. Risultato: responsabilità chiare e aspetto/interazioni già funzionanti conservati.
3. **Correggere i problemi della home.** Gestire la copia, esporre le selezioni accessibili, correggere testi e ancore e ripristinare il controllo dei tipi. Risultato: ciascun difetto confermato ha una verifica mirata; non viene simulato il successo di funzioni ancora prive di backend.
4. **Verificare il riordino prima di ampliarlo.** Eseguire controllo tipi e build senza bypass, confrontare la home con il riferimento e verificare tastiera, focus, campi e layout con tastiera mobile aperta. Risultato: una base stabile da cui proseguire.
5. **Consolidare le regole ancora aperte.** Definire nickname, invito, rientro e organizzatore, mantenendo esplicite le scelte di hosting ancora mancanti.
6. **Preparare dati e sessione ospite.** Definire salvataggi, vincoli, scadenze e gestione dei reinvii. Risultato: identità recuperabile senza registrazione.
7. **Realizzare creazione e ingresso e collegarli al pannello esistente.** Gestire invito, assegnazione dei posti, convalida e messaggi di errore. Risultato: il telefono raggiunge una stanza reale, fino a dieci partecipanti.
8. **Completare lobby, rientro e uscita.** Sincronizzare partecipanti e organizzatore, coprendo refresh, cambio rete, più schede e riserva del posto. Risultato: elenco coerente su tutti i telefoni e nessun duplicato al rientro.
9. **Verificare il modulo completo.** Eseguire le prove multiutente seguenti e il controllo su telefoni reali, anche collegati a reti diverse.

Ogni passaggio produce una parte verificabile del modulo, senza realizzare domande, punteggi, minisfide o maledizioni.

## 7. Criteri di completamento e verifiche

La revisione della home è verificata separatamente dall'integrazione delle stanze:

- App esistente mantenuta come base e responsabilità distribuite nelle directory concordate, con import e configurazioni coerenti.
- Aspetto e interazioni locali confrontati prima/dopo il riordino, con differenze limitate alle correzioni intenzionali.
- Controllo dei tipi e build eseguiti senza ignorare gli errori; eventuale lint configurato con strumenti compatibili con la versione in uso.
- Copia verificata con successo, API assente e permesso negato, senza falsi messaggi di conferma.
- Selezione modalità/avatar comprensibile agli strumenti assistivi e utilizzabile da tastiera.
- Testi delle tre fasi e collegamenti coerenti; nessuna azione dimostrativa presentata come una funzione completata.
- Verifica effettiva su telefono di intestazione, footer, zoom, focus e tastiera: eventuali problemi di spazio sono da controllare, non già dimostrati dalla sola lettura del codice.

Il modulo delle stanze è completo quando sono verificati anche i seguenti punti:

- Creazione e ingresso da altri telefoni tramite codice e link, scegliendo nickname e avatar.
- Dieci partecipanti supportati; undicesimo ingresso respinto con un esito comprensibile.
- A nove partecipanti, due ingressi simultanei assegnano un solo posto.
- Due nickname equivalenti simultanei non vengono accettati entrambi, se si adotta l'unicità proposta.
- Conferme ripetute e risposte perse non creano stanze o partecipanti duplicati.
- Due creazioni o ingressi simultanei verso stanze diverse non lasciano la stessa sessione attiva in entrambe.
- Un'altra sessione con lo stesso nickname e codice non prende il controllo di un partecipante esistente.
- Refresh e rientro entro la riserva ripristinano lo stesso posto.
- Uscita esplicita libera il posto; un vecchio reinvio non annulla l'uscita.
- La chiusura della vecchia connessione dopo un rientro non segna erroneamente offline il giocatore.
- Cambio scheda e passaggio del ruolo mantengono un solo partecipante e un solo organizzatore validi.
- Aggiornamenti persi e riavvio del server consentono il riallineamento allo stato salvato.
- Menu, moduli, errori e lobby sono utilizzabili da telefono senza schermo comune.

Le verifiche tecniche future si concentreranno sui difetti corretti, sui vincoli, sugli accessi simultanei e sul recupero della sessione. Una verifica completa del percorso utente coprirà creazione, ingresso, lobby e uscita; non occorrono test che ripetano la sola struttura visiva dei componenti.

## 8. Confine con l'avvio della partita

Il modulo lascia identificativi stabili per stanza e partecipanti. Il modulo successivo li userà per fissare l'elenco dei giocatori e passare alla prima fase.

La futura operazione di avvio dovrà verificare organizzatore e condizioni concordate, chiudendo i nuovi ingressi insieme al cambio di stato. Il rientro di chi è già riconosciuto resterà distinto dal nuovo ingresso. Un ingresso simultaneo all'avvio non dovrà creare elenchi differenti sui telefoni.

Il successivo piano della Fase 1 recepisce minimo di due giocatori e countdown di cinque secondi confermati il 26 ottobre 2026. Stato «Pronto», permessi di avvio e conteggio dei temporaneamente offline rimangono aperti. Questo primo piano non prevede l'esecuzione delle fasi di gioco.

## 9. Scelte ancora da consolidare

- Regole del nickname e possibilità di ripetere lo stesso avatar; il pacchetto Kenney è già scelto, mentre i dettagli del catalogo sono scelte tecniche dell'integrazione.
- Creatore anche giocatore e passaggio dell'organizzatore.
- Finestre di rientro, scadenza della lobby e durata della sessione ospite.
- Stato «Pronto», permessi di avvio e conteggio degli offline per il modulo successivo; minimo di due giocatori e countdown di cinque secondi sono ora confermati.
- Eventuali aggiustamenti mirati alla presentazione esistente, lingua e nome definitivo; il riordino prende come riferimento la home già realizzata.

Gli aspetti ancora aperti sono proposte, non requisiti approvati. Il rinvio dei profili, le stanze private tramite codice/link, la scelta del pacchetto Kenney e, per il seguito, minimo di due giocatori e countdown di cinque secondi sono invece confermati.

## Riferimenti tecnici

Verificati il 25 ottobre 2026: [struttura di un progetto Next.js](https://nextjs.org/docs/app/getting-started/project-structure), [separazione dei componenti server/client](https://nextjs.org/docs/app/getting-started/server-and-client-components), [controllo TypeScript durante la build](https://nextjs.org/docs/app/api-reference/config/next-config-js/typescript), [sessione distinta dalla connessione Socket.IO](https://socket.io/docs/v4/server-socket-instance/), [convalida delle connessioni](https://socket.io/docs/v4/middlewares/), [accessi simultanei in PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html), [cookie e gestione della sessione](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies). Sono riferimenti per la futura implementazione, non attività eseguite.
