/**
 * Black & Gold Parrilla - Procesador Dinámico de Checkout
 * Renderizado en tiempo real de ítems y cálculos aritméticos precisos
 */

document.addEventListener('DOMContentLoaded', () => {
    const orderItemsContainer = document.querySelector('.order-items-list');
    const subtotalLabel = document.getElementById('subtotal');
    const grandTotalLabel = document.getElementById('grandTotal');
    const checkoutButton = document.querySelector('.btn-checkout');

    // Formateador de moneda en pesos colombianos (Estilo Premium)
    const formatearMoneda = (valor) => {
        return '\$' + valor.toLocaleString('es-CO');
    };

    const cargarResumenPedido = () => {
        // Leer la memoria del navegador
        let carrito = JSON.parse(localStorage.getItem('carrito_parrilla')) || [];

        // Regla de control: Si el carrito está vacío, deshabilitar botón e informar elegantemente
        if (carrito.length === 0) {
            orderItemsContainer.innerHTML = `
                <p style="text-align: center; color: var(--texto-mutado); font-size: 0.9rem; padding: 20px 0;">
                    Tu carrito está vacío.<br><a href="menu.html" style="color: var(--oro-viejo); text-decoration: none;">Ver los cortes de carne</a>
                </p>
            `;
            subtotalLabel.textContent = '\$0';
            grandTotalLabel.textContent = '\$0';
            checkoutButton.disabled = true;
            checkoutButton.style.opacity = '0.3';
            checkoutButton.style.cursor = 'not-allowed';
            return;
        }

        // Si hay productos, limpiar el contenedor estático previo
        orderItemsContainer.innerHTML = '';
        let subtotalAcumulado = 0;

        // Inyección dinámica de filas de productos mediante interpolación de cadenas de texto
        carrito.forEach(item => {
            const costoItemTotal = item.precio * item.cantidad;
            subtotalAcumulado += costoItemTotal;

            const row = document.createElement('div');
            row.className = 'order-item';
            row.innerHTML = `
                <div class="item-details">
                    <strong>${item.nombre}</strong><br>
                    <span>Cantidad: ${item.cantidad} x ${formatearMoneda(item.precio)}</span>
                </div>
                <span class="item-price" style="font-weight: 500;">${formatearMoneda(costoItemTotal)}</span>
            `;
            orderItemsContainer.appendChild(row);
        });

        // Constante de costo de envío establecida en las reglas de negocio
        const costoEnvio = 5000; 
        const granTotal = subtotalAcumulado + costoEnvio;

        // Renderizado final de valores calculados matemáticamente
        subtotalLabel.textContent = formatearMoneda(subtotalAcumulado);
        grandTotalLabel.textContent = formatearMoneda(granTotal);
        
        checkoutButton.disabled = false;
        checkoutButton.style.opacity = '1';
        checkoutButton.style.cursor = 'pointer';
    };

    // Inicializar la carga automática al arrancar la pantalla
    cargarResumenPedido();
});

