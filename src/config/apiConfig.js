// ######
// 1. GDJE SE NALAZIM? (Položaj aplikacije)
// ######
const hostname = window.location.hostname;
export const IS_LOCAL = hostname === 'localhost' || hostname === '127.0.0.1';
export const IS_AZURE = hostname.includes('azurestaticapps.net');
export const IS_AWS = hostname.includes('amazonaws.com'); // Spremno za kasnije

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
    AWS: 'https://tvoj-aws-url.com/api' // Ovdje ćeš upisati AWS kasnije
};

// Određivanje baze URL-a ovisno o tome gdje je aplikacija pokrenuta
let selectedUrl = URLS.LOCAL; // Default
if (IS_AZURE) selectedUrl = URLS.AZURE;
if (IS_AWS) selectedUrl = URLS.AWS;

export const API_BASE_URL = selectedUrl;