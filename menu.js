document.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('.menu-item-card');
    const cartBadge = document.getElementById('cartBadge');
    const modalEl = document.getElementById('quickViewModal');
    const modal = modalEl ? new bootstrap.Modal(modalEl) : null;
    const qvImg = document.getElementById('qvImg');
    const qvName = document.getElementById('qvName');
    const qvDesc = document.getElementById('qvDesc');
    const qvPrice = document.getElementById('qvPrice');
    const qvAddBtn = document.getElementById('qvAddBtn');

    let currentItem = null;

    function totalCantidadCarrito() {
        let carrito = [];
        try { carrito = JSON.parse(localStorage.getItem('carrito_parrilla')) || []; } catch (e) { carrito = []; }
        return carrito.reduce((acc, it) => acc + (it.cantidad || 0), 0);
    }

    function actualizarBadge() {
        if (!cartBadge) return;
        const total = totalCantidadCarrito();
        if (total > 0) {
            cartBadge.textContent = total;
            cartBadge.style.display = '';
        } else {
            cartBadge.style.display = 'none';
        }
    }

    function parsePrecio(texto) {
        return parseInt(String(texto).replace(/[^0-9]/g, ''), 10) || 0;
    }

    function agregarAlCarrito(card) {
        const idProducto = card.getAttribute('data-id');
        const nombrePlato = card.querySelector('.item-title').textContent.trim();
        const precioNumerico = parsePrecio(card.querySelector('.item-price').textContent);

        let carrito = [];
        try { carrito = JSON.parse(localStorage.getItem('carrito_parrilla')) || []; } catch (e) { carrito = []; }

        const existente = carrito.find(item => item.id === idProducto);
        if (existente) {
            existente.cantidad += 1;
        } else {
            carrito.push({ id: idProducto, nombre: nombrePlato, precio: precioNumerico, cantidad: 1 });
        }
        localStorage.setItem('carrito_parrilla', JSON.stringify(carrito));
        actualizarBadge();
        window.dispatchEvent(new Event('storage'));
    }

    cards.forEach(card => {
        card.addEventListener('click', () => {
            if (card.classList.contains('out-of-stock')) return;
            currentItem = card;
            const img = card.querySelector('img');
            qvImg.src = img ? img.src : '';
            qvImg.alt = img ? img.alt : '';
            qvName.textContent = card.querySelector('.item-title').textContent.trim();
            qvDesc.textContent = card.querySelector('.item-desc').textContent.trim();
            qvPrice.textContent = card.querySelector('.item-price').textContent.trim();
            if (modal) modal.show();
        });
    });

    if (qvAddBtn) {
        qvAddBtn.addEventListener('click', () => {
            if (!currentItem) return;
            agregarAlCarrito(currentItem);
            qvAddBtn.textContent = '¡Agregado! ✓';
            setTimeout(() => { qvAddBtn.textContent = 'Agregar a Domicilios'; }, 1200);
            if (modal) modal.hide();
        });
    }

    window.addEventListener('storage', actualizarBadge);
    setInterval(actualizarBadge, 1000);
    actualizarBadge();
});
