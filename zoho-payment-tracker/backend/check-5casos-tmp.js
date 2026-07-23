const { PrismaClient } = require('@prisma/client');
const { construirPlan } = require('./src/services/conciliacionService');
const prisma = new PrismaClient();

const referencias = [
  '1460711110705', // Kabo Torre 1 1-G
  '1423614140409', // Kaliza Torre 1 4-D
  '1374412120800', // Prive Torre 1 2-H
  '1460712221408', // Prive Torre 2 2-N
  '1374422410400', // Prive Torre 4 1-D
];

(async () => {
  for (const ref of referencias) {
    const negocio = await prisma.negocio.findFirst({ where: { referencia: ref } });
    const opp = await prisma.opportunity.findFirst({ where: { referenciaRecaudo: ref } });
    const valorVenta = negocio?.datos?.['Valor venta'];
    const rows = opp?.propuestaPago?.length ? opp.propuestaPago : opp?.formaPago;
    const usaPropuesta = !!opp?.propuestaPago?.length;
    const plan = construirPlan(rows, opp?.fechaInicioPlanPagos);
    const sumaResto = plan.slice(0, -1).reduce((s, c) => s + c.valorPlan, 0);
    const saldoCEOriginal = plan[plan.length - 1];

    console.log('========================================');
    console.log('Referencia:', ref, '| usa', usaPropuesta ? 'PROPUESTA' : 'FORMA');
    console.log('Valor venta (campo negocio):', valorVenta);
    console.log('Suma de cuotas (sin la ultima):', sumaResto);
    console.log('Saldo Contraentrega original (antes de ajustar):', JSON.stringify(saldoCEOriginal));
    console.log('Diferencia (Valor Venta - sumaResto):', Number(valorVenta) - sumaResto);
    console.log('Numero de cuotas en el plan:', plan.length);
  }
  process.exit(0);
})();
