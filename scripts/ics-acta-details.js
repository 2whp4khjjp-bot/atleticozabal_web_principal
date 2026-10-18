// Campos opcionales procedentes de actas verificadas. Nunca inferir tarjetas ni goles del marcador.
function eventDetails(match){
 if(!Array.isArray(match.score)||match.score.length!==2)return [];
 const lines=['','GOLEADORES'];
 const goals=match.actaDetails?.goals;
 if(Array.isArray(goals)){
  for(const [side,name] of [['home',match.home],['away',match.away]]){
   const items=goals.filter(g=>g.team===side&&typeof g.player==='string'&&g.player.trim()).map(g=>g.player+(g.minute!=null?' ('+g.minute+"')":''));
   lines.push(name+': '+(items.length?items.join(', '):'Sin goles registrados'));
  }
 }else lines.push('No disponible en el acta');
 lines.push('','TARJETAS');
 const cards=match.actaDetails?.cards;
 if(Array.isArray(cards)){
  for(const [side,name] of [['home',match.home],['away',match.away]]){
   const items=cards.filter(g=>g.team===side&&['yellow','red','second-yellow'].includes(g.type));
   const yellows=items.filter(g=>g.type==='yellow').length,reds=items.filter(g=>g.type==='red').length,second=items.filter(g=>g.type==='second-yellow').length;
   lines.push(name+': '+yellows+' amarillas, '+second+' dobles amarillas, '+reds+' rojas');
   for(const g of items)if(g.player)lines.push('  '+g.player+' · '+({yellow:'Amarilla',red:'Roja','second-yellow':'Segunda amarilla'}[g.type])+(g.minute!=null?' ('+g.minute+"')":''));
  }
 }else lines.push('No disponible en el acta');
 if(match.actaUrl)lines.push('','Acta oficial: '+match.actaUrl);
 return lines;
}
module.exports={eventDetails};
