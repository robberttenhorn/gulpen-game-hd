# Verslag HD-proefversie Locals: Gulpen

> Dit verslag wordt per stap bijgewerkt en meegepusht. Alles wat hier staat is echt gedaan en gemeten.

## Samenvatting

De game is in één nacht een flink stuk filmischer geworden, zonder dat de gameplay is veranderd. Alles staat op `main` en dus online.

**Wat er nu anders is**
- **Lucht en licht**: een gefotografeerde lucht (blauw met stapelwolken overdag, sterren en Melkweg 's nachts) die ook het hemellicht en de reflecties levert; fellere zon met koele schaduwen; een grote, stabiele schaduwkaart; luchtperspectief en hoogtemist.
- **Nabewerking**: ambient occlusion, zonnestralen, scherptediepte in gesprekken, bloom, filmische tone mapping, kleurcorrectie, vignet en korrel.
- **Avond**: lantaarns langs alle straten die echt licht geven, zachte lichtkegels, etalages die de stoep verlichten, en een natte straat waarin elke lantaarn spiegelt.
- **Wereld**: gras dat je ziet staan, bladerige hagen en struiken, water met fijne rimpels, dakranden met overstek en goot, schoorstenen, ramen die terugliggen in de muur, en rustig asfalt zonder steeds dezelfde scheuren.
- **Poppetjes**: nieuw lichaam, en lopen, joggen, rennen en zitten uit echte motion capture (CMU).
- **Auto's**: ronde carrosserie, glas met interieur, draaiende wielen, lampen, kentekens.
- **Drie kwaliteitsstanden** (hoog, midden, laag), te kiezen op het startscherm, met een automatische regeling die verder afschaalt als het hapert.

**Wat je moet weten**
- **De echte beeldsnelheid is niet gemeten.** De testomgeving heeft geen videokaart. In softwareweergave kost een beeld op computerformaat nu 9,5 s (was 6,8 s) en op telefoonformaat 4,1 s (was 4,2 s). Of de stand hoog op een gewone laptop 30 beelden per seconde haalt, moet je op een echt apparaat nakijken; hapert het, dan schaalt het spel zelf af.
- **Alle 51 missies starten en stoppen zonder fouten** in de rooktest (`tools/hd-missies.cjs`), ook met getekend beeld. De test speelt missies niet uit.
- **De gepubliceerde site zelf heb ik niet kunnen openen**: `github.io` is vanuit de testomgeving geblokkeerd. De publicatie-workflow is na elke push geslaagd en precies dezelfde build is lokaal getest, maar kijk zelf even of https://robberttenhorn.github.io/gulpen-game-hd/ goed start.
- **Niet gedaan**: WebGPU (bewust, zie Keuzes vooraf), echte kozijnen en deuren aan de gevels, een fijner hoogtemodel, het MakeHuman-model. Het budget van 150 tot 250 MB is niet gebruikt: de site is ongeveer 37 MB.
- **Eén bestaande fout hersteld**: de Bierfeesten-missie liep vast in deze kopie. En één eigen fout gevonden en hersteld: na de nacht bleef de straat nat (zie stap 5).

Bronnen en licenties: [`BRONNEN.md`](BRONNEN.md). Beelden voor en na: [`voor/`](voor) en [`na/`](na), en per stap hieronder.

## Plan

Volgorde: van het meeste visuele effect naar het minste. Elke stap wordt gebouwd, getest, bekeken en gepusht.

1. **Nulmeting**: screenshots van de bestaande game in `docs/hd/voor/` en een meting.
2. **Kwaliteitsstanden**: `hoog` (computer), `midden` en `laag` (telefoon), gekoppeld aan de bestaande automatische regeling (`adaptQuality`).
3. **Lucht, licht en atmosfeer**: fotografische lucht (HDRI van Poly Haven) voor dag en nacht, die ook het hemellicht en de reflecties levert; zon en schaduw opnieuw afgesteld; grotere, stabiele schaduwkaart; hoogtemist en luchtperspectief.
4. **Nabewerking**: eigen keten met ambient occlusion, zonnestralen, scherptediepte in gesprekken, bloom, filmische tone mapping, kleurcorrectie, vignet en korrel.
5. **Materialen van de wereld**: wegen en stoepen (fijnere fototexturen, natte plekken met reflectie), water, gras en akkers, gevels en daken.
6. **Begroeiing**: gras dat je echt ziet staan, vollere bomen en hagen, licht door het blad.
7. **Poppetjes**: realistischer lichaam en bewegingen uit echte motion capture (Carnegie Mellon University).
8. **Auto's**: carrosserie met rondingen, glas met interieur, wielen, lampen.
9. **Straatmeubilair en details**: lantaarns met lichtkegels, gloed van ramen, kleine dingen in het dorp.
10. **Afronding**: missies nalopen, beeldsnelheid, README, bronnenlijst, dit verslag.

## Keuzes vooraf

- **WebGL blijft de hoofdroute, geen WebGPU.** De hele game hangt aan eigen GLSL-shaders die in de materialen van three.js zijn ingebouwd (gevels met ramen en kamers, terrein met luchtfoto, randlicht en mist in `lighting.js`, bomen, water). De WebGPU-renderer van three.js gebruikt een ander shadersysteem (TSL); overstappen betekent al die shaders opnieuw schrijven en opnieuw testen, zonder dat het beeld er op zichzelf mooier van wordt. In één nacht, zonder videokaart om WebGPU op te testen, is dat een te groot risico voor een game met ruim 50 missies. Alle verbeteringen hieronder werken op WebGL 2, dat op elke computer en telefoon draait.
- **Testen zonder videokaart.** De testomgeving heeft geen videokaart: Chromium tekent met software (SwiftShader). Eén beeld kost daar 4 tot 7 seconden. Gemeten tijden per beeld zijn dus alleen bruikbaar om versies met elkaar te vergelijken, niet als beeldsnelheid op een echte laptop of telefoon. Zie het hoofdstuk Beeldsnelheid.

## Stap 0: nulmeting

Screenshots van de bestaande game staan in `docs/hd/voor/` (computerformaat 1280x720, telefoonformaat 844x390 met pixelverhouding 2, telkens overdag en 's avonds). Gemaakt met `tools/hd-shots.cjs`, dat vaste standpunten gebruikt zodat elke stap precies hetzelfde beeld opnieuw kan maken.

Meting van de bestaande game (softwareweergave, zie Keuzes vooraf): computer 6,8 s per beeld, 3,6 miljoen driehoeken en 823 tekenopdrachten per beeld; telefoon 4,2 s per beeld, 2,9 miljoen driehoeken en 599 tekenopdrachten.

Er is ook een test die alle missies kort naloopt (`tools/hd-missies.cjs`): naar de persoon toe, het gesprek door, wachten tot het minispel of de opdracht begint, wat invoer geven en dan stoppen. Die test vond meteen een bestaande fout: de Gulpener Bierfeesten liepen vast op `hideTrees`, een functie die in deze kopie niet bestond. Die is toegevoegd in `src/world.js` (bomen rond het podium tijdelijk weghalen), en de missie werkt weer.

## Stap 1: kwaliteitsstanden, fotografische lucht, licht, atmosfeer en nabewerking

**Wat**
- `src/quality.js`: drie standen. `hoog` op de computer, `laag` op de telefoon, `midden` ertussenin. Kiezen kan met `?kwaliteit=hoog|midden|laag` (wordt onthouden, `?kwaliteit=auto` zet het terug). De automatische regeling (`adaptQuality`) schakelt nu stap voor stap af: eerst scherptediepte en zonnestralen, dan minder pixels, dan ambient occlusion, dan nog minder pixels, en pas als laatste de hele nabewerking.
- `src/sky.js` en `tools/fetch-hdri.py`: de lucht is nu een echte foto (HDRI van Poly Haven, CC0): overdag blauw met stapelwolken, 's nachts een sterrenhemel met de Melkweg. De koepel draait mee zodat de zon op de foto staat waar de zon in het spel staat. Dezelfde lucht levert het hemellicht en de reflecties in ramen, lak en water. Eerst laadt een lichte versie (2048 breed), op de computer daarna de fijne (4096 breed).
- Licht (`applyTime` in `src/main.js`): de zon is feller ten opzichte van het opvullicht (meer contrast tussen zon en schaduw), het opvullicht komt nu grotendeels van de echte lucht. De schaduwkaart is op de computer 4096 pixels over 170 meter (was 2048 over 120 meter), ligt vóór de speler in de kijkrichting en klikt vast op zijn eigen raster, zodat schaduwranden niet trillen als je loopt.
- Atmosfeer (`src/lighting.js`): de grijze mistwand is vervangen door luchtperspectief (verder weg trekt alles naar de kleur van de horizon) en hoogtemist (in het dal van de Gulp hangt meer nevel dan op de heuvels). De mistkleur komt van de horizon op de luchtfoto, dus het landschap loopt naadloos over in de lucht.
- Nabewerking (`src/post.js`): een eigen keten in plaats van de standaardketen van three.js, omdat de effecten de diepte van het beeld nodig hebben. Ambient occlusion uit de diepte (zachte schaduw in hoeken, onder auto's, langs stoepranden), zonnestralen als je richting de zon kijkt, scherptediepte tijdens gesprekken (de achtergrond wordt zacht), bloom, filmische tone mapping (ACES), kleurcorrectie met koele schaduwen en warme lichten, vignet, een beetje filmkorrel en een lichte kleurschifting aan de randen. Naambordjes worden na de nabewerking getekend, zodat ze scherp blijven.

**Waarom**: lucht, licht en nabewerking bepalen het hele beeld; al het andere (materialen, begroeiing, auto's) ziet er pas goed uit als dit klopt.

**Voor en na** (links de bestaande game, rechts na deze stap)

| | Voor | Na |
| --- | --- | --- |
| Rijksweg, dag | ![](voor/computer-dag-rijksweg.jpg) | ![](stap1/computer-dag-rijksweg.jpg) |
| Markt, dag | ![](voor/computer-dag-markt.jpg) | ![](stap1/computer-dag-markt.jpg) |
| Ringweg 38, dag | ![](voor/computer-dag-tuin38.jpg) | ![](stap1/computer-dag-tuin38.jpg) |
| Rijksweg, avond | ![](voor/computer-avond-rijksweg.jpg) | ![](stap1/computer-avond-rijksweg.jpg) |
| Markt, telefoon | ![](voor/telefoon-dag-markt.jpg) | ![](stap1/telefoon-dag-markt.jpg) |

**Meting** (softwareweergave): computer 7,6 s per beeld (was 6,8; tijdens deze meting draaiden er andere zware processen mee), telefoon 4,6 s (was 4,2). De telefoonstand heeft geen nabewerking; het verschil daar is ruis van de meting.

**Geprobeerd en aangepast**
- Tone mapping AgX in plaats van ACES: gaf een flets, grijzig beeld. Teruggezet naar ACES met een eigen kleurcorrectie erachter.
- De eerste lucht (Kloofendal 38d, half bewolkt met sluierwolken) had precies de goede zonnestand maar oogde grijs. Vervangen door Kloofendal 48d (blauw met stapelwolken). Daar staat de zon 10 graden hoger dan in het spel; in plaats van de zon in het spel hoger te zetten (dan worden de schaduwen korter en verdwijnt het lage, warme licht) wordt de foto in de hoogte iets opgerekt, zodat de zon op de foto op 37 graden staat.
- De eerste nachtinstelling was melkachtig (te veel bloom en mist die oplichtte richting de maan). Bloom en mist zijn 's nachts teruggeschroefd.

## Stap 2: de avond (lantaarns die echt licht geven) en de poppetjes

**Lantaarns en avondlicht**
- De kaartdata (BGT) bevat voor heel Gulpen maar 40 lantaarns; de meeste straten waren 's avonds dus donker. `streetLamps()` in `src/world.js` zet er langs alle straten bij: om de 30 meter, om en om links en rechts, net naast de rijbaan, nooit vlak bij een bestaande lantaarn en niet pal voor de camera op het startpunt.
- De lantaarns geven nu echt licht op straat, gevels, auto's en mensen, zonder honderden echte lampen (dat kan een browser niet aan). De truc (`bakeLamps()` in `src/world.js`, shader in `src/lighting.js`): één kaart van het dorp met per vakje van 2 meter de lichtbron die daar het meeste licht geeft. Elk materiaal leest één vakje en rekent het licht van die ene lamp precies uit (afstand, richting, kegel naar beneden). Etalages zijn ook lichtbronnen en verlichten de stoep ervoor.
- Onder elke lantaarn hangt een zachte lichtkegel in de avondnevel. De oude platte lichtvlek op de grond is er alleen nog op de telefoon.
- Stoepranden en wegmarkering kregen geen zon- of lantaarnlicht: three.js keerde hun normaal om omdat ze van twee kanten getekend worden. Dat is hersteld (ook overdag zijn stoepranden nu licht aan de zonkant). Dezelfde reparatie bij het blad van de bomen: de bestaande aanpassing daarvoor deed in de praktijk niets, omdat het stukje shader op dat moment nog niet was ingevoegd.

| | Voor | Na |
| --- | --- | --- |
| Rijksweg, avond | ![](voor/computer-avond-rijksweg.jpg) | ![](stap2/computer-avond-rijksweg.jpg) |
| Markt, avond | ![](voor/computer-avond-markt.jpg) | ![](stap2/computer-avond-markt.jpg) |

Geprobeerd en aangepast: de eerste lichtkegels waren harde, goed zichtbare 'feesthoedjes'. Ze hebben nu een eigen shader die uitdooft naar de rand. De eerste versie van de lichtkaart koos per vakje de dichtstbijzijnde lamp; dat gaf een zichtbare sprong op de grens tussen een etalage en een lantaarn. Nu wint de lamp die daar het meeste licht geeft, en is de overgang onzichtbaar.

**Poppetjes** (gemaakt door een hulpagent in een eigen werkkopie, daarna samengevoegd; details in `docs/hd/poppetjes/NOTITIES.md`)
- Lopen, joggen, rennen en zitten komen nu uit echte motion capture van Carnegie Mellon University (opnamen 35_01, 35_17, 09_01 en 14_31), omgerekend naar het eigen skelet met `tools/bake-mocap.mjs`. De stap loopt mee met de afgelegde afstand, zodat voeten bij loopsnelheid niet meer schuiven (gemeten op de testpagina: 0,04 m/s bij 1,3 m/s; de oude versie gaf 1,9 tot 3 m/s).
- Nieuw lichaam: borstkas, taille, bekken, kuiten, hals, kaaklijn, oren, neus, ogen met oogleden, handen met vingers en duim, schoenen met zool, kleding met boord en zomen. 5768 driehoeken per poppetje op de computer (was 3662), op de telefoon 3662.
- Fietsen zit niet in de CMU-data en is berekend gebleven, maar nu met het bekken op het zadel, voeten op meedraaiende trappers en handen aan het stuur.
- Niet opgelost: bij volle sprint (6,5 m/s) schuift de standvoet nog, omdat de snelste opname 3,6 m/s is. Op bankjes hangen de voeten ongeveer 7 cm boven de grond. Het MakeHuman-basismodel is niet geprobeerd.

| | Voor | Na |
| --- | --- | --- |
| Lopen | ![](poppetjes/voor-lopen.jpg) | ![](poppetjes/na-lopen.jpg) |
| Rij | ![](poppetjes/voor-rij-schuin.jpg) | ![](poppetjes/na-rij-schuin.jpg) |

**Hagen en struiken**: een kern met daaromheen dunne schillen met losse blaadjes (uitgeknipt met een bladtextuur die in code wordt gemaakt). Dat geeft een bladerige, rafelige rand in plaats van een strak blok, en kost minder driehoeken dan de oude hagen (48 in plaats van 244 per stuk).

![](stap2/computer-dag-tuin38.jpg)

**Test**: alle 51 missies nagelopen met `tools/hd-missies.cjs`: geen fouten.

## Stap 3: gras, auto's, water en de natte avondstraat

**Gras** (`src/grass.js`)
- Rond de speler staan nu echte grassprieten, in twee ringen: dichtbij fijne sprieten (elke 17 cm een polletje, tot 10 meter), verderop grovere pollen tot 30 meter. Samen ongeveer 38.000 polletjes van vijf sprieten.
- De videokaart plaatst ze zelf: de plek volgt uit een vast raster in de wereld (het gras staat dus stil als je loopt), de hoogte uit de hoogtekaart, de vraag "is hier gras?" uit een graskaart (BGT-vlakken gras, berm en oever, zonder gebouwen en zonder de nagebouwde tuin van Ringweg 38), en de kleur uit de luchtfoto. Elke spriet heeft daardoor de kleur van de grond eronder, en het veld loopt verderop naadloos over in de luchtfoto.
- Het gras wuift in de wind en krijgt hetzelfde licht als de rest (zon, schaduw, lantaarns, mist).
- Alleen in de standen `hoog` (beide ringen) en `midden` (alleen de dichte ring). Op de telefoon geen gras.

| Voor | Na |
| --- | --- |
| ![](voor/computer-gouden-uur-gulperberg.jpg) | ![](stap3/computer-dag-gras.jpg) |

(De linkerfoto is een ander standpunt uit de nulmeting, om te laten zien hoe gras er eerst uitzag: een vlakke luchtfoto.)

Geprobeerd en aangepast: de eerste versie had te weinig en te donkere sprieten op een lichte ondergrond; dat oogde als losse stekels. Nu staan ze dichter, gebruikt het gras hetzelfde soort materiaal als het terrein (zodat het ook het hemellicht krijgt) en is de grond eronder iets donkerder gemaakt.

**Auto's** (gemaakt door een hulpagent in een eigen werkkopie, daarna samengevoegd; details en aantallen in `docs/hd/autos/NOTITIES.md`)
- Carrosserie als een reeks dwarsdoorsneden met vloeiende vormen (bolle neus en kont, schouders, echte wielkasten, naden, spiegels, deurgrepen), per type eigen verhoudingen. Maten voor botsingen en parkeren zijn gelijk gebleven.
- Doorzichtig getint glas met een interieur (stoelen, dashboard, stuur); verkeer heeft een bestuurder.
- Wielen draaien en sturen bij rijdende auto's. Remlichten, achteruitrijlicht, knipperlicht in bochten, en 's avonds koplampen met een lichtvlek op de weg en verlichte kentekens (verzonnen).
- De Volvo XC40 heeft zijn kenmerken behouden (zwart dak, knik in de ruitlijn, hamerkoplampen, turbinevelgen).
- Drie detailniveaus: een losse auto 18.000 tot 20.000 driehoeken, geparkeerd dichtbij 6.600 tot 7.500, ver weg en op de telefoon 1.700 tot 1.850.
- De spiegeling in lak en glas was afgesteld op de oude, zwakke omgeving; die is teruggezet nu de echte lucht het werk doet.
- Niet af: de XC40 gebruikt de algemene SUV-vorm met eigen maten en onderdelen; de wissel tussen het verre model (ondoorzichtig glas) en het nabije is zichtbaar als je erop let.

| Voor | Na |
| --- | --- |
| ![](voor/computer-dag-auto.jpg) | ![](stap3/computer-dag-auto.jpg) |

**Water** (`src/hardscape.js`): het water had grote, striperige golven. Nu is het donker en helder, spiegelt het de lucht (sterker naarmate je er vlakker overheen kijkt) en heeft het twee lagen fijne rimpels in wereldmaten die tegen elkaar in schuiven.

| Voor | Na |
| --- | --- |
| ![](stap1/computer-dag-gulp.jpg) | ![](stap3/computer-dag-gulp.jpg) |

**Natte avondstraat** (`wetSurface` in `src/hardscape.js`): 's avonds is de straat nat, alsof het net geregend heeft. Het wegdek is donkerder en glanst, in de plassen spiegelt de lucht, en elke lantaarn krijgt een lichtveeg op het natte wegdek. Die veeg is een echte spiegeling: voor elk punt op de weg rekent de shader uit welke lantaarn daar in de spiegel zou staan, met dezelfde lichtkaart als het lantaarnlicht. Overdag is de straat droog.

![](stap3/computer-avond-rijksweg.jpg)

**Kleinere dingen**: de bolle kruinen en struiken in de tuin van Ringweg 38 hebben een bladmateriaal gekregen in plaats van kale vlakjes; het glas van de huizen is gladder, zodat de lucht erin spiegelt; boomblad heeft zachtere randen.

## Stap 4: dakranden, keuze van de beeldkwaliteit en de telefoon

- **Dakranden** (`buildRoofTrim` in `src/world.js`): de daken uit de 3D BAG eindigen precies op de gevel, waardoor huizen op dozen leken. Elke vrije rand van een dak krijgt nu een overstek van 28 cm met een boeibord eronder: langs de dakvoet een zinken goot, langs de schuine kanten een lichte windveer, bij platte daken een daktrim. Het overstek werpt een echte schaduw op de gevel. De randen worden bij het laden uit de dakvlakken zelf afgeleid (randen die maar bij één dakvlak horen), dus het werkt voor alle 1.872 panden zonder extra data (samen ongeveer 208.000 driehoeken).
- **Beeldkwaliteit kiezen**: op het startscherm staan de knoppen Hoog, Midden en Laag.
- **Automatische regeling**: in de stand hoog wordt pas afgeschaald onder ongeveer 27 beelden per seconde (30 is daar goed genoeg), en er is een extra stap bijgekomen (het verre gras weg en een kleinere schaduwkaart) vóórdat de resolutie verder zakt.
- **Telefoon**: de lucht ging daar zonder tone mapping naar het scherm en was daardoor te donker; dat is hersteld. Omdat de lantaarns op de telefoon geen licht geven, is het maanlicht daar sterker gezet.

| Voor (stap 1) | Na |
| --- | --- |
| ![](stap1/computer-dag-tuin38.jpg) | ![](stap4/computer-dag-tuin38.jpg) |

## Stap 5: ramen met diepte, rustig asfalt en een herstelde fout

- **Ramen liggen terug in de muur** (gevelshader in `src/world.js`). De ramen waren op een vlakke muur getekend. Nu rekent de shader van dichtbij (tot ongeveer 50 meter) uit waar je kijklijn het raam raakt dat 11 cm terugligt: je ziet de zijkant van de muur (de negge), de onderkant van de latei is donker, en het raam verschuift ten opzichte van de muur als je erlangs loopt. Het is dezelfde techniek als de kamers achter het glas, dus het kost geen extra geometrie.
- **Asfalt**: de oude textuur had grote scheuren die zich om de drie meter herhaalden. Vervangen door een schone, fijnkorrelige asfalttextuur (Poly Haven, `clean_asphalt`), met in de shader grote slijtagevlekken eroverheen zodat een lange straat geen egaal vlak is.
- **Fout gevonden en hersteld**: na een nacht bleef de straat overdag nat, en lantaarns konden blijven branden of juist uit blijven. Oorzaak: three.js maakt van elke texture in zijn standaardmaterialen een kopie per materiaal, en mijn gedeelde lichtkaart (lampen aan, straat nat) werd dus ook gekopieerd; een wijziging kwam alleen door als er toevallig een nieuw materiaal in beeld kwam. In de eerdere tests viel dat niet op omdat daar steeds iets nieuws werd getekend. De twee gedeelde textures geven nu zichzelf terug als er om een kopie wordt gevraagd. Gecontroleerd met een opname overdag, na heen en weer schakelen naar de nacht.

| Voor (stap 1) | Na |
| --- | --- |
| ![](stap1/computer-dag-rijksweg.jpg) | ![](stap5/computer-dag-rijksweg.jpg) |

Ramen van dichtbij (uitsnede uit hetzelfde beeld, links de rechtergevel, rechts de linkergevel):

![](stap5/ramen-dichtbij.jpg)

- **Schoorstenen** (`buildChimneys` in `src/world.js`): op ongeveer zeven van de tien gewone huizen met een schuin dak staat nu een gemetselde schoorsteen met een pot, bij de nok en recht met het huis mee. De plek volgt uit het dak zelf (het hoogste punt boven het pand, een stukje naar het midden). Ze zijn toegevoegd ná de eindbeelden in `na/`; daar staan ze dus nog niet op. Ze zijn zo klein dat de meting er niet merkbaar door verandert (ze zijn daarna niet opnieuw gemeten).

![](stap5/computer-dag-woonwijk.jpg)

Geprobeerd en aangepast: in de eerste versie schoof het raam de verkeerde kant op (je zag de voorste negge in plaats van de achterste). De richting waarin de gevelmaat loopt verschilt per muur; de shader leidt die nu af uit het beeld zelf.

## Eindresultaat

Alle eindbeelden staan in `docs/hd/na/` (zelfde standpunten als `docs/hd/voor/`).

| | Voor | Na |
| --- | --- | --- |
| Markt, dag | ![](voor/computer-dag-markt.jpg) | ![](na/computer-dag-markt.jpg) |
| Rijksweg, dag | ![](voor/computer-dag-rijksweg.jpg) | ![](na/computer-dag-rijksweg.jpg) |
| Looierstraat, dag | ![](voor/computer-dag-looierstraat.jpg) | ![](na/computer-dag-looierstraat.jpg) |
| Bij de kerk, dag | ![](voor/computer-dag-kerk.jpg) | ![](na/computer-dag-kerk.jpg) |
| Ringweg 38, dag | ![](voor/computer-dag-tuin38.jpg) | ![](na/computer-dag-tuin38.jpg) |
| Water, dag | ![](voor/computer-dag-gulp.jpg) | ![](na/computer-dag-gulp.jpg) |
| Gulperberg, dag | ![](voor/computer-dag-gulperberg.jpg) | ![](na/computer-dag-gulperberg.jpg) |
| Woonwijk, dag | ![](voor/computer-dag-woonwijk.jpg) | ![](na/computer-dag-woonwijk.jpg) |
| Volvo XC40, dag | ![](voor/computer-dag-auto.jpg) | ![](na/computer-dag-auto.jpg) |
| Markt, avond | ![](voor/computer-avond-markt.jpg) | ![](na/computer-avond-markt.jpg) |
| Rijksweg, avond | ![](voor/computer-avond-rijksweg.jpg) | ![](na/computer-avond-rijksweg.jpg) |
| Looierstraat, avond | ![](voor/computer-avond-looierstraat.jpg) | ![](na/computer-avond-looierstraat.jpg) |
| Bij de kerk, avond | ![](voor/computer-avond-kerk.jpg) | ![](na/computer-avond-kerk.jpg) |
| Markt, telefoon, dag | ![](voor/telefoon-dag-markt.jpg) | ![](na/telefoon-dag-markt.jpg) |
| Rijksweg, telefoon, dag | ![](voor/telefoon-dag-rijksweg.jpg) | ![](na/telefoon-dag-rijksweg.jpg) |
| Markt, telefoon, avond | ![](voor/telefoon-avond-markt.jpg) | ![](na/telefoon-avond-markt.jpg) |

De beelden met 'gouden-uur' in de naam (18.36 uur) zijn alleen ter controle gemaakt: de zon is dan in het spel al onder, dus ze zien eruit als de avond. In het spel zelf komt dat tijdstip niet voor (het is 9 uur, 15 uur of avond). Een echt gouden uur met lage zon bestaat dus nog niet; dat staat bij het vervolg.

## Beeldsnelheid

**Wat ik niet heb kunnen meten: de echte beeldsnelheid.** De testomgeving heeft geen videokaart. Chromium tekent daar met software (SwiftShader) en doet seconden over één beeld. De getallen hieronder zeggen dus alleen hoeveel zwaarder of lichter een beeld is geworden ten opzichte van de nulmeting, niet hoeveel beelden per seconde een laptop of telefoon haalt. Dat moet op echte apparaten worden nagekeken.

Gemeten op de Markt, overdag, kleinste van drie metingen, zonder andere processen (`docs/hd/voor/meting.json` en `docs/hd/na/meting.json`):

| | Voor | Na |
| --- | --- | --- |
| Computer (1280x720, stand hoog): tijd per beeld | 6,8 s | 9,5 s |
| Computer: driehoeken per beeld | 3,6 miljoen (zonder schaduwkaart geteld) | 6,7 miljoen (alle stappen samen, met schaduwkaart) |
| Computer: tekenopdrachten per beeld | 823 (zonder schaduwkaart geteld) | 1088 (alle stappen samen) |
| Telefoon (844x390 bij pixelverhouding 2, stand laag): tijd per beeld | 4,2 s | 4,1 s |
| Telefoon: driehoeken per beeld | 2,9 miljoen | 3,5 miljoen (alle stappen samen) |
| Telefoon: tekenopdrachten per beeld | 599 | 822 (alle stappen samen) |

De telling van driehoeken is tussentijds verbeterd: in de nulmeting telde het script alleen de laatste tekenstap, nu het hele beeld inclusief de schaduwkaart. De getallen voor en na zijn daardoor niet één op één te vergelijken; de tijd per beeld wel.

Wat dit betekent:
- De telefoonstand is ongeveer even zwaar als de oorspronkelijke game. Daar komt wel bij: nieuwe poppetjes (zelfde aantal driehoeken als voorheen op de telefoon), lichtere hagen, extra lantaarnpalen en de nieuwe auto's in hun lichtste vorm.
- De computerstand is in software ongeveer 39 procent zwaarder per beeld. Het zwaarst wegen het gras (ongeveer 0,6 miljoen driehoeken), de schaduwkaart van 4096 pixels en de nabewerking. Software rekent heel anders dan een videokaart (driehoeken zijn daar relatief goedkoop, pixels duur), dus dit percentage zegt weinig over een echte laptop.
- Vangnet: hapert het op een echt apparaat, dan schakelt `adaptQuality` stap voor stap af (zie stap 1 en 4), en met de knoppen op het startscherm kan iemand zelf een lichtere stand kiezen.
- Het laden duurt in software merkbaar langer dan voorheen, vooral door het compileren van de extra shaders. Op een echte videokaart is dat naar verwachting een kwestie van seconden, maar ook dat is niet gemeten.

## Geprobeerd en teruggedraaid of aangepast (alles bij elkaar)

- **AgX-tone mapping**: flets en grijzig. Terug naar ACES met eigen kleurcorrectie.
- **Lucht Kloofendal 38d**: goede zonnestand, maar grijs. Vervangen door Kloofendal 48d, in de hoogte opgerekt zodat de zon op 37 graden blijft.
- **Misty-morning-lucht voor de ochtend**: opgehaald en bekeken, maar vlak en saai; niet gebruikt. De ochtend gebruikt dezelfde daglucht, gedraaid naar de ochtendzon.
- **Eerste nachtinstelling**: melkachtig door bloom en oplichtende mist. Teruggeschroefd.
- **Lichtkegels als gewone doorzichtige kegels**: harde 'feesthoedjes'. Vervangen door een shader die uitdooft naar de rand.
- **Lichtkaart met de dichtstbijzijnde lamp per vakje**: zichtbare sprong tussen etalage en lantaarn. Nu wint de lamp met het meeste licht.
- **Eerste gras**: te dun en te donker op een lichte grond. Dichter gemaakt, zelfde materiaal als het terrein, grond eronder donkerder; daarna nog bijgestuurd omdat het gras op lichte plekken van de luchtfoto vaalwit werd.
- **Hagen met alleen een vlak bladpatroon**: nog steeds een blok. Schillen met losse blaadjes erbij.
- **Kleurschifting aan de beeldranden**: eerst te sterk (gekleurde randen om bomen), teruggebracht tot nauwelijks zichtbaar.
- **Plassen op de natte straat**: eerst te groot en te licht; kleiner gemaakt.
- **Lantaarn pal voor de camera op het startpunt**: weggehaald (geen nieuwe lantaarns binnen 12 meter van het startpunt).

## Keuzes waar je misschien iets van vindt

1. **Geen WebGPU.** Zie Keuzes vooraf. Alles draait op WebGL 2.
2. **De opdracht noemde 150 tot 250 MB; de hele site is ongeveer 37 MB.** Ik heb het budget niet opgemaakt. De winst zat in licht, lucht, schaduw, nabewerking en geometrie die in code wordt gemaakt, niet in zwaardere bestanden. Grotere texturen (2K of 4K voor gevels en wegen) had ik kunnen ophalen, maar zonder videokaart kan ik niet nagaan wat dat met het geheugen en de laadtijd doet, en van dichtbij zijn de huidige texturen (1024 pixels per 1 tot 3 meter) al scherp. Het stapsgewijs laden (eerst licht, dan fijn) is wel gebouwd voor de lucht.
3. **De zon staat nog op 37 graden** (zoals jij hem had gezet), terwijl de zon op de luchtfoto op 48 graden staat. De foto wordt in de hoogte opgerekt om dat gelijk te trekken.
4. **'s Avonds is de straat altijd nat.** Dat geeft het filmische avondbeeld met spiegelende lantaarns. Overdag is het droog. Het is één getal in `applyTime` (`world.wet`) als je het anders wilt.
5. **Er staan nu lantaarns langs alle straten** (960 in totaal, waarvan 40 uit de kaartdata). Ze staan op berekende plekken, niet op de echte plekken in Gulpen. Je kunt er niet tegenaan botsen (dat kon bij de bestaande lantaarns ook niet).
6. **Scherptediepte tijdens gesprekken**: de achtergrond wordt zacht zodra er een gesprekvenster open is (niet in minispellen en niet bij de introductie).
7. **Naambordjes worden na de nabewerking getekend** en zijn dus niet meer meegekleurd met het beeld. Ze zijn zo altijd scherp, maar 's nachts ogen ze iets lichter dan voorheen.
8. **Dakranden en schoorstenen zijn berekend**, niet opgemeten: elk dak steekt even ver uit, en of een huis een schoorsteen heeft is willekeurig gekozen. Waar een dak tegen een hogere muur aanloopt, zit de rand soms deels in die muur.
9. **De speler jogt** bij normale snelheid (4 m/s is hardlooptempo); wandelen zie je bij voetgangers. De snelheden zelf zijn niet veranderd.
10. **Poppetjes buiten beeld worden niet meer getekend** (ze hadden dat eerst uit staan). Mocht er ergens een poppetje onterecht verdwijnen, dan zit het in `src/character.js` (de omhullende bol).
11. **De Bierfeesten-missie liep vast** op een ontbrekende functie (`hideTrees`) in deze kopie. Die heb ik toegevoegd. Controleer of het origineel dezelfde fout heeft.
12. **Twee hulpagents** hebben de poppetjes en de auto's gemaakt, elk in een eigen werkkopie; ik heb hun werk bekeken, samengevoegd en opnieuw getest. Hun notities staan in `docs/hd/poppetjes/NOTITIES.md` en `docs/hd/autos/NOTITIES.md`.
13. **De missietest is een rooktest.** Hij start elke missie, loopt het gesprek door tot het minispel of de opdracht begint, geeft wat invoer en stopt. Hij speelt missies niet uit. Laatste runs: met per missie een echt getekend beeld (op de versie vóór de schoorstenen) 51 van 51 zonder fouten, en zonder beeld op de eindversie ook 51 van 51.
14. **Er is direct naar `main` gepusht**, zoals gevraagd; dezelfde commits staan ook op de branch `claude/modest-einstein-59p2fn`.

## Wat er nog beter kan (vervolg)

- **Eerst: testen op een echte laptop en telefoon.** Beeldsnelheid meten, de drempels van `adaptQuality` afstellen, en kijken of de stand hoog op een gewone laptop de 30 beelden per seconde haalt. Dit is het grootste open punt.
- **Gevels**: de ramen en deuren zijn nog getekend in de shader op een vlakke muur. Echte kozijnen, vensterbanken, deuren met diepte, schoorstenen en dakkapellen zouden de huizen het meest vooruit helpen. De dakvormen zelf komen al uit de 3D BAG (LoD 2.2).
- **Bomen**: de bomen zijn dezelfde gebleven (alleen beter belicht en met zachtere bladranden). Vollere kruinen van dichtbij en beweging in de takken zijn een logische volgende stap. De bolle bomen in de tuin van Ringweg 38 hebben nu blad, maar blijven bollen.
- **Reflecties**: de lucht en de lantaarns spiegelen, maar gebouwen en auto's spiegelen niet in plassen, ramen of lak. Daarvoor is spiegeling in beeldruimte nodig.
- **Schaduwen**: één schaduwkaart rond de speler. Verderop (voorbij ongeveer 85 meter) zijn er geen schaduwen. Lantaarns werpen geen schaduw.
- **Poppetjes**: geen gezichtsanimatie, de sprint schuift nog, fietsen en stilstaan zijn berekend, de zithouding past niet precies op de bankjes.
- **Auto's**: de XC40 verdient een eigen carrosserie; de wissel tussen ver en dichtbij is zichtbaar.
- **Lucht en tijd**: één daglucht en één nachtlucht, en de overgang is een sprong achter een zwart scherm. Een aparte ochtendlucht, een echt gouden uur met lage zon en een vloeiende zonsondergang zouden veel sfeer toevoegen.
- **Hoogtemodel**: het fijnere AHN is niet opgehaald; het terrein is ongewijzigd.
- **Binnenruimtes**: niet aangepakt, behalve dat ze de nieuwe nabewerking meekrijgen.
- **Laadtijd**: gecomprimeerde texturen (KTX2) en het vooraf compileren van shaders in stapjes zouden het laden korter en rustiger maken.
- **WebGPU**: een overstap blijft mogelijk, maar is een project op zich (alle eigen shaders herschrijven).

## Na de eerste test: klaar om naar de echte game te gaan

Op verzoek, na het testen van de proefversie:

- **Eén code voor beide plekken** (`src/config.js`). Het adres bepaalt of het de echte game of de proefversie is. Op de echte game zijn de opslagnamen weer `gulpe-...` (dezelfde als altijd), heet de game "Locals: Gulpen" en staat de anonieme telling aan; op de proefversie blijft alles zoals het was (`gulpehd-...`, telling uit, "Locals: Gulpen HD"). Daardoor raakt niemand zijn voortgang kwijt als deze code op `gulpen-game` komt te staan. Getest: een opslag in het formaat van de echte game (`gulpe-missies-v2`) wordt ingelezen en de missies staan als gedaan.
- **Instellingen tijdens het spelen**: een tandwiel rechtsboven opent een klein paneel met de beeldkwaliteit (Hoog, Midden, Laag). Bij een andere keuze laadt de game opnieuw in die stand en begin je bij het startpunt; afgeronde missies blijven bewaard. Het tandwiel is er alleen tijdens vrij rondlopen, niet in minispellen of tussenfilmpjes.
- **Telefoon**: begint standaard in de stand Laag (dat was al zo); wie zelf iets anders kiest, houdt die keuze.
- De echte game (`gulpen-game`) is hierbij niet aangeraakt. De hoofdtak daar is niet verder gegaan sinds de kopie is gemaakt, dus de proefversie kan er zonder samenvoegwerk overheen.

## Korte zwarte flits tijdens het lopen (standen Hoog en Midden)

Melding: tijdens het rondlopen en rondkijken af en toe heel kort een zwart beeld, onregelmatig, grofweg elke 5 tot 20 seconden.

- **Wat er gemeten is** (zonder videokaart, in Chromium met SwiftShader): als er één pixel in beeld staat die oneindig fel is, was in de oude versie één beeld lang 99,7% van het scherm zwart. De gloed (bloom) smeert die ene pixel uit over het hele beeld en de tone mapping maakt van "oneindig" zwart. Met de aanpassing blijft hetzelfde beeld gewoon (0,3% zwart, net als zonder die pixel).
- **Waar zo'n pixel vandaan kan komen**: het beeld wordt opgebouwd met een beperkt helderheidsbereik (tot ongeveer 65.000). Een schittering van de zon in iets heel glads (autoruiten, autolak, water) kan daar volgens de formule van het materiaal boven komen als je er scherend langs kijkt. In de proeven kwam een gladde bol in de zon tot ruim 2.000 en een gewone wandeling tot 113; een echte overloop is in de proeven niet opgetreden. Dat dit de oorzaak is van de gemelde flits is dus aannemelijk, maar niet bewezen.
- **Aanpassing** (`src/post.js`): bij het samenvoegen van het beeld wordt elke pixel begrensd (hoogstens 64) en krijgt een ongeldige pixel de kleur van zijn buren, vóórdat de gloed erbij komt. Het beeld overdag en 's avonds is daarbij niet zichtbaar veranderd.
- **Ook nagekeken en niet de oorzaak**: het eerste beeld na een automatische wisseling van resolutie is gewoon goed (geen zwart). In 48 vaste standpunten en ruim 120 beelden lopen zaten geen ongeldige pixels.
- **Niet gedekt**: in de stand Laag (telefoon) is er geen gloed, dus daar kan dit mechanisme geen zwart beeld geven. Komt de flits daar ook voor, dan heeft die een andere oorzaak.
