Undo/Redo:
- Ovi gumbi rade, ali malo čudno. IDK why, ali treba kliknuti više puta na njih da se dogodi promjena.
- Također, potpuno break-aju real-time jer kod jednog usera nestane, a kod drugog ostanu te obrisane/dodane stvari.


- Također, onaj kod za HAND TOOL je malo useless jer sam htio nešto tipa da se ili napravi near-infinite canvas kao u OneNote
    kad se klikne malo out of bounds. Ili također, da ako se zumira u canvas da se može micati, ali to nije implementirano.


--------------------------------------------------------------------------------

WebSocket/Pusher:

Komunikacija izgleda ovako:
1. Korisnik napravi akciju (npr. nacrta stroke, obriše objekt...)
2. Frontend (React) šalje HTTP request backendu (Laravel API)
3. Backend:
    - Sprema promjenu u bazu.
    - Emitira Broadcast Event (npr. StrokeAdded)
4. Pusher šalje event svim klijentima koji su na istom kanalu
6. Frontend (Laravel Echo) prima event i ažurira state (strokes).

broadcasting.php:
- Laravelu govori da koristi Pusher kao broadcast driver ('default' => env('BROADCAST_DRIVER', 'pusher')).
- Koristi vrijednosti iz .env datoteke i TLS (sigurnu vezu).

Eventi (StrokeAdded, StrokeDeleted, StrokeUpdated, MessageSent):
- Svaki ima metodu public function broadcastOn(): array
- To znači da se event emitira na kanalu specifičnom za taj jedan board.

Frontend -> Echo + React:
- Frontend koristi Laravel Echo kao wrapper oko Pushera (echo.js):
- withCredentials: true -> ovo omogućuje Laravel Sanctum session auth.
- Nije potreban JWT token, session cookie se automatski šalje.

Spajanje na kanal u Whiteboard.jsx:
- Kada se board učita, frontend:
    - Dohvati postojeće strokes REST API-jem
    - Inicijalizira Echo
    - Spoji se na kanal board.{id}
    - Postavi listeners

    channel.listen('.stroke.added', (e) => {
    setStrokes(prev =>
        prev.some(s => s.id === e.stroke.id)
        ? prev
        : [...prev, e.stroke]
    );
    });

    - Za stroke.deleted i stroke.updated koristim .map() i .filter jer nema dodatnih HTTP poziva.
    - UI reagira trenutno i svi klijenti ostaju sinkronizirani.

Sinkronizacija stanja:
- Koristim =sync. Također je prije toga radilo php artisan queue:work --verbose
- Ako je =sync, Laravel ne koristi queue, nego se event izvrši odmah u request.
- Pošto je prije bio =database, event ide u queue i moram imati worker.

Cleanup:
- Prilikom izlaska iz boarda ili unmounta komponente pozivam channel.stopListeni(stroke.added/deleted/updated) i echo.leave().
- Ovo sprječava memory leak i duplicirane listenere.
- Također, da user ne sluša board koji nije otvoren.