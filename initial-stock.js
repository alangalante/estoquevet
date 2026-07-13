export const INITIAL_STOCK = [
  ["Cloresten 500m", 3], ["Cloresten 200ml", 2], ["Sebotrat S", 2],
  ["Sebotrat O", 2], ["Hidrapet Xampu", 3], ["Hidrapet Creme", 3],
  ["Ketochlor", 3], ["Phisioderm Banho Seco", 2], ["Prednon", 5],
  ["Posatex", 10], ["Zelotril Oto", 5], ["Cortotic", 2], ["Easiotic", 3],
  ["Phisioderm Auricular", 5], ["Sept Clean Oto", 5], ["Aliv Pet 150mg", 1],
  ["Aliv Pet 50mg", 3], ["Omega", 2], ["Qpelo", 2], ["Credeli 450mg", 2],
  ["Credeli 112,50mg", 2], ["Credeli 225mg", 1], ["Synulox 250mg", 3],
  ["Synulox 50mg", 2], ["Ceftrat 200mg", 2], ["Ceftrat 150mg", 3],
  ["Zenrelia 4,8mg", 3], ["Zenrelia 6,4mg", 2], ["Numelvi 7,2mg", 2],
  ["Numelvi 4,8mg", 1], ["Apoquel 5,4mg", 4], ["Apoquel 3,06mg", 3]
].map(([name, quantity]) => ({ name, quantity, lowStockThreshold: 2 }));
