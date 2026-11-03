# Piano di implementazione — Colonna sonora

Data: 3 novembre 2026.
Stato: approvato e implementato il 3 novembre 2026, con il ticchettio che accelera negli ultimi secondi; prova sui telefoni a cura del proprietario.
Riferimenti: [memoria di progetto](../../PROJECT_MEMORY.md), [Fase 1](02-fase-1-trivia.md), [Fase 2](03-fase-2-ruota.md).

## 1. Richiesta del proprietario

- Il brano «Elevator Synth» è la musica di sottofondo del gioco.
- In alcuni momenti il volume va adattato.
- Durante le domande e nel bonus «21 al contrario» la musica non c'è: al suo posto un ticchettio di orologio.

## 2. Dove agganciarsi

Il grafo di graphify conferma che `GameStage` (`web/src/features/game/components/game-stage.tsx`) è il nodo che riceve ogni `GameSnapshot` e rende tutte le fasi, comprese ruota (`WheelStage`), minigiochi (`MinigamePlay`) e bonus (`BonusPlay`). `SessionShell` mostra `GameStage` per ogni fase tranne `countdown`.

Basta quindi un solo hook chiamato da `GameStage`, guidato da `game.phase`, `game.deadline` e `game.wheel?.minigame?.kind`. Il server non cambia: l'audio è una preferenza del dispositivo e, come già previsto nella memoria di progetto, vive nella memoria locale del browser.

## 3. Mappa fase → audio

| Modalità | Fasi | Resa |
| --- | --- | --- |
| Piena | `intro`, `round_ready`, `round_reveal`, `scoreboard`, `bonus_intro`, `bonus_results`, `phase1_summary`, `wheel_intro`, `wheel_spin`, `wheel_effect`, `wheel_summary`, `minigame_intro`, `minigame_results`, `flash_intro`, `flash_reveal`, `phase_complete` | Musica al volume pieno (circa 0,5) |
| Bassa | `category_vote`, `category_reveal` (preparazione poteri), `wheel_turn`, `minigame_playing` | Musica abbassata (circa 0,15) |
| Ticchettio | `question`, `flash_question`, `bonus_playing` | Musica a 0, un tic al secondo finché c'è una scadenza; due al secondo negli ultimi 5 secondi, quattro negli ultimi 2. Nel «21 al contrario» conta la scadenza della singola domanda |
| Silenzio | `suspended`, `aborted`, `minigame_playing` con «Stoppa il timer» | Niente musica né tic |

«Stoppa il timer» resta muto: un tic al secondo aiuterebbe a contare e falserebbe il minigioco. I passaggi fra modalità usano una dissolvenza di circa 2 secondi, in uscita e in entrata, allungata due volte dopo le prove del proprietario. Prima di una fase col ticchettio la musica comincia a sfumare 1,5 secondi prima della scadenza della fase precedente: preparazione dei poteri prima della domanda e introduzione della domanda lampo. Così la domanda parte con la musica già uscita. Se la fase precedente finisce prima del tempo, per esempio quando tutti hanno preparato i poteri, o non ha un timer, come l'introduzione del «21 al contrario», la musica sfuma al cambio di fase.

La tabella è un default da provare giocando: le fasi «Bassa» sono una proposta, non una richiesta esplicita.

## 4. Modifiche

1. **File audio.** Copiare il brano in `web/public/audio/elevator-synth.mp3` (1,2 MB), servito in loop.
2. **Hook `useSoundtrack`** in `web/src/features/game/hooks/use-soundtrack.ts`, accanto a `use-game-clock.ts`:
   - una funzione pura `soundModeFor(phase, minigameKind)` che restituisce `'full' | 'low' | 'tick' | 'silent'` secondo la tabella;
   - un solo elemento `Audio` in loop, creato una volta e fermato all'uscita dalla partita;
   - il ticchettio sintetizzato con Web Audio (un breve clic di oscillatore), senza un secondo file, con ritmo dato da `tickIntervalMs(remainingMs)`;
   - la musica passa da un `GainNode` di Web Audio: su iPhone il volume di un elemento `Audio` non si può cambiare;
   - con la pagina nascosta l'audio si sospende, così il telefono in tasca non suona;
   - lo stato «audio attivo» salvato in `localStorage`, con letture e scritture protette da `try/catch`.
3. **`GameStage`.** Chiamare l'hook e aggiungere un pulsante muto/attivo con icona `Volume2`/`VolumeX` di `lucide-react`, accanto all'indicatore «In onda», con `aria-label` e `aria-pressed`. Testi nuovi in `web/src/texts.ts`.
4. **Sblocco dell'autoplay.** I browser, soprattutto su iPhone, bloccano l'audio prima di un gesto. La musica parte al primo tocco o swipe nella partita: avvio, conferme e swipe ne offrono di sicuro uno. Chi rientra a partita in corso sente l'audio dal primo tocco o dal pulsante muto.
5. **Test.** Un piccolo test di `soundModeFor` con `node --test`, aggiunto allo script `test`: copre una fase per modalità, il caso «Stoppa il timer» e l'accelerazione del ticchettio.
6. **Memoria di progetto.** Registrare la decisione nella sezione «Menu, avatar e caratterizzazione», dove la musica è ancora «da definire», e nel registro delle decisioni.

## 5. Verifica

- `pnpm exec tsc --noEmit` e `pnpm test`.
- Nel browser, con i salti di sviluppo (`game:dev-skip`): musica nella introduzione, volume basso nel voto, tic nella domanda, tic nel «21 al contrario», silenzio in «Stoppa il timer», musica di nuovo nella classifica.
- Il pulsante muto vale anche dopo il ricaricamento della pagina.
- Prova su un telefono reale a cura del proprietario: lo sblocco audio di iOS non si verifica dal desktop.

## 6. Fuori da questo piano

- Musica nella home e nella lobby: oggi parte solo con la partita.
- Effetti sonori (risposta giusta, esplosione della bomba, giro della ruota), cursore del volume, brani diversi per fase, voce di Jerry.

## 7. Risposte del proprietario

Il 3 novembre 2026:

- Niente musica nella home e nella lobby.
- La tabella delle modalità va bene così, fasi «Bassa» comprese.
- Il brano è stato creato dal proprietario con Suno.
- Il ticchettio accelera negli ultimi secondi.
