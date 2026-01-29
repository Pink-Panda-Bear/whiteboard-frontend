/*import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

const echo = new Echo({
  broadcaster: 'pusher',
  key: '6d11a830a5b8ac4ec501',
  cluster: 'eu',
  forceTLS: true,
  authEndpoint: 'http://localhost:8000/broadcasting/auth',
  auth: {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  },
});

export default echo;*/


import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

let echoInstance = null;

export const initEcho = (token) => {
  if (!echoInstance) {
    const key = import.meta.env.VITE_PUSHER_KEY;
    console.log('Pusher key:', key);
  
    const cluster = import.meta.env.VITE_PUSHER_CLUSTER;
    console.log('Pusher cluster:', cluster);

    if (!key || !cluster) {
      console.error('❌ VITE_PUSHER_KEY or VITE_PUSHER_CLUSTER is not set!');
      return null;
    }

    echoInstance = new Echo({
      broadcaster: 'pusher',
      key: key,
      cluster: cluster,
      forceTLS: true,
      authEndpoint: 'http://localhost:8000/broadcasting/auth',
      // session cookie automatski ide, nema potrebe za JWT
      auth: {
        withCredentials: true, // ovo je ključno za Sanctum
      },
    });
  }
  return echoInstance;
};

export const getEcho = () => echoInstance;
