import { useState, useEffect, useRef } from 'react';

// ####################### BACKEND ##########################
import api from '../../services/api';
import { getEcho } from '../../services/echo';

// ####################### FIREBASE #########################
import { db } from '../../services/firebase';
import { collection, query, orderBy, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';

// ####################### CONFIG ###########################
import { USE_FIREBASE } from '../../config/apiConfig'


function Chat({ boardId, isOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const messagesEndRef = useRef(null);

  // Load user from localStorage
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
  }, []);

  // Setup Firebase real-time listener for messages
  useEffect(() => {
    if (!isOpen || !boardId) return;

    console.log('💬 Setting up messages listener for board:', boardId);
    setLoading(true);

    // ####################### FIREBASE #########################
    if (USE_FIREBASE) {
      console.log('💬 Setting up Firebase listener for board:', boardId);

      const messagesColRef = collection(db, 'boards', boardId, 'messages');
      const q = query(messagesColRef, orderBy('created_at', 'asc'));

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          console.log('📨 Messages updated, count:', querySnapshot.size);
          
          const firebaseMessages = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              // Convert Firestore Timestamp to Date if needed
              created_at: data.created_at?.toDate?.() || new Date()
            };
          });

          setMessages(firebaseMessages);
          setLoading(false);
          
          // Auto-scroll to bottom after messages load
          setTimeout(scrollToBottom, 100);
        },
        (error) => {
          console.error('❌ Messages listener error:', error);
          setLoading(false);
        }
      );

      // Cleanup listener
      return () => {
        console.log('🔇 Cleaning up messages listener');
        unsubscribe();
      };
    
    // ####################### BACKEND ##########################
    } else {
      let timeoutId;
      let channel;

      const fetchMessages = async () => {
        try {
          const response = await api.get(`/boards/${boardId}/messages`);
          setMessages(response.data.reverse() || []);
          scrollToBottom();
        } catch (error) {
          console.error('❌ Error fetching messages:', error);
        } finally {
          setLoading(false);
        }
      };

      const setupSocket = () => {
        const echo = getEcho();
        if (!echo) {
          timeoutId = setTimeout(setupSocket, 500);
          return;
        }
        channel = echo.channel(`board.${boardId}`);
        channel.listen('.message.sent', (e) => {
          setMessages((prev) => {
            if (prev.some(m => m.id === e.message.id)) return prev;
            return [...prev, e.message];
          });
          scrollToBottom();
        });
      };

      fetchMessages();
      setupSocket();

      return () => {
        if (channel) channel.stopListening('.message.sent');
        if (timeoutId) clearTimeout(timeoutId);
      };
    }
  }, [boardId, isOpen]);

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Send message to Firebase
  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    if (!user) return alert('You must be logged in to send messages');

    const messageContent = newMessage.trim();
    setNewMessage('');

    try {
      // ####################### FIREBASE #########################
      if (USE_FIREBASE) {
        console.log('📤 Sending message:', messageContent);

        const messagesColRef = collection(db, 'boards', boardId, 'messages');
        
        await addDoc(messagesColRef, {
          message: messageContent,
          user_id: user.uid,
          user: { 
            name: user.name || user.email?.split('@')[0] || 'User' 
          },
          created_at: serverTimestamp()
        });

        console.log('✅ Message sent');

      // ####################### BACKEND ##########################
      } else {
        const response = await api.post(`/boards/${boardId}/messages`, { message: messageContent });
        setMessages((prev) => {
          const exists = prev.find(m => m.id === response.data.id);
          return exists ? prev : [...prev, response.data];
        });
      }

      // Scroll to bottom after sending
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error('❌ Error sending message:', error);
      alert('Failed to send message: ' + error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-4 bottom-4 top-20 w-96 bg-white shadow-2xl z-50 flex flex-col rounded-2xl border border-gray-100 overflow-hidden transition-all duration-300 ease-in-out">
      {/* Header */}
      <div className="bg-white border-b px-5 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          {/* Pulsirajući zeleni krug označava da je chat "online" */}
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <h3 className="font-bold text-gray-800 text-lg">Team Chat</h3>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/50">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-2">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-400 text-sm">Loading chat...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-60">
            <div className="bg-gray-200 p-4 rounded-full">
               <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No messages yet</p>
          </div>
        ) : (

          // Mapiranje kroz niz poruka (prikaz text bubble-a)
          messages.map((message, index) => {
            const isOwnMessage = message.user_id === user?.id;
            return (
              <div key={message.id || index} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                  {/* Prikazujem ime korisnika samo ako poruka nije moja */}
                  {!isOwnMessage && (
                    <span className="text-[11px] font-semibold text-gray-500 ml-2 mb-1 uppercase tracking-wider">
                      {message.user?.name || 'User'}
                    </span>
                  )}
                  {/* Stil teyt bubble-a ovisi o tome tko šalje (plavo desno, bijelo lijevo). */}
                  <div className={`px-4 py-2.5 rounded-2xl shadow-sm text-sm ${
                    isOwnMessage 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                  }`}>
                    <p className="leading-relaxed">{message.message}</p>
                  </div>
                  {/* Vrijeme slanja formatirano u 24h format. */}
                  <span className="text-[10px] text-gray-400 mt-1 px-1">
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t">
        <div className="relative flex items-center">
          <textarea
            rows="1"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Write a message..."
            maxLength={500}
            className="w-full pl-4 pr-12 py-3 bg-gray-100 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 resize-none text-sm transition-all"
          />
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim()}
            className="absolute right-2 p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-md active:scale-95"
          >
            <svg className="w-5 h-5 transform rotate-90" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
        <div className="flex justify-between mt-2 px-1">
            <span className="text-[10px] text-gray-400">Shift + Enter for new line</span>
            <span className={`text-[10px] ${newMessage.length > 450 ? 'text-red-400' : 'text-gray-400'}`}>
              {newMessage.length}/500
            </span>
        </div>
      </div>
    </div>
  );
}

export default Chat;