# Piano di implementazione — Crazy Bet, minigioco della Fase 2

Data: 6 novembre 2026.
Stato: autorizzato con «procedi» il 6 novembre 2026, con i default della sezione 2, e implementato lo stesso giorno; prove da interfaccia a cura del proprietario. Le differenze rispetto al piano sono nella sezione 9.
Riferimenti: [memoria di progetto](../../PROJECT_MEMORY.md), [Fase 2](03-fase-2-ruota.md), in particolare il contratto dei minigiochi (§4) e il riuso del secondo gruppo (§7).

## 1. Requisiti confermati

Dal proprietario, 6 novembre 2026:

- Crazy Bet è un nuovo minigioco della Fase 2.
- In gara c'è una biglia per ogni giocatore della partita.
- Vince la biglia che arriva per prima in fondo a un percorso con ostacoli, come nei video di gare di biglie su TikTok e Instagram. L'esito deve essere imprevedibile.
- Ogni giocatore punta quanto vuole su una delle biglie.
- Il premio è proporzionale alla posizione d'arrivo della biglia scelta: si possono vincere o perdere punti.
- Le gare devono essere entusiasmanti, con begli ostacoli.

## 2. Default proposti da validare

Prima taratura, da provare giocando.

| Voce | Proposta |
| --- | --- |
| Giocatori | Da 2 in su, quindi anche in due |
| Puntata | Una sola, su qualsiasi biglia, anche la propria. Da 50 punti fino al proprio punteggio. Chi ha meno di 200 punti può comunque puntarne fino a 200: se perde, non scende sotto zero |
| Tempo per puntare | 20 s. Si chiude prima quando tutti i connessi hanno puntato. Chi non punta non vince e non perde |
| Visibilità | Puntate nascoste mentre si punta; al via tutti vedono chi ha puntato quanto e su quale biglia |
| Premio | `round(puntata × (1 − 2 × (posizione − 1) / (biglie − 1)))`: la prima vince quanto ha puntato, l'ultima perde la puntata, in mezzo in proporzione |
| Tempi | 3 s di conto alla rovescia, gara di 20–30 s (al massimo 45), 4 s sull'arrivo, poi i 5 s di risultati come negli altri minigiochi |

Premi con una puntata di 1.000 punti:

| Biglie | 1ª | 2ª | 3ª | 4ª | 5ª | 6ª | 7ª | 8ª | 9ª | 10ª |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | +1.000 | −1.000 | | | | | | | | |
| 4 | +1.000 | +333 | −333 | −1.000 | | | | | | |
| 5 | +1.000 | +500 | 0 | −500 | −1.000 | | | | | |
| 10 | +1.000 | +778 | +556 | +333 | +111 | −111 | −333 | −556 | −778 | −1.000 |

In media puntare non fa né guadagnare né perdere: i punti passano a chi rischia e indovina. Con puntate alte questo minigioco può spostare più punti di tutti gli altri insieme, che danno al massimo 1.000 punti: è nello spirito del nome, ma va verificato giocando.

## 3. La gara

### Percorso

- Verticale, largo quanto lo schermo e lungo circa quattro schermate.
- **Partenza:** biglie in fila in ordine sorteggiato, con «3, 2, 1, VIA!».
- **Corpo:** 4 sezioni estratte fra 6, con ordine e parametri casuali. Ogni gara ha quindi un percorso diverso.
- **Arrivo:** rettilineo finale, traguardo a scacchi e vasca dove le biglie si fermano.

| Sezione | Ostacolo | Effetto sulla gara |
| --- | --- | --- |
| Pioggia di chiodi | File sfalsate di chiodi, con densità casuale | Ogni urto devia la biglia a caso |
| Mulini | Due o tre pale a croce che girano, con verso e velocità casuali | Colpiscono e rilanciano, a volte all'indietro |
| Zig-zag | Rampe alternate, una con un buco | Sorpassi in rotolamento e una scorciatoia per chi ci cade dentro |
| Imbuto con agitatore | Collo stretto con una paletta rotante | Ingorgo: l'ordine di uscita si rimescola |
| Respingenti | Funghi da flipper che rilanciano più forte di come colpiti | Rimbalzi lunghi e imprevedibili |
| Botola a tempo | Un piano che si apre a intervalli | Ricompatta il gruppo e azzera i vantaggi |

### Regole della simulazione

- Fisica 2D vera: gravità, rimbalzi, attrito e urti tra biglie. Pale e botole si muovono in funzione del tempo.
- Il coordinatore simula la gara alla chiusura delle puntate: mentre si punta, l'esito non esiste ancora.
- La posizione è l'ordine di passaggio sul traguardo. Dopo 45 s chi non è arrivato è classificato per profondità raggiunta. Non esistono pari merito.
- Una biglia ferma per 1,5 s riceve una piccola spinta casuale, e le sezioni non hanno tasche dove fermarsi: la gara finisce sempre.

## 4. Sul telefono

### Puntata

- Sullo sfondo c'è il percorso di questa gara, con una lenta panoramica dalla partenza al traguardo.
- Le biglie sono sfere di vetro con dentro l'avatar Kenney e sotto il nickname. Si tocca quella su cui puntare.
- L'importo si sceglie con il cursore daisyUI `daisy-range`, a passi di 50, e con i pulsanti «Metà» e «Tutto». Sotto compare l'effetto in punti, per esempio «1ª: +1.000 · ultima: −1.000».
- «Punta!» conferma. Fino alla conferma la scelta si può cambiare, poi è definitiva, come nella Fase 1.
- Il gioco mostra un proprio conto alla rovescia e «3 di 5 hanno puntato». Il timer generico della scena si nasconde, come per Stoppa il timer, perché la scadenza di sicurezza copre anche la gara.

### Gara

- «3, 2, 1, VIA!» sulla fila di partenza, mentre compaiono le puntate di tutti; poi le biglie cadono.
- La telecamera segue la biglia in testa. Toccando un avatar nella striscia della classifica si segue quella biglia.
- La striscia in alto mostra le posizioni dal vivo e quante puntate ha ogni biglia. La biglia su cui hai puntato è evidenziata, con «Se finisse ora: +556», che cambia a ogni sorpasso.
- Effetti: avatar che rotolano con la biglia, scia della prima, respingenti che lampeggiano all'urto, pale e botole in movimento, «1ª!» all'arrivo di ogni biglia e fuochi d'artificio (`FireworksBurst`) se vince la tua.
- La gara è disegnata su un `<canvas>` 2D ridisegnato a ogni fotogramma. Con decine di ostacoli, 10 biglie e una telecamera che scorre è più leggero dell'SVG usato per la ruota.

### Arrivo e risultati

Per 4 s restano l'ordine finale e il tuo risultato in grande. Poi arrivano i risultati standard dei minigiochi, con il dettaglio «biglia 3ª» accanto ai punti.

### Movimento ridotto

Nessuna animazione: il percorso resta fermo e, a fine gara, compare l'ordine d'arrivo.

## 5. Architettura

### Sincronizzazione: una sola fisica, sul coordinatore

Il coordinatore simula la gara una volta e, al via, invia a tutti la traiettoria registrata: posizioni di ogni biglia 30 volte al secondo, in interi a 16 bit codificati in base64. Sono circa 50 KB per 10 biglie e 30 s. Ogni telefono la riproduce sullo stesso orologio del server, interpolando tra i fotogrammi, come già fa la ruota con `spinAngle`. Chi rientra trova la gara al punto giusto.

**Alternativa scartata:** rieseguire la fisica su ogni telefono partendo da un seme. Trasmetterebbe pochi byte, ma basta una minima differenza di calcolo tra Safari e Chrome perché un rimbalzo cambi e vinca un'altra biglia. I telefoni mostrerebbero allora un vincitore diverso da quello pagato.

Pale e botole seguono funzioni del tempo condivise in `features/game/marble-race.ts`. Il server le impone ai corpi a ogni passo e il telefono le disegna con gli stessi numeri.

### Motore fisico

Si usa `planck` 1.5.1: Box2D in JavaScript, licenza MIT, nessuna dipendenza. Gira solo nel coordinatore, quindi non entra nel bundle dei telefoni. Gestisce urti tra biglie, corpi che si muovono a comando e collisioni continue, che impediscono alle biglie veloci di attraversare le pareti.

L'alternativa senza dipendenze è un motore su misura per sfere e segmenti: circa 200 righe in più e più lavoro di taratura.

### Stato e privacy

- **JSONB della partita:** seme, ordine di partenza, ordine e tempi d'arrivo, durata della gara, puntate, istante di chiusura e segno di fine.
- **Cache in memoria:** percorso e traccia si rigenerano dal seme, in una cache delle ultime 8 gare. Il coordinatore rilegge lo stato ogni 250 ms: 50 KB in più a ogni lettura sarebbero uno spreco.
- **Durante la puntata:** lo snapshot contiene percorso, biglie, la propria puntata e il numero di puntate. Traccia, ordine d'arrivo e puntate altrui arrivano solo alla chiusura.
- **Tempi:** sono offset dall'inizio del minigioco, come `signalOffsetMs` di Duello, perché `view()` non conosce l'orario d'inizio. Il telefono li somma a `startedAt`.
- **Fine del gioco:** `isComplete` non riceve l'orologio. Per questo è `advance` a chiudere le puntate, simulare la gara e segnarne la fine; `isComplete` legge quel segno.
- **Scadenza di sicurezza:** `durationMs` vale 72 s (20 + 3 + 45 + 4).
- **Riavvio:** durante il minigioco si torna all'anteprima con una nuova esecuzione, come oggi. Le puntate decadono e nessuno paga.

### Comando

Si usa il comando esistente `game:minigame-action`, con `{ type: 'bet', marbleId, amount }`. `act` controlla:

- che la biglia sia in gara;
- che l'importo sia un intero tra 50 e il massimo;
- che sia la prima puntata del giocatore;
- che le puntate siano ancora aperte.

Il massimo dipende dal punteggio, quindi `MinigameContext` riceve `points`, costruito in `contextFor`. Gli altri minigiochi lo ignorano.

### Risultati

Ogni partecipante ha una riga con il premio della formula, ordinata con `rowsByPoints`; `detail` è la posizione della biglia scelta. Chi non punta o si ritira prende zero. Il limite a zero già presente in `finishMinigame` copre la puntata minima garantita di 200.

### File

| File | Intervento |
| --- | --- |
| `server/game/minigames/bet.ts` (nuovo) | Regole: creazione, puntate, tempi, risultati e vista |
| `server/game/minigames/marble-race.ts` (nuovo) | Percorso a sezioni dal seme, simulazione con `planck`, traccia codificata e cache |
| `server/game/minigames/types.ts`, `index.ts` | `points` nel contesto; registrazione di `bet` |
| `server/game/wheel.ts` | `contextFor` passa i punti |
| `features/game/marble-race.ts` (nuovo) | Tipi del percorso, moto di pale e botole, formula del premio e decodifica della traccia. Condiviso, senza `planck` |
| `features/game/wheel.ts` | `'bet'` in `MinigameKind` e la sua vista in `MinigameView` |
| `features/game/components/bet-play.tsx` (nuovo) | Puntata e gara: canvas, telecamera, striscia ed effetti |
| `minigame-play.tsx`, `minigame-demo.tsx`, `wheel-stage.tsx` | Instradamento, demo CSS dell'anteprima con biglie che rimbalzano tra i chiodi e dettaglio dei risultati |
| `game-stage.tsx` | Timer generico nascosto anche per `bet` |
| `styles/wheel.module.css`, `texts.ts` | Stili e testi, con nome «Crazy Bet» e regole in due righe |
| `server/game/wheel.test.ts`, `server/game/marble-race.test.ts` (nuovo) | Test. Il nuovo file sta in `server/game/` perché `test:unit` non legge `minigames/` |
| `package.json`, `pnpm-lock.yaml` | Dipendenza `planck` |

Non servono migrazioni SQL. La composizione della ruota non cambia: Crazy Bet entra nel sacchetto dei minigiochi ed esce come gli altri, senza ripetizioni.

## 6. Ordine di lavoro

1. **Simulazione:** percorso a sezioni, `planck`, traccia, cache e relativi test. La durata si tara facendo girare molte gare in locale.
2. **Regole:** `bet.ts`, punti nel contesto, registrazione, testi minimi e test. Il test della partita completa va adeguato alla nuova durata massima.
3. **Puntata sul telefono** e demo dell'anteprima. Da qui il gioco è giocabile, con la gara ancora schematica.
4. **Gara sul telefono:** riproduzione, telecamera, striscia, effetti, arrivo e dettaglio nei risultati.
5. **Verifica finale**, aggiornamento di `PROJECT_MEMORY.md` e del grafo Graphify. Per provare va riavviato `pnpm dev`, che non ricarica il coordinatore.

## 7. Verifiche

Test senza listener di rete con `pnpm test:unit`, controllo TypeScript e build:

- **Simulazione:**
  - Lo stesso seme produce la stessa gara, anche dopo aver svuotato la cache.
  - Nessuna biglia esce dal percorso.
  - In 30 gare da 10 biglie tutte arrivano entro 45 s.
  - In 60 gare da 6 biglie nessuna posizione di partenza vince più di una volta su tre.
  - Una gara da 10 biglie si calcola in meno di 1 s.
  - La traccia decodificata coincide con quella simulata, entro l'arrotondamento.
- **Puntate:**
  - Biglia inesistente, importo fuori dai limiti o non intero, seconda puntata e puntata dopo la chiusura sono respinti.
  - Con zero punti si può puntare fino a 200.
  - La puntata sulla propria biglia è accettata.
- **Chiusura anticipata:** solo quando tutti i connessi hanno puntato e c'è almeno una puntata.
- **Premi:** valori per 2, 4, 5 e 10 biglie, arrotondamenti, zero per chi non punta o si ritira, limite a zero.
- **Privacy:** prima della chiusura nessuno snapshot contiene traccia, ordine d'arrivo o puntate altrui.
- **Tempi:** fine a chiusura + 3 s + gara + 4 s; scadenza di sicurezza; riavvio in puntata o in gara senza punti spostati.
- **Partita completa:** la simulazione con 2, 4 e 10 giocatori avanza della durata massima dei minigiochi, invece dei 30 s fissi di oggi, che Crazy Bet supera.

I test non possono giudicare l'emozione della gara. Restano alla prova del proprietario:

- la leggibilità di 10 biglie su un telefono;
- la fluidità del canvas su un telefono medio;
- il peso della traccia su rete mobile;
- il bilanciamento dei premi.

## 8. Decisioni da validare

1. **Premio:** da +1× a −1× della puntata, lineare, come proposto. In alternativa la prima può valere +2×: puntare conviene in media, ma i punti si gonfiano.
2. **Puntata massima:** il proprio punteggio, con almeno 200 punti puntabili anche da chi ne ha meno.
3. **Puntate:** nascoste mentre si punta, svelate al via.
4. **Giocatori:** minimo 2.
5. **Dipendenza:** `planck`, solo nel coordinatore, oppure un motore su misura.
6. **Tempi:** 20 s per puntare, 3 s di via, gara di 20–30 s (al massimo 45) e 4 s sull'arrivo.
7. **Facoltativo:** un salto di sviluppo, solo con `pnpm dev`, che fa uscire Crazy Bet al prossimo spicchio minigioco, per provarlo subito.

Restano fuori dal piano:

- rallentatore sul fotofinish;
- portali e ascensori;
- suoni dedicati e musica più alta durante la gara;
- battute di Jerry sulle puntate totali perse;
- premio al proprietario della biglia vincente;
- puntate su più biglie.

## 9. Implementazione

Autorizzata il 6 novembre 2026 con «procedi, usa originkit per ui migliore e daisy ui, poi testo io la parte da interfaccia». Valgono i default della sezione 2, compreso il salto di sviluppo del punto 7 della sezione 8.

### Differenze rispetto al piano

- **Corsie nascoste:** durante le puntate il percorso si vede senza biglie e non si sa quale biglia parte da quale posizione. Le posizioni compaiono al via, così nessuno punta su una corsia.
- **Denti alle pareti:** ai lati di chiodi, mulini e respingenti ci sono denti inclinati che spingono le biglie verso il centro. Lungo le pareti restavano corsie libere, e le biglie più esterne vincevano il doppio.
- **Zig-zag più largo:** tra una rampa e l'altra ci sono 3,2 m e l'uscita è larga 1,8 m. Con meno spazio tre biglie restavano incastrate tra fine rampa, parete e rampa sotto anche per 10 secondi.
- **Anti-blocco a 2,5 s:** la spinta arriva dopo 2,5 s da ferma, non 1,5 s, così chi aspetta sulla botola chiusa non salta.
- **Importo:** oltre al cursore daisyUI c'è il contatore a rulli di Originkit, [Rolling counter](https://www.originkit.dev/functional?c=rolling-counter), con «−», «+» e trascinamento del numero. Provenienza in `web/src/components/originkit/README.md`.
- **daisyUI:** conto alla rovescia delle puntate con `daisy-countdown`, «Metà» e «Tutto» con `daisy-join`, numero di puntate per biglia con `daisy-badge` dentro un `daisy-indicator`.
- **`planck`:** la sezione 5 diceva «nessuna dipendenza», ma `planck` dichiara `stage-js` come dipendenza tra pari. La usa solo il banco di prova grafico, che il gioco non importa. `planck` chiede inoltre Node 24 o successivo, mentre il progetto ne dichiara 22.18; in locale gira Node 24.22.

### Misure

| Misura | Valore |
| --- | --- |
| Durata della gara, 150 gare da 10 biglie | Mediana 23,3 s, massimo 35 s, nessuna oltre il tetto di 45 s |
| Durata della gara, 150 gare da 6 biglie | Mediana 22,2 s, massimo 35,2 s |
| Vittorie per posizione di partenza, 10 biglie | Da 11 a 20 su 150, attese 15 |
| Vittorie per posizione di partenza, 6 biglie | Da 20 a 30 su 150, attese 25 |
| Cambi di testa per gara | Circa 11 con 10 biglie |
| Calcolo di una gara da 10 biglie | Al massimo 121 ms |
| Peso inviato ai telefoni, 10 biglie | Percorso circa 3 KB; traccia in media 36 KB, al massimo 56 KB |

### Verifiche

- **Test:** 161 test con `pnpm test:unit`, nessuno fallito. Tra questi 4 nuovi sulla simulazione e 4 nuovi sulle regole di Crazy Bet. Il test della partita completa ora avanza della durata massima dei minigiochi.
- **Controlli:** controllo TypeScript e build di produzione Next.js riusciti.
- **Non eseguito:** nessun server o browser aperto. Gesto, leggibilità, fluidità del canvas, peso della traccia su rete mobile e bilanciamento dei premi restano alla prova del proprietario.

Per provarlo:

1. Riavvia `pnpm dev`: il coordinatore non ricarica `src/server`.
2. Crea una nuova partita.
3. Usa il pulsante «Dev: Crazy Bet».

### Correzioni dopo la prima prova, 7 novembre 2026

- **Tempo per puntare:** passa da 20 a 30 s, su richiesta del proprietario. La scadenza di sicurezza sale a 82 s.
- **«Non punto»:** pulsante esplicito, richiesto dal proprietario. Conta come scelta fatta per la chiusura anticipata e non sposta punti; se tutti passano, la gara parte subito senza premi.
- **Contatore fermo a 000:** in sviluppo React monta due volte i componenti. La prima pulizia cancellava l'animazione senza azzerare il suo riferimento, e il contatore non si ridisegnava più.
- **Timer delle puntate:** il conto alla rovescia di daisyUI mostrava le cifre sovrapposte; ora è un numero semplice.
- **Mappa su PC:** lo zoom ora lascia sempre in vista almeno 14 m di percorso durante la gara e 8 m nell'anteprima, con il percorso centrato. Prima, su uno schermo largo, se ne vedevano solo 3–4 m.
