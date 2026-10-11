'use strict';

/**
 * Orearte Parrilla - Módulo de reservas (front-end)
 *
 * Reglas de negocio
 *  - Mesa tipo A: de 1 a 4 personas. Mesa tipo B: de 5 a 8 personas. Hay 5 mesas de cada tipo.
 *  - Los grupos de más de 8 personas no reservan en línea: deben comunicarse con el restaurante.
 *  - Una reserva nueva queda en estado "pendiente" hasta que el administrador la confirme
 *    (caso de uso "Gestionar reservas"). El cliente recibe un código y un mensaje de "solicitud recibida".
 *
 * El formulario (HTML) debe tener estos elementos:
 *   #reservationForm        formulario
 *   #bookingDate            <input type="date">
 *   #guestsCount            <select>; la opción de grupos grandes tiene value="large-group"
 *   input[name="timeSlot"]  un radio por franja, con value "12:00 PM - 02:00 PM" (inicio - fin);
 *                           cada radio va dentro de un contenedor con id "container-slotN" (opcional)
 *   #customerName           nombre del cliente (obligatorio)      <- nuevo
 *   #customerPhone          teléfono del cliente (obligatorio)    <- nuevo
 *   #customerEmail          correo del cliente (opcional)         <- nuevo
 *   .booking-container      contenedor general; aquí se muestra la confirmación
 */

document.addEventListener('DOMContentLoaded', () => {
  // 0. Configuración
  const CONFIG = {
    maxPersonas: 8,
    valorGrupoGrande: 'large-group',
    estadoInicial: 'pendiente',
    antelacionMinutos: 0, // minutos mínimos entre "ahora" y el inicio de la franja
    contacto: { telefono: '', whatsapp: '' }, // COMPLETAR (idealmente se lee de "Información del restaurante")
    debug: true,
    simularFalloGuardado: false // true para probar el mensaje de error al registrar la reserva
  };
  const FRANJA_SELECTOR = 'input[name="timeSlot"]';

  // 1. Selectores del DOM
  const reservationForm = document.getElementById('reservationForm');
  if (!reservationForm) return; // esta página no tiene el formulario de reservas

  const bookingDateInput = document.getElementById('bookingDate');
  const guestsSelect = document.getElementById('guestsCount');
  const nameInput = document.getElementById('customerName');
  const phoneInput = document.getElementById('customerPhone');
  const emailInput = document.getElementById('customerEmail');
  const contenedor = document.querySelector('.booking-container') || reservationForm.parentElement;

  if (!bookingDateInput || !guestsSelect) {
    console.error('[Reservas] Faltan #bookingDate o #guestsCount en el formulario.');
    return;
  }
  if (!nameInput || !phoneInput) {
    console.warn('[Reservas] Faltan #customerName o #customerPhone: sin datos de contacto no se puede enviar la solicitud.');
  }

  // Utilidades
  const log = (...args) => { if (CONFIG.debug) console.log(...args); };
  const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pad = (n) => String(n).padStart(2, '0');
  const hoyISO = () => {
    const d = new Date();
    return `d.getFullYear()-{pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const mananaISO = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `d.getFullYear()-{pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const formatearFecha = (iso) => {
    const texto = new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  };

  // Estilos propios del módulo (así funciona sin tocar tu CSS)
  const inyectarEstilos = () => {
    if (document.getElementById('reservas-estilos')) return;
    const estilo = document.createElement('style');
    estilo.id = 'reservas-estilos';
    estilo.textContent = `
      .rsv-oculto { display: none !important; }
      .rsv-mensaje { margin: 12px 0; padding: 12px 14px; border: 1px solid; border-radius: 4px; font-size: .95rem; line-height: 1.5; }
      .rsv-mensaje:empty { margin: 0; padding: 0; border: 0; }
      .rsv-mensaje--error { color: #FF8A80; border-color: rgba(255,107,94,.5); background: rgba(255,107,94,.08); }
      .rsv-mensaje--aviso, .rsv-mensaje--info { color: var(--oro-viejo, #D4AF37); border-color: rgba(212,175,55,.4); background: rgba(212,175,55,.06); }
      .rsv-mensaje a { color: inherit; text-underline-offset: 3px; }
      .rsv-franja-pasada { opacity: .4; cursor: not-allowed; }
      .rsv-invalido { outline: 2px solid #FF8A80; outline-offset: 2px; }
      .rsv-confirmacion { text-align: center; padding: 20px; }
      .rsv-confirmacion:focus { outline: none; }
      .rsv-confirmacion__icono { color: var(--oro-viejo, #D4AF37); font-size: 4rem; margin-bottom: 20px; }
      .rsv-confirmacion__titulo { font-family: 'Playfair Display', serif; color: var(--oro-viejo, #D4AF37); margin-bottom: 15px; }
      .rsv-confirmacion__texto { font-size: 1.1rem; line-height: 1.6; margin-bottom: 25px; }
      .rsv-confirmacion__datos { display: inline-block; text-align: left; margin-bottom: 25px; padding: 15px; font-size: .95rem; background: rgba(212,175,55,.05); border: 1px solid rgba(212,175,55,.2); border-radius: 4px; }
      .rsv-confirmacion__datos p { margin: 5px 0; }
      .rsv-confirmacion__nota { margin-bottom: 20px; font-size: .85rem; color: var(--texto-mutado, #8A8A8A); }
    `;
    document.head.append(estilo);
  };

  // Mensajes dentro de la página (reemplazan a los alert)
  const zonaMensaje = document.createElement('div');
  zonaMensaje.className = 'rsv-mensaje';
  zonaMensaje.setAttribute('role', 'alert');
  const botonEnviar = reservationForm.querySelector('[type="submit"]');
  if (botonEnviar) botonEnviar.before(zonaMensaje); else reservationForm.append(zonaMensaje);

  // Estado del botón de envío (admite <button> e <input type="submit">)
  let enviando = false;
  const etiquetaBoton = (boton) => (boton.tagName === 'INPUT' ? boton.value : boton.textContent);
  const ponerEtiquetaBoton = (boton, texto) => { if (boton.tagName === 'INPUT') boton.value = texto; else boton.textContent = texto; };
  const etiquetaOriginal = botonEnviar ? etiquetaBoton(botonEnviar) : '';
  const restaurarBotonEnviar = () => {
    enviando = false;
    if (botonEnviar) {
      botonEnviar.disabled = false;
      ponerEtiquetaBoton(botonEnviar, etiquetaOriginal);
    }
  };

  let mensajeDeFranjas = false; // true cuando el aviso visible lo puso actualizarFranjas (y puede retirarlo cuando ya no aplique)
  const mostrarMensaje = (contenido, tipo = 'error') => {
    mensajeDeFranjas = false;
    zonaMensaje.className = `rsv-mensaje rsv-mensaje--${tipo}`;
    zonaMensaje.replaceChildren(...[].concat(contenido).map((c) => (typeof c === 'string' ? document.createTextNode(c) : c)));
  };
  const limpiarMensaje = () => {
    mensajeDeFranjas = false;
    zonaMensaje.className = 'rsv-mensaje';
    zonaMensaje.replaceChildren();
  };
  const marcarInvalido = (campo) => {
    if (!campo) return;
    campo.classList.add('rsv-invalido');
    campo.setAttribute('aria-invalid', 'true');
    campo.focus();
    const limpiar = () => { campo.classList.remove('rsv-invalido'); campo.removeAttribute('aria-invalid'); };
    campo.addEventListener('input', limpiar, { once: true });
    campo.addEventListener('change', limpiar, { once: true });
  };

  // 2. Control de fechas mínimas (la fecha se calcula con la hora local, no en UTC)
  const establecerFechaMinima = () => {
    const hoy = hoyISO();
    bookingDateInput.min = hoy;
    // Por defecto, el día de hoy; si ya pasaron todas sus franjas, se propone mañana para no dejar al cliente sin opciones
    const franjas = obtenerFranjas();
    const hoyAgotado = franjas.length > 0 && franjas.every((franja) => franjaYaPaso(franja, hoy));
    bookingDateInput.value = hoyAgotado ? mananaISO() : hoy;
  };

  // 3. Franjas horarias
  const parsearInicioMin = (valor) => {
    const m = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(valor || '');
    if (!m) return null;
    return ((parseInt(m[1], 10) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + parseInt(m[2], 10);
  };
  const obtenerFranjas = () => Array.from(reservationForm.querySelectorAll(FRANJA_SELECTOR)).map((input) => ({
    input,
    contenedor: input.closest('[id^="container-slot"]') || input.parentElement,
    inicioMin: parsearInicioMin(input.value)
  }));
  const franjaYaPaso = (franja, fecha) => {
    if (!fecha) return false;
    const hoy = hoyISO();
    if (fecha < hoy) return true;
    if (fecha > hoy || franja.inicioMin == null) return false;
    const ahora = new Date();
    return franja.inicioMin - CONFIG.antelacionMinutos <= ahora.getHours() * 60 + ahora.getMinutes();
  };

  // Regla de mesas: una sola función para el cambio de comensales y para el envío
  const obtenerTipoMesa = (n) => (n >= 1 && n <= 4 ? 'tipo_A' : n >= 5 && n <= CONFIG.maxPersonas ? 'tipo_B' : null);

  // 4. Disponibilidad (simulación de Cloud Firestore)
  // Devuelve los IDs de las franjas sin cupo para esa fecha y tipo de mesa.
  const consultarDisponibilidad = async (fecha, tipoMesa) => {
    log(`[Firestore Mock]: verificando inventario para Fecha: ${fecha} | Mesa: ${tipoMesa}`);
    await pausa(150);
    // TODO Firestore: leer los cupos de la fecha, p. ej. disponibilidad/{fecha}_{franja}_{tipoMesa}
    // Simulación: los grupos grandes (mesa tipo B) no encuentran cupo en la franja "slot3".
    return { franjasAgotadas: tipoMesa === 'tipo_B' ? ['slot3'] : [] };
  };

  let consultaActual = 0;
  let ultimasAgotadas = [];
  let ultimaClave = '';
  const claveActual = () => `bookingDateInput.value|{guestsSelect.value}`;

  const avisarFranjas = (texto) => {
    mostrarMensaje(texto, 'aviso');
    mensajeDeFranjas = true;
  };

  // Pinta el estado de las franjas con lo que hay en pantalla en este momento (sin consultar la base de datos)
  const aplicarFranjas = (fecha, tipoMesa, agotadas, { avisarPerdida = true } = {}) => {
    bookingDateInput.min = hoyISO(); // si pasó la medianoche, "hoy" cambió
    const franjas = obtenerFranjas();
    let hayDisponible = false;
    let seleccionadaPerdida = false;
    franjas.forEach((franja) => {
      const agotada = agotadas.includes(franja.input.id);
      const pasada = franjaYaPaso(franja, fecha);
      const noDisponible = agotada || pasada;
      franja.input.disabled = noDisponible;
      franja.contenedor.classList.toggle('sold-out', agotada);
      franja.contenedor.classList.toggle('rsv-franja-pasada', pasada && !agotada);
      if (pasada) franja.contenedor.title = 'Esta franja ya pasó'; else franja.contenedor.removeAttribute('title');
      if (noDisponible && franja.input.checked) { franja.input.checked = false; seleccionadaPerdida = true; }
      if (!noDisponible) hayDisponible = true;
    });

    const todasPasadas = Boolean(fecha) && franjas.length > 0 && franjas.every((franja) => franjaYaPaso(franja, fecha));
    if (todasPasadas) {
      log('[Reservas] Todas las franjas figuran como pasadas', { fecha, hoy: hoyISO(), hora: new Date().toTimeString().slice(0, 5) });
      avisarFranjas(`Ya pasaron todas las franjas del ${formatearFecha(fecha)}. Elige otra fecha.`);
    } else if (fecha && tipoMesa && !hayDisponible) {
      avisarFranjas('No hay franjas disponibles para esa fecha y cantidad de personas. Prueba con otra fecha.');
    } else if (seleccionadaPerdida && avisarPerdida) {
      avisarFranjas('La franja que habías elegido ya no está disponible. Elige otra.');
    } else if (mensajeDeFranjas) {
      limpiarMensaje(); // el aviso anterior ya no aplica
    }
  };

  const actualizarFranjas = async ({ avisarPerdida = true } = {}) => {
    const fecha = bookingDateInput.value;
    const tipoMesa = obtenerTipoMesa(parseInt(guestsSelect.value, 10));
    const clave = claveActual();
    const consulta = ++consultaActual; // una respuesta lenta no debe pisar a una más reciente
    let agotadas = [];

    if (fecha && tipoMesa) {
      try {
        ({ franjasAgotadas: agotadas } = await consultarDisponibilidad(fecha, tipoMesa));
      } catch (error) {
        console.error(error);
        mostrarMensaje('No pudimos consultar la disponibilidad. Revisa tu conexión e inténtalo de nuevo.');
        return;
      }
      if (consulta !== consultaActual) return;
    }

    ultimasAgotadas = agotadas;
    ultimaClave = clave;
    aplicarFranjas(fecha, tipoMesa, agotadas, { avisarPerdida });
  };

  // Vuelve a calcular el estado cuando pasa el tiempo o cuando los valores cambiaron sin avisar
  // (por ejemplo, si el navegador restaura el formulario al recargar la página)
  const refrescarFranjas = () => {
    if (claveActual() !== ultimaClave) {
      actualizarFranjas({ avisarPerdida: false });
    } else {
      aplicarFranjas(bookingDateInput.value, obtenerTipoMesa(parseInt(guestsSelect.value, 10)), ultimasAgotadas, { avisarPerdida: false });
    }
  };

  // Aviso para grupos de más de 8 personas
  const mensajeGrupoGrande = () => {
    const partes = [`Para grupos de más de ${CONFIG.maxPersonas} personas coordinamos un espacio privado y un menú personalizado. Comunícate directamente con nuestro Concierge`];
    const { telefono, whatsapp } = CONFIG.contacto;
    const enlaces = [];
    if (telefono) { const a = document.createElement('a'); a.href = `tel:${telefono.replace(/[^\d+]/g, '')}`; a.textContent = `llamando al ${telefono}`; enlaces.push(a); }
    if (whatsapp) { const a = document.createElement('a'); a.href = `https://wa.me/${whatsapp.replace(/\D/g, '')}`; a.textContent = 'por WhatsApp'; enlaces.push(a); }
    if (!enlaces.length) return `${partes[0]}.`;
    const nodos = [`${partes[0]}: `];
    enlaces.forEach((a, i) => { if (i) nodos.push(' o '); nodos.push(a); });
    nodos.push('.');
    return nodos;
  };

  // 5. Datos de contacto
  const validarContacto = () => {
    if (!nameInput || !phoneInput) return { campo: null, mensaje: 'No se puede enviar la solicitud: faltan los campos de contacto en el formulario.' };
    const nombre = nameInput.value.trim();
    const telefono = phoneInput.value.trim();
    const correo = emailInput ? emailInput.value.trim() : '';
    if (nombre.length < 2) return { campo: nameInput, mensaje: 'Escribe tu nombre para que el restaurante sepa a nombre de quién reservar.' };
    const digitos = telefono.replace(/\D/g, '');
    if (!/^[+()\-\s\d]+$/.test(telefono) || digitos.length < 7 || digitos.length > 15) return { campo: phoneInput, mensaje: 'Escribe un teléfono válido, con entre 7 y 15 dígitos.' };
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { campo: emailInput, mensaje: 'El correo no parece válido. Revisa que tenga @ y un dominio, por ejemplo nombre@correo.com.' };
    return { contacto: { nombre, telefono, correo } };
  };

  // 6. Registro de la reserva (simulación de Cloud Firestore)
  class HorarioNoDisponibleError extends Error {}

  const guardarReserva = async (payload, idFranja) => {
    await pausa(400);
    if (CONFIG.simularFalloGuardado) throw new Error('Fallo simulado al registrar la reserva');
    // TODO Firestore: runTransaction(db, async (tx) => { leer el cupo de fecha + franja + tipo de mesa;
    //   si no queda cupo -> throw new HorarioNoDisponibleError(); incrementar el cupo y crear la reserva }).
    // creado_en debe ser serverTimestamp(): el reloj del cliente no es confiable.
    const { franjasAgotadas } = await consultarDisponibilidad(payload.fecha_operativa, payload.tipo_mesa_asignada);
    if (franjasAgotadas.includes(idFranja)) throw new HorarioNoDisponibleError();
    const id = `RES_${Math.floor(10000 + Math.random() * 90000)}`; // con Firestore: el ID del documento
    log('--- RESERVA PENDIENTE LISTA PARA CLOUD FIRESTORE ---', { id, ...payload });
    return { id };
  };

  // 7. Confirmación en pantalla (se construye con DOM y textContent, nunca con innerHTML)
  const hijosOriginales = Array.from(contenedor.children);
  let bloqueConfirmacion = null;

  const crearConfirmacion = (datos) => {
    const el = (etiqueta, clase, texto) => {
      const nodo = document.createElement(etiqueta);
      if (clase) nodo.className = clase;
      if (texto != null) nodo.textContent = texto;
      return nodo;
    };
    const linea = (titulo, valor) => {
      const p = el('p');
      p.append(el('strong', '', `${titulo}: `), document.createTextNode(valor));
      return p;
    };

    const bloque = el('div', 'rsv-confirmacion');
    bloque.tabIndex = -1;
    bloque.setAttribute('role', 'status');

    const icono = el('div', 'rsv-confirmacion__icono', '✓');
    icono.setAttribute('aria-hidden', 'true');
    const personas = `${datos.cantidad_comensales} ${datos.cantidad_comensales === 1 ? 'persona' : 'personas'}`;
    const texto = el('p', 'rsv-confirmacion__texto');
    texto.append('Tu solicitud para ', el('strong', '', personas), ' está pendiente de confirmación. El restaurante te avisará cuando la confirme.');

    const detalle = el('div', 'rsv-confirmacion__datos');
    detalle.append(
      linea('Código de reserva', datos.codigo),
      linea('A nombre de', datos.cliente_nombre),
      linea('Fecha de visita', formatearFecha(datos.fecha_operativa)),
      linea('Horario de entrada', datos.franja_horaria.split(' - ')[0]),
      linea('Franja asignada', datos.franja_horaria),
      linea('Estado', 'Pendiente de confirmación')
    );

    const botonOtra = el('button', botonEnviar ? botonEnviar.className : '', 'Hacer otra reserva');
    botonOtra.type = 'button';
    botonOtra.addEventListener('click', reiniciarFormulario);

    bloque.append(
      icono,
      el('h2', 'rsv-confirmacion__titulo', 'Solicitud de reserva recibida'),
      texto,
      detalle,
      el('p', 'rsv-confirmacion__nota', 'Guarda tu código de reserva para cualquier consulta. Agradecemos tu puntualidad para garantizar la exclusividad del servicio.'),
      botonOtra
    );
    return bloque;
  };

  function mostrarConfirmacion(datos) {
    const bloque = crearConfirmacion(datos);
    contenedor.style.opacity = '0'; // desvanecimiento controlado
    setTimeout(() => {
      hijosOriginales.forEach((nodo) => nodo.classList.add('rsv-oculto'));
      bloqueConfirmacion = bloque;
      contenedor.append(bloque);
      contenedor.style.opacity = '1';
      bloque.focus();
    }, 500);
  }

  function reiniciarFormulario() {
    if (bloqueConfirmacion) bloqueConfirmacion.remove();
    bloqueConfirmacion = null;
    hijosOriginales.forEach((nodo) => nodo.classList.remove('rsv-oculto'));
    reservationForm.reset();
    restaurarBotonEnviar();
    establecerFechaMinima();
    limpiarMensaje();
    actualizarFranjas();
    guestsSelect.focus();
  }

  // 8. Cambio de comensales (regla de aforo físico)
  guestsSelect.addEventListener('change', (e) => {
    limpiarMensaje();
    const valorSeleccionado = e.target.value;

    // Grupos mayores a 8 personas: se informa en la página y se vuelve a la selección vacía
    if (valorSeleccionado === CONFIG.valorGrupoGrande) {
      mostrarMensaje(mensajeGrupoGrande(), 'info');
      guestsSelect.value = '';
      actualizarFranjas();
      return;
    }

    const tipoMesaRequerida = obtenerTipoMesa(parseInt(valorSeleccionado, 10));
    if (tipoMesaRequerida) log(`[Lógica interna]: el cliente requiere mesa ${tipoMesaRequerida}`);
    actualizarFranjas();
  });

  // 9. Cambio de fecha: la disponibilidad depende de la fecha, así que se consulta de nuevo.
  // Al teclear la fecha el navegador pasa por valores intermedios (01/10, 13/01, año 0002, 0020, 0202...),
  // por eso se espera un instante y se ignoran las fechas con el año incompleto.
  let esperaFecha = null;
  const alCambiarFecha = () => {
    limpiarMensaje();
    clearTimeout(esperaFecha);
    esperaFecha = setTimeout(() => {
      if (bookingDateInput.value && bookingDateInput.value < '1900-01-01') return;
      actualizarFranjas();
    }, 150);
  };
  bookingDateInput.addEventListener('input', alCambiarFecha);
  bookingDateInput.addEventListener('change', alCambiarFecha);
  bookingDateInput.addEventListener('blur', () => { clearTimeout(esperaFecha); actualizarFranjas(); });

  // Si la pestaña estuvo abierta o en segundo plano, o pasó el tiempo, se recalcula el estado de las franjas
  document.addEventListener('visibilitychange', () => { if (!document.hidden) actualizarFranjas({ avisarPerdida: false }); });
  window.addEventListener('focus', refrescarFranjas);
  setInterval(() => { if (!document.hidden) refrescarFranjas(); }, 60000);

  // 10. Envío del formulario
  reservationForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // evita la recarga de la página
    if (enviando) return;
    limpiarMensaje();

    const fecha = bookingDateInput.value;
    if (!fecha) {
      mostrarMensaje('Elige la fecha de tu visita.');
      marcarInvalido(bookingDateInput);
      return;
    }
    if (fecha < hoyISO()) {
      mostrarMensaje('La fecha no puede estar en el pasado. Elige hoy o un día posterior.');
      marcarInvalido(bookingDateInput);
      return;
    }

    const cantidadComensales = parseInt(guestsSelect.value, 10);
    const tipoMesa = obtenerTipoMesa(cantidadComensales);
    if (!tipoMesa) {
      mostrarMensaje(`Elige cuántas personas serán (hasta ${CONFIG.maxPersonas}).`);
      marcarInvalido(guestsSelect);
      return;
    }

    const slotSeleccionado = reservationForm.querySelector(`${FRANJA_SELECTOR}:checked`);
    if (!slotSeleccionado) {
      await actualizarFranjas({ avisarPerdida: false }); // por si el estado de las franjas estaba desactualizado
      if (!zonaMensaje.hasChildNodes()) mostrarMensaje('Selecciona una franja horaria para tu visita.');
      return;
    }
    const franja = obtenerFranjas().find((f) => f.input === slotSeleccionado);
    if (franja && franjaYaPaso(franja, fecha)) {
      mostrarMensaje('Esa franja ya pasó. Elige otra.', 'aviso');
      actualizarFranjas();
      return;
    }

    const validacion = validarContacto();
    if (validacion.mensaje) {
      mostrarMensaje(validacion.mensaje);
      marcarInvalido(validacion.campo);
      return;
    }

    // Payload con la misma estructura que tendrá el documento en la base de datos NoSQL
    const payloadReserva = {
      fecha_operativa: fecha,
      cantidad_comensales: cantidadComensales,
      franja_horaria: slotSeleccionado.value, // Ejemplo: "12:00 PM - 02:00 PM"
      tipo_mesa_asignada: tipoMesa,
      cliente_nombre: validacion.contacto.nombre,
      cliente_telefono: validacion.contacto.telefono,
      cliente_correo: validacion.contacto.correo,
      estado: CONFIG.estadoInicial, // "pendiente" hasta que el administrador la confirme
      creado_en: new Date().toISOString() // con Firestore: serverTimestamp()
    };

    enviando = true;
    let registrada = false;
    if (botonEnviar) {
      botonEnviar.disabled = true;
      ponerEtiquetaBoton(botonEnviar, 'Enviando solicitud…');
    }

    try {
      const { id } = await guardarReserva(payloadReserva, slotSeleccionado.id);
      registrada = true;
      mostrarConfirmacion({ ...payloadReserva, codigo: id });
    } catch (error) {
      if (error instanceof HorarioNoDisponibleError) {
        await actualizarFranjas({ avisarPerdida: false });
        // Si ya no queda ninguna franja, actualizarFranjas explicó el motivo; si no, se explica aquí
        if (!zonaMensaje.hasChildNodes()) mostrarMensaje('Ese horario acaba de ocuparse. Elige otra franja y vuelve a enviar la solicitud.', 'aviso');
      } else {
        console.error(error);
        mostrarMensaje('No pudimos registrar tu solicitud. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally {
      // Si se registró, el botón sigue bloqueado hasta que se muestre la confirmación (evita duplicados)
      if (!registrada) restaurarBotonEnviar();
    }
  });

  // Inicio
  log('[Reservas] módulo cargado (v2)');
  inyectarEstilos();
  establecerFechaMinima();
  actualizarFranjas(); // aplica desde el inicio el filtro de franjas que ya pasaron
});



