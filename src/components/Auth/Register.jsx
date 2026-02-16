import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

// ####################### BACKEND ##########################
import api from '../../services/api';

// ####################### FIREBASE #########################
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../services/firebase';

// ####################### CONFIG ###########################
import { USE_FIREBASE } from '../../config/apiConfig';


function Register() {
  // Hook za preusmjeravanje korisnika nakon uspješne registracije
  const navigate = useNavigate();

  // ####################### STATE MANAGEMENT #########################
  // Pratim sve unose, specifične validacijske greške i status slanja
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    password_confirmation: '',
  });

  // Errors je kao objekt kako bih mogao prikazati grešku ispod svakog polja
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  // ####################### LOGIKA ZA REGISTRACIJU ############################
  // Funkcija koja šalje nove korisničke podatke na Laravel backend
  const handleSubmit = async (e) => {
    e.preventDefault();     // sprječavam default reload stranice
    setErrors({});          // čistim stare greške prije novog pokušaja
    setLoading(true);       // aktiviram loading animaciju

    try {
      if (formData.password !== formData.password_confirmation) {
        throw new Error("Passwords do not match.");
      }

      // ####################### FIREBASE #########################
      if (USE_FIREBASE) {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          formData.email,
          formData.password
        );
        const user = userCredential.user;

        localStorage.setItem('user', JSON.stringify({ uid: user.uid, email: user.email, name: formData.name }));
        console.log("Registered via Firebase:", user.email);
      
      // ####################### BACKEND ##########################
      } else {
        // Šaljem POST zahtjev na '/register' rutu API-ja
        const response = await api.post('/register', formData);

        // Ako je registracija uspjela, odmah sprema token i podatke o useru
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        console.log("Registered via Backend:", response.data.user.email);
      }

      // Šaljem novog korisnika direktno na Dashboard.jsx
      navigate('/dashboard');
    } catch (err) {
      // ####################### FIREBASE #########################
      if (USE_FIREBASE) {
        setErrors({ general: err.message || 'Registration failed' });
      
      // ####################### BACKEND ##########################
      } else if (err.response?.data?.errors) {
        setErrors(err.response.data.errors);
      } else {
        setErrors({ general: err.response?.data?.message || 'Registration failed' });
      }
      
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-3xl font-bold text-center mb-8">Sign Up</h2>

        {errors.general && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {errors.general}
          </div>
        )}

        {/* ####################### FORMA ZA REGISTRACIJU ####################### */}
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Polje za Ime i Prezime */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Name
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="John Doe"
            />
            {/* Greška za ime (npr. ako je prekratko) */}
            {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name[0]}</p>}
          </div>

          {/* Polje za Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="your@email.com"
            />
            {/* Provjera zauzetosti emaila ili formata */}
            {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email[0]}</p>}
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
            {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password[0]}</p>}
          </div>

          {/* Polje za potvrdu lozinke */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              required
              value={formData.password_confirmation}
              onChange={(e) => setFormData({ ...formData, password_confirmation: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {/* ###################### GUMB ZA KREIRANJE ACCOUNTA ########################## */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        {/* ###################### LINK ZA POVRATAK ############################# */}
        <p className="text-center mt-6 text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Register;