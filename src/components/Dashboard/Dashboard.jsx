import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

function Dashboard() {
  const navigate = useNavigate();

  // ####################### STATE MANAGEMENT #########################
  const [boards, setBoards] = useState([]);                      // lista svih ploča iz baze
  const [loading, setLoading] = useState(true);                  // status učitavanja podataka
  const [showModal, setShowModal] = useState(false);             // kontrola modalnog prozora za kreiranje
  const [newBoardTitle, setNewBoardTitle] = useState('');        // naziv nove ploče
  const [user, setUser] = useState(null);                        // podatci o ulogiranom kroisniku

  const [showJoinModal, setShowJoinModal] = useState(false);     // kontrola modala za join
  const [roomCode, setRoomCode] = useState('');                  // uneseni kod za sobu
  const [joinError, setJoinError] = useState('');                // greška pri pridruživanju

  // ####################### INITIALIZATION #######################
  // Prilikom prvog renderiranja, dohvaćam ploče i podatke o korisniku
  useEffect(() => {
    fetchBoards();

    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  // ####################### API OPERACIJE (BACKEND) ###########################
  // Dohvaćam sve ploče povezane sa trenutnim računom
  const fetchBoards = async () => {
    try {
      const response = await api.get('/boards');
      setBoards(response.data);
    } catch (error) {
      console.error('Error fetching boards:', error);
    } finally {
      setLoading(false);
    }
  };

  // Kreiram novu ploču na backendu
  const createBoard = async () => {
    if (!newBoardTitle.trim()) return;

    try {
      const response = await api.post('/boards', {
        title: newBoardTitle,
      });
      // Dodajem novu ploču na početak liste u UI
      setBoards([response.data, ...boards]);
      setNewBoardTitle('');
      setShowModal(false);
    } catch (error) {
      console.error('Error creating board:', error);
    }
  };

  // Brišem ploču uz sigurnosnu provjeru
  const deleteBoard = async (boardId) => {
    if (!confirm('Are you sure you want to delete this board?')) return;

    try {
      await api.delete(`/boards/${boardId}`);
      // Mičem ploču iz stanja kako bi nestala s ekrana bez refresha
      setBoards(boards.filter((b) => b.id !== boardId));
    } catch (error) {
      console.error('Error deleting board:', error);
    }
  };

  // Pridruživanje postojećoj ploči preko jedinstvenog koda
  const joinRoom = async () => {
    if (!roomCode.trim()) {
      setJoinError('Please enter a room code');
      return;
    }

    try {
      const response = await api.post('/boards/join', {
        room_code: roomCode.toUpperCase().trim(),
      });
      
      // Ako kod postoji, navigira korisnika direktno u tu sobu
      navigate(`/board/${response.data.id}`);
    } catch (error) {
      if (error.response?.status === 404) {
        setJoinError('Board not found');
      } else if (error.response?.status === 403) {
        setJoinError('This board is private');
      } else {
        setJoinError('Failed to join board');
      }
      console.error('Error joining board:', error);
    }
  };

  // Brisanje session podataka i povratak na početnu stranicu
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  // Ranom gradijenti za različit izgled ploča
  const gradients = [
    'bg-gradient-to-br from-blue-400 to-blue-600',
    'bg-gradient-to-br from-purple-400 to-purple-600',
    'bg-gradient-to-br from-pink-400 to-pink-600',
    'bg-gradient-to-br from-green-400 to-green-600',
    'bg-gradient-to-br from-yellow-400 to-yellow-600',
    'bg-gradient-to-br from-red-400 to-red-600',
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ####################### NAVBAR DASHBOARDA ######################### */}
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <div className="text-2xl font-bold text-gray-900">Whiteboard</div>
        <div className="flex items-center space-x-4">
          <span className="text-gray-700">Welcome, {user?.name}</span>
          <button
            onClick={logout}
            className="px-4 py-2 text-red-600 hover:text-red-700"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* ####################### GLAVNI SADRŽAJ ############################ */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Boards</h1>

          {/* Gumb za Join Room */}
          <button
            onClick={() => setShowJoinModal(true)}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            <span>Join Room</span>
          </button>

          {/* Gumb za Create Board */}
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Create Board</span>
          </button>
        </div>

        {/* ####################### RENDERIRANJE PLOČA ######################## */}
        {loading ? (
          <div className="text-center py-12">
            <div className="text-gray-500">Loading boards...</div>
          </div>
        ) : boards.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No boards yet. Create your first board!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {boards.map((board, index) => (
              <div
                key={board.id}
                className="group relative bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow cursor-pointer overflow-hidden"
                onClick={() => navigate(`/board/${board.id}`)}
              >
                <div className={`h-32 ${gradients[index % gradients.length]}`}></div>
                <div className="p-4">
                  <h3 className="font-bold text-lg text-gray-900 mb-2">{board.title}</h3>
                  <p className="text-sm text-gray-500">Room Code: {board.room_code}</p>
                </div>

                {/* Brisanje - pop-up kad se hovera */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteBoard(board.id);
                  }}
                  className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ####################### MODAL ZA KREIRANJE NOVE PLOČE ####################### */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4">Create New Board</h2>
            <input
              type="text"
              value={newBoardTitle}
              onChange={(e) => setNewBoardTitle(e.target.value)}
              placeholder="Board title"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4"
              autoFocus
            />
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={createBoard}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ####################### MODAL ZA JOIN ############################# */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4">Join Board</h2>
            
            {joinError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {joinError}
              </div>
            )}
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Room Code
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value);
                  setJoinError('');
                }}
                placeholder="Enter 8-character code"
                maxLength={8}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg uppercase text-center text-2xl tracking-widest"
                autoFocus
              />
              <p className="text-sm text-gray-500 mt-2">
                Ask the board owner for the room code
              </p>
            </div>
            
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => {
                  setShowJoinModal(false);
                  setRoomCode('');
                  setJoinError('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={joinRoom}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Join Board
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;