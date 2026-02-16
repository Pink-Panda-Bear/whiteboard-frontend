import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Canvas from './Canvas';
import Chat from './Chat';

// ####################### BACKEND ##########################
import api from '../../services/api';
import { getEcho, initEcho } from '../../services/echo';

// ####################### FIREBASE #########################
import { auth, db } from '../../services/firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';

// ####################### CONFIG ###########################
import { USE_FIREBASE } from '../../config/apiConfig';


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

  // ####################### FIREBASE REAL-TIME LISTENERS #######################
  useEffect(() => {
    if (!boardId) return;
    let channel = null;
    let unsubBoard, unsubStrokes;
    
    const init = async () => {
      // ####################### FIREBASE #########################
      if (USE_FIREBASE) {
        console.log('🎧 Setting up Firebase listeners for board:', boardId);
        const boardDocRef = doc(db, 'boards', boardId);
        const strokesColRef = collection(boardDocRef, 'strokes');

        // Board listener
        unsubBoard = onSnapshot(
          boardDocRef, 
          (snap) => {
            if (snap.exists()) {
              console.log('✅ Board data loaded');
              setBoard({ id: snap.id, ...snap.data() });
            } else {
              console.error('❌ Board not found:', boardId);
              setBoard(null);
            }
          }, 
          (err) => {
            console.error('❌ Board listener error:', err);
          }
        );

        // Strokes listener (real-time)
        const qStrokes = query(strokesColRef, orderBy('created_at'));
        unsubStrokes = onSnapshot(
          qStrokes, 
          (qsnap) => {
            console.log('📦 Strokes updated, count:', qsnap.size);
            
            const items = qsnap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Filter out deleted strokes
            const filtered = items.filter(s => !deletedStrokeIds.has(s.id));
            setStrokes(filtered);
          }
        );
      
      // ####################### BACKEND ##########################
      } else {
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
          if (typeof initEcho === 'function') {
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
          } else {
            console.warn('⚠️ initEcho function is missing. WebSocket disabled.');
          }
        } catch (error) {
          console.error('❌ Error fetching board:', error);
        }
      }
    };

    init();

    // Cleanup - gasim slušatelje ovisno o tome koji su bili aktivni
    return () => {
      if (unsubBoard) unsubBoard();
      if (unsubStrokes) unsubStrokes();
      if (channel) {
        channel.stopListening('.stroke.added');
        channel.stopListening('.stroke.deleted');
        channel.stopListening('.stroke.updated');
        if (typeof getEcho === 'function') {
          const echo = getEcho();
          if (echo) echo.leave(`board.${boardId}`);
        }
      }
    };

  }, [boardId, deletedStrokeIds]);

  // ####################### HISTORY INITIALIZATION #######################
  // Ovaj useEffect inicijalizira history kada se učitaju prvi potezi
  useEffect(() => {
    if (strokes.length > 0 && history.length === 0) {
      // Ako ima poteza, a povijest je prazna, postavlja povijest i indeks na prvi element
      setHistory([strokes]);
      setHistoryIndex(0);
    }
  }, [strokes, history]);

  // ####################### HISTORY TRACKING #############################
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


  // ####################### CRUD OPERACIJE (CRTANJE) #####################
  // Spremanje novog poteza
  const handleStrokeSave = useCallback(async (strokeData) => {
    if (typeof auth === 'undefined') {
      console.error('❌ "auth" is not defined. Did you forget to import it at the top of Whiteboard.jsx?');
      return;
    }
    
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('❌ No authenticated user found. Cannot save stroke.');
      return;
    }

    // Generiram privremeni ID kako bi se ta linija vidjela odmah (bez čekanja servera)
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const tempStroke = { 
      // Stvaranje privremenog poteza
      ...strokeData, 
      id: tempId, 
      isOptimistic: true, 
      created_at: new Date() 
    };

    console.log('➕ Adding temp stroke:', tempId);
    setStrokes(prev => [...prev, tempStroke]);

    try {
      // ####################### FIREBASE #########################
      if (USE_FIREBASE) {
        const strokesColRef = collection(db, 'boards', boardId, 'strokes');
        const docRef = await addDoc(strokesColRef, {
          ...strokeData,
          created_at: serverTimestamp(),
        });

        console.log('✅ Stroke saved to Firebase with ID:', docRef.id);
        setStrokes(prev => prev.map(s => s.id === tempId ? { ...s, id: docRef.id } : s));
      
      // ####################### BACKEND ##########################
      } else {
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
      }
    } catch (err) {
      console.error('❌ Error saving stroke:', err);
      setStrokes(prev => prev.filter(s => s.id !== tempId));
      alert('Failed to save stroke.');
      return null;
    }
  }, [boardId, setStrokes]);

  const handleStrokeUpdate = useCallback(async (index, updatedStrokeData) => {
    const oldStroke = strokes[index];
    if (!oldStroke || !oldStroke.id || String(oldStroke.id).startsWith('temp_')) {
      console.warn('⚠️ Cannot update stroke without valid ID');
      return;
    }

    console.log('✏️ Updating stroke:', oldStroke.id);

    // Optimistic update
    setStrokes(prev => {
      const newStrokes = [...prev];
      newStrokes[index] = { ...oldStroke, ...updatedStrokeData };
      return newStrokes;
    });

    try {
      // ####################### FIREBASE #########################
      if (USE_FIREBASE) {
        const strokeDocRef = doc(db, 'boards', boardId, 'strokes', oldStroke.id);
        await updateDoc(strokeDocRef, {
          ...updatedStrokeData,
          updated_at: serverTimestamp()
        });
        
        console.log('✅ Stroke updated');

      // ####################### BACKEND ##########################
      } else {
        // Slanje izmjene na server
        await api.put(`/boards/${id}/strokes/${oldStroke.id}`, updatedStrokeData);
        console.log('✅ API: Stroke updated');
      }
    } catch (err) {
      console.error('❌ Error updating stroke:', err);
    }
  }, [strokes, boardId]);

  const handleStrokeDelete = useCallback(async (index) => {
    const strokeToDelete = strokes[index];
    if (!strokeToDelete) {
      console.warn('⚠️ Stroke not found at index:', index);
      return;
    }

    const strokeId = String(strokeToDelete.id);
    console.log('🗑️ Deleting stroke:', { index, strokeId, type: strokeToDelete.type });

    // Mark as deleted
    if (strokeId) {
      setDeletedStrokeIds(prev => new Set([...prev, strokeId]));
    }

    // Remove from local state
    setStrokes(prev => prev.filter((_, i) => i !== index));

    // Delete from Firestore
    if (strokeId && !strokeId.startsWith('temp_')) {
      try {
        // ####################### FIREBASE #########################
        if (USE_FIREBASE) {
          const strokeDocRef = doc(db, 'boards', boardId, 'strokes', strokeId);
          await deleteDoc(strokeDocRef);
          console.log('✅ Stroke deleted from Firestore');
        
        // ####################### BACKEND ##########################
        } else {
          console.log('📤 Sending DELETE to API:', strokeId);
          await api.delete(`/boards/${id}/strokes/${strokeId}`);
          console.log('✅ DELETE successful');
        }
      } catch (err) {
        console.error('❌ Error deleting stroke:', err);
        if (err.response) console.error('❌ Error response:', err.response.data);
      }
    }
  }, [strokes, boardId, id]);

  
  // ####################### UNDO / REDO #######################
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      console.log('⏮️ Undo');
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setStrokes(history[newIndex]);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      console.log('⏭️ Redo');
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setStrokes(history[newIndex]);
    }
  }, [history, historyIndex]);


  // ####################### UTILITIES #######################
  const copyRoomCode = () => {
    navigator.clipboard.writeText(board.room_code);
    alert(`Room code ${board.room_code} copied to clipboard!`);
  };

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

  // ####################### LOADING STATE #######################
  // Ako podatci o ploči još nisu stigli, prikazuje loading
  if (!board) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading board...</div>
      </div>
    );
  }

  // ####################### TOOLBAR TOOLS #######################
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
      {/* Toolbar */}
      <div className="bg-gray-900 text-white shadow-lg overflow-x-auto">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between min-w-max">
          {/* Left section */}
          <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 hover:bg-gray-700 rounded"
              title="Back to Dashboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>

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

          {/* Tools */}
          <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
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
            
            <div className="flex items-center space-x-2">
              <label className="text-xs sm:text-sm whitespace-nowrap">Stroke:</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer"
              />
            </div>

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

            <button
              onClick={exportCanvas}
              className="px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-xs sm:text-sm whitespace-nowrap"
              title="Export PNG"
            >
              Export
            </button>

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
      
      {/* Canvas */}
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
      
      {/* Chat */}
      <Chat
        boardId={id}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </div>
  );
}

export default Whiteboard;