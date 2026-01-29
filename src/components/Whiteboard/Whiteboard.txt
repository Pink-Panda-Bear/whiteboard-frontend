import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { getEcho, initEcho } from '../../services/echo';
import Canvas from './Canvas';
import Chat from './Chat';

function Whiteboard() {
  // ####################### HOOKS I REFS #########################
  const { id } = useParams();         // dohvaćam ID ploče iz URL-a
  const navigate = useNavigate();     // hook za navigaciju između stranica
  const canvasRef = useRef(null);     // pristup Canvas komponenti

  const boardId = id;
  const [echoReady, setEchoReady] = useState(false);     // je li websocket spreman
  const channelRef = useRef(null);     // pohrana websocketa
  
  // ####################### STATE MANAGEMENT #########################
  // Podaci o ploči i svi potezi (strokes)
  const [board, setBoard] = useState(null);
  const [strokes, setStrokes] = useState([]);

  // Alati za crtanje
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#000000');
  const [fillColor, setFillColor] = useState('transparent');
  const [lineWidth, setLineWidth] = useState(2);

  // UI stanja
  const [isChatOpen, setIsChatOpen] = useState(false);

  // History za Undo/Redo - pohranjuje stanje ploče
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Set za praćenje obrisanih poteza (sprječava vraćanje obrisanog kroz WebSocket)
  const [deletedStrokeIds, setDeletedStrokeIds] = useState(new Set());

  // ####################### INICIJALIZACIJA ##################################
  // Pokreće se pri montiranju komeponente ili promjeni ID-a ploče
  useEffect(() => {
    let channel = null;

    const init = async () => {
      try {
        // Dohvaćam podatke o ploči s API-ja
        const response = await api.get(`/boards/${id}`);
        console.log('✅ Board loaded:', response.data);
        
        // Dohvaćam poteze sa servera -> ako postoje, inače prazan niz
        const strokesFromServer = response.data.strokes || [];
        // Filtriranje poteza - mičem one koji su obrisani
        const filteredStrokes = strokesFromServer.filter(stroke => !deletedStrokeIds.has(stroke.id));

        setBoard(response.data);
        setStrokes(filteredStrokes);

        // Inicijalizacija Echo-a (WebSocket)
        const echo = initEcho(); // ako se koristi session auth, token nije potreban
        if (!echo) return;
        
        channel = echo.channel(`board.${id}`);     // spajanje na kanal za ovu ploču

        // Sluša kad netko doda novi stroke:
        channel.listen('.stroke.added', (e) => {
          console.log('📨 Stroke added:', e.stroke);
          // Spremam potez iz događaja
          const stroke = e.stroke;
          // Ažurira se state s novim stroke (ako već ne postoji)
          setStrokes(prev => prev.some(s => s.id === stroke.id) ? prev : [...prev, stroke]);
        });

        // Sluša kad netko obriše stroke:
        channel.listen('.stroke.deleted', (e) => {
          console.log('🗑️ Stroke deleted:', e.strokeId);
          const strokeId = e.strokeId;
          setStrokes(prev => prev.filter(s => s.id !== strokeId));
        });

        // Sluša kad netko ažurira stroke (npr. pomakne ga):
        channel.listen('.stroke.updated', (e) => {
          console.log('✏️ Stroke updated:', e.stroke);
          const updatedStroke = e.stroke;
          
          setStrokes(prev => prev.map(s => s.id === updatedStroke.id ? updatedStroke : s));
        });

        setEchoReady(true);

      } catch (error) {
        console.error('Error fetching board:', error);
      }
    };

    init();

    // Cleanup - prekid WebSocketa prije unmounta komponente
    return () => {
      if (channel) {
        channel.stopListening('.stroke.added');
        channel.stopListening('.stroke.deleted');
        channel.stopListening('.stroke.updated');

        const echo = getEcho();
        if (echo) echo.leave(`board.${id}`);
      }
    };
  }, [id]); // ponovno se izvršava kad se promijeni ID

  // ####################### Inicijalna povijest ##################################
  // Ovaj useEffect inicijalizira history kada se učitaju prvi potezi
  useEffect(() => {
    // Ako ima poteza, a povijest je prazna, postavlja povijest i indeks na prvi element
    if (strokes.length > 0 && history.length === 0) {
      setHistory([strokes]);
      setHistoryIndex(0);
    }
  }, [strokes, history]);

  // Funkcija za kopiranje koda u clipboard
  const copyRoomCode = () => {
    navigator.clipboard.writeText(board.room_code);
    alert(`Room code ${board.room_code} copied to clipboard!`);
  };

  // Postavljanje slušatelja za WebSocket događaje
  const setupWebSocket = () => {
    const echo = getEcho();
    if (!echo) {
      console.log('⏳ Echo not ready yet, waiting...');
      return;
    }

    console.log('🟢 Echo ready, connecting to board channel:', id);

    const channel = echo.channel(`board.${id}`);     // spaja se na kanal za određenu ploču
    channelRef.current = channel;                    // spremam kanal

    // Kad netko doda stroke
    channel.listen('.stroke.added', (e) => {
      const stroke = e.stroke;
      setStrokes(prev => prev.some(s => s.id === stroke.id) ? prev : [...prev, stroke]);
    });

    // Kad netko obriše stroke
    channel.listen('.stroke.deleted', (e) => {
      const strokeId = e.strokeId;
      setStrokes(prev => prev.filter(s => s.id !== strokeId));
    });

    setEchoReady(true);
    return true;
  };

  useEffect(() => {
    if (echoReady) return; // već postavljeno

    const intervalId = setInterval(() => {
      setupWebSocket();
    }, 500); // check svakih 500ms dok Echo nije spreman

    return () => {
      clearInterval(intervalId);

      // Cleanup kanala
      if (channelRef.current) {
        channelRef.current.stopListening('.stroke.added');
        channelRef.current.stopListening('.stroke.deleted');

        const echo = getEcho();
        if (echo) echo.leave(`board.${id}`);
      }
    };
  }, [echoReady, id]);

  // ####################### HISTORY LOGIKA ###################################
  // Automatsko praćenje promjena u strokes za Undo/Redo
  useEffect(() => {
    if (strokes.length === 0) return;
    
    setHistory(prev => {
      // Dohvati posljednje stanje iz povijesti
      const lastState = prev[historyIndex] || [];
      // Ako je sadržaj isti, vraća staru povijest
      if (JSON.stringify(lastState) === JSON.stringify(strokes)) {
        return prev;
      }
      // Nova povijest -> trenutni index + novo stanje
      const newHistory = [...prev.slice(0, historyIndex + 1), JSON.parse(JSON.stringify(strokes))];
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
  }, [strokes]);

  // ####################### CRUD OPERACIJE (CRTANJE) #########################
  // Spremanje novog poteza
  const handleStrokeSave = useCallback(async (strokeData) => {
    // Generiram privremeni ID kako bi se ta linija vidjela odmah (bez čekanja servera)
    let tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Stvaranje privremenog poteza
      const tempStroke = {
        ...strokeData,
        id: tempId,
        isOptimistic: true
      };
      
      console.log('➕ Adding temp stroke:', tempId, strokeData.type);
      
      // Odmah dodaje u lokalni state za trenutni prikaz
      setStrokes(prev => [...prev, tempStroke]);
      // Šaljem na backend za spremanje
      const response = await api.post(`/boards/${id}/strokes`, strokeData);
      
      // Stvaranje poteza s podatcima sa servra
      const serverStroke = {
        ...response.data,
        id: response.data.id || `server_${Date.now()}`
      };
      
      // Zamijeni privremeni objekt onim pravim koji je vratio server (sa pravim ID-em)
      setStrokes(prev => prev.map(s => s.id === tempId ? serverStroke : s));
      
      return serverStroke;
      
    } catch (error) {
      console.error('❌ Error saving stroke:', error);
      // Ako server javi grešku, obriši taj privremeni potez (rollback)
      setStrokes(prev => prev.filter(s => s.id !== tempId));
      alert('Failed to save stroke.');
      return null;
    }
  }, [id]);

  // Ažuriranje postojećeg poteza (npr. pomicanje elementa)
  const handleStrokeUpdate = useCallback(async (index, updatedStrokeData) => {
    try {
      const oldStroke = strokes[index];
      
      if (!oldStroke || !oldStroke.id) {
        console.log('⚠️ Cannot update stroke without ID');
        return;
      }
      
      console.log('✏️ Updating stroke:', oldStroke.id);
      
      // Lokalni update state-a za trenutni prikaz
      setStrokes(prev => {
        const newStrokes = [...prev];
        newStrokes[index] = {
          ...oldStroke,
          ...updatedStrokeData,
          id: oldStroke.id     // keep the same ID
        };
        return newStrokes;
      });

      // Slanje izmjene na server
      await api.put(`/boards/${id}/strokes/${oldStroke.id}`, updatedStrokeData);
      
    } catch (error) {
      console.error('❌ Error updating stroke:', error);
      /// U slučaju greške, povuci zadnje ispravno stanje s baze
      fetchBoard();
    }
  }, [strokes, id]);

  // Brisanje poteza (Gumica ili Select + Delete)
  const handleStrokeDelete = useCallback(async (index) => {
    try {
      const strokeToDelete = strokes[index];
      if (!strokeToDelete) {
        console.warn('⚠️ Stroke not found at index:', index);
        return;
      } 
      
      const strokeId = String(strokeToDelete.id);

      console.log('🗑️ Deleting stroke:', { index, strokeId, type: strokeToDelete.type });
      
      // Pamtim da je obrisan kako ga WebSocket ne bi vratio nazad
      if (strokeId) {
        setDeletedStrokeIds(prev => new Set([...prev, strokeId]));
      }
      
      // Mičem ga iz lokalnog niza odmah
      setStrokes(prev => prev.filter((_, i) => i !== index));

      // Ako potez ima ID i nije privremen, sšalje DELET zahtjev na API
      if (strokeId && !String(strokeId).startsWith('temp_')) {
        console.log('📤 Sending DELETE to API:', strokeId);
        await api.delete(`/boards/${id}/strokes/${strokeId}`);
        console.log('✅ DELETE successful');
      }
      
    } catch (error) {
      console.error('❌ Error deleting stroke:', error);
      console.error('❌ Error response:', error.response?.data);
    }
  }, [strokes, id]);

  // ####################### UNDO / REDO ######################################
  // Vraćanje na prethodno stanje iz history niza
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      console.log('⏮️ Undo');
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setStrokes(history[newIndex]);
    }
  }, [history, historyIndex]);

  // Pomicanje naprijed u history nizu
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      console.log('⏭️ Redo');
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setStrokes(history[newIndex]);
    }
  }, [history, historyIndex]);

  // Funkcija za dohvat podataka o ploči sa servera
  const fetchBoard = useCallback(async () => {
    try {
      const response = await api.get(`/boards/${id}`);
      const strokesFromServer = response.data.strokes || [];
      const filteredStrokes = strokesFromServer.filter(stroke => !deletedStrokeIds.has(stroke.id));

      setBoard(response.data);
      setStrokes(filteredStrokes);
    } catch (error) {
      console.error('Error refreshing board:', error);
    }
  }, [id, deletedStrokeIds]);

  // Funkcija za pretvaranje Canvasa u PNG sliku
  const exportCanvas = () => {
    if (canvasRef.current && canvasRef.current.getStage) {
      // Dohvaćam Konva stage objekt iz Canvas komponente
      const stage = canvasRef.current.getStage();
      const dataURL = stage.toDataURL({ pixelRatio: 2 });
      
      // Postavljanje imena datoteke
      const link = document.createElement('a');
      link.download = `${board?.title || 'whiteboard'}-${Date.now()}.png`;

      // Dodavanje i uklanjanje iz DOM
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      console.error("Stage not found via ref");
    }
  };

  // Ako podatci o ploči još nisu stigli, prikazuje loading
  if (!board) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading board...</div>
      </div>
    );
  }

  // ####################### UI KOMPONENTE (TOOLBAR) #########################
  // Lista alata - ID i ikone
  const tools = [
    { id: 'select', icon: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122' },
    { id: 'hand', icon: 'M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11' },
    { id: 'pen', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
    { id: 'rectangle', icon: 'M3 3h18v18H3z' },
    { id: 'circle', icon: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0' },
    { id: 'line', icon: 'M5 19l14-14' },
    { id: 'arrow', icon: 'M17 8l4 4m0 0l-4 4m4-4H3' },
    { id: 'text', icon: null, text: 'A' },
    { id: 'image', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h14a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { id: 'eraser', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' }
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Gornja traka (Toolbar) - sada sa scrollom */}
      <div className="bg-gray-900 text-white shadow-lg overflow-x-auto">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between min-w-max">
          {/* Lijevi dio - navigacija */}
          <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
            {/* Gumb za povratak */}
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 hover:bg-gray-700 rounded"
              title="Back to Dashboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>

            {/* Naslov ploče i gumb za kopiranje koda sobe */}
            <div className="text-base sm:text-lg font-semibold truncate max-w-[100px] sm:max-w-[150px]">
              {board.title}
            </div>
            <button
              onClick={copyRoomCode}
              className="text-xs sm:text-sm text-gray-400 hover:text-white flex items-center space-x-1 whitespace-nowrap"
              title="Click to copy"
            >
              <span>Room: {board.room_code}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>

          {/* Glavni alati */}
          <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
            {/* Alati za crtanje */}
            <div className="flex items-center space-x-1">
              {tools.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTool(t.id)}
                  className={`p-2 rounded ${tool === t.id ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
                  title={t.id.charAt(0).toUpperCase() + t.id.slice(1)}
                >
                  {t.icon ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
                    </svg>
                  ) : (
                    <span className="font-bold">{t.text}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="h-8 w-px bg-gray-700"></div>
            
            {/* Odabir boje linije (Stroke Color) */}
            <div className="flex items-center space-x-2">
              <label className="text-xs sm:text-sm whitespace-nowrap">Stroke:</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer"
              />
            </div>

            {/* Odabir boje ispune (Fill Color) */}
            <div className="flex items-center space-x-2">
              <label className="text-xs sm:text-sm whitespace-nowrap">Fill:</label>
              <input
                type="color"
                value={fillColor === 'transparent' ? '#ffffff' : fillColor}
                onChange={(e) => setFillColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer"
              />
              <button
                onClick={() => setFillColor('transparent')}
                className={`px-2 py-1 text-xs rounded whitespace-nowrap ${fillColor === 'transparent' ? 'bg-gray-700' : 'bg-gray-600'}`}
              >
                None
              </button>
            </div>

            {/* Odabir debljine linije (Stroke Width) */}
            <div className="flex items-center space-x-2">
              <label className="text-xs sm:text-sm whitespace-nowrap">Width:</label>
              <input
                type="range"
                min="1"
                max="20"
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
                className="w-20 sm:w-24"
              />
              <span className="text-xs sm:text-sm w-6">{lineWidth}</span>
            </div>

            {/* Undo/Redo gumbi */}
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title="Undo (Ctrl+Z)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>

            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title="Redo (Ctrl+Y)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
              </svg>
            </button>

            <div className="h-8 w-px bg-gray-700"></div>

            {/* Gumb za Export u PNG */}
            <button
              onClick={exportCanvas}
              className="px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-xs sm:text-sm whitespace-nowrap"
              title="Export PNG"
            >
              Export
            </button>

            {/* Gumb za otvaranje Chat prozora */}
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`px-3 sm:px-4 py-2 rounded flex items-center space-x-2 text-xs sm:text-sm whitespace-nowrap ${
                isChatOpen ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-700 hover:bg-gray-600'
              }`}
              title="Toggle Chat"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="hidden sm:inline">Chat</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Kontejner za Canvas */}
      <div className="flex-1 overflow-hidden">
        <Canvas
          boardId={boardId}
          strokes={strokes}
          tool={tool}
          color={color}
          fillColor={fillColor}
          lineWidth={lineWidth}
          ref={canvasRef}
          onStrokeSave={handleStrokeSave}
          onStrokeDelete={handleStrokeDelete}
          onStrokeUpdate={handleStrokeUpdate}
        />
      </div>
      
      {/* Chat komponenta koja se prikazuje sa strane */}
      <Chat
        boardId={id}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </div>
  );
}

export default Whiteboard;