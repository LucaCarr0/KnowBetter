# Catalogo trivia privato

Questo catalogo è importato nel database dal coordinatore. Non spostare questi
file in `public/` e non importare il loader da componenti client: contengono le
soluzioni. Una partita usa soltanto i contenuti del database; non chiama servizi
trivia esterni durante il gioco.

`catalog.ts` esporta `getCatalog()` sincrono: `{ version, categories, questions,
metadata }`. Ogni domanda ha ID stabile, categoria, testo, quattro opzioni con ID,
ID della risposta corretta, lingua, difficoltà, fonte, licenza e riferimento alla
riga originale. `sourceCategory` conserva la tassonomia originaria; `playable`
distingue la conservazione nel database dalla selezione durante la partita.

## Fonte principale: ITALIC, in italiano

- Autori: Andrea Seveso, Daniele Potertì, Edoardo Federici, Mario Mezzanzanica,
  Fabio Mercorio; CRISP, Università degli Studi di Milano-Bicocca.
- Sito e descrizione: <https://italicbench.it/>.
- Repository: <https://github.com/Crisp-Unimib/ITALIC>.
- Dataset originale fissato al commit
  `92df420ff686babeea54e217b9f90f8471374916`, file `italic.jsonl`.
- Licenza **MIT** dichiarata anche dalla scheda dataset degli autori:
  <https://huggingface.co/datasets/Crisp-Unimib/ITALIC>.
- La licenza originale e la scheda del repository sono conservate senza modifiche
  in `sources/italic/LICENSE` e `sources/italic/UPSTREAM_README.md`.
- Download: 26 ottobre 2026. SHA-256 del file originale:
  `ca877846f19a6d781ba151382e4f43b10efad1a7e375b5e0c50b047a3917e0af`.

È stato scaricato **l'intero catalogo originale di 10.000 domande**, non un campione.
Tutta la parte strutturalmente compatibile è normalizzata e importabile:

| Esito ITALIC | Numero |
| --- | ---: |
| Importate, quattro opzioni distinte e una soluzione riconoscibile | 7.461 |
| Escluse: due, tre o cinque opzioni | 2.534 |
| Escluse: opzioni testuali duplicate | 4 |
| Esclusa: domanda duplicata | 1 |
| Totale originale | 10.000 |

`exclusions.json` registra ciascuna esclusione con riferimento esatto alla riga e
motivo. Non sono stati inventati distrattori per rendere compatibili le domande
con un numero diverso di alternative. Conserviamo integralmente il sorgente per
consentire un futuro formato con un numero diverso di risposte.

Modifiche: decodifica di entità HTML anche doppiamente codificate, normalizzazione
Unicode/spazi, opzioni strutturate, ID basati sul contenuto, raggruppamento delle
sottocategorie linguistiche in «Lingua italiana» e nomi delle categorie in italiano.
Il testo corretto e la posizione delle opzioni provengono dal dataset; il motore
può mescolare l'ordine delle opzioni per ciascuna domanda comune.

La fonte non assegna difficoltà: `medium` è un **default tecnico**, non una
valutazione degli autori o una misura calibrata. Il contenuto proviene da prove
concorsuali del 2008–2024 e include quesiti specialistici. Il download e i test
strutturali **non equivalgono a una verifica fattuale indipendente**.

Le 82 domande compatibili classificate `current_events` rimangono importate
con `playable: false`: possono contenere risposte variabili nel tempo, prive di
ancoraggio temporale verificato. Il coordinatore deve escluderle dall'estrazione
finché non saranno revisionate. Gli altri quesiti, compresi quelli di educazione
civica, conservano le risposte della fonte e richiedono revisione editoriale per
una distribuzione pubblica; nessuna garanzia di attualità è stata aggiunta.

## Supplemento italiano: OpenTriviaQA

La fonte italiana principale non contiene categorie autonome per animali, cinema
e sport. Il supplemento aggiunge **36 adattamenti italiani**, 12 per categoria,
selezionati da [OpenTriviaQA](https://github.com/uberspot/OpenTriviaQA) di **uberspot
e contributori**. È una selezione dichiarata, non l'importazione dell'intero
catalogo OpenTriviaQA. Il catalogo principale ITALIC rimane integralmente importato
per tutta la parte compatibile.

- Commit originale: `dcc1cdf36c2985ed5c849d1f2265c5041ffcdfb9`.
- Licenza: **Creative Commons Attribution-ShareAlike 4.0 International**
  (<https://creativecommons.org/licenses/by-sa/4.0/>).
- Sorgenti e licenza originali conservati in `sources/opentriviaqa/`.
- SHA-256 animali:
  `53b0dbac5d70b232e5d2c9ea0f7742807a6b318fc409856daba15b7a87c70585`.
- SHA-256 cinema:
  `774945aa764551247a81ca50404e869bd09175534eee2ad8f920485f0442b6e8`.
- SHA-256 sport:
  `5d8dbb522356780f3b1a3bedea02c27768fe24cb9a8d60c7d70485143cbfcc7a`.

Gli adattamenti (`supplement-translations.json` e `supplement-it.json`) sono
distribuiti sotto **CC BY-SA 4.0**, con attribuzione a OpenTriviaQA/uberspot e
contributori, adattamento italiano Know Better del 26 ottobre 2026.
I file MIT mantengono la propria licenza: questo supplemento non cambia la licenza
del catalogo ITALIC.

Modifiche esplicite: traduzione in italiano preparata dall'agente, titoli italiani
dei film quando riconoscibili, nomi comuni italiani degli animali, correzione di
alcuni refusi nei nomi, eliminazione di dettagli accessori e riscrittura di alcuni
quesiti per ridurre ambiguità o riferimenti al presente. Le quattro opzioni restano
associate alle lettere originali; il normalizzatore ricava automaticamente la
lettera corretta dal testo inglese. La difficoltà è una stima locale.
I quesiti non sono una traduzione revisionata da un redattore umano: le fonti e le
righe sono disponibili per tale revisione. Non sono state trasferite le domande
del resto del catalogo inglese nelle partite italiane.

Attribuzione sintetica da mantenere nell'interfaccia/fonti del gioco:
**«Domande ITALIC — CRISP/Milano-Bicocca (MIT). Supplemento OpenTriviaQA — uberspot
e contributori, adattamento italiano Know Better (CC BY-SA 4.0).»**
Ogni domanda conserva anche il link alla riga originale per la relativa attribuzione.

## Totali e riproducibilità

Il catalogo normalizzato contiene **7.497 domande italiane**, 10 categorie
archiviate, **7.415 domande attive** in 9 categorie; «Cultura e società» contiene
attualmente soltanto gli 82 quesiti di attualità disattivati. Ogni categoria attiva
ha almeno 12 domande, abbastanza per cinque round e alcune sostituzioni dopo un
riavvio. Gli ID delle domande sono stabili a parità di contenuto/versione della
fonte.

Il motore applica anche il filtro di leggibilità per la domanda da 15 secondi:
testo entro 300 caratteri, ogni opzione entro 120 e totale entro 600. Sono quindi
**7.155 le domande effettivamente estraibili** nella configurazione iniziale; tutte
le 7.497 rimangono nel database. Le 7.415 indicate sopra hanno il solo requisito
editoriale `playable !== false`; 260 di queste superano i limiti di lunghezza.

| Categoria | Archiviate nel database | Estraibili nel gioco |
| --- | ---: | ---: |
| Animali | 12 | 12 |
| Arte | 442 | 438 |
| Cinema | 12 | 12 |
| Cultura e società | 82 | 0 |
| Educazione civica | 792 | 719 |
| Geografia | 682 | 653 |
| Letteratura | 982 | 968 |
| Lingua italiana | 3.770 | 3.688 |
| Sport | 12 | 12 |
| Storia | 711 | 653 |

Per rigenerare il normalizzato dagli originali già conservati, senza rete:

```sh
node --import tsx src/server/content/import-trivia.ts
```

Il comando verifica gli SHA-256 prima di scrivere `catalog.json`,
`supplement-it.json` ed `exclusions.json`. Non apre il database e non avvia server.
L'importazione SQL è compito dello script dell'app e conserva **tutte** le domande;
il filtro `playable !== false` va applicato quando si prepara il contenuto del
motore di gioco, non al seed del database.

Per verificare riproducibilità, esclusioni, risposte, licenze e quantità:

```sh
node --import tsx --test --test-isolation=none src/server/content/catalog.test.ts
```
