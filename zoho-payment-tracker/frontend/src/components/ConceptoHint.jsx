import { Info } from 'lucide-react';
import { getConcepto } from '../utils/conceptosColumnas';
import HelpTip from './HelpTip';

// Ícono (i) que muestra el concepto de una columna definido por Cartera.
// No renderiza nada si la columna no tiene concepto. Es una especialización
// de HelpTip que resuelve el texto desde el glosario de columnas.
export default function ConceptoHint({ columna, hoja = 'movimiento' }) {
  const concepto = getConcepto(columna, hoja);
  if (!concepto) return null;
  return <HelpTip text={concepto} Icon={Info} size={11} />;
}
