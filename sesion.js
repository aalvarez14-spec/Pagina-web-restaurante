/**
 * Fernando Parrilla - Gestión de sesión visible
 * Muestra el enlace "Salir" en el navbar solo cuando hay sesión de administrador
 * y permite cerrarla (siempre regresa al index).
 *
 * Requiere que el navbar tenga:
 *   <li class="nav-item" id="itemSalir" hidden>
 *     <a class="nav-link" href="#" id="navLogoutLink">Salir</a>
 *   </li>
 */
(function () {
  'use strict';

  var CLAVE_SESION = 'fp_admin_auth';
  var itemSalir = document.getElementById('itemSalir');
  var enlaceSalir = document.getElementById('navLogoutLink');
  if (!itemSalir || !enlaceSalir) return;

  // Estilo discreto (rojo suave) para el enlace "Salir"
  var css = document.createElement('style');
  css.textContent =
    '#navLogoutLink.nav-link { color: #FF6B5E !important; font-size: 0.9rem; }' +
    '#navLogoutLink.nav-link:hover, #navLogoutLink.nav-link:focus { color: #FF8A7F !important; text-decoration: underline; }';
  document.head.appendChild(css);

  // ¿Hay sesión activa?
  var activo = false;
  try { activo = sessionStorage.getItem(CLAVE_SESION) === '1'; } catch (e) { activo = false; }
  if (!activo) return; // el enlace se queda oculto

  itemSalir.hidden = false;

  enlaceSalir.addEventListener('click', function (e) {
    e.preventDefault();
    try { sessionStorage.removeItem(CLAVE_SESION); } catch (err) { /* sin storage: continúa igual */ }
    window.location.href = 'index.html';
  });
})();
