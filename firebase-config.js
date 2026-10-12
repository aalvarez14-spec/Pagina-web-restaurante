/**
 * Fernando Parrilla - Infraestructura en la Nube
 * Configuración e inicialización modular de Google Firebase y Cloud Firestore.
 *
 * Este archivo es un módulo ES: para usarlo, la página debe cargarlo (o cargar un script que lo importe)
 * con <script type="module">. Por ahora las páginas simulan Firestore y no lo importan.
 */

// 1. Módulos oficiales desde la CDN de Google (fijar la versión evita cambios inesperados)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 2. Configuración del proyecto: cópiala desde Firebase Console > Configuración del proyecto > Tus apps.
// Estos valores son de ejemplo y deben reemplazarse. La apiKey web de Firebase no es un secreto:
// lo que protege los datos son las reglas de seguridad de Firestore (ver nota abajo).
const firebaseConfig = {
    apiKey: "REEMPLAZAR_CON_TU_API_KEY",
    authDomain: "TU-PROYECTO.firebaseapp.com",
    projectId: "TU-PROYECTO",
    storageBucket: "TU-PROYECTO.appspot.com",
    messagingSenderId: "REEMPLAZAR",
    appId: "REEMPLAZAR"
};

// SEGURIDAD: antes de publicar, define reglas de Firestore y Firebase Authentication para que
//  - los clientes solo puedan CREAR pedidos y reservas (y leer los suyos),
//  - y solo los administradores puedan leer todo y cambiar estados, menú e información del restaurante.

// 3. Inicializar la aplicación
const app = initializeApp(firebaseConfig);

// 4. Inicializar Cloud Firestore
const db = getFirestore(app);

console.log("[Google Cloud Infra]: Firebase inicializado.");

// Referencias que usarán los formularios y el panel de administración
export { db, collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp };
