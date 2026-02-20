// ######
// 1. GDJE SE NALAZIM? (Položaj aplikacije)
// ######
const hostname = window.location.hostname;
export const IS_LOCAL = hostname === 'localhost' || hostname === '127.0.0.1';
export const IS_AZURE = hostname.includes('azurestaticapps.net');
export const IS_AWS = hostname.includes('amazonaws.com');

console.log('HOSTNAME:', hostname);
console.log('IS_AWS:', IS_AWS);
console.log('IS_AZURE:', IS_AZURE);

// ######
// 2. ŠTO KORISTIM ZA AUTH/DATA? (Firebase ili Backend)
// ######
// Ovaj boolean je glavni. Ako je true -> Firebase (Google). 
// Ako je false -> Laravel (bio on na localhostu, Azureu ili AWS-u).
export const USE_FIREBASE = false; 

// ######
// 3. DEFINIRANJE URL-ova ZA TVOJ BACKEND
// ######
const URLS = {
    LOCAL: 'http://localhost:8000/api',
    AZURE: 'https://whiteboard-backend-dpg3g0asfrhqgxg5.westeurope-01.azurewebsites.net/api',
    AWS: 'http://whiteboard-production.eba-uti7h2qf.eu-north-1.elasticbeanstalk.com/api'
};

// Određivanje baze URL-a ovisno o tome gdje je aplikacija pokrenuta
let selectedUrl = URLS.LOCAL; // Default
if (IS_AZURE) selectedUrl = URLS.AZURE;
else if (IS_AWS) selectedUrl = URLS.AWS;

console.log('SELECTED URL:', selectedUrl);

export const API_BASE_URL = selectedUrl;