# Piano di implementazione — Fase 2: ruota dei minigiochi

Data: 30 ottobre 2026.
Stato: autorizzato con «Procedi» e implementato il 30 ottobre 2026; prove sui telefoni a cura del proprietario.
Aggiunte in corso d'opera: la ruota gira nel verso dello swipe, resta ferma 1,4 secondi per leggere lo spicchio, e la Domanda lampo ha il suo comando `game:flash-answer`.
Riferimenti: [memoria di progetto](../../PROJECT_MEMORY.md), [Fase 1](02-fase-1-trivia.md).

## 1. Requisiti confermati

Confermati dal proprietario il 30 ottobre 2026:

- A ogni turno un giocatore gira la ruota; tutti la girano lo stesso numero di volte.
- Giri a testa: `ceil(8 / N)`. Da 8 a 14 giri totali, sempre entro il limite di 16.
- Chi gira subisce l'effetto dello spicchio. I bonus non fanno rigirare.
- +500 e −500 comuni; x2 e ÷2 molto rari; niente jackpot.
- Minigiochi sul 40–50% della ruota, non a ogni turno. Coinvolgono tutti e assegnano direttamente i punti.
- La trivia resta con due spicchi distinti: «Domanda lampo per tutti», al 5%, e «Domanda lampo personale», per la sola persona che ha girato, un po' più frequente.
- La ruota ha più spicchi rispetto alla prima proposta da 20.
- Animazioni fluide: la fase non deve ridursi a testo e cursori di swipe.
- La ruota si gira con uno swipe direttamente sulla ruota e deve dare la sensazione di una ruota vera.
- Ogni minigioco è presentato da un'anteprima con le regole sotto, come in Wii Party; si parte quando tutti hanno confermato con uno swipe.
- Per gli elementi React si usa anche Originkit.

| Giocatori | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Giri a testa | 4 | 3 | 2 | 2 | 2 | 2 | 1 | 1 | 1 |
| Giri totali | 8 | 9 | 8 | 10 | 12 | 14 | 8 | 9 | 10 |

Fuori da questo piano: Fase 3, poteri nella Fase 2, audio, sensori di movimento e i 9 minigiochi non selezionati. Dopo la Fase 2 la partita si chiude con il riepilogo, come oggi avviene dopo la Fase 1.

## 2. Default proposti da approvare

Tutti i numeri sono una prima taratura da provare giocando.

### Ruota su 40 spicchi

| Spicchio | Quanti | Probabilità | Effetto |
| --- | --- | --- | --- |
| Minigioco | 17 | 42,5% | Estrae un minigioco; giocano tutti |
| Domanda lampo per tutti | 2 | 5% | Una domanda; rispondono tutti |
| Domanda lampo personale | 3 | 7,5% | Una domanda; risponde solo chi ha girato |
| +500 | 9 | 22,5% | Chi ha girato guadagna 500 punti |
| −500 | 7 | 17,5% | Chi ha girato perde 500 punti, senza scendere sotto zero |
| x2 | 1 | 2,5% | Raddoppia il punteggio totale di chi ha girato |
| ÷2 | 1 | 2,5% | Dimezza il punteggio totale di chi ha girato, per difetto |

Le attività per tutti (minigioco e domanda per tutti) sono il 47,5% della ruota, quindi ne esce una circa ogni due giri, ma non è garantito: con 8 giri c'è circa lo 0,6% di probabilità di non vederne nessuna. Non aggiungo correttivi, perché la casualità fa parte della ruota. Gli spicchi uguali sono distribuiti lungo la ruota, non raggruppati.

### Turni

- L'ordine viene sorteggiato a inizio fase e si ripete a ogni giro di tavolo.
- Solo chi è di turno può girare, con uno swipe sulla ruota. Dopo 15 secondi senza swipe, o se è disconnesso, il server gira per lui.
- Il turno di chi si ritira viene saltato; il totale dei giri si fissa all'inizio della fase.
- Il minigioco dello spicchio viene estratto senza ripetizioni finché non sono usciti tutti quelli disponibili per quel numero di giocatori. Le Domande lampo non ripetono domande già usate nella partita.

### Minigiochi

Premio standard per posizione, con pari merito come nel bonus: `round(1000 − 800 × (posizione − 1) / (partecipanti − 1))`, da 1.000 a 200 punti. Chi non partecipa o non ottiene un risultato valido fa zero.

| Minigioco | Giocatori | Durata | Regole | Punti |
| --- | --- | --- | --- | --- |
| **Stoppa il timer** | 2+ | 20 s | Obiettivo uguale per tutti, da 5,0 a 10,0 s. Il timer parte da solo sul telefono all'inizio del gioco, per decisione del proprietario; il display si spegne dopo 2 s. Un solo tentativo | Standard, per scarto dall'obiettivo |
| **Numeri in ordine** | 2+ | 20 s | Griglia da 16 uguale per tutti; un tocco sbagliato blocca per 1 s | Standard, per tempo; chi non finisce fa zero |
| **Palloncino** | 2+ | 15 s | Limite segreto da 10 a 30 pompate, uguale per tutti. Si incassa quando si vuole | Standard, per pompate al momento dell'incasso; zero se scoppia o se non incassa |
| **Dividi il bottino** | 3+ | 12 s | Scelta nascosta tra tre forzieri | 1.500, 800 e 300 punti, divisi tra chi ha scelto quel forziere |
| **Il più alto unico** | 3+ | 12 s | Scelta nascosta di un numero da 1 a 20 | 1.000 punti al più alto scelto da uno solo; altrimenti nessuno |
| **Bomba** | 3+ | 25 s | Tre esplosioni a orari nascosti. Si passa toccando un avatar, ma non a chi l'ha appena passata. Dopo ogni esplosione la bomba va a un giocatore a caso | −300 a ogni esplosione per chi la tiene, senza scendere sotto zero; +300 a chi non esplode mai |

I forzieri sono scesi da 3.000/1.000/300 a 1.500/800/300 per restare in linea con il premio standard. Con 2 giocatori restano Stoppa il timer, Numeri in ordine e Palloncino.

### Domande lampo

Entrambe hanno quattro risposte, categoria casuale, 15 secondi, nessun voto e nessun potere. Una risposta corretta vale 500 punti più fino a 500 per la rapidità, come nella Fase 1; errore o assenza danno zero, senza penalità.

- **Per tutti:** ognuno risponde dal proprio telefono; la domanda si chiude quando hanno risposto tutti.
- **Personale:** gli altri vedono domanda e risposte in sola lettura e seguono la scelta solo all'esito. Se chi ha girato è disconnesso, il turno vale zero e si passa avanti.

### Flusso

Riepilogo Fase 1 → presentazione della ruota (swipe) → turno di chi gira → animazione.

- **Spicchio bonus:** effetto e classifica per 5 secondi, poi turno successivo.
- **Spicchio minigioco:** anteprima con regole, finché tutti confermano → gioco → risultati e classifica per 5 secondi → turno successivo.
- **Spicchio Domanda lampo:** annuncio della categoria per 3 secondi → domanda → esito e classifica per 5 secondi → turno successivo. Le regole non servono, perché il formato è già noto dalla Fase 1.

Dopo l'ultimo giro compare il riepilogo della Fase 2, con la scomposizione tra punti della Fase 1 e variazione della Fase 2, che può essere negativa.

## 3. Esperienza visiva

### La ruota

Originkit non ha una ruota della fortuna, quindi la costruisco su misura in SVG, ruotandola con `transform` per restare fluida anche su telefoni medi.

- **Trascinamento:** la ruota segue il dito attorno al centro. Anche chi non è di turno può vederla, ma solo chi è di turno può toccarla.
- **Lancio:** al rilascio conta la velocità del dito. Uno swipe troppo lento non la fa partire: la ruota torna indietro con un piccolo rimbalzo.
- **Rotazione:** più forte è lo swipe, più giri fa e più dura, da 3 a 6 secondi. Rallenta in modo naturale, con la linguetta che scatta sui pioli e vibra a ogni spicchio.
- **Finale:** negli ultimi istanti la ruota può sembrare fermarsi tra due spicchi prima di cadere su quello giusto, per aumentare la tensione.
- **Spicchi:** con 40 spicchi le scritte non starebbero, quindi uso colori e icone, con una legenda apribile. Lo spicchio uscito si ingrandisce con il suo nome.

**Equità e sincronia.** La forza cambia solo la durata dell'animazione: lo spicchio lo decide sempre il server, che in cambio invia ora di partenza, durata e angolo finale. Ogni telefono calcola l'angolo dallo stesso orologio, quindi la ruota si ferma ovunque nello stesso momento e chi rientra la trova al punto giusto. Sul telefono di chi gira la ruota parte subito al rilascio e si aggancia poi alla traiettoria del server.

Le vibrazioni funzionano solo dove il browser le permette, quindi non su iPhone.

### Anteprima dei minigiochi

- Una scheda mostra il nome e una **demo animata che gira da sola**, per esempio il palloncino che si gonfia e scoppia o la bomba che passa tra gli avatar.
- Sotto ci sono le regole, in due righe al massimo.
- La conferma è uno **swipe verso l'alto sulla scheda**, non più il cursore. Resta un pulsante per chi usa la tastiera o uno screen reader.
- Gli avatar di chi ha confermato si illuminano su tutti i telefoni, e si parte quando hanno confermato tutti i giocatori connessi. Una scadenza di sicurezza di 45 secondi, che compare solo a chi non ha confermato, evita che una persona distratta blocchi il gruppo.

### Effetti e transizioni

| Momento | Animazione |
| --- | --- |
| +500 | Monete che volano verso l'avatar e punteggio che sale |
| −500 | Avatar che trema e monete che cadono |
| x2 | Il punteggio si sdoppia e le cifre rotolano, con fuochi d'artificio |
| ÷2 | Il punteggio si spezza a metà e una parte cade |
| Risultati dei minigiochi | Podio con gli avatar che entrano uno a uno e punti che salgono |
| Classifica | Le righe scorrono verso la nuova posizione |
| Cambi di scena | Transizioni rapide e cartoonose, con Jerry che entra in scena |

Ogni minigioco ha un elemento centrale animato, non pulsanti: palloncino che si deforma, bomba con la miccia, forzieri che si aprono, cifre del timer che si spengono. Con «movimento ridotto» attivo il telefono mostra direttamente il risultato, come già avviene per il voto delle categorie.

### Originkit e dipendenze

Il catalogo ha 805 componenti. Scarico il codice al momento dell'implementazione e lo adatto, annotando la provenienza in `components/originkit/README.md`, come già fatto per i due adattamenti esistenti.

| Uso | Componente |
| --- | --- |
| Punti e monete | `emojiburst`, già adattato in `score-burst.tsx` |
| Festa per x2 e vincitori | `fireworks`, su canvas e senza dipendenze |
| Titoli delle schede | `stagger-text-rise` |
| Scheda con swipe | `swipe-stack`, come base per il gesto |
| Eliminazioni e scoppi | `shattered-glass`, già adattato per il voto |

Scarto i componenti WebGL e three.js: pesano troppo per una partita a 10 telefoni. L'unica dipendenza nuova è `framer-motion`, già richiesta da `stagger-text-rise` e `swipe-stack`, che userei anche per transizioni e classifica. La ruota non la usa.

La chiave di Originkit resta in `~/.codex/.env`: non entra nel repository.

## 4. Architettura

Si estende il motore esistente seguendo il modello di `server/game/bonus.ts`. Non servono migrazioni SQL: lo stato vive nel JSONB di `kb_matches`.

| File | Intervento |
| --- | --- |
| `server/game/wheel.ts` (nuovo) | Stato della ruota, ordine, calcolo dei giri, estrazione server, effetti, proiezione nello snapshot |
| `server/game/minigames/` (nuovo) | Un file per minigioco e un registro comune |
| `server/game/engine.ts` | Nuove fasi, transizione dal bonus, `advance`, `continueGame`, `recoverGame`, totali |
| `server/game/commentary.ts` | Battute di Jerry su effetti e risultati, con nickname e tono sbruffone |
| `server/lobby.ts`, `server/index.ts` | Comandi `game:spin` (con la forza dello swipe), `game:minigame-confirm` e `game:minigame-action`, convalida dei campi |
| `features/game/types.ts` | Fasi, `WheelSnapshot`, `MinigameSnapshot`, nuovi campi dei comandi |
| `features/rooms/hooks/use-room-connection.ts` | Riconoscimento delle conferme perse per i nuovi comandi |
| `features/game/components/wheel-*.tsx`, `minigames/*.tsx` (nuovi) | Ruota con gesto e fisica, scheda di anteprima, un componente e una demo per minigioco |
| `features/game/components/game-stage.tsx` | Instradamento verso le nuove viste |
| `texts.ts` | Tutti i nuovi testi; correzione di `Beat a mini-challenge…` nella home e di `phaseCompleteNote` |

**Fasi nuove.** `phase1_summary`, `wheel_intro`, `wheel_turn`, `wheel_spin`, `wheel_effect`, `minigame_intro`, `minigame_playing`, `minigame_results`, `flash_intro`, `flash_question`, `flash_reveal`, `wheel_summary`. Quelle manuali entrano in `GameContinuePhase`. `phase_complete` resta lo stato finale con ritorno in lobby.

**Contratto dei minigiochi.** Ogni minigioco espone funzioni pure:

```ts
interface Minigame<State> {
  kind: MinigameKind
  minPlayers: number
  durationMs: number
  create(participantIds: string[], content: GameContent): State
  act(state: State, playerId: string, action: unknown, now: number): void
  advance(state: State, now: number): boolean // true se la scena è cambiata
  isComplete(state: State): boolean
  results(state: State): MinigameResult[]
  snapshot(state: State, selfId: string): unknown // solo ciò che selfId può vedere
}
```

**Autorità e privacy.** Il server decide lo spicchio e la forza dello swipe non lo influenza. Limite del palloncino, orari della bomba, scelte nascoste e soluzione della domanda restano nello stato privato fino alla chiusura.

**Frequenza dei comandi.** Ogni comando apre una transazione, quindi i minigiochi a tocchi rapidi non inviano ogni tocco:

- **Numeri in ordine:** il telefono controlla la sequenza e invia solo il completamento; il tempo è quello di ricezione del server.
- **Palloncino:** le pompate vengono inviate a gruppi ogni 250 ms, e il server decide lo scoppio e applica un limite di pompate al secondo.
- **Stoppa il timer:** il tempo è misurato sul telefono con `performance.now()`, così la latenza non penalizza chi gioca a distanza. Il server scarta solo i valori incompatibili con la finestra di gioco.

Un giocatore malizioso potrebbe falsificare il tempo di Stoppa il timer e Numeri in ordine. Tra amici è un rischio accettabile e non aggiungo contromisure.

**Riavvio e disconnessione.**

- Lo spicchio e il suo effetto si salvano insieme in un'unica transazione, quindi un riavvio non ripete né il giro né l'effetto.
- Un riavvio durante `minigame_playing` annulla solo quella esecuzione e torna alle regole, con un nuovo `runId`. Una Domanda lampo interrotta viene sostituita con un'altra, senza ripetere il giro.
- La disconnessione non ferma il minigioco. Se chi ha la bomba si disconnette, il server la passa a un giocatore connesso.
- Le partite già salvate senza il campo `wheel` mantengono il percorso attuale.
- Se restano meno di 2 giocatori attivi, la fase si interrompe conservando i punti, come nella Fase 1.

## 5. Ordine di lavoro

1. **Ruota senza minigiochi:** calcolo dei giri, ordine, spicchi, effetti, nuove fasi, recupero, test. Comprende le due Domande lampo; lo spicchio minigioco usa provvisoriamente la Domanda lampo per tutti.
2. **Interfaccia della ruota:** gesto, fisica, effetti animati, riepilogo, testi, Jerry. Da qui la Fase 2 è giocabile, ed è il momento giusto per provare sul telefono la sensazione della ruota.
3. **Contratto dei minigiochi, anteprima con conferma di tutti**, con Stoppa il timer come primo caso.
4. **Numeri in ordine e Palloncino.**
5. **Dividi il bottino e Il più alto unico.**
6. **Bomba**, per ultima perché è la più delicata: passaggi simultanei e disconnessioni.
7. **Verifica finale** e aggiornamento di `PROJECT_MEMORY.md`.

## 6. Verifiche

Test senza listener di rete, con `pnpm test:unit`, controllo TypeScript e build:

- Giri per ogni N da 2 a 10, e totali sempre tra 8 e 16.
- Distribuzione della ruota, effetti ai limiti: −500 con meno di 500 punti, ÷2 con numero dispari, x2 con zero punti.
- Permesso di girare solo a chi è di turno, swipe doppi, giro automatico, turni di chi si ritira.
- Per ogni minigioco: punteggi, parità, confini temporali, reinvii e nessun dato privato nello snapshot.
- Esclusione dei minigiochi da 3+ con 2 giocatori, nessuna ripetizione prima di esaurirli.
- Domanda lampo personale: risposte respinte da chi non ha girato, soluzione nascosta fino all'esito, turno a zero se chi ha girato è disconnesso.
- Traiettoria della ruota: stesso angolo per lo stesso istante, arrivo esatto sullo spicchio del server, ingresso a metà rotazione, nessun effetto della forza sull'esito.
- Conferma dell'anteprima: partenza con tutti i connessi, disconnessioni durante l'attesa, scadenza di sicurezza, conferme doppie.
- Riavvio in ogni fase senza effetti doppi; recupero delle partite precedenti.
- Partita completa simulata con 2, 4 e 10 giocatori.

I test non possono giudicare fluidità e sensazione. Le prove sui telefoni, il ritmo e il bilanciamento restano al proprietario. Da guardare in particolare: la sensazione dello swipe sulla ruota, la fluidità su un telefono medio, la durata con 7 giocatori (14 giri) e il peso di x2 e ÷2 sul totale.
