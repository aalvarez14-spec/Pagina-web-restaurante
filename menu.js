/**
 * Black & Gold Parrilla - Gestión de Carrito Premium (Persistencia Local)
 * Almacenamiento optimizado de ítems mediante localStorage
 */

document.addEventListener('DOMContentLoaded', () => {
    const categoryButtons = document.querySelectorAll('.category-btn');
    const menuCards = document.querySelectorAll('.menu-item-card');

    // --- 1. LÓGICA DE FILTRADO DE CATEGORÍAS (Mantenida y Optimizada) ---
    categoryButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            categoryButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');

            const categoriaSeleccionada = e.target.textContent.trim();
            
            menuCards.forEach(card => {
                const categoriaPlato = card.getAttribute('data-category');
                if (categoriaSeleccionada === 'Todo' || categoriaPlato === categoriaSeleccionada) {
                    card.style.display = 'flex';
                    setTimeout(() => {
                        card.style.opacity = '1';
                        card.style.transform = 'translateY(0)';
                    }, 50);
                } else {
                    card.style.opacity = '0';
                    card.style.transform = 'translateY(10px)';
                    setTimeout(() => { card.style.display = 'none'; }, 300);
                }
            });
        });
    });

    // --- 2. LÓGICA DEL CARRITO CON LOCALSTORAGE ---
    const orderButtons = document.querySelectorAll('.btn-add-order');
    
    orderButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const cardElement = e.target.closest('.menu-item-card');
            
            // Regla de Negocio: Bloqueo si el administrador aplicó Soft Delete (Agotado)
            if (cardElement.classList.contains('out-of-stock')) return;

            // Extraer metadatos limpios del HTML5 mediante data-attributes
            const idProducto = cardElement.getAttribute('data-id');
            const nombrePlato = cardElement.querySelector('.item-title').textContent;
            
            // Sanitización del precio: Removemos "$", "." y espacios para pasarlo a número entero puro
            const precioTexto = cardElement.querySelector('.item-price').textContent;
            const precioNumerico = parseInt(precioTexto.replace(/[^0-9]/g, ""), 10);

            // Obtener el carrito actual de la memoria o inicializar uno vacío si no existe
            let carrito = JSON.parse(localStorage.getItem('carrito_parrilla')) || [];

            // Verificar si el producto ya fue añadido previamente para incrementar su cantidad
            const itemExistente = carrito.find(item => item.id === idProducto);

            if (itemExistente) {
                itemExistente.cantidad += 1;
            } else {
                // Si es nuevo, lo empujamos al arreglo con cantidad inicial de 1
                carrito.push({
                    id: idProducto,
                    nombre: nombrePlato,
                    precio: precioNumerico,
                    cantidad: 1
                });
            }

            // Guardamos el arreglo serializado como String en el localStorage de Google Chrome
            localStorage.setItem('carrito_parrilla', JSON.stringify(carrito));

            // Feedback elegante sin alertas molestas
            const botonOriginalText = e.target.textContent;
            e.target.textContent = '¡Añadido! ✓';
            e.target.style.borderColor = '#2ECC71';
            e.target.style.color = '#2ECC71';
            
            setTimeout(() => {
                e.target.textContent = botonOriginalText;
                e.target.style.borderColor = 'var(--oro-viejo)';
                e.target.style.color = 'var(--oro-viejo)';
            }, 1200);

            console.log('[Memoria Local]: Carrito Actualizado con éxito', carrito);
        });
    });
});

