import {money} from './model.js';

const escapeHtml=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const icon=name=>`<svg class="icon"><use href="#i-${name}"/></svg>`;

export function sourceColorsHtml(colors,selected){
 return colors.map(color=>`<button type="button" class="color-option ${color===selected?'selected':''}" data-color="${color}" style="background:${color}" aria-label="Цвет ${color}" aria-pressed="${color===selected}"></button>`).join('');
}

export function trashHtml(trash,now=Date.now()){
 if(!trash.length)return `<div class="trash-empty">${icon('trash')}<h3>Корзина пуста</h3><p>Здесь появятся удалённые источники дохода.</p></div>`;
 return [...trash].sort((a,b)=>b.deletedAt-a.deletedAt).map(source=>{
  const remaining=source.expiresAt-now,days=Math.max(1,Math.ceil(remaining/86400000));
  const deadline=new Date(source.expiresAt).toLocaleString('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const time=remaining<=0?'Срок хранения истёк':remaining<86400000?'Осталось меньше суток':`Осталось дней: ${days}`;
  return `<article class="trash-item"><div class="trash-item-heading"><i class="source-dot" style="background:${source.color}"></i><h3>${escapeHtml(source.name)}</h3></div><p class="trash-deadline">${time} · до ${escapeHtml(deadline)}</p><p class="trash-meta">${source.active?'Активный':'Неактивный'} · Записей: ${source.entryCount} · ${escapeHtml(money(source.total))}</p><div class="trash-actions"><button type="button" class="button subtle" data-restore-source="${escapeHtml(source.id)}" ${remaining<=0?'disabled':''}>${icon('restore')}Восстановить</button><button type="button" class="text-button danger-text" data-delete-source="${escapeHtml(source.id)}">${icon('trash')}Удалить навсегда</button></div></article>`;
 }).join('');
}

export function sourceConfirmationCopy(type){
 if(type==='deleteSource')return {title:'Удалить источник навсегда?',description:'Источник и все его доходы за все годы будут удалены безвозвратно. Восстановить их не получится.',label:'Удалить навсегда',delay:3000,danger:true};
 if(type==='restoreSource')return {title:'Восстановить источник?',description:'Источник вернётся вместе со всеми доходами за все годы и прежним статусом активности. Его доходы снова будут участвовать в расчётах.',label:'Восстановить',delay:0,danger:false};
 if(type==='trashSource')return {title:'Переместить источник в корзину?',description:'Источник и все его доходы за все годы исчезнут из таблиц и расчётов. Их можно восстановить в течение 30 дней. После этого данные удалятся безвозвратно.',label:'В корзину',delay:0,danger:false};
 throw new Error('Неизвестное действие с источником.');
}
