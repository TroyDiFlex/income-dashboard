import {summarize,sortSources,niceCeiling,SHORT_MONTHS} from './model.js';

export const LINE_REVEAL_MS=1600;

export function lineRevealStarts(model,previous,now) {
  const existing=new Set(previous?.model.lines.map(series=>series.id)),starts=new Map();
  for(const series of model.lines){
    const start=existing.has(series.id)?previous.lineReveals.get(series.id):now;
    if(start!==undefined&&now-start<LINE_REVEAL_MS)starts.set(series.id,start);
  }
  return starts;
}

export function incomeChart(data,from,to,selection=['all']) {
  const selected=new Set(selection),summary=summarize(data,from,to,selection);
  const sources=sortSources(data.sources).filter(s=>selected.has(s.id));
  const sourceSeries=sources.map(source=>({...source,months:summarize(data,from,to,source.id).months}));
  const total={id:'all',name:'Общий доход',color:'var(--accent)',months:summary.months};
  const lines=selected.has('all')?[total,...sourceSeries]:sourceSeries;
  // The aggregate is a total, never an extra contribution to a stacked bar.
  const remainder=selected.has('all')&&sources.length<data.sources.length;
  const bars=[...sourceSeries];
  if(remainder||selected.has('all')&&!sources.length){
    const rest=summarize(data,from,to,data.sources.filter(s=>!selected.has(s.id)).map(s=>s.id));
    bars.push({...total,id:'remainder',name:sources.length?'Остальные источники':'Общий доход',months:rest.months});
  }
  return {summary,lines,bars};
}

export function chartGeometry(model,type,containerWidth,containerHeight,{animate=true,lineReveals=null,now=0}={}) {
  const {summary:s,lines,bars}=model,width=Math.max(280,containerWidth),height=containerHeight;
  const left=44,right=12,top=12,bottom=34,plotW=width-left-right,plotH=height-top-bottom;
  const values=type==='bars'?s.months.map(m=>m.total):lines.flatMap(line=>line.months.map(m=>m.total));
  const max=niceCeiling(values.reduce((best,value)=>Math.max(best,value),0));
  const n=s.months.length,step=plotW/n,x=i=>left+step*(i+.5),y=v=>top+plotH*(1-v/max);
  let axes='',fills='',strokes='',defs='';
  for(let i=0;i<=4;i++){
    const value=max*i/4,py=y(value),label=value===0?'0':new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:1}).format(value/100);
    axes+=`<line class="gridline" x1="${left}" x2="${width-right}" y1="${py}" y2="${py}"/><text class="axis-label" x="${left-10}" y="${py+4}" text-anchor="end">${label}</text>`;
  }
  const stride=Math.max(1,Math.ceil(n/(width<500?5:9)));
  s.months.forEach((m,i)=>{
    if(i%stride===0||i===n-1&&n>1&&(n-1)%stride>=stride/2){
      const label=SHORT_MONTHS[+m.month.slice(5)-1]+(n>12?' '+m.month.slice(2,4):'');
      axes+=`<text class="axis-label" x="${x(i)}" y="${height-8}" text-anchor="middle">${label}</text>`;
    }
  });
  if(type==='bars'){
    s.months.forEach((m,i)=>{
      if(!m.count)return;
      const w=Math.min(step*.58,44),bx=x(i)-w/2,by=y(m.total),h=Math.max(m.total?1:2,y(0)-by);
      defs+=`<clipPath id="bar-clip-${i}"><rect x="${bx}" y="${by}" width="${w}" height="${h}" rx="${Math.min(step*.15,4)}"/></clipPath>`;
      let total=0;
      const pieces=bars.map((series,j)=>{
        const month=series.months[i];
        if(!month.total)return '';
        const base=total;total+=month.total;
        return `<rect class="bar" data-series="${j}" style="--series-color:${series.color}" x="${bx}" y="${y(total)}" width="${w}" height="${y(base)-y(total)}"/>`;
      }).join('');
      const zeroColor=bars.find(series=>series.months[i].count)?.color||'var(--accent)';
      // A recorded zero remains visible; a missing month has no column.
      fills+=`<g class="bar-stack" style="transform-origin:0 ${y(0)}px;--bar-delay:${Math.round(i/Math.max(1,n-1)*180)}ms" clip-path="url(#bar-clip-${i})">${m.total?pieces:`<rect class="bar" style="--series-color:${zeroColor}" x="${bx}" y="${by}" width="${w}" height="2"/>`}</g>`;
    });
  }else{
    lines.forEach((series,j)=>{
      const start=lineReveals===null?now:lineReveals.get(series.id);
      const reveal=animate&&start!==undefined&&now-start<LINE_REVEAL_MS;
      const clip=reveal?` clip-path="url(#chart-reveal-clip-${j})"`:'';
      if(reveal)defs+=`<clipPath id="chart-reveal-clip-${j}" clipPathUnits="userSpaceOnUse"><rect class="chart-reveal" style="--line-delay:${Math.min(0,start-now)}ms" width="${width}" height="${height}"/></clipPath>`;
      defs+=`<linearGradient id="chart-fill-${j}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${series.color}" stop-opacity=".23"/><stop offset="100%" stop-color="${series.color}" stop-opacity="0"/></linearGradient>`;
      let lineFills='',lineStrokes='';
      const segments=[];let segment=[];
      series.months.forEach((m,i)=>{if(m.count)segment.push([x(i),y(m.total)]);else if(segment.length){segments.push(segment);segment=[];}});
      if(segment.length)segments.push(segment);
      for(const points of segments){
        let path=`M ${points[0].join(' ')}`;
        for(let i=1;i<points.length;i++){
          const p=points[i-1],q=points[i],mid=(p[0]+q[0])/2;
          path+=type==='smooth'?` C ${mid} ${p[1]}, ${mid} ${q[1]}, ${q[0]} ${q[1]}`:` L ${q.join(' ')}`;
        }
        lineFills+=`<path d="${path} L ${points.at(-1)[0]} ${y(0)} L ${points[0][0]} ${y(0)} Z" fill="url(#chart-fill-${j})"/>`;
        lineStrokes+=`<path class="data-line" data-series="${j}" style="--series-color:${series.color}" d="${path}"/>`;
        if(points.length===1)lineStrokes+=`<circle class="chart-point" style="--series-color:${series.color}" cx="${points[0][0]}" cy="${points[0][1]}" r="4.5"/>`;
      }
      // Keep every fill below every stroke; each source shares its own reveal clip.
      fills+=`<g${clip}>${lineFills}</g>`;
      strokes+=`<g${clip}>${lineStrokes}</g>`;
    });
  }
  const hoverSeries=type==='bars'?[{color:bars.length===1?bars[0].color:'var(--accent)',months:s.months}]:lines;
  const dots=hoverSeries.map((series,i)=>`<circle id="hover-dot-${i}" class="chart-point hover-dot" style="--series-color:${series.color}" r="5" opacity="0"/>`).join('');
  const svg=`<svg${animate?' class="chart-enter"':''} style="--line-reveal-duration:${LINE_REVEAL_MS}ms" viewBox="0 0 ${width} ${height}" aria-hidden="true"><defs>${defs}</defs>${axes}${fills}${strokes}<line id="crosshair" x1="0" x2="0" y1="${top}" y2="${y(0)}" stroke="var(--muted)" stroke-dasharray="3 4" opacity="0"/>${dots}</svg>`;
  return {svg,x,y,width,left,step,hoverSeries};
}
