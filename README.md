> **Deze code draait op twee plekken:** de echte game ([gulpen-game](https://github.com/robberttenhorn/gulpen-game)) en de HD-proefversie (gulpen-game-hd). Het adres bepaalt welke van de twee het is (`src/config.js`), dus dezelfde code kan naar beide worden gepubliceerd.
> Op de proefversie wordt de voortgang apart bewaard (opslagnamen beginnen met `gulpehd-`), staat de anonieme telling uit en is de titel "Locals: Gulpen HD". Op de echte game zijn de opslagnamen dezelfde als altijd (`gulpe-`), zodat niemand zijn voortgang kwijtraakt, en staat de telling aan.

## Wat er in de HD-versie anders is

Het volledige verslag met voor- en na-beelden staat in [`docs/hd/VERSLAG.md`](docs/hd/VERSLAG.md), de bronnen in [`docs/hd/BRONNEN.md`](docs/hd/BRONNEN.md). De gameplay en alle missies zijn ongewijzigd. In het kort:

- **Beeldkwaliteit in drie standen** (`src/quality.js`): `hoog` op de computer, `laag` op de telefoon, `midden` ertussenin. Kiezen kan op het startscherm, tijdens het spelen via het tandwiel rechtsboven (Instellingen; de game laadt dan opnieuw), of met `?kwaliteit=hoog|midden|laag` achter het adres (wordt onthouden; `?kwaliteit=auto` zet het terug). Hapert het spel, dan schakelt het zelf stap voor stap af: eerst scherptediepte en zonnestralen, dan minder pixels, dan ambient occlusion, dan het verre gras en een kleinere schaduwkaart, en pas als laatste de hele nabewerking. In de stand `hoog` gebeurt dat pas onder ongeveer 27 beelden per seconde.
- **Lucht** (`src/sky.js`): gefotografeerde hemels van Poly Haven: overdag blauw met stapelwolken, 's nachts sterren en de Melkweg. De lucht levert ook het hemellicht en de reflecties. Eerst laadt een lichte versie, daarna op de computer de fijne.
- **Licht en atmosfeer** (`src/main.js`, `src/lighting.js`): fellere zon tegenover koel hemellicht, een grote stabiele schaduwkaart, luchtperspectief en hoogtemist in het dal.
- **Nabewerking** (`src/post.js`): ambient occlusion, zonnestralen, scherptediepte tijdens gesprekken, bloom, filmische tone mapping, kleurcorrectie, vignet en korrel.
- **Avond**: lantaarns langs alle straten die echt licht geven op straat, gevels, auto's en mensen (één lichtkaart in plaats van honderden lampen), zachte lichtkegels, etalages die de stoep verlichten, en een natte straat waarin elke lantaarn spiegelt.
- **Wereld**: gras dat je echt ziet staan rond de speler (`src/grass.js`), bladerige hagen en struiken (`src/vegetation.js`, `src/foliage.js`), water met fijne rimpels dat de lucht spiegelt (`src/hardscape.js`), dakranden met overstek en goot, schoorstenen en ramen die terugliggen in de muur (`src/world.js`), en rustig asfalt.
- **Poppetjes** (`src/character.js`, `src/mocap.js`): nieuw lichaam, en lopen, joggen, rennen en zitten uit echte motion capture (Carnegie Mellon University).
- **Auto's** (`src/vehicles.js`, `src/carmodel.js`, `src/cartypes.js`, `src/carmat.js`): carrosserie met rondingen, glas met interieur, draaiende en sturende wielen, lampen die 's avonds aangaan, Nederlandse kentekens (verzonnen).
- **WebGL 2 is de enige route.** Er is bewust niet overgestapt op WebGPU; het verslag legt uit waarom.

Hulpscripts voor deze versie:

| Script | Wat het doet |
| --- | --- |
| `tools/hd-shots.cjs` | vaste screenshots (dag, avond, computer en telefoon) en een meting per beeld |
| `tools/hd-missies.cjs` | loopt alle missies kort na en meldt fouten |
| `tools/fetch-hdri.py` | haalt de luchten op van Poly Haven en zet ze om |
| `tools/bake-mocap.mjs` | haalt de motion capture op en rekent die om naar het skelet van de poppetjes |
| `tools/poppetje-*.{html,js,cjs}`, `tools/auto-*.{html,js,cjs}` | losse testpagina's voor poppetjes en auto's |

# Locals: Gulpen

Een browsergame die zich afspeelt in het echte Gulpen (Zuid-Limburg). Het dorp is opgebouwd uit open overheidsdata:
elk huis staat op de goede plek met de echte dakvorm, de straten hebben hun echte namen, en het reliëf van het Heuvelland klopt.

## Spelen

```bash
npm install
npm run dev
```

Open daarna de link die Vite toont (meestal http://localhost:5173).

**Besturing**
- Computer: WASD of pijltjes om te bewegen, Shift om te rennen, muis bewegen om te kijken (het spel vangt de muis tijdens het rondlopen; Esc maakt hem vrij, een klik in het beeld vangt hem weer),
  E om te praten of in en uit te stappen, F voor fiets of skateboard, spatie als handrem, M voor de kaart.
- Mobiel: joystick links, slepen op de rechterhelft om te kijken, knoppen rechtsonder. Tik op de minikaart voor de grote kaart.

**Vervoer**: lopen (ongeveer 15 km/u, rennen 23 km/u), skateboard (34 km/u), fiets (45 km/u, na het afstellen bij Jef Abels sneller) en auto's (tot 120 km/u). De fiets heb je altijd bij je: druk op de knop Fiets (of F).
Overal staan auto's waar je in kunt stappen: op parkeerplaatsen en op opritten door het hele dorp, bij elke start op andere plekken. Er zijn ook sportwagens, en op het boerenland staat een tractor. Op de oprit van Ringweg 38 staat altijd een grijze Volvo XC40 (die staat niet op de kaart). Die heeft een eigen model met de typische XC40-vormen: zwart zwevend dak met spoiler, de knik in de achterste ruitlijn, zwarte wielkasten, de grille met schuine streep en logo, 'Thor's hammer'-koplampen, hoge verticale achterlichten en turbinevelgen. Ringweg 38 heeft een voor- en achtertuin die zijn nagebouwd naar de luchtfoto (PDOK, 8 cm per pixel), het kadaster en de BGT (src/tuin38.js): een oprit van rode klinkers, een plantvak met buxushaagje, een boom met roodbruin blad, een berging, een vijver met stenen rand, twee terrassen, een gazon, moestuinbakken, een groene haag langs de wei en achter het terras, een haag aan de westkant, en achterin een open stuk naar de wei met twee knotwilgen in het gras. Op het terras bij het huis staat een houten eettafel met zes stoelen, met twee bomen in een smalle border naast de haag; achterin staat een donkere bistroset met zes stoeltjes en een ronde terracotta parasol op een voet. Een klinkerpaadje verbindt de terrassen, en rechts van de vijver staat een plantvak met witte en gele bloemen en een hoge boom. Door de grote ramen in de achtergevel zie je links de eettafel en rechts de serre met twee oranje stoelen en een schildersezel. Welke plant of welk meubel het precies is, is een interpretatie van de luchtfoto.
Water kun je niet in. Er rijdt verkeer over het echte wegennet en er lopen dorpsbewoners rond.

## Missies

Alle missies staan tegelijk open. Je kiest zelf de volgorde. Op de grote kaart zie je ze allemaal, met hun status.

| Missie | Waar |
| --- | --- |
| Proefrit bij Jef Abels: fiets afstellen en door zes genummerde poortjes slalommen (groene pijl wijst het volgende aan), binnen 30 s inclusief strafseconden | Jef Abels Bikes, Rijksweg 113 |
| Viraal met een frietje: in de cafetaria een POV-filmpje opnemen voor TikTok (friet bakken, snack frituren, schudden, saus, trucje) | Cafetaria Zheng (de stagiair is verzonnen) |
| Frikandel super: alleen contant, dus eerst muntjes zoeken | Friture An + Piet, Rijksweg 60B |
| Bezorgen voor Salma: twee bestellingen in de buurt op tijd (beloning: Broodje Gulpen) | Grillroom Pizzeria Salma, Rijksweg 60A |
| Friet bij Zheng: kies je saus | Cafetaria Zheng, Looierstraat 103 |
| In beslag genomen: skateboard ophalen met een overhoring | Sophianum, Landsraderweg 7 |
| Ringweg Race: skatewedstrijd | Ringweg |
| Vers van 't vat: een vat naar de Zwarte Ruiter brengen | Gulpener Bierbrouwerij, Rijksweg 16 |
| Pilsje: eerst vallende glazen pils vangen met het dienblad, daarna wordt het avond (of weer ochtend) | Herberg De Zwarte Ruiter, Markt 4 |
| Penalty's: eerst richten, dan de kracht timen; de keeper leert je patroon. Scoor er 3 van de 5 | Sportpark FC Gulpen, Ringweg 14 |
| Een schimmig zaakje: een pakketje snel bezorgen | Mariabeeld, top van de Gulperberg |
| De Nachtburgemeester (alleen 's avonds): zoek zijn ambtsketen | Markt |
| Gulperberg op!: fietswedstrijd tegen de wielrenner, wie het eerst bij het Mariabeeld is | Voet van de Gulperberg |
| De ontsnapte geit: ren de zigzaggende geit achterna en tik hem drie keer aan | Boerenland aan de rand van het dorp |
| Inparkeren bij de PLUS: vijf keer netjes in een vak in twee minuten, botsen kost tijd | Parkeerplaats PLUS |
| Vogelschieten: met de buks de houten vogel stukje voor stukje van de paal schieten, de romp als laatste (14 schoten) | Bij het sportpark (de schutter is verzonnen) |
| Vissen in de Gulp: vang drie vissen | Oever van de Gulp |
| Op tijd voor de optocht: haal het gevolg van Prins Carnaval op, want hij moet klumpkes sjmiete (snoepjes gooien); aan het eind gooit hij een paar handenvol snoep | Markt |
| Nacht van Gulpen (alleen 's avonds): wandelen langs drie stempelposten | Bij de Markt |
| Plat kalle: opa overhoort je in het Gulpens | Benkske bij de Markt |
| Kroegentocht op de Hubertusmarkt: vier cafés, vier verhalen en een live interview met De Razende Reporter | Markt, De Kroon, De Zwarte Ruiter, Neubourg en De Poort |
| De Gezellerie-borrelplank: snel worst en vleeswaren halen bij Slagerij Bormans | Donny's Gezellerie, Kapelaan Pendersplein 8 |
| Karretjes-trein: vier losgeslagen winkelwagentjes terugbrengen | PLUS supermarkt, Passage 1 |
| Vlaaien voor na de mis: van de bakkerij naar de koffietafel in de kerk, zonder te botsen | Bakkerij Paulissen, Rijksweg 54, en de Sint-Petruskerk |
| Bestelling in het plat: een bestelling in het Gulpens inpakken en bezorgen | De Eetwinkel van het Heuvelland (Meertens), Rijksweg 55 |
| Het verdwenen armenfonds: speurtocht naar de sporen van deken Haffmans, met een gouden sportwagen | Sint-Petruskerk |
| Muizen in de bakkerij: vang zes muizen voordat de keuring komt | Bakkerij Pijls, Rijksweg 57 |
| Tuutjes trekken: condooms uit de automaat halen zonder dat het halve dorp het ziet | Condoomautomaat naast de DA, Rijksweg 53 |
| Het grootste bommetje: drie sprongen, de jury geeft punten | Mosaqua, Landsraderweg 11 |
| Gyros en Opa!: gyros snijden op het juiste moment, daarna borden kapotgooien | Grieks Restaurant Athene, Rijksweg 31 |
| De deurtjes van de Gulperberg Deluxe: tijdens een demo openspringende keukendeurtjes dichtklappen voordat ze eraf vallen | Plan Keukens, Rijksweg 21 |
| Het matras van Gulpen: langs de loketten van het gemeentehuis, van het kastje naar de muur | Gemeentehuis Gulpen-Wittem, Willem Vliegenstraat 12 |
| De strakste heg van de Heggerank: de heggenschaar op de lijn houden voor de jury van de Mooiste Voortuin | Heggerank (bloemenwijk) |
| Kabouters ontvoerd: vijf tuinkabouters zoeken met een warm-koudmeter (steeds andere voortuinen, binnen zo'n 75 m) | Akelei en de straten eromheen (bloemenwijk) |
| Burendag-BBQ: burgers op tijd omdraaien en opdienen, niet te veel verbranden | Aardaker 43 (bloemenwijk) |
| Biceps pompen: in de sportschool curlen tot je Mosaqua-klaar bent (ingedrukt houden, bovenin aanspannen tot de ring vol is, dan loslaten) | Anytime Fitness, hoek Looierstraat en Nieuwstraat |
| Badkamer betegelen: het halve huis ligt open en de tegelzetter is aangefietst; leg de tegels volgens het voorbeeld binnen de tijd | Oude Akerweg 43 |
| Ploegen op de Gulperberg: met de tractor zes banen zo recht mogelijk omploegen, keren op de kopakker | Akker op de Gulperberg |
| Grond sjouwen: de voortuin van de krullebol ophogen met drie kruiwagens grond van de straat, zonder te rennen of te scherp de bocht om te gaan | Groeneweg 65 |
| IJsjes scheppen: bolletjes in de volgorde van het bonnetje op een wiebelende hoorn stapelen, vijf klanten blij maken | IJssalon Mezzaluna, Markt |
| De verdwaalde toerist: een toerist met een VVV-kaart rondleiden langs de kerk, de brouwerij en de Gulp; hij houdt je bij, ook als je rent, maar raakt steeds afgeleid (een poes, een etalage, zijn veter): ga dan terug en roep hem | VVV, Looierstraat |
| Bonbons sorteren: 25 bonbons van een snelle, steeds snellere band in de doos puur, melk, wit of praliné (met hazelnoot); gebroken bonbons opeten, drie fouten en je bent af | Rousseau Chocolade, Rijksweg |
| Knuffel kwijt: drie voorbijgangers geven een hint (richting, straat, plek), zoek beer Bobbie en breng hem terug | Top1Toys, Rijksweg |
| Kunst in de piramide: er komt geen hond op de tentoonstelling af; haal vijf bezoekers (en een hond) voor de Mona Liesje, daarna het verhaal van de veiling | Piramide Primosa, Landsraderweg 7 |
| De Romeinse weg: graven naar Romeinse vondsten; een getal zegt hoeveel vondsten er in de vakjes eromheen liggen, pas op voor de waterleiding | Oude Akerweg |
| Een bord is een schilderij: drie gangen precies zo opmaken als de chef ze voordoet | Restaurant Atelier, Markt 9 |
| Tappen op de Bierfeesten: tien Gulpeners precies tot de streep met een kraag van twee vingers schuim (de tap sputtert en het schuim verschilt per glas), met Feestkabinet op het podium | Markt, bij Café Neubourg (alleen 's avonds: overdag stuurt de voorzitter je eerst voor een pilsje naar De Zwarte Ruiter) |
| Zit de korenwolf er nog?: drie wildcamera's ophangen in het veld en de nachtfoto's nakijken | Velden aan de rand van het dorp |
| Forellen scheppen: tien grote forellen uit de kweekvijver scheppen; kleintjes laten zwemmen (twee keer fout en je bent af), bij een misser schieten de vissen weg | Aan de Gulp, bij de Looierstraat |
| Knotwilgen knotten: help de man met de handzaag de twee knotwilgen te knotten (3D: kies waar je zaagt, net boven de knot, en zaag in een rustig ritme); daarna zijn de wilgen in de tuin echt geknot en gaan de takken later in de haard | Achtertuin van Ringweg 38 |
| Gulpen van bovenaf: met een drone door lichtringen over het dorp vliegen (Markt, Gulp, brouwerij, Primosa, Mosaqua, kerktoren); de gouden ringen maken luchtfoto's, die je aan het eind als polaroids ziet. Batterij, windvlagen en botsen tegen gebouwen | Weiland aan de rand van het dorp |

Bij de kroegentocht, de vlaaien en de slager ga je ook naar binnen: in een café, de bakkerij, de kerk en de slagerij.

**Dag en nacht**: de tijd loopt niet vanzelf. Het wordt avond na de missie Pilsje bij De Zwarte Ruiter (en tijdens de finale). Het wordt weer dag zodra je een andere missie begint, als je een nachtmissie haalt, stopt of die mislukt, met nog een pilsje, en anders na 3 minuten zonder missie. Bij elke start van de game is het 11 uur 's ochtends. De avondmissies zijn de Nachtburgemeester, de Nacht van Gulpen en de Gulpener Bierfeesten.

**Licht**: het spel begint midden op de middag (15 uur), met een lage, warme zon en lange schaduwen. De schaduwen worden opgevuld met koel licht van de echte lucht, langs de randen van poppetjes, bomen, auto's en gevels loopt een heldere rand (het sterkst als je tegen de zon in kijkt), en verderop wordt alles zachter door nevel die richting de zon warm kleurt (src/lighting.js). Kijk je richting de zon, dan zie je zonnestralen langs daken en bomen. Achter de etalages brandt ook overdag warm licht. 's Avonds branden de lantaarns langs alle straten, is de straat nat en spiegelen de lampen in de plassen.

**Geluid**: alle geluiden worden in de browser opgewekt (WebAudio): voetstappen, fietsbel, motor, deuren, munten, proosten, kerkklokken, vogels en krekels. Met de knop met de luidspreker zet je het geluid uit. Wissel je van app en kom je terug, dan gaat het geluid vanzelf weer aan.

**Terug naar start**: naast de geluidsknop staat een knop met een huisje. Die is altijd in beeld (in een minispel linksonder) en brengt je na een korte bevestiging terug naar het startpunt. Een lopende missie, minispel, gesprek, race of rit stopt dan, en ook als er iets is vastgelopen kun je zo altijd weer verder.

**Besturing**: fiets, skateboard en auto sturen zoals een voertuig: vooruit is gas (of trappen), achteruit is remmen, links en rechts is sturen. Met toetsen lopen gas en sturen geleidelijk op; de joystick heeft een dode zone in het midden en stuurt bij een kleine uitslag maar een klein beetje.

**Auto kapen**: ga voor of naast een rijdende auto staan, dan stopt hij en toetert hij. Bij het portier kun je de chauffeur eruit trekken (knop **Kapen** of E) en zelf verder rijden. De chauffeur valt op straat en rent scheldend weg.

Voortgang wordt in de browser bewaard. Een missie kun je altijd stoppen met de knop **Stoppen** op de opdrachtkaart of in het gesprekvenster (tik nogmaals om te bevestigen), of met Esc.

## Data

Alle data staat al in `public/data/`. Opnieuw ophalen (duurt een paar minuten):

```bash
NODE_USE_ENV_PROXY=1 npm run data   # NODE_USE_ENV_PROXY alleen nodig achter een proxy
```

| Bron | Wat | Licentie |
| --- | --- | --- |
| [3D BAG](https://3dbag.nl) (TU Delft / 3DGI) | Gebouwen in 3D (LoD 2.2) | CC BY 4.0 |
| [AHN](https://www.ahn.nl) via PDOK | Hoogtekaart maaiveld | CC0 |
| [BGT](https://www.pdok.nl) via PDOK | Wegen, water, groen, bomen, bankjes, lantaarnpalen, verkeersborden, sportvelden | CC0 |
| [NWB](https://www.pdok.nl) (Rijkswaterstaat) via PDOK | Wegennet met straatnamen | CC0 |
| [Luchtfoto](https://www.beeldmateriaal.nl) (Beeldmateriaal Nederland) via PDOK | Zomerluchtfoto 25 cm: groen, akkers, bos, dakkleuren en het Heuvelland rondom | CC BY 4.0 |
| [ez-tree](https://github.com/dgreenheck/ez-tree) (Daniel Greenheck) | Boommodellen met schors- en bladtexturen | MIT |
| [Poly Haven](https://polyhaven.com) | Fototexturen voor baksteen, mergel, pleister, leien, dakpannen, asfalt, klinkers en tegels (namen en makers in `public/data/tex/tex.json`), en de luchten voor dag en nacht (`public/data/sky/sky.json`) | CC0 |
| [CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu) | Bewegingen van de poppetjes: lopen, joggen, rennen en zitten | vrij te gebruiken (zie `docs/hd/BRONNEN.md`) |

Voor de 3D BAG en de luchtfoto is bronvermelding verplicht (CC BY 4.0). Die staat op het laadscherm.

Texturen opnieuw ophalen: `SSL_CERT_FILE=... python3 tools/fetch-textures.py` (Python met Pillow).
Luchten opnieuw ophalen: `SSL_CERT_FILE=... python3 tools/fetch-hdri.py` (Python met Pillow en NumPy).
Luchtfoto opnieuw ophalen: `SSL_CERT_FILE=... python3 tools/fetch-ortho.py` (Python met Pillow).
Bomen opnieuw maken: `npm run build`, `npx vite preview --port 4173` en dan `node tools/bake-trees.cjs` (Playwright). Zonder `public/data/trees/` maakt de game de bomen zelf, maar laadt dan ~4 MB extra.

## Verborgen: de SixSense-flyers

Op drie plekken (bij het busstation, bij het tankstation en verderop in de Dorpsstraat) ligt een flyer met een kortingscode voor SixSense; ze staan als roze 6 op de kaart. Heb je ze alle drie, dan komt er een zwarte bus met een grote roze 6 voorrijden. Instappen, en de bus staat meteen vijf seconden te schommelen en te piepen (je ziet hem helemaal, van buiten, zonder knoppen in beeld). Daarna stap je vanzelf weer uit en rijdt de bus weg. De flyers liggen er daarna weer, zodat je het opnieuw kunt doen. De kortingscodes zijn verzonnen.

## Alle missies af

Na de laatste missie nodigt de waard van De Zwarte Ruiter je uit op de Markt. Daar staan alle personen uit de missies, de waard houdt een toespraak (je wordt Ereburger van Gullepe) en daarna volgen vuurwerk, muziek, slingers met gekleurde lampjes en een polonaise achter jou aan. Het feest duurt zo lang je wilt: met de knop Feest afsluiten rond je het af.

Elke missie onthoudt je beste prestatie, zichtbaar in de lijst op de grote kaart. Meestal is dat de tijd van start tot finish; bij de heg, het bommetje, TikTok, de penalty's en het grond sjouwen is het de score. Verbeter je die, dan meldt het spel een nieuw record.

## Bezoekers tellen

`src/stats.js` telt anoniem via [GoatCounter](https://www.goatcounter.com): geen cookies en geen persoonsgegevens, alleen tellers. Het dashboard staat op https://10horn.goatcounter.com. De code staat in `src/config.js` (`GOATCOUNTER`); op de HD-proefversie is die leeg en staat de telling dus uit.

| In het GoatCounter-dashboard | Betekenis |
|---|---|
| paginaweergaven (`/gulpen-game/`) | elke keer dat iemand de game opent, ook wie niet op Speel drukt; met de verwijzer (bijv. Facebook of WhatsApp) |
| `speler-nieuw` | één keer per apparaat of browser: ongeveer het aantal verschillende spelers |
| `spel-gestart` | elke keer dat iemand op Speel drukt |
| `speelminuut` | elke minuut dat het spel in beeld is: het totaal is de speeltijd in minuten |
| `drie-missies` | één keer per apparaat: hoeveel spelers drie missies halen |
| `haperend/mobiel/..fps` of `haperend/computer/..fps` | één keer per sessie: het spel liep een tijdje onder 40 beelden per seconde |
| `soepel/mobiel/..fps` of `soepel/computer/..fps` | één keer per sessie: na twee minuten spelen liep het soepel (ter vergelijking) |
| `fout/vastgezet` | het vangnet heeft een speler losgelaten die vast stond |

Daarnaast komen fouten anoniem binnen als `fout/...` (bijvoorbeeld `fout/zwart-beeld` of `fout/webgl-weg`), met welke missie er net klaar was. Zo zie je wat er op telefoons misgaat.

Niet geteld: lokaal testen, adressen met `?dev` of `?nostats`, en apparaten waar in de browserconsole `localStorage.setItem('skipgc', 't')` is gedaan (handig voor je eigen telefoon).

## Naar een ander dorp of andere stad

Het concept is herbruikbaar. In `tools/fetch-data.mjs` pas je aan:
- `ORIGIN`: middelpunt van de spelwereld (RD-coördinaten).
- `CORE` en `WIDE`: het speelgebied en het grotere gebied voor de horizon.
- `POIS`: de herkenbare plekken.

De klussen en teksten staan in `src/missions.js`, de gevels van de zaken in `src/facades.js`.

## Nog te controleren

- **Limburgse woorden en uitspraken**: Enne?, aangefietst, wablief?, op de kis houwe, op de joets, doa velt mig de boks van aaf, doa valle mig de sjoon van oet, d'n klets kriegen, hiel leuk, afgewerkt, roetsjen, uithelpen, tien op twaalf, zeiveren, toenstraks, McDrek, dreksbak, drek, een tas koffie inschudden, tes, sjattepoemelke, zin in mik, sjottelslet en haije komen uit een lijst van de maker en zijn waar het paste in de bestaande teksten verwerkt, steeds met een vertaling.
- **Dialect**: de dorpsbewoners spreken af en toe Gulpens, met een Nederlandse vertaling eronder (aan en uit te zetten in de dialoog). Alle Gulpense woorden komen uit de [woordenlijst Gulpens op mijnwoordenboek.nl](https://www.mijnwoordenboek.nl/dialect/Gulpens), die door bezoekers is samengesteld en geen officiële bron is. De zinnetjes zijn met die woorden gemaakt en moeten door een echte Gulpenaar worden nagelopen.
- **Echte personen**: bewust weggelaten. De mensen in de zaken zijn verzonnen rollen ("de monteur", "de waard"). De nachtburgemeester is verzonnen.
- **Naam**: het spel heet "Locals: Gulpen". "Locals" is de serienaam; de plaatsnaam staat in `src/config.js` (en als begintekst in `index.html`), zodat dezelfde opzet ook voor een ander dorp, een stad of een wijk kan. Het logo op het startscherm is een kaartspeld als O in LOCALS, met de plaatsnaam op een blauw straatnaambord dat meegroeit met de lengte van de naam. Controleer voor breder delen of de naam nog vrij is (app-winkels, domeinnaam, merkregister).
- **Winkels en bedrijven**: de gevels aan de Rijksweg en in het centrum (onder andere HEMA, Top1Toys, Pearle, DA, Euronics, Decorette, de bakkerijen Pijls en Ortmans, Rousseau Chocolade, IJzerwaren Knubben, Gulpener Bierhuys, VVV, Il Gusto, IJssalon Mezzaluna en Slagerij Bormans) staan op adressen uit online bedrijvengidsen en officiële winkelpagina's. Die gidsen kunnen verouderd zijn: controleer ter plekke of de zaken er nog zitten. De adressen zelf komen uit de PDOK Locatieserver. Het tankstation (Rijksweg 70) en de plek van het busstation (busbaan bij de Rijksweg) komen uit TOP10NL; het tankstation heeft bewust geen merk. Borden, kleuren en etalages zijn verzonnen, zonder echte logo's.
- **Nieuwe plekken**: De Pannekoekenmolen (Molenweg 2A), Mosaqua (Landsraderweg 11), Grieks Restaurant Athene (Rijksweg 31) en het gemeentehuis (Willem Vliegenstraat 12) staan op adressen uit online gidsen en de gemeentesite; Plan Keukens op Rijksweg 21 en Bakkerij Pijls op Rijksweg 57 zijn opgegeven door de maker. Volgens L1/NOS sluit Mosaqua na 32 jaar; de badmeester verwijst daarnaar.
- **Bloemenwijk (west)**: het speelgebied loopt nu ook over de wijk met Bolderik, Aardaker, Akelei, Bosrank, Wederik, Sleedoorn, Heggerank, Maretak en Schuttersveld (gebouwen, terrein en straten uit dezelfde open data). De buurman, de mevrouw van de kabouters en de wedstrijd Mooiste Voortuin zijn verzonnen. De plek en het uiterlijk van de jongen bij de BBQ (Aardaker 43, adres via de PDOK Locatieserver) zijn opgegeven door de maker; zijn verhaal is verzonnen. Hetzelfde geldt voor de krullebol op Groeneweg 65: plek en uiterlijk komen van de maker, het verhaal over de gestorte grond is verzonnen. De missies zijn gekozen bij de straatnamen, niet bij echte gebeurtenissen.
- **Anytime Fitness**: adres Nieuwstraat 8 volgens openingstijden.nl (coördinaten via de PDOK Locatieserver). De ingang staat op aanwijzing van de maker aan de Looierstraat-kant van hetzelfde pand, bij de hoek met de Nieuwstraat. De glazen pui, de sporters, de personal trainer en het roepen zijn verzonnen; bord in een passende stijl, geen echt logo.
- **Oude Akerweg 43**: plek en de blonde jongen zijn opgegeven door de maker (adres via de PDOK Locatieserver); de verbouwing, de opengewerkte kamer en het verhaal zijn verzonnen.
- **SixSense**: naam opgegeven door de maker. Er staat geen adres in de game; de bus, de flyers en de codes zijn verzonnen. Vraag toestemming voordat de game breed gedeeld wordt.
- **Het matras van Gulpen**: volledig verzonnen verhaal. Alle loketmedewerkers, de portier, de stagiair, de zenuwachtige jongen, de bakkersgezel, de kok en de keukenverkoper zijn verzonnen rollen.
- **Joods monument**: staat op de plek van het herdenkingsmonument aan de Beversbergweg volgens de BGT, ongeveer 400 meter ten westen van het gedetailleerde dorpsgebied. Het echte ontwerp is niet nagemaakt: het is een eenvoudige gedenksteen, zonder missie.
- **Geschiedenis**: de feiten over de piramide Primosa (gebouwd voor 9,5 miljoen gulden, tentoonstellingen zonder bezoekers, geveild voor 260.000 gulden aan de man die eerder 250.000 gulden kreeg voor zijn schuur), de Romeinse weg (Oude Akerweg van Maastricht naar Aken, vondsten bij de aanleg van de tramlijn tussen 1920 en 1925), het stromende water (leerlooiers, bierbrouwers en forellenkwekers; de Gulpener Bierbrouwerij in 1825) en de twijfel over de korenwolf komen van de maker van de game. De Mona Liesje, de bezoekers en de grappen zijn verzonnen. De glazen piramide (ongeveer 18 bij 18 meter en 10 meter hoog, op aanwijzing van de maker) staat op de plek uit de 3D BAG, met een ruitjespatroon zoals dat van het Louvre en de ingang aan de kant van Mosaqua.
- **Merken**: Gulpener, An + Piet, Salma, Zheng, Jef Abels, De Zwarte Ruiter, Sophianum, FC Gulpen, Volvo, IJssalon Mezzaluna, de VVV, Rousseau Chocolade, Top1Toys, Restaurant Atelier, de Gulpener Bierfeesten, het DJ-duo Feestkabinet, Aldi, Kruidvat, Zeeman, Lunchroom De Looier, Mudo Kappers, Primera, Moustache, Optiek Gulpen en Enjoy Feestballonshop worden bij naam genoemd. De personen bij Mezzaluna, de VVV, Rousseau, Top1Toys en Atelier, de voorzitter van de Bierfeesten en hun verhalen zijn verzonnen; de DJ en MC van Feestkabinet heten in de game alleen 'de DJ' en 'de MC'. Vraag toestemming voordat de game breed gedeeld wordt. Er worden geen echte logo's gebruikt.
- **Mariabeeld**: de plek komt uit de BGT (een monument op 157 m, de top van de Gulperberg). Het beeld zelf is een gestileerde benadering, niet het echte ontwerp.
- **Beelden in het dorp** (src/beelden.js), zonder missie en met botsing, in vereenvoudigde vorm nagemaakt naar de beschrijvingen die ik online vond:
  - *Paard in brons* (Fons Bemelmans, 1988), een steigerend paard bij het busstation. De plek komt uit de BGT (herdenkingsmonument aan de Rijksweg).
  - *Smeltkroes van de evolutie* (Dolf Wong Lun Hing, 1988), een granieten druppel van 3,5 meter met vissen die vogels worden, aan de Deken Schneidersstraat. De plek komt uit de BGT.
  - *Sint Jozef* met kind (1991), stenen beeld op het Kapelaan Pendersplein. De precieze plek op het plein is een benadering.
  - *De Limburger* (Bert van Loo, 1975, geschonken door de Gulpener Bierbrouwerij), een bronzen figuur op een ton met drie gezichten, op de Markt recht voor Herberg De Zwarte Ruiter.
  - *Twee Stromen* (Arthur Spronken, 1992), twee bogen met een bronzen torso ervoor, die de samenvloeiing van Gulp en Geul verbeelden. Staat bij de Gulp tegenover Café Neubourg.
- **Hubertusmarkt**: de weetjes (sinds 1544, Hubertusmis in de Sint-Petruskerk, paardenzegening bij het gemeentehuis, zo'n 150 kramen met onder andere gerookte paling) komen uit aankondigingen van de 482e editie in 2026. De Razende Reporter is een verzonnen figuur. De cafés zijn echte zaken rond de Markt; hun gevels en de stamgasten zijn verzonnen.
- **Het verdwenen armenfonds**: gaat over Joep Haffmans (1943-2007), deken van Gulpen van 1984 tot 2006. De missie gebruikt alleen wat in de berichtgeving stond (L1, Wikipedia, het boek *In Gods naam*): bijna 2 miljoen euro uit de armenkas, dure auto's, dure vakanties en buitenlandse rekeningen. In de game wordt gezegd dat het nooit bewezen is, omdat hij overleed voordat het voor de rechter kwam. De voorwerpen (koffer, bankafschrift, briefje, gouden auto) en de grappen zijn verzonnen.
- **Gevels**: de borden, luifels en etalages van de zaken zijn verzonnen in een passende stijl, niet nagemaakt van de echte gevels. Met foto's kan dit realistischer.

## Techniek

Vite + Three.js, geen game-engine.
- Gebouwen krijgen in een shader baksteen, mergelblokken, pleisterwerk, kozijnen met roeden, deuren en dakpannen. 's Avonds gaan ramen branden.
- Wegen, stoepen (met stoepranden), fietspaden, parkeervakken en water zijn losse meshes uit de BGT-vlakken die het terrein volgen, met herhalende textures.
- Omgevingsreflecties uit de lucht (auto's, ramen, water) en op de computer een lichte gloed (bloom), vooral 's avonds.
- Etalages met een kijkje naar binnen: de ruiten van winkels, cafés en restaurants tonen een kamer erachter (achterwand, zijmuren, vloer, plafond, toonbank en mensen) die meeschuift als je langsloopt (interior mapping, zonder uitbouw). De inrichting hoort bij de zaak: brood bij de bakker, worsten bij de slager, brillen bij de opticien, een bar bij de cafés. 's Avonds brandt er licht.
- Bewoonde huizen: dichtbij zie je achter de ramen van woonhuizen een kamer (muren, houten vloer, lamp, schilderij, kast, soms een plant), overdag gedempt en 's avonds warm verlicht. Dit zit in de shader van de gebouwen zelf, dus zonder extra objecten.
- Leven op straat: hondenuitlaters (met lijn), mensen met boodschappentassen, ouders met een kind, fietsers op de weg en mensen op bankjes. Wie ver weg loopt, verhuist naar een straat in jouw buurt, zodat het rond jou levendig blijft zonder extra poppetjes.
- Straatmeubilair op logische plekken: bankjes en fietsenrekken met de rug of lange kant tegen de gevel of van de rijbaan af, afvalbakken naast bankjes, fietsen in de rekken en bloembakken op de Markt.
- Begroeiing: struiken, hagen langs voortuinen, graspollen en bloemen in bermen en grasvelden, per vak getekend en alleen in de buurt van de camera.
- Omgevingsgeluid: geroezemoes en klinkende glazen op de Markt, kabbelend water bij de Gulp, meer vogels in het groen, krekels 's avonds en kerkklokken op het hele uur.
- Automatische beeldkwaliteit: op een groot of scherp scherm rekent het spel niet met meer pixels dan nodig. Hapert het toch (minder dan ongeveer 48 beelden per seconde), dan zakt de resolutie stapsgewijs en als laatste gaat de gloed uit; loopt het weer soepel, dan wordt het beeld vanzelf weer scherper. De controle op een zwart beeld draait één keer per 10 seconden, omdat die de videokaart even laat wachten.
- Bomen staan per vak van 200 m: dichtbij echte boommodellen (ez-tree) die zacht wiegen, veraf eenvoudige bomen. Geparkeerde auto's zijn gebundeld, zodat het ook op telefoons draait.
- Poppetjes zijn in code gebouwd: één vloeiend model met een skelet (heupen, knieën, ellebogen, nek), gezicht, haar, kleding en hoedjes, met animaties voor lopen, rennen, fietsen, zitten, zwaaien, eten en drinken die zacht in elkaar overlopen.
- Groen, akkers en daken krijgen hun kleur van de echte luchtfoto. Langs muren ligt een vooraf berekende zachte schaduw. Wolken drijven door de lucht en op de computer zorgt een kleurcorrectie met vignet voor een warmere sfeer.
