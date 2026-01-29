import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Firebase imports
import { auth, db } from '../../services/firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  deleteDoc,
  doc,
  query, 
  where,
  onSnapshot,
  getDocs
} from 'firebase/firestore';


function Dashboard() {
  const navigate = useNavigate();

  // ####################### STATE MANAGEMENT #########################
  const [boards, setBoards] = useState([]);                      
  const [loading, setLoading] = useState(true);                  
  const [showModal, setShowModal] = useState(false);             
  const [newBoardTitle, setNewBoardTitle] = useState('');        
  const [user, setUser] = useState(null);                        
  const [authLoading, setAuthLoading] = useState(true); // NOVO - prati auth status

  const [showJoinModal, setShowJoinModal] = useState(false);     
  const [roomCode, setRoomCode] = useState('');                  
  const [joinError, setJoinError] = useState('');                

  // ####################### AUTH INITIALIZATION #######################
  useEffect(() => {
    console.log('🔵 Setting up auth listener');
    
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.log('Auth state changed:', firebaseUser?.email || 'No user');
      
      if (firebaseUser) {
        const userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || firebaseUser.email.split('@')[0]
        };
        
        console.log('✅ User authenticated:', userData.email);
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        console.log('❌ No user, clearing state');
        setUser(null);
        setBoards([]); // Očisti boards
        localStorage.removeItem('user');
        navigate('/login');
      }
      
      setAuthLoading(false); // Auth je gotov (bilo user ili null)
    });

    return () => {
      console.log('🔴 Cleaning up auth listener');
      unsubscribe();
    };
  }, [navigate]);

  // ####################### BOARDS REAL-TIME LISTENER #######################
  useEffect(() => {
    // Čekaj da auth završi prije setupanja boards listenera
    if (authLoading) {
      console.log('⏳ Waiting for auth to complete...');
      return;
    }

    if (!user?.uid) {
      console.log('⏸️ No user, skipping boards listener');
      setLoading(false);
      return;
    }

    console.log('🎧 Setting up boards listener for user:', user.uid);
    setLoading(true);

    const q = query(
      collection(db, "boards"),
      where("createdBy", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        console.log('📦 Boards updated, count:', querySnapshot.size);
        
        const boardData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0);
          const dateB = b.createdAt?.toDate?.() || new Date(0);
          return dateB - dateA;
        });

        console.log('✅ Setting boards:', boardData.length);
        setBoards(boardData);
        setLoading(false);
      },
      (error) => {
        console.error('❌ Boards listener error:', error);
        alert('Failed to load boards: ' + error.message);
        setLoading(false);
      }
    );

    return () => {
      console.log('🔇 Cleaning up boards listener');
      unsubscribe();
    };
  }, [user?.uid, authLoading]); // Triggera se kad se user ili authLoading promijene

  // ####################### FIREBASE OPERATIONS ###########################
  const createBoard = async () => {
    if (!newBoardTitle.trim()) {
      alert('Please enter a board title');
      return;
    }
    
    const currentUser = auth.currentUser;
    if (!currentUser) {
      alert('You must be logged in');
      return;
    }

    try {
      console.log('📝 Creating board:', newBoardTitle);
      
      const roomCode = Math.random().toString(36).substring(2, 10).toUpperCase();

      const boardData = {
        title: newBoardTitle,
        createdBy: currentUser.uid,
        room_code: roomCode,
        createdAt: new Date(),
        members: [currentUser.uid] // NOVO - dodaj ownera u members
      };

      console.log('💾 Saving to Firestore');
      await addDoc(collection(db, "boards"), boardData);
      
      console.log('✅ Board created');
      setNewBoardTitle('');
      setShowModal(false);
    } catch (error) {
      console.error('❌ Error creating board:', error);
      alert('Failed to create board: ' + error.message);
    }
  };

  const deleteBoard = async (boardId) => {
    if (!confirm('Are you sure you want to delete this board?')) return;

    try {
      console.log('🗑️ Deleting board:', boardId);
      await deleteDoc(doc(db, "boards", boardId));
      console.log('✅ Board deleted');
    } catch (error) {
      console.error('❌ Error deleting board:', error);
      alert('Failed to delete board: ' + error.message);
    }
  };

  const joinRoom = async () => {
    if (!roomCode.trim()) {
      setJoinError('Please enter a room code');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setJoinError('You must be logged in');
      return;
    }

    try {
      const normalizedCode = roomCode.toUpperCase().trim();
      console.log('🔍 Searching for board with code:', normalizedCode);
      console.log('Current user:', currentUser.uid);

      // Query za board s tim room_code
      const q = query(
        collection(db, "boards"), 
        where("room_code", "==", normalizedCode)
      );
      
      console.log('Executing query...');
      const querySnapshot = await getDocs(q);
      
      console.log('Query complete. Results:', querySnapshot.size);
      
      if (querySnapshot.empty) {
        console.log('❌ No board found with code:', normalizedCode);
        setJoinError('Board not found. Please check the code and try again.');
        return;
      }

      const boardDoc = querySnapshot.docs[0];
      const boardData = boardDoc.data();
      
      console.log('✅ Found board:', {
        id: boardDoc.id,
        title: boardData.title,
        owner: boardData.createdBy,
        currentUser: currentUser.uid
      });
      
      // Navigiraj na board
      navigate(`/board/${boardDoc.id}`);
      
      // Resetuj modal state
      setRoomCode('');
      setJoinError('');
      setShowJoinModal(false);
      
    } catch (error) {
      console.error('❌ Error joining board:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      // Detaljnija error poruka
      if (error.code === 'permission-denied') {
        setJoinError('Permission denied. Please check your Firestore rules.');
      } else {
        setJoinError('Failed to join board: ' + error.message);
      }
    }
  };

  const logout = async () => {
    try {
      console.log('👋 Logging out...');
      await signOut(auth);
      localStorage.removeItem('user');
      setUser(null);
      setBoards([]);
      console.log('✅ Logged out');
      navigate('/login');
    } catch (error) {
      console.error('❌ Error signing out:', error);
      alert('Failed to log out: ' + error.message);
    }
  };

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
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <div className="text-2xl font-bold text-gray-900">Whiteboard</div>
        <div className="flex items-center space-x-4">
          <span className="text-gray-700">Welcome, {user?.name || 'User'}</span>
          <button
            onClick={logout}
            className="px-4 py-2 text-red-600 hover:text-red-700"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Boards</h1>

          <div className="flex space-x-4">
            <button
              onClick={() => setShowJoinModal(true)}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              <span>Join Room</span>
            </button>

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
        </div>

        {loading || authLoading ? (
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

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4">Create New Board</h2>
            <input
              type="text"
              value={newBoardTitle}
              onChange={(e) => setNewBoardTitle(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  createBoard();
                }
              }}
              placeholder="Board title"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4"
              autoFocus
            />
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => {
                  setShowModal(false);
                  setNewBoardTitle('');
                }}
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
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    joinRoom();
                  }
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