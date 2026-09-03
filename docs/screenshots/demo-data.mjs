// Entirely fictional data for README photography. Amounts below are in rubles.
export const screenshotDate = '2026-09-03T08:24:00+04:00';

const series = [
  ['salary', 'Основная работа', '#79b8ff', true,
    [90000,90000,95000,95000,95000,105000,105000,105000,110000,110000,110000,125000,115000,115000,120000,120000,120000,130000,130000,130000]],
  ['freelance', 'Фриланс', '#5ed9bc', true,
    [18000,28000,22000,42000,35000,25000,51000,32000,44000,56000,38000,62000,32000,48000,41000,58000,46000,72000,53000,68000]],
  ['consulting', 'Консультации', '#f5bd72', true,
    [8000,12000,6000,16000,12000,18000,14000,10000,20000,16000,24000,18000,16000,20000,12000,24000,18000,28000,22000,32000]],
  ['products', 'Цифровые продукты', '#a78bfa', true,
    [null,null,4500,6800,8200,7500,11200,14600,12800,19400,16700,24500,18200,21600,25400,22800,31500,28700,34200,38600]],
  ['partners', 'Партнёрства', '#ec88bf', true,
    [null,null,null,5000,0,8000,6500,4000,9500,7500,12000,15000,8000,12500,10000,16000,11500,18500,14000,22000]],
  ['teaching', 'Обучение', '#b5b0ce', false,
    [12000,18000,15000,0,22000,16000,12000,18000,0,15000,20000,24000,null,null,null,null,null,null,null,null]],
];

export function demoData() {
  return {
    sources: series.map(([id,name,color,active],order) => ({id,name,color,active,order})),
    entries: series.flatMap(([sourceId,,,,values]) => values.flatMap((rubles,index) => {
      if (rubles === null) return [];
      const year = 2025 + Math.floor(index / 12);
      const month = `${year}-${String(index % 12 + 1).padStart(2,'0')}`;
      return [{sourceId,month,amount:rubles * 100}];
    })),
  };
}
