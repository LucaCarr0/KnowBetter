# Consultare il database dal terminale

Apri un terminale nella directory dell’app:

```bash
cd /home/lucacarraturo/KnowBetter/web
```

Se usi il database locale, prima arresta `pnpm dev` o `pnpm start` con `Ctrl+C` e
attendi che il processo termini. PGlite conserva PostgreSQL nella directory
`.data/knowbetter` e ammette un solo processo per volta. Il messaggio `DB_IN_USE`
indica che un altro processo detiene il database: non rimuovere il lock mentre
quel processo è attivo.

## Controllare catalogo e migrazioni

```bash
pnpm db:inspect
```

Il riepilogo mostra categorie e domande archiviate, quelle effettivamente
estraibili dal gioco, versioni importate, migrazioni applicate e conteggi di
stanze e partite. `storedQuestions` comprende anche i quesiti conservati ma
esclusi dal gioco. `playableQuestions` applica il filtro attuale del motore:
italiano, domanda di massimo 300 caratteri, alternative di massimo 120 caratteri,
massimo 600 caratteri complessivi e ulteriori controlli di formato.

Il comando non importa nuove domande e non mostra credenziali o risposte del
catalogo. Usa `pnpm trivia:import` separatamente quando occorre importare il
catalogo, sempre a coordinatore fermo con PGlite.

## Eseguire una query

```bash
pnpm db:sql 'SELECT id, name FROM kb_trivia_categories ORDER BY name'
pnpm db:sql 'SELECT category_id, count(*) FROM kb_trivia_questions GROUP BY category_id ORDER BY category_id'
pnpm db:sql 'SELECT version, imported_at FROM kb_content_imports ORDER BY imported_at DESC'
pnpm db:sql 'SELECT version, applied_at FROM kb_schema_migrations ORDER BY version'
```

La risposta è JSON leggibile nel terminale, seguito dal numero delle righe.
Passa una query per volta fra apici, così la shell non interpreta gli spazi o i
simboli SQL. Sono ammessi `SELECT`, `WITH`, `SHOW` ed `EXPLAIN`: ogni comando
viene eseguito in una transazione `READ ONLY`. Scritture e comandi manuali di
transazione non sono ammessi. L’apertura utilizza il normale bootstrap del
progetto e può applicare migrazioni mancanti prima delle query di consultazione.

## Aprire la console SQL

```bash
pnpm db:console
```

All’interno della console:

```sql
.tables
.schema kb_trivia_questions
SELECT id, question->>'prompt' AS domanda
FROM kb_trivia_questions
LIMIT 5;
SHOW transaction_read_only;
.help
.exit
```

Le query possono occupare più righe e devono terminare con `;`. `.tables`
elenca le tabelle; `.schema` mostra colonne e tipi, anche di tutte le tabelle se
non specifichi un nome. `.clear` scarta una query ancora in preparazione.
`.exit`, fine dell’input (`Ctrl+D`) e `Ctrl+C` chiudono il database. Un comando
incompleto alla fine dell’input viene scartato, senza eseguirlo.

Il processo termina con codice `0` se riesce, `1` per errori di accesso o query,
`2` per uso scorretto o query incompleta, `130` dopo `Ctrl+C`, `143` dopo SIGTERM.
La console resta utilizzabile dopo un errore SQL; all’uscita segnala comunque
che si è verificato un errore.

## Directory o database diversi

I comandi caricano `.env.local` e usano le stesse variabili dell’app:

```bash
LOBBY_DATA_DIR=/percorso/del/database pnpm db:inspect
```

Se è impostata `DATABASE_URL`, si collegano al PostgreSQL esterno configurato,
invece che ai file PGlite. Il riepilogo indica il tipo di database senza stampare
la stringa di connessione. Non cambiare `.env.local` per consultare il database
attuale.

PGlite incorporato non espone una porta PostgreSQL: `psql` non si collega
direttamente a `.data/knowbetter`. Usa questi comandi per il database locale;
`psql` è adatto a un PostgreSQL esterno che esponga una connessione. Non aprire
i file PGlite con un server PostgreSQL di sistema e non cancellare `.data` per
eseguire una semplice verifica.
