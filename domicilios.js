document.addEventListener('DOMContentLoaded', () => {
    const orderItemsContainer = document.querySelector('.order-items-list');
    const subtotalLabel = document.getElementById('subtotal');
    const grandTotalLabel = document.getElementById('grandTotal');
    const checkoutButton = document.querySelector('.btn-checkout');
    const form = document.getElementById('deliveryForm');
    const successModalEl = document.getElementById('successModal');
    const successModal = successModalEl ? new bootstrap.Modal(successModalEl) : null;
    const successBody = document.getElementById('successBody');

    const formatearMoneda = (valor) => '\$' + (valor || 0).toLocaleString('es-CO');

    function leerCarrito() {
        try { return JSON.parse(localStorage.getItem('carrito_parrilla')) || []; } catch (e) { return []; }
    }
    function guardarCarrito(carrito) {
        localStorage.setItem('carrito_parrilla', JSON.stringify(carrito));
        window.dispatchEvent(new Event('storage'));
    }

    function cambiarCantidad(id, delta) {
        let carrito = leerCarrito();
        const item = carrito.find(i => i.id === id);
        if (!item) return;
        item.cantidad += delta;
        if (item.cantidad <= 0) {
            carrito = carrito.filter(i => i.id !== id);
        }
        guardarCarrito(carrito);
        render();
    }
    function eliminarItem(id) {
        const carrito = leerCarrito().filter(i => i.id !== id);
        guardarCarrito(carrito);
        render();
    }

    function render() {
        const carrito = leerCarrito();
        if (!orderItemsContainer) return;
        if (carrito.length === 0) {
            orderItemsContainer.innerHTML = `
                <p style="text-align: center; color: var(--texto-mutado); font-size: 0.9rem; padding: 20px 0;">
                    Tu carrito está vacío.<br><a href="menu.html" style="color: var(--oro-viejo); text-decoration: none;">Ver los cortes de carne</a>
                </p>
            `;
            subtotalLabel.textContent = '\$0';
            grandTotalLabel.textContent = '\$0';
            if (checkoutButton) { checkoutButton.disabled = true; checkoutButton.style.opacity = '0.3'; checkoutButton.style.cursor = 'not-allowed'; }
            return;
        }

        orderItemsContainer.innerHTML = '';
        let subtotalAcumulado = 0;
        carrito.forEach(item => {
            const costoItemTotal = item.precio * item.cantidad;
            subtotalAcumulado += costoItemTotal;

            const row = document.createElement('div');
            row.className = 'order-item';
            row.innerHTML = `
                <div class="item-details">
                    <strong>${item.nombre}</strong><br>
                    <span>${formatearMoneda(item.precio)} x ${item.cantidad}</span>
                </div>
                <div class="qty-controls">
                    <button class="qty-btn" data-action="dec" data-id="${item.id}">-</button>
                    <span>${item.cantidad}</span>
                    <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
                    <button class="remove-btn" data-action="remove" data-id="${item.id}" title="Eliminar">✕</button>
                </div>
                <span class="item-price" style="font-weight: 500;">${formatearMoneda(costoItemTotal)}</span>
            `;
            orderItemsContainer.appendChild(row);
        });

        const costoEnvio = 5000;
        const granTotal = subtotalAcumulado + costoEnvio;
        subtotalLabel.textContent = formatearMoneda(subtotalAcumulado);
        grandTotalLabel.textContent = formatearMoneda(granTotal);
        if (checkoutButton) { checkoutButton.disabled = false; checkoutButton.style.opacity = '1'; checkoutButton.style.cursor = 'pointer'; }

        orderItemsContainer.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const action = e.currentTarget.getAttribute('data-action');
                if (action === 'inc') cambiarCantidad(id, 1);
                else if (action === 'dec') cambiarCantidad(id, -1);
                else if (action === 'remove') eliminarItem(id);
            });
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const carrito = leerCarrito();
            if (carrito.length === 0) {
                alert('Tu carrito está vacío.');
                return;
            }
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }
            const nombre = document.getElementById('fullName').value.trim();
            const telefono = document.getElementById('phone').value.trim();
            const direccion = document.getElementById('address').value.trim();
            const barrio = document.getElementById('neighborhood').value.trim();
            const pagoRadio = document.querySelector('input[name="paymentMethod"]:checked');
            if (!nombre || !telefono || !direccion || !barrio) {
                alert('Completa todos los campos obligatorios.');
                return;
            }
            if (!pagoRadio) {
                alert('Selecciona un método de pago.');
                return;
            }
            const metodoPago = pagoRadio.value;
            const subtotal = carrito.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
            const total = subtotal + 5000;

            if (successBody) {
                successBody.innerHTML = `
                    <p><strong>Cliente:</strong> ${nombre}</p>
                    <p><strong>Teléfono:</strong> ${telefono}</p>
                    <p><strong>Dirección:</strong> ${direccion}${document.getElementById('apt').value ? ' - ' + document.getElementById('apt').value : ''}</p>
                    <p><strong>Barrio:</strong> ${barrio}</p>
                    <p><strong>Método de pago:</strong> ${metodoPago}</p>
                    <p><strong>Total a pagar:</strong> ${formatearMoneda(total)}</p>
                `;
            }
            if (successModal) successModal.show();

            localStorage.removeItem('carrito_parrilla');
            window.dispatchEvent(new Event('storage'));
            if (form) form.reset();
            render();
        });
    }

    render();
    window.addEventListener('storage', render);
});
