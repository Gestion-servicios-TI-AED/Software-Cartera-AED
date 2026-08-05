// Claves válidas de módulo -- deben reflejar 1:1 las `key` de
// frontend/src/config/navItems.js (NAV_ITEMS_BAIA_KRISTAL + NAV_ITEMS_ALEGRA).
// El backend no puede importar ese archivo (depende de lucide-react, un
// paquete de frontend), así que esta lista se mantiene sincronizada a mano.
// Si agregas un módulo nuevo en navItems.js, agrégalo también acá, o la
// creación/edición de usuarios en /api/usuarios lo rechazará como inválido.
const MODULOS_VALIDOS = [
  'negocios', 'oportunidades', 'inventario', 'encargos', 'movimientos',
  'resumen', 'dashboard', 'cartera-mora',
  'alegra-negocios', 'alegra-oportunidades', 'alegra-inventario', 'alegra-encargos',
  'alegra-movimientos', 'alegra-resumen', 'alegra-dashboard', 'alegra-cartera-mora',
];

module.exports = { MODULOS_VALIDOS };
