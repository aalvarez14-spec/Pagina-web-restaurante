'use strict';

/**
 * Fernando Parrilla - Módulo de domicilios (front-end)
 *
 * Reglas de negocio
 *  - El carrito lo llena menu.js en localStorage ("carrito_parrilla"); aquí el cliente puede
 *    cambiar cantidades y quitar platos antes de confirmar.
 *  - Envío fijo de $5.000. Por ahora solo se paga en efectivo contra entrega y el cliente indica
 *    con cuánto paga para que el repartidor lleve los vueltos. (Pagos en línea: pendiente.)
 *  - Un pedido nuevo queda en estado "pendiente" hasta que el administrador lo confirme
 *    (caso de uso "Gestionar pedidos"). Los estados son los mismos de admin.html:
 *    pendiente -> recibido -> en_preparacion -> enviado -> entregado (o rechazado).
 *  - La disponibilidad de los platos la decide el administrador; aquí no se valida.
 *  - El cliente consulta el estado con el código del pedido y su celular
 *    (casos de uso "Gestionar pedidos" y "Confirmación de pedido").
 *
 * La persistencia es simulada con localStorage, igual que app.js simula Firestore.
 * Los puntos de cambio están marcados con "TODO Firestore".
 *
 * Elementos que debe tener domicilios.html: ver el método DomiciliosUI.#cargarDom().
 */

(() => {
  // ───── 0. Configuración ─────
  const CONFIG = Object.freeze({
    claveCarrito: 'carrito_parrilla',            // la misma que usa menu.js
    clavePedidos: 'pedidos_domicilio',           // simulación de la colección "pedidos"
    claveUltimoPedido: 'ultimo_pedido_domicilio',
    costoEnvio: 5000,
    maxPorPlato: 20,
    maxPagoCon: 5000000,
    estadoInicial: 'pendiente',
    intervaloSeguimientoMs: 15000,
    simularFalloGuardado: false,                 // true para probar el mensaje de error al registrar el pedido
    debug: true
  });

  const ESTADOS = Object.freeze({
    pendiente: { etiqueta: 'Pendiente', detalle: 'El restaurante aún no confirma tu pedido. Te avisaremos cuando lo reciba.' },
    recibido: { etiqueta: 'Recibido', detalle: 'El restaurante confirmó la recepción de tu pedido.' },
    en_preparacion: { etiqueta: 'En preparación', detalle: 'Estamos preparando tu pedido en la parrilla.' },
    enviado: { etiqueta: 'Enviado', detalle: 'Tu pedido salió hacia tu dirección.' },
    entregado: { etiqueta: 'Entregado', detalle: 'Tu pedido fue entregado. ¡Buen provecho!' },
    rechazado: { etiqueta: 'No recibido', detalle: 'El restaurante no pudo recibir tu pedido. Comunícate con nosotros para coordinarlo.' }
  });
  const PASOS = Object.freeze(['pendiente', 'recibido', 'en_preparacion', 'enviado', 'entregado']);
  const ESTADOS_FINALES = Object.freeze(['entregado', 'rechazado']);

  // ───── 1. Utilidades ─────
  const log = (...args) => { if (CONFIG.debug) console.log(...args); };
  const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Crea elementos con textContent (nunca con innerHTML): los datos del cliente no pueden inyectar HTML.
  const h = (etiqueta, atributos = {}, ...hijos) => {
    const el = document.createElement(etiqueta);
    for (const [clave, valor] of Object.entries(atributos)) {
      if (valor == null || valor === false) continue;
      if (clave === 'class') el.className = valor;
      else if (clave.startsWith('on') && typeof valor === 'function') el.addEventListener(clave.slice(2), valor);
      else el.setAttribute(clave, valor === true ? '' : valor);
    }
    for (const hijo of hijos.flat()) {
      if (hijo == null || hijo === false) continue;
      el.append(hijo.nodeType ? hijo : document.createTextNode(String(hijo)));
    }
    return el;
  };

  // ───── 2. Errores específicos ─────
  class ValidacionError extends Error {
    constructor(campo, mensaje) {
      super(mensaje);
      this.name = 'ValidacionError';
      this.campo = campo;
    }
  }
  class PersistenciaError extends Error {
    constructor(mensaje, opciones) {
      super(mensaje, opciones);
      this.name = 'PersistenciaError';
    }
  }
  class PedidoNoEncontradoError extends Error {
    constructor() {
      super('Pedido no encontrado');
      this.name = 'PedidoNoEncontradoError';
    }
  }

  // ───── 3. Valores: moneda, teléfono y código de pedido ─────
  class Moneda {
    static formatear(valor) {
      return `$${Number(valor).toLocaleString('es-CO')}`;
    }
    // "$100.000" -> 100000. Devuelve NaN si no hay dígitos.
    static aEntero(texto) {
      const digitos = String(texto ?? '').replace(/\D/g, '');
      return digitos ? parseInt(digitos, 10) : NaN;
    }
  }

  class Telefono {
    // Celular colombiano: 10 dígitos que empiezan por 3 (admite +57 / 57 al inicio). Devuelve null si no es válido.
    static normalizar(texto) {
      let digitos = String(texto ?? '').replace(/\D/g, '');
      if (digitos.length === 12 && digitos.startsWith('57')) digitos = digitos.slice(2);
      return /^3\d{9}$/.test(digitos) ? digitos : null;
    }
    static formatear(digitos) {
      return `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}`;
    }
  }

  class CodigoPedido {
    // Acepta "PED_12345", "ped-12345", "#PED_12345" o solo "12345". Devuelve null si no es válido.
    static normalizar(texto) {
      const limpio = String(texto ?? '').toUpperCase().replace(/[\s#]/g, '');
      const m = /^(?:PED[_-]?)?(\d{5})$/.exec(limpio);
      return m ? `PED_${m[1]}` : null;
    }
  }

  // ───── 4. Almacenamiento local seguro ─────
  class AlmacenLocal {
    leer(clave) {
      try {
        return localStorage.getItem(clave);
      } catch (error) {
        console.warn('[Domicilios] localStorage no disponible para leer', error);
        return null;
      }
    }
    escribir(clave, valor) {
      try {
        localStorage.setItem(clave, valor);
      } catch (error) {
        throw new PersistenciaError('No se pudo escribir en el almacenamiento local', { cause: error });
      }
    }
    eliminar(clave) {
      try {
        localStorage.removeItem(clave);
      } catch (error) {
        console.warn('[Domicilios] localStorage no disponible para eliminar', error);
      }
    }
  }

  // ───── 5. Carrito ─────
  class CarritoRepositorio {
    #almacen;
    #clave;

    constructor(almacen, clave) {
      this.#almacen = almacen;
      this.#clave = clave;
    }

    // Lee y sanea lo que guardó menu.js: ignora filas dañadas, une repetidos y limita la cantidad.
    leer() {
      const crudo = this.#almacen.leer(this.#clave);
      if (!crudo) return [];
      let datos;
      try {
        datos = JSON.parse(crudo);
      } catch (error) {
        if (error instanceof SyntaxError) return [];
        throw error;
      }
      if (!Array.isArray(datos)) return [];

      const porId = new Map();
      for (const crudoItem of datos) {
        const item = CarritoRepositorio.#sanear(crudoItem);
        if (!item) continue;
        const previo = porId.get(item.id);
        if (previo) previo.cantidad = Math.min(previo.cantidad + item.cantidad, CONFIG.maxPorPlato);
        else porId.set(item.id, item);
      }
      return [...porId.values()];
    }

    guardar(items) {
      this.#almacen.escribir(this.#clave, JSON.stringify(items));
    }

    vaciar() {
      this.#almacen.eliminar(this.#clave);
    }

    static #sanear(item) {
      if (!item || typeof item !== 'object') return null;
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      const nombre = typeof item.nombre === 'string' ? item.nombre.trim().slice(0, 80) : '';
      const precio = Number(item.precio);
      const cantidad = Number(item.cantidad);
      if (!id || !nombre) return null;
      if (!Number.isInteger(precio) || precio <= 0) return null;
      if (!Number.isInteger(cantidad) || cantidad <= 0) return null;
      return { id, nombre, precio, cantidad: Math.min(cantidad, CONFIG.maxPorPlato) };
    }
  }

  class Carrito {
    #repositorio;
    #items = [];

    constructor(repositorio) {
      this.#repositorio = repositorio;
      this.recargar();
    }

    recargar() {
      this.#items = this.#repositorio.leer();
    }

    get items() { return this.#items.map((item) => ({ ...item })); }
    get vacio() { return this.#items.length === 0; }
    get subtotal() { return this.#items.reduce((suma, i) => suma + i.precio * i.cantidad, 0); }
    get envio() { return this.vacio ? 0 : CONFIG.costoEnvio; }
    get total() { return this.subtotal + this.envio; }

    // Devuelve true si la cantidad cambió (respeta el mínimo de 1 y el máximo por plato).
    cambiarCantidad(id, delta) {
      const item = this.#items.find((i) => i.id === id);
      if (!item) return false;
      const nueva = item.cantidad + delta;
      if (nueva < 1 || nueva > CONFIG.maxPorPlato) return false;
      item.cantidad = nueva;
      this.#repositorio.guardar(this.#items);
      return true;
    }

    quitar(id) {
      const antes = this.#items.length;
      this.#items = this.#items.filter((i) => i.id !== id);
      if (this.#items.length === antes) return false;
      this.#repositorio.guardar(this.#items);
      return true;
    }

    vaciar() {
      this.#items = [];
      this.#repositorio.vaciar();
    }
  }

  // ───── 6. Validación de los datos de entrega ─────
  class ValidadorPedido {
    static #NOMBRE = /^\p{L}[\p{L}\s.'’-]{1,59}$/u;
    static #DIRECCION = /^[\p{L}\d\s#.,\-°ºª/]+$/u;
    static #CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    // Devuelve los datos limpios o lanza ValidacionError con el campo y el mensaje para el cliente.
    static validar(valores, total) {
      const limpiar = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
      const nombre = limpiar(valores.nombre);
      const telefonoCrudo = limpiar(valores.telefono);
      const correo = limpiar(valores.correo);
      const direccion = limpiar(valores.direccion);
      const apto = limpiar(valores.apto);
      const barrio = limpiar(valores.barrio);
      const indicaciones = String(valores.indicaciones ?? '').trim();

      if (!ValidadorPedido.#NOMBRE.test(nombre)) {
        throw new ValidacionError('nombre', 'Escribe tu nombre completo usando solo letras (entre 2 y 60 caracteres).');
      }

      const telefonoDigitos = Telefono.normalizar(telefonoCrudo);
      if (!telefonoDigitos) {
        throw new ValidacionError('telefono', 'Escribe un celular válido de 10 dígitos que empiece por 3, por ejemplo 300 000 0000.');
      }

      if (correo && (correo.length > 100 || !ValidadorPedido.#CORREO.test(correo))) {
        throw new ValidacionError('correo', 'El correo no parece válido. Revisa que tenga @ y un dominio, por ejemplo nombre@correo.com.');
      }

      const direccionValida = direccion.length >= 5 && direccion.length <= 100
        && ValidadorPedido.#DIRECCION.test(direccion) && /\p{L}/u.test(direccion) && /\d/.test(direccion);
      if (!direccionValida) {
        throw new ValidacionError('direccion', 'Escribe tu dirección completa con calle o carrera y número, por ejemplo: Cra 15 # 85-20.');
      }

      if (apto.length > 30) {
        throw new ValidacionError('apto', 'El apartamento o casa admite máximo 30 caracteres.');
      }

      if (barrio.length < 3 || barrio.length > 50) {
        throw new ValidacionError('barrio', 'Escribe el barrio de entrega (entre 3 y 50 caracteres).');
      }

      if (indicaciones.length > 200) {
        throw new ValidacionError('indicaciones', 'Las indicaciones admiten máximo 200 caracteres.');
      }

      const pagaCon = Moneda.aEntero(valores.pagaCon);
      if (Number.isNaN(pagaCon)) {
        throw new ValidacionError('pagaCon', 'Indica con cuánto vas a pagar para que el repartidor lleve los vueltos.');
      }
      if (pagaCon < total) {
        throw new ValidacionError('pagaCon', `El valor con el que pagas debe ser igual o mayor al total (${Moneda.formatear(total)}).`);
      }
      if (pagaCon > CONFIG.maxPagoCon) {
        throw new ValidacionError('pagaCon', 'El valor con el que pagas es demasiado alto. Revisa la cifra.');
      }

      return {
        cliente: nombre,
        telefono: Telefono.formatear(telefonoDigitos),
        correo,
        direccion: apto ? `${direccion}, ${apto}` : direccion,
        barrio,
        referencias: indicaciones,
        pagaCon
      };
    }
  }

  // ───── 7. Persistencia de pedidos (simulación de Cloud Firestore) ─────
  class PedidoRepositorio {
    #almacen;
    #clave;

    constructor(almacen, clave) {
      this.#almacen = almacen;
      this.#clave = clave;
    }

    async guardar(datos) {
      await pausa(400);
      if (CONFIG.simularFalloGuardado) throw new PersistenciaError('Fallo simulado al registrar el pedido');
      // TODO Firestore: await addDoc(collection(db, 'pedidos'), { ...datos, creado_en: serverTimestamp() });
      // creado_en y actualizado_en deben ser serverTimestamp(): el reloj del cliente no es confiable.
      const pedidos = this.#leerTodos();
      const pedido = { id: this.#generarId(pedidos), ...datos };
      pedidos.push(pedido);
      this.#escribirTodos(pedidos);
      log('--- PEDIDO PENDIENTE LISTO PARA CLOUD FIRESTORE ---', pedido);
      return structuredClone(pedido);
    }

    // Busca por código y celular; si el celular no coincide responde igual que si el pedido no existiera.
    async buscar(codigo, telefonoDigitos) {
      await pausa(150);
      // TODO Firestore: getDoc / onSnapshot sobre pedidos/{codigo} y comparar el teléfono (idealmente con una Cloud Function).
      const pedido = this.#leerTodos().find((p) => p.id === codigo);
      if (!pedido || Telefono.normalizar(pedido.telefono) !== telefonoDigitos) throw new PedidoNoEncontradoError();
      return structuredClone(pedido);
    }

    #leerTodos() {
      const crudo = this.#almacen.leer(this.#clave);
      if (!crudo) return [];
      try {
        const datos = JSON.parse(crudo);
        return Array.isArray(datos) ? datos : [];
      } catch (error) {
        if (error instanceof SyntaxError) return [];
        throw error;
      }
    }

    #escribirTodos(pedidos) {
      this.#almacen.escribir(this.#clave, JSON.stringify(pedidos));
    }

    #generarId(pedidos) {
      const usados = new Set(pedidos.map((p) => p.id));
      for (let intento = 0; intento < 100; intento++) {
        const id = `PED_${Math.floor(10000 + Math.random() * 90000)}`;
        if (!usados.has(id)) return id;
      }
      throw new PersistenciaError('No se pudo generar un código de pedido único');
    }
  }

  // ───── 8. Interfaz ─────
  class DomiciliosUI {
    #carrito;
    #pedidos;
    #almacen;
    #dom = {};
    #enviando = false;
    #vista = 'pedido';
    #pedidoActual = null;
    #temporizador = null;
    #foco = null;

    static CAMPOS = Object.freeze({
      nombre: 'fullName', telefono: 'phone', correo: 'email', direccion: 'address',
      apto: 'apt', barrio: 'neighborhood', indicaciones: 'notes', pagaCon: 'cashAmount'
    });

    constructor(carrito, pedidos, almacen) {
      this.#carrito = carrito;
      this.#pedidos = pedidos;
      this.#almacen = almacen;
    }

    iniciar() {
      if (!this.#cargarDom()) return;
      this.#dom.form.addEventListener('submit', (e) => this.#alEnviar(e));
      // El aviso de error deja de ser válido en cuanto el cliente corrige algún dato.
      this.#dom.form.addEventListener('input', () => { if (!this.#enviando) this.#limpiarMensaje(this.#dom.mensaje); });
      this.#dom.cashAmount.addEventListener('input', () => this.#actualizarPago());
      this.#dom.cashAmount.addEventListener('blur', () => this.#formatearPago());
      this.#dom.tabPedido.addEventListener('click', () => this.#mostrarVista('pedido'));
      this.#dom.tabSeguimiento.addEventListener('click', () => this.#mostrarVista('seguimiento'));
      this.#dom.trackingForm.addEventListener('submit', (e) => this.#alConsultar(e));

      // El carrito puede cambiar desde menu.html en otra pestaña; los pedidos, desde el panel del administrador.
      window.addEventListener('storage', (e) => {
        if (e.key === CONFIG.claveCarrito) this.#recargarCarrito();
        if (e.key === CONFIG.clavePedidos) this.#refrescarSeguimiento({ manual: false });
      });
      window.addEventListener('focus', () => this.#recargarCarrito());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) { this.#recargarCarrito(); this.#refrescarSeguimiento({ manual: false }); }
      });

      const ultimo = this.#almacen.leer(CONFIG.claveUltimoPedido);
      if (ultimo) this.#dom.trackCode.value = ultimo;

      this.#dom.shipping.textContent = Moneda.formatear(CONFIG.costoEnvio);
      this.#renderCarrito();
      log('[Domicilios] módulo cargado');
    }

    #cargarDom() {
      const id = (nombre) => document.getElementById(nombre);
      this.#dom = {
        form: id('deliveryForm'), items: id('orderItems'), subtotal: id('subtotal'), shipping: id('shipping'),
        grandTotal: id('grandTotal'), changeRow: id('changeRow'), changeAmount: id('changeAmount'),
        mensaje: id('orderMessage'), boton: id('checkoutButton'), cashAmount: id('cashAmount'), cashHelp: id('cashHelp'),
        vistaPedido: id('vistaPedido'), vistaSeguimiento: id('vistaSeguimiento'),
        tabPedido: id('tabPedido'), tabSeguimiento: id('tabSeguimiento'),
        trackingForm: id('trackingForm'), trackCode: id('trackCode'), trackPhone: id('trackPhone'),
        trackMessage: id('trackMessage'), trackButton: id('trackButton'), trackResult: id('trackResult')
      };
      const faltantes = Object.entries(this.#dom).filter(([, el]) => !el).map(([nombre]) => nombre);
      if (faltantes.length) {
        console.error('[Domicilios] Faltan elementos en la página:', faltantes.join(', '));
        return false;
      }
      return true;
    }

    // ── Mensajes y campos inválidos ──
    #mostrarMensaje(zona, texto, tipo = 'error') {
      zona.className = `msg ${tipo}`;
      zona.textContent = texto;
    }
    #limpiarMensaje(zona) {
      zona.className = 'msg';
      zona.textContent = '';
    }
    #marcarInvalido(campo) {
      if (!campo) return;
      campo.classList.add('campo-invalido');
      campo.setAttribute('aria-invalid', 'true');
      campo.focus();
      const limpiar = () => { campo.classList.remove('campo-invalido'); campo.removeAttribute('aria-invalid'); };
      campo.addEventListener('input', limpiar, { once: true });
    }

    // ── Carrito ──
    // Solo redibuja si el carrito cambió (así no se pierde el foco al volver a la pestaña).
    #recargarCarrito() {
      if (this.#enviando) return;
      const antes = JSON.stringify(this.#carrito.items);
      this.#carrito.recargar();
      if (JSON.stringify(this.#carrito.items) !== antes) this.#renderCarrito();
    }

    #cambiarCantidad(id, delta, accion) {
      this.#foco = { id, accion };
      try {
        this.#carrito.cambiarCantidad(id, delta);
      } catch (error) {
        if (!(error instanceof PersistenciaError)) throw error;
        console.error(error);
        this.#mostrarMensaje(this.#dom.mensaje, 'No pudimos guardar el cambio en tu carrito. Inténtalo de nuevo.');
      }
      this.#renderCarrito();
    }

    #quitarPlato(id) {
      this.#foco = { id: null, accion: 'lista' };
      try {
        this.#carrito.quitar(id);
      } catch (error) {
        if (!(error instanceof PersistenciaError)) throw error;
        console.error(error);
        this.#mostrarMensaje(this.#dom.mensaje, 'No pudimos quitar el plato de tu carrito. Inténtalo de nuevo.');
      }
      this.#renderCarrito();
    }

    #filaCarrito(item) {
      const enMaximo = item.cantidad >= CONFIG.maxPorPlato;
      return h('li', { class: 'order-item' },
        h('div', { class: 'item-details' },
          h('strong', {}, item.nombre),
          h('span', {}, `${Moneda.formatear(item.precio)} c/u`)),
        h('div', { class: 'item-controls' },
          h('div', { class: 'qty', role: 'group', 'aria-label': `Cantidad de ${item.nombre}` },
            h('button', {
              type: 'button', class: 'qty-btn', 'data-id': item.id, 'data-accion': 'menos',
              'aria-label': `Quitar una unidad de ${item.nombre}`, disabled: item.cantidad <= 1,
              onclick: () => this.#cambiarCantidad(item.id, -1, 'menos')
            }, '−'),
            h('span', { class: 'qty-value', 'aria-live': 'polite' }, String(item.cantidad)),
            h('button', {
              type: 'button', class: 'qty-btn', 'data-id': item.id, 'data-accion': 'mas',
              'aria-label': enMaximo ? `Máximo de ${CONFIG.maxPorPlato} unidades de ${item.nombre}` : `Agregar una unidad de ${item.nombre}`,
              disabled: enMaximo,
              onclick: () => this.#cambiarCantidad(item.id, 1, 'mas')
            }, '+')),
          h('span', { class: 'item-price' }, Moneda.formatear(item.precio * item.cantidad)),
          h('button', {
            type: 'button', class: 'item-remove', 'data-id': item.id, 'data-accion': 'quitar',
            'aria-label': `Quitar ${item.nombre} del pedido`,
            onclick: () => this.#quitarPlato(item.id)
          }, 'Quitar')));
    }

    #renderCarrito() {
      const { items, subtotal, grandTotal, boton } = this.#dom;
      const filas = this.#carrito.items;

      if (filas.length === 0) {
        items.replaceChildren(h('li', { class: 'carrito-vacio' },
          'Tu carrito está vacío.', h('br'), h('a', { href: 'menu.html' }, 'Ver los cortes de carne')));
      } else {
        items.replaceChildren(...filas.map((fila) => this.#filaCarrito(fila)));
      }

      subtotal.textContent = Moneda.formatear(this.#carrito.subtotal);
      grandTotal.textContent = Moneda.formatear(this.#carrito.total);
      boton.disabled = this.#carrito.vacio || this.#enviando;
      this.#restaurarFoco();
      this.#actualizarPago();
    }

    // Tras redibujar la lista el botón pulsado desaparece; se devuelve el foco al equivalente para no perder el lugar.
    #restaurarFoco() {
      const foco = this.#foco;
      this.#foco = null;
      if (!foco) return;
      const { items } = this.#dom;
      if (foco.id) {
        const mismo = Array.from(items.querySelectorAll(`button[data-accion="${foco.accion}"]`)).find((b) => b.dataset.id === foco.id && !b.disabled);
        const otro = Array.from(items.querySelectorAll('button')).find((b) => b.dataset.id === foco.id && !b.disabled);
        const destino = mismo || otro;
        if (destino) { destino.focus(); return; }
      }
      items.focus();
    }

    // ── Pago en efectivo y vueltos ──
    #actualizarPago() {
      const { cashAmount, cashHelp, changeRow, changeAmount } = this.#dom;
      const total = this.#carrito.total;
      const monto = Moneda.aEntero(cashAmount.value);
      cashHelp.className = 'ayuda';
      changeRow.hidden = true;

      if (this.#carrito.vacio) { cashHelp.textContent = ''; return; }
      if (Number.isNaN(monto)) {
        cashHelp.textContent = `Total a pagar: ${Moneda.formatear(total)}.`;
      } else if (monto < total) {
        cashHelp.className = 'ayuda error';
        cashHelp.textContent = `El valor debe ser igual o mayor al total (${Moneda.formatear(total)}).`;
      } else if (monto > CONFIG.maxPagoCon) {
        cashHelp.className = 'ayuda error';
        cashHelp.textContent = 'El valor es demasiado alto. Revisa la cifra.';
      } else if (monto === total) {
        cashHelp.className = 'ayuda ok';
        cashHelp.textContent = 'Pago exacto: no se necesitan vueltos.';
      } else {
        cashHelp.className = 'ayuda ok';
        cashHelp.textContent = `El repartidor llevará ${Moneda.formatear(monto - total)} de vueltos.`;
        changeAmount.textContent = Moneda.formatear(monto - total);
        changeRow.hidden = false;
      }
    }

    #formatearPago() {
      const monto = Moneda.aEntero(this.#dom.cashAmount.value);
      if (!Number.isNaN(monto)) this.#dom.cashAmount.value = Moneda.formatear(monto);
    }

    // ── Envío del pedido ──
    #leerFormulario() {
      const valor = (campo) => document.getElementById(DomiciliosUI.CAMPOS[campo]).value;
      return Object.fromEntries(Object.keys(DomiciliosUI.CAMPOS).map((campo) => [campo, valor(campo)]));
    }

    #construirPedido(datos) {
      const ahora = new Date().toISOString();
      return {
        cliente: datos.cliente,
        telefono: datos.telefono,
        correo: datos.correo,
        direccion: datos.direccion,
        barrio: datos.barrio,
        referencias: datos.referencias,
        items: this.#carrito.items.map(({ id, nombre, cantidad, precio }) => ({ id, nombre, cantidad, precio, observacion: '' })),
        subtotal: this.#carrito.subtotal,
        envio: this.#carrito.envio,
        total: this.#carrito.total,
        metodo_pago: 'efectivo',
        paga_con: datos.pagaCon,
        vueltos: datos.pagaCon - this.#carrito.total,
        estado: CONFIG.estadoInicial,
        creado_en: ahora,       // con Firestore: serverTimestamp()
        actualizado_en: ahora   // con Firestore: serverTimestamp()
      };
    }

    #bloquearEnvio(bloqueado) {
      this.#enviando = bloqueado;
      this.#dom.boton.disabled = bloqueado || this.#carrito.vacio;
      this.#dom.boton.textContent = bloqueado ? 'Enviando pedido…' : 'Confirmar Pedido';
    }

    async #alEnviar(evento) {
      evento.preventDefault();
      if (this.#enviando) return;
      this.#limpiarMensaje(this.#dom.mensaje);

      // Por si el carrito cambió en otra pestaña desde la última vez que se dibujó.
      this.#carrito.recargar();
      this.#renderCarrito();
      if (this.#carrito.vacio) {
        this.#mostrarMensaje(this.#dom.mensaje, 'Tu carrito está vacío. Agrega platos desde el menú para hacer tu pedido.');
        return;
      }

      let datos;
      try {
        datos = ValidadorPedido.validar(this.#leerFormulario(), this.#carrito.total);
      } catch (error) {
        if (!(error instanceof ValidacionError)) throw error;
        this.#mostrarMensaje(this.#dom.mensaje, error.message);
        this.#marcarInvalido(document.getElementById(DomiciliosUI.CAMPOS[error.campo]));
        return;
      }

      this.#bloquearEnvio(true);
      let registrado = false;
      try {
        const pedido = await this.#pedidos.guardar(this.#construirPedido(datos));
        registrado = true;
        this.#carrito.vaciar();
        this.#dom.form.reset();
        // Recordar el código es solo una comodidad: si el almacenamiento falla, el pedido ya quedó registrado.
        try { this.#almacen.escribir(CONFIG.claveUltimoPedido, pedido.id); } catch (error) { if (!(error instanceof PersistenciaError)) throw error; }
        this.#dom.trackCode.value = pedido.id;
        this.#mostrarSeguimiento(pedido, { nuevo: true });
      } catch (error) {
        if (error instanceof PersistenciaError) {
          console.error(error);
          this.#mostrarMensaje(this.#dom.mensaje, 'No pudimos registrar tu pedido. Revisa tu conexión e inténtalo de nuevo.');
        } else {
          console.error(error);
          this.#mostrarMensaje(this.#dom.mensaje, 'Ocurrió un error inesperado. Inténtalo de nuevo en unos segundos.');
        }
      } finally {
        this.#bloquearEnvio(false);
        if (registrado) this.#renderCarrito();
      }
    }

    // ── Vistas ──
    #mostrarVista(vista) {
      this.#vista = vista;
      const esPedido = vista === 'pedido';
      this.#dom.vistaPedido.hidden = !esPedido;
      this.#dom.vistaSeguimiento.hidden = esPedido;
      this.#dom.tabPedido.setAttribute('aria-pressed', String(esPedido));
      this.#dom.tabSeguimiento.setAttribute('aria-pressed', String(!esPedido));
      if (esPedido) this.#detenerSeguimiento(); else this.#iniciarSeguimiento();
    }

    // ── Consulta del estado ──
    async #alConsultar(evento) {
      evento.preventDefault();
      this.#limpiarMensaje(this.#dom.trackMessage);
      const codigo = CodigoPedido.normalizar(this.#dom.trackCode.value);
      if (!codigo) {
        this.#mostrarMensaje(this.#dom.trackMessage, 'Escribe el código de tu pedido, por ejemplo PED_12345.');
        this.#marcarInvalido(this.#dom.trackCode);
        return;
      }
      const telefono = Telefono.normalizar(this.#dom.trackPhone.value);
      if (!telefono) {
        this.#mostrarMensaje(this.#dom.trackMessage, 'Escribe el celular con el que hiciste el pedido (10 dígitos).');
        this.#marcarInvalido(this.#dom.trackPhone);
        return;
      }

      this.#dom.trackButton.disabled = true;
      this.#dom.trackButton.textContent = 'Consultando…';
      try {
        const pedido = await this.#pedidos.buscar(codigo, telefono);
        this.#mostrarSeguimiento(pedido, { nuevo: false });
      } catch (error) {
        this.#dom.trackResult.replaceChildren();
        this.#detenerSeguimiento();
        this.#pedidoActual = null;
        if (error instanceof PedidoNoEncontradoError) {
          this.#mostrarMensaje(this.#dom.trackMessage, 'No encontramos un pedido con ese código y celular. Revisa los datos e inténtalo de nuevo.');
        } else {
          console.error(error);
          this.#mostrarMensaje(this.#dom.trackMessage, 'No pudimos consultar tu pedido. Revisa tu conexión e inténtalo de nuevo.');
        }
      } finally {
        this.#dom.trackButton.disabled = false;
        this.#dom.trackButton.textContent = 'Consultar estado';
      }
    }

    #mostrarSeguimiento(pedido, { nuevo }) {
      this.#pedidoActual = pedido;
      this.#limpiarMensaje(this.#dom.trackMessage);
      this.#mostrarVista('seguimiento');
      this.#renderSeguimiento(pedido, { nuevo });
      this.#dom.trackResult.focus();
    }

    async #refrescarSeguimiento({ manual }) {
      const actual = this.#pedidoActual;
      if (!actual || this.#vista !== 'seguimiento') return;
      try {
        const nuevo = await this.#pedidos.buscar(actual.id, Telefono.normalizar(actual.telefono));
        const cambio = nuevo.estado !== actual.estado || nuevo.actualizado_en !== actual.actualizado_en;
        if (cambio || manual) {
          this.#pedidoActual = nuevo;
          this.#renderSeguimiento(nuevo, { nuevo: false, ultimaConsulta: new Date() });
        }
        if (ESTADOS_FINALES.includes(nuevo.estado)) this.#detenerSeguimiento();
      } catch (error) {
        if (error instanceof PedidoNoEncontradoError || error instanceof PersistenciaError) {
          console.warn('[Domicilios] No se pudo actualizar el estado del pedido', error);
          if (manual) this.#mostrarMensaje(this.#dom.trackMessage, 'No pudimos actualizar el estado. Inténtalo de nuevo.');
        } else {
          throw error;
        }
      }
    }

    #iniciarSeguimiento() {
      this.#detenerSeguimiento();
      if (!this.#pedidoActual || ESTADOS_FINALES.includes(this.#pedidoActual.estado)) return;
      this.#temporizador = setInterval(() => {
        if (!document.hidden) this.#refrescarSeguimiento({ manual: false });
      }, CONFIG.intervaloSeguimientoMs);
    }

    #detenerSeguimiento() {
      clearInterval(this.#temporizador);
      this.#temporizador = null;
    }

    #renderSeguimiento(pedido, { nuevo, ultimaConsulta = new Date() }) {
      const estado = ESTADOS[pedido.estado] ?? { etiqueta: String(pedido.estado), detalle: '' };
      const fecha = (iso) => {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
      };
      const dato = (titulo, valor) => (valor ? [h('dt', {}, titulo), h('dd', {}, valor)] : []);

      const indiceActual = PASOS.indexOf(pedido.estado);
      const linea = pedido.estado === 'rechazado' ? null : h('ol', { class: 'timeline', 'aria-label': 'Progreso del pedido' },
        PASOS.map((paso, i) => h('li', {
          class: i < indiceActual ? 'hecho' : i === indiceActual ? 'actual' : null,
          'aria-current': i === indiceActual ? 'step' : null
        }, ESTADOS[paso].etiqueta)));

      const repartidor = pedido.estado === 'enviado' && pedido.repartidor?.nombre
        ? [h('dt', {}, 'Repartidor'), h('dd', {},
            pedido.repartidor.nombre,
            pedido.repartidor.telefono
              ? [' · ', h('a', { href: `tel:${String(pedido.repartidor.telefono).replace(/[^\d+]/g, '')}` }, pedido.repartidor.telefono)]
              : null)]
        : [];
      const entrega = ['en_preparacion', 'enviado'].includes(pedido.estado) && fecha(pedido.entrega_estimada)
        ? dato('Entrega estimada', fecha(pedido.entrega_estimada)) : [];

      const botonActualizar = h('button', { type: 'button', class: 'btn-secundario' }, 'Actualizar estado');
      botonActualizar.addEventListener('click', async () => {
        botonActualizar.disabled = true;
        botonActualizar.textContent = 'Actualizando…';
        await this.#refrescarSeguimiento({ manual: true });
        // si no hubo error, #renderSeguimiento ya reemplazó este botón
        botonActualizar.disabled = false;
        botonActualizar.textContent = 'Actualizar estado';
      });
      const botonOtro = h('button', { type: 'button', class: 'btn-secundario' }, 'Hacer otro pedido');
      botonOtro.addEventListener('click', () => { this.#mostrarVista('pedido'); this.#dom.form.querySelector('input')?.focus(); });

      const bloque = h('article', { 'aria-labelledby': 'trackTitulo' },
        nuevo ? h('div', { class: 'pedido-banner', role: 'status' },
          h('strong', {}, 'Pedido enviado'),
          'El restaurante revisará tu pedido y te avisará cuando lo reciba. Guarda tu código para consultarlo cuando quieras.') : null,
        h('div', { class: 'pedido-cabecera' },
          h('span', { class: 'pedido-codigo', id: 'trackTitulo' }, `Pedido ${pedido.id}`),
          h('span', { class: `badge ${pedido.estado}` }, estado.etiqueta)),
        h('p', { class: 'estado-detalle' }, estado.detalle),
        linea,
        h('ul', { class: 'lista-platos', 'aria-label': 'Platos del pedido' },
          pedido.items.map((i) => h('li', {},
            h('span', {}, `${i.cantidad} × ${i.nombre}${i.observacion ? ` (${i.observacion})` : ''}`),
            h('span', {}, Moneda.formatear(i.cantidad * i.precio)))),
          h('li', {}, h('span', {}, 'Envío'), h('span', {}, Moneda.formatear(pedido.envio))),
          h('li', {}, h('strong', {}, 'Total'), h('strong', {}, Moneda.formatear(pedido.total)))),
        h('dl', { class: 'datos-pedido' },
          dato('A nombre de', pedido.cliente),
          dato('Dirección de entrega', `${pedido.direccion}${pedido.barrio ? ` · ${pedido.barrio}` : ''}`),
          dato('Indicaciones', pedido.referencias),
          dato('Pago', pedido.metodo_pago === 'efectivo'
            ? `Efectivo contra entrega · pagas con ${Moneda.formatear(pedido.paga_con)}${pedido.vueltos > 0 ? ` · vueltos ${Moneda.formatear(pedido.vueltos)}` : ''}` : ''),
          dato('Realizado', fecha(pedido.creado_en)),
          entrega, repartidor),
        h('div', { class: 'acciones-pedido' }, botonActualizar, botonOtro),
        h('p', { class: 'actualizado' },
          `Consultado a las ${ultimaConsulta.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}${ESTADOS_FINALES.includes(pedido.estado) ? '' : '. Esta página se actualiza sola.'}`));

      this.#dom.trackResult.replaceChildren(bloque);
    }
  }

  // ───── 9. Arranque ─────
  document.addEventListener('DOMContentLoaded', () => {
    const almacen = new AlmacenLocal();
    const carrito = new Carrito(new CarritoRepositorio(almacen, CONFIG.claveCarrito));
    const pedidos = new PedidoRepositorio(almacen, CONFIG.clavePedidos);
    new DomiciliosUI(carrito, pedidos, almacen).iniciar();
  });
})();
