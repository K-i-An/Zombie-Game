# Zombie Game - Base Builder

Ein 2D-Survival-Spiel mit Tile-basierter Welt, Ressourcen-Management und Zombie-Verteidigung.

## Spielziel
- Erweitere dein Territorium durch das Erobern von Tiles
- Sammle Ressourcen (Stein, Lehm, Holz) 
- Fange und domestiziere Tiere für Nahrung
- Verteidige deine Base gegen Zombies
- Überlebe so lange wie möglich

## Steuerung

### Bewegung
- **WASD** oder **Pfeiltasten** - Spieler bewegen
- **Maus** - Zielen und Schießen

### Aktionen
- **F** - Wilde Tiere fangen (in der Nähe)
- **P** - Überlebende sammeln (in Gebäuden)
- **E** - Angrenzendes Tile erobern (wenn genug Ressourcen)
- **B** - Stall bauen (auf besetztem Tile, kostet 10 Holz)
- **G** - Tiere in Stall einteilen (bei Stall + domestizierte Tiere)
- **V** - Tiergebäude bauen (auf besetztem Tile)
- **H** - Tiere in Gebäude einteilen (bei Gebäude + domestizierte Tiere)
- **Tab** - Shortcuts-Panel ein-/ausblenden

### UI
- **Start Button** - Spiel starten
- **Restart Button** - Spiel neustarten

## Ressourcen sammeln

### Stein, Lehm, Holz
- **Automatisches Sammeln**: Gehe einfach über die Ressourcen-Punkte hinweg
- **Spawn**: Erscheinen als farbige Kreise auf der Karte
  - **Stein**: Graue Kreise
  - **Lehm**: Beige Kreise  
  - **Holz**: Braune Kreise
- **Respawn**: Ressourcen respawnen automatisch in unbesetzten Gebieten

### Nahrung
- **Konserven**: In Ruinen-Gebäuden (gelbe Punkte) - automatisch beim Darüberlaufen
- **Tiere fangen**: Mit **F** wilde Tiere einfangen für sofortige Nahrung
- **Tierzucht**: 2+ gleiche Tiere in Ställen/Gebäuden generieren kontinuierlich Nahrung

## Gebäude

### Ställe (B-Taste)
- **Kosten**: 10 Holz
- **Funktion**: Tiere können hier gezüchtet werden
- **Tiere einteilen**: Mit **G** domestizierte Tiere in Stall bringen

### Tiergebäude (V-Taste)
- **Kosten**: 2 Stein, 2 Lehm, 4 Holz
- **Funktion**: Bis zu 2 Tiere können hier gehalten werden
- **Nahrungsgenerierung**: 2+ gleiche Tiere produzieren langsam Nahrung
- **Tiere einteilen**: Mit **H** domestizierte Tiere in Gebäude bringen
- **Stroh-Verbrauch**: Gebäude mit 2+ Tieren verbrauchen Stroh (alle 10 Minuten)
- **Nahrung aus Stroh**: Jedes verbrauchte Stroh produziert 2 Nahrung

## Tiere

### Wilde Tiere
- **Spawn**: Außerhalb deines Territoriums
- **Bewegung**: Wandern frei über die Karte
- **Fangen**: Mit **F** in der Nähe
- **Gefahr**: Werden von Zombies außerhalb deines Gebiets getötet

### Domestizierte Tiere
- **Bewegung**: Frei in deinem gesamten besetzten Gebiet
- **Schutz**: Sicher vor Zombies in deinem Territorium
- **Zucht**: In Ställen und Gebäuden möglich

## Überlebende (NPCs)

### Sammeln
- **Spawn**: Selten in Ruinen-Gebäuden (15% Chance)
- **Sammeln**: Mit **P** in der Nähe eines Gebäudes
- **Erscheinung**: Hellhäutige Kreise in Gebäuden

### Basis-Integration
- **Bewegung**: Langsam wandernd in deinem Territorium
- **Nahrung**: Verbrauchen 0.3 Nahrung pro Sekunde
- **Ressourcen**: Sammeln automatisch Ressourcen in der Nähe
- **Schutz**: Bleiben innerhalb deines Territoriums
- **Hindernisse**: Vermeiden Gebäude und Ställe

## Zombies

### Verhalten
- **Spawn**: Nur außerhalb deines Territoriums
- **Reichweite**: Greifen nur an, wenn sie innerhalb von 2 Tiles sind
- **Territorium**: Können dein besetztes Gebiet nicht betreten
- **Tiere**: Töten wilde Tiere außerhalb deines Gebiets

### Schutz
- **Grace Period**: 3 Sekunden Schutz am Spielstart
- **Zombie-freie Zeit**: Konfigurierbar (0-20 Minuten) am Spielstart
- **Territorium**: Dein besetztes Gebiet ist zombie-frei

## Territorium

### Erobern
- **Kosten**: Steigen mit der Anzahl besetzter Tiles
- **Voraussetzung**: Angrenzendes Tile muss sichtbar sein
- **Ressourcen**: Benötigt Stein, Lehm und Holz

### Zaun
- **Automatisch**: Wird um dein Territorium gezeichnet
- **Schutz**: Hält Zombies fern
- **Sichtbar**: Holzfarbener Zaun an den Grenzen

## Minimap
- **Blau**: Dein besetztes Territorium
- **Dunkelblau**: Sichtbare, aber unbesetzte Tiles
- **Schwarz**: Unbekannte Gebiete
- **Weißer Punkt**: Deine Position
- **Blauer Punkt**: Deine Base

## Tipps
1. **Früh expandieren**: Mehr Tiles = mehr Ressourcen
2. **Tiere fangen**: Erhöht deine Nahrungsrate
3. **Gebäude bauen**: Für kontinuierliche Nahrungsproduktion
4. **Territorium schützen**: Zombies können es nicht betreten
5. **Ressourcen sammeln**: Gehe über die farbigen Punkte

## Game Over
- **Nahrung**: Wenn deine Nahrung auf 0 fällt (kann deaktiviert werden)
- **HP**: Wenn deine Lebenspunkte auf 0 fallen (kann deaktiviert werden)
- **Restart**: Mit dem Restart-Button neu starten

Viel Erfolg beim Überleben! 🧟‍♂️🏰
