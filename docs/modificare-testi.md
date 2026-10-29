# Modificare i testi del gioco

Tutte le frasi che compaiono a schermo sono in un unico file: [`web/src/texts.ts`](../web/src/texts.ts). Le domande del catalogo non sono lì: stanno nel database (vedi [`web/src/server/content/README.md`](../web/src/server/content/README.md)).

## Sezioni

| Sezione | Dove compare |
| --- | --- |
| `meta` | Titolo e descrizione nella scheda del browser |
| `home`, `access` | Home e pannello per creare una stanza o entrarci |
| `copy`, `lobby` | Lobby: codice, QR, giocatori, avvio |
| `game` | Studio: titoli delle fasi, timer, voto, risposte, finestre di dialogo |
| `leaderboard` | Classifica dei punti |
| `jerry` | Battute fisse di Jerry sulla plancia |
| `commentary` | Commenti di Jerry a fine round, una variante a rotazione per round |
| `voteResult`, `powers`, `bonus`, `swipe` | Esito del voto, poteri, «21 al contrario», pulsante da trascinare |
| `serverMessages`, `errors` | Avvisi e messaggi di errore |

## Come si modifica

- **Testo semplice:** cambia ciò che sta tra apici.
- **Frasi con nomi o numeri**, scritte come `(nome) => \`...${nome}...\``: cambia il testo, ma lascia intatti i `${...}`, dove vengono inseriti nickname, punti e numeri.
- **Liste di varianti** (`commentary`, regole di Jerry): puoi aggiungere o togliere voci.
- **Apostrofi:** una frase tra apici singoli non può contenere `'`. Usa l'apostrofo tipografico `’` (`'L’organizzatore'`) oppure le virgolette doppie (`"c'è"`).
- `serverMessages.waitingPlayers` è usato in due punti del server: cambiandolo cambiano entrambi.

## Quando si vede la modifica

Con `pnpm dev`:

- **Testi delle schermate** (`meta`, `home`, `access`, `copy`, `lobby`, `game`, `leaderboard`, `jerry`, `voteResult`, `powers`, `bonus`, `swipe`): basta salvare, la pagina si aggiorna da sola.
- **Testi prodotti dal server** (`commentary`, `serverMessages` e quasi tutti gli `errors`): serve riavviare `pnpm dev` (Ctrl+C, poi di nuovo `pnpm dev`). I commenti nuovi compaiono dal round successivo.

In produzione serve sempre `pnpm build` seguito da un nuovo `pnpm start`.

I messaggi già salvati nelle partite in corso restano con il testo vecchio.

Se dopo il salvataggio la pagina mostra un errore, di solito manca un apice o una virgola: il messaggio indica la riga di `texts.ts` da correggere. `pnpm typecheck`, eseguito in `web/`, fa lo stesso controllo dal terminale.
