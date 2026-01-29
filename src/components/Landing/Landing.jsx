import { useNavigate } from 'react-router-dom';

function Landing() {
  // Inicijaliziram navigaciju za prebacivanje između stranica bez loadanja
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      
      {/* ####################### NAVBAR SEKCIJA ############################ */}
      {/* Gornja traka s logotipom i osnovnim login/register gumbima        */}
      <nav className="px-6 py-4 flex justify-between items-center border-b border-gray-100">
        
        {/* Logotip aplikacije s plavom točkom za moderan izgled */}
        <div className="text-2xl font-bold text-gray-900">
          Whiteboard<span className="text-blue-600">.</span>
        </div>

        {/* Desna strana navbara s brzim akcijama */}
        <div className="space-x-4">
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 text-gray-600 font-medium hover:text-gray-900 transition-colors"
          >
            Login
          </button>
          <button
            onClick={() => navigate('/register')}
            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all shadow-sm"
          >
            Sign Up
          </button>
        </div>
      </nav>

      {/* ####################### HERO SEKCIJA ############################## */}
      <div className="flex flex-col items-center justify-center max-w-4xl mx-auto px-6 py-32 text-center">
        
        <h1 className="text-6xl md:text-7xl font-extrabold text-gray-900 mb-8 tracking-tight">
          Collaborate in <br />
          <span className="text-blue-600">Real-Time</span>
        </h1>
        
        {/* Podnaslov koji kratko opisuje tehničke mogućnosti aplikacije */}
        <p className="text-xl text-gray-500 mb-12 max-w-2xl leading-relaxed">
          Draw, sketch, and brainstorm together on one infinite canvas.
        </p>

        {/* ##################### AUTH GUMBI ZA AKCIJU ######################## */}
        <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
          
          <button
            onClick={() => navigate('/register')}
            className="px-10 py-4 bg-blue-600 text-white rounded-lg text-lg font-semibold hover:bg-blue-700 transition-all shadow-lg"
          >
            Sign Up Now
          </button>

          <button
            onClick={() => navigate('/login')}
            className="px-10 py-4 border-2 border-gray-900 text-gray-900 rounded-lg text-lg font-semibold hover:bg-gray-900 hover:text-white transition-all"
          >
            Login to Workspace
          </button>
        </div>
      </div>
    </div>
  );
}

export default Landing;