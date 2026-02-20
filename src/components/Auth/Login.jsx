import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

// ####################### BACKEND ##########################
import api from '../../services/api';

// ####################### FIREBASE #########################
import { auth } from '../../services/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

// ####################### CONFIG ###########################
import { USE_FIREBASE, API_BASE_URL } from '../../config/apiConfig';


function Login() {
  // Inicijaliziram navigaciju za preusmjeravanje nakon uspješnog logina
  const navigate = useNavigate();

  // ####################### STATE MANAGEMENT #########################
  // Za praćenje unosa podataka, greške i statusa učitavanja (loading)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ####################### LOGIKA ZA SLANJE FORME ############################
  // Funkcija koja komunicira s Laravel API-jem
  const handleSubmit = async (e) => {
    e.preventDefault();     // zaustavljam osvježavanje stranice
    setError('');           // resetiram greške prije novog pokušaja
    setLoading(true);       // spinner za učitavanje stranice

    try {
      // ####################### FIREBASE #########################
      if (USE_FIREBASE) {
        const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
        const user = userCredential.user;
        
        localStorage.setItem('user', JSON.stringify({ uid: user.uid, email: user.email }));
        console.log("Logged in via Firebase:", user.email);
      
      // ####################### BACKEND ##########################
      } else {
        // Šaljem POST zahtjev na backend endpoint '/login'
        const response = await api.post('/login', formData);

        // Spremam dobiveni Bearer token i podatke o useru u LocalStorage preglednika
        // To omogućuje da korisnik ostane prijavljen i nakon refresha
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        console.log("Logged in via Backend:", response.data.user.email);
      }
      
      // Šaljem korisnika na glavnu radnu površinu (Dashboard.jsx)
      navigate('/dashboard');
    } catch (err) {
      // ####################### FIREBASE #########################
      if (USE_FIREBASE) {
        setError(err.message || 'Login failed.');
      
      // ####################### BACKEND ##########################
      } else {
        setError(err.response?.data?.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      {/* Naslov sekcije */}
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-3xl font-bold text-center mb-8">Login</h2>

        {/* ####################### PRIKAZ GREŠAKA ############################## */}
        {/* Renderira se samo ako postoji poruka o greški s backenda */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* ####################### FORMA ZA UNOS ############################### */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Polje za Email adresu */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="your@email.com"
            />
          </div>

          {/* Polje za Lozinku */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {/* ###################### GUMB ZA PRIJAVU ############################ */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Loading...' : 'Login'}
          </button>
        </form>

        {/* ###################### LINK ZA REGISTRACIJU ######################### */}
        <p className="text-center mt-6 text-gray-600">
          Don't have an account?{' '}
          <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;