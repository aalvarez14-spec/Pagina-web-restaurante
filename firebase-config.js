/**
 * Black & Gold Parrilla - Infraestructura en la Nube
 * Configuración e Inicialización Modular de Google Firebase & Cloud Firestore
 */

// 1. Importar los módulos necesarios desde la CDN oficial de Google
import { initializeApp } from "https://gstatic.com";
import { getFirestore, collection, addDoc, doc, updateDoc, onSnapshot } from "https://gstatic.com";

// 2. Objeto de configuración de tu proyecto en la consola de Firebase
// (Estos valores los provee Google automáticamente al crear el proyecto en la web)
const firebaseConfig = {
    apiKey: "AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q",
    authDomain: "://firebaseapp.com",
    projectId: "corte-y-brasa-premium",
    storageBucket: "://appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:a1b2c3d4e5f6g7h8i9j0k1"
};

// 3. Inicializar la aplicación en el ecosistema de Google
const app = initializeApp(firebaseConfig);

// 4. Inicializar la base de datos NoSQL en tiempo real (Cloud Firestore)
const db = getFirestore(app);

console.log("[Google Cloud Infra]: Ecosistema Firebase inicializado correctamente.");

// Exportamos las referencias esenciales para usarlas en los formularios y el panel de administración
export { db, collection, addDoc, doc, updateDoc, onSnapshot };

