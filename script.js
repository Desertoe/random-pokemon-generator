/* script.js
   Final version:
   - Two independent checkboxes: Generate moves, Generate ability
   - EV/IV Mode: Competitive or Random
   - Export format matches the example (Level, Happiness, EVs, Nature, IVs, Moves)
   - Dropdown multi-selects remain as before
*/

const DOM = {
  quantity: document.getElementById('quantity'),
  generateBtn: document.getElementById('generateBtn'),
  exportBtn: document.getElementById('exportBtn'),
  results: document.getElementById('results'),
  status: document.getElementById('status'),

  // legend flags
  subLegendary: document.getElementById('subLegendary'),
  legendary: document.getElementById('legendary'),
  mythical: document.getElementById('mythical'),
  paradox: document.getElementById('paradox'),
  ultraBeast: document.getElementById('ultraBeast'),

  // additional options
  showNatures: document.getElementById('showNatures'),
  showGenders: document.getElementById('showGenders'),
  altForms: document.getElementById('altForms'),
  showStats: document.getElementById('showStats'),

  // NEW options
  genMoves: document.getElementById('genMoves'),
  genAbility: document.getElementById('genAbility'),
  evivMode: document.getElementById('evivMode')
};

const REGION_RANGES = {
  all: [1,1010],
  kanto:[1,151],
  johto:[152,251],
  hoenn:[252,386],
  sinnoh:[387,493],
  unova:[494,649],
  kalos:[650,721],
  alola:[722,809],
  galar:[810,898],
  hisui:[899,905],
  paldea:[906,1010]
};

const NATURES=["Hardy","Lonely","Brave","Adamant","Naughty","Bold","Docile","Relaxed","Impish","Lax","Timid","Hasty","Serious","Jolly","Naive","Modest","Mild","Quiet","Bashful","Rash","Calm","Gentle","Sassy","Careful","Quirky"];
const SAMPLE_ITEMS=['Leftovers','Choice Band','Life Orb','Focus Sash','Choice Specs','Assault Vest','Aguav Berry','Expert Belt','Sitrus Berry','Mystic Water','Black Sludge'];

// small helpers
function setStatus(t){ DOM.status.textContent = t; }
function randomInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function capitalize(s){ return s? s[0].toUpperCase()+s.slice(1): s; }
function randomNature(){ return NATURES[randomInt(0,NATURES.length-1)]; }
function randomItem(){ return SAMPLE_ITEMS[randomInt(0,SAMPLE_ITEMS.length-1)]; }

// fetch helper
async function fetchJson(url, timeout=12000){
  const controller = new AbortController();
  const id = setTimeout(()=>controller.abort(), timeout);
  try {
    const r = await fetch(url, {signal: controller.signal});
    clearTimeout(id);
    if(!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  } catch(e){
    clearTimeout(id);
    throw e;
  }
}

// evolution stage helper
function computeStageFromChain(chain, speciesName){
  let found = null;
  function walk(n, depth){
    if(n.species && n.species.name === speciesName){ found = depth; return; }
    if(n.evolves_to){
      for(const c of n.evolves_to){ if(found===null) walk(c, depth+1); }
    }
  }
  walk(chain,1);
  return found || 1;
}

// gender formatting
function formatGender(r){
  if(r===null||r===undefined||r===-1) return 'Genderless';
  if(r===0) return '♂';
  if(r===8) return '♀';
  const f = Math.round((r/8)*100);
  return `♀${f}%`;
}

// moves picker
function pickMoves(arr, max=4){
  if(!arr || arr.length === 0) return ['Tackle'];
  const pool = arr.map(m => (m.move?.name ?? m).replace(/-/g,' '));
  const chosen = [];
  const used = new Set();
  let safe = 0;
  while(chosen.length < Math.min(max, pool.length) && safe < 300){
    safe++;
    const m = pool[randomInt(0, pool.length-1)];
    if(!used.has(m)){ used.add(m); chosen.push(capitalize(m)); }
  }
  return chosen;
}

/* ================= EV/IV generation ================= */
// format order: HP / Atk / Def / SpA / SpD / Spe

// competitive EV presets (common spreads)
const COMP_EV_PRESETS = [
  {label:'252 Atk / 4 SpD / 252 Spe', arr:[0,252,0,0,4,252]}, // actually order mismatch -> we'll transform properly below
  {label:'252 HP / 252 Def / 4 SpD', arr:[252,0,252,0,4,0]},
  {label:'252 SpA / 4 SpD / 252 Spe', arr:[0,0,0,252,4,252]},
  {label:'252 Atk / 252 Spe / 4 HP', arr:[4,252,0,0,0,252]},
  {label:'252 HP / 252 SpA / 4 Spe', arr:[252,0,0,252,0,4]}
];

// helper: format EV/IV arrays to string with proper labels and order
function formatStatLine(values, prefix){
  // values array must be [HP,Atk,Def,SpA,SpD,Spe]
  const labels = ['HP','Atk','Def','SpA','SpD','Spe'];
  const parts = [];
  for(let i=0;i<6;i++){
    if(values[i] && values[i] > 0) parts.push(`${values[i]} ${labels[i]}`);
  }
  if(parts.length === 0) return '';
  return `${prefix}: ${parts.join(' / ')}`;
}

// generate competitive EVs: pick one preset and map to HP/Atk/Def/SpA/SpD/Spe
function generateCompetitiveEVs(){
  // We'll pick reasonable presets mapped correctly
  // Use a set of explicit arrays in correct order [HP,Atk,Def,SpA,SpD,Spe]
  const presets = [
    [0,252,4,0,0,252],   // 252 Atk / 4 Def? Wait - choose common ones:
    [252,0,252,0,4,0],   // 252 HP / 252 Def / 4 SpD
    [0,0,0,252,4,252],   // 252 SpA / 4 SpD / 252 Spe
    [4,252,0,0,0,252],   // 4 HP / 252 Atk / 252 Spe
    [252,0,0,252,0,4]    // 252 HP / 252 SpA / 4 Spe
  ];
  const pick = presets[randomInt(0,presets.length-1)];
  return pick;
}

// generate random EVs summing up to at most 508 (we'll avoid >508)
function generateRandomEVs(){
  const maxTotal = 508;
  const vals = [0,0,0,0,0,0];
  let remaining = maxTotal;
  // We'll scatter random chunks (multiples of 1) but cap each to 252
  // Give each stat a random initial allocation then adjust
  for(let i=0;i<6;i++){
    const cap = Math.min(252, remaining);
    const v = Math.floor(Math.random() * (cap+1));
    vals[i] = v;
    remaining -= v;
  }
  // if leftover, distribute 1 by 1 to random stats until none or stats at 252
  while(remaining > 0){
    const idx = randomInt(0,5);
    if(vals[idx] < 252){ vals[idx]++; remaining--; }
    else { // find another
      let found=false;
      for(let j=0;j<6;j++){
        if(vals[j] < 252){ vals[j]++; remaining--; found=true; break; }
      }
      if(!found) break;
    }
  }
  return vals;
}

// generate competitive IVs: typically all 31
function generateCompetitiveIVs(){
  return [31,31,31,31,31,31];
}

// generate random IVs 0-31 each
function generateRandomIVs(){
  return [randomInt(0,31),randomInt(0,31),randomInt(0,31),randomInt(0,31),randomInt(0,31),randomInt(0,31)];
}

/* ================= Multi-dropdown helpers ================= */
function getCheckedValues(containerId){
  const container = document.getElementById(containerId);
  if(!container) return [];
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}
function selectionIncludesAll(values){
  return values.length === 0 || values.includes('all');
}

/* ================= Main generation ================= */

async function generateTeam(){
  setStatus('Generating...');
  DOM.results.innerHTML = '';

  const qty = Math.max(1, Math.min(6, parseInt(DOM.quantity.value) || 3));
  const regs = getCheckedValues('regionDropdown');
  const types = getCheckedValues('typeDropdown');
  const stages = getCheckedValues('stageDropdown');

  // stage filtering logic
  const stageFiltering = !(selectionIncludesAll(stages) || stages.includes('any'));
  // legend flags
  const legendFlags = {
    sub: DOM.subLegendary.checked,
    leg: DOM.legendary.checked,
    myth: DOM.mythical.checked,
    par: DOM.paradox.checked,
    ub: DOM.ultraBeast.checked
  };

  const includeForms = DOM.altForms.checked;
  const includeStats = DOM.showStats.checked;
  const includeNatures = DOM.showNatures.checked;
  const includeGenders = DOM.showGenders.checked;

  // new options:
  const generateMoves = DOM.genMoves.checked;
  const generateAbility = DOM.genAbility.checked;
  const evivMode = DOM.evivMode.value; // 'competitive' or 'random'

  // id ranges
  let ranges = [];
  if(selectionIncludesAll(regs)) ranges.push(REGION_RANGES.all);
  else{
    regs.forEach(r => { if(REGION_RANGES[r]) ranges.push(REGION_RANGES[r]); });
    if(ranges.length === 0) ranges.push(REGION_RANGES.all);
  }

  const typeFilters = selectionIncludesAll(types) ? [] : types;

  const stageSet = new Set();
  if(stageFiltering){
    if(stages.includes('unevolved')) stageSet.add(1);
    if(stages.includes('evolvedOnce')) stageSet.add(2);
    if(stages.includes('evolvedTwice')) stageSet.add(3);
  }

  const results = [];
  const seen = new Set();
  let attempts = 0;
  const MAX_ATTEMPTS = 700;

  while(results.length < qty && attempts < MAX_ATTEMPTS){
    attempts++;
    const [minId, maxId] = ranges[randomInt(0, ranges.length-1)];
    const id = randomInt(minId, maxId);
    if(seen.has(id)) continue;
    seen.add(id);

    try {
      const [p, s] = await Promise.all([
        fetchJson(`https://pokeapi.co/api/v2/pokemon/${id}/`),
        fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${id}/`)
      ]);

      const pokeTypes = (p.types || []).map(t => t.type.name);
      if(typeFilters.length && !typeFilters.some(tf => pokeTypes.includes(tf))) continue;

      // legendary checks
      const isLegend = !!s.is_legendary;
      const isMyth = !!s.is_mythical;
      const nm = (p.name || '').toLowerCase();
      let matchesLegend = true;
      if(Object.values(legendFlags).some(v => v)){
        matchesLegend = false;
        if(legendFlags.leg && isLegend) matchesLegend = true;
        if(legendFlags.myth && isMyth) matchesLegend = true;
        if(legendFlags.ub && nm.includes('ub')) matchesLegend = true;
        if(legendFlags.par && nm.includes('paradox')) matchesLegend = true;
        if(legendFlags.sub && !isLegend && !isMyth) matchesLegend = true;
      }
      if(!matchesLegend) continue;

      // stage filtering
      if(stageFiltering){
        try{
          const evo = await fetchJson(s.evolution_chain.url);
          const st = computeStageFromChain(evo.chain, s.name); // 1,2,3...
          if(!stageSet.has(st)) continue;
        }catch(e){
          // can't fetch chain -> skip stage filtering for this candidate
        }
      }

      // build display object
      const display = {
        id: p.id,
        name: p.name,
        types: pokeTypes,
        sprite: p.sprites?.other?.['official-artwork']?.front_default || p.sprites?.front_default || '',
        moves: [], // fill later if requested
        ability: null,
        gender_rate: s.gender_rate,
        species: s
      };

      // ability generation controlled by checkbox
      if(generateAbility){
        if(p.abilities && p.abilities.length){
          display.ability = p.abilities[randomInt(0, p.abilities.length-1)].ability.name;
        } else {
          display.ability = null;
        }
      }

      // moves generation controlled by checkbox
      if(generateMoves){
        display.moves = pickMoves(p.moves || [], 4);
      } else {
        display.moves = [];
      }

      // stats / natures / items controlled as before
      if(includeStats){
        display.item = randomItem();
        display.nature = includeNatures ? randomNature() : null;

        if(evivMode === 'competitive'){
          display.evs = generateCompetitiveEVs(); // [HP,Atk,Def,SpA,SpD,Spe]
          display.ivs = generateCompetitiveIVs();
        } else {
          display.evs = generateRandomEVs();
          display.ivs = generateRandomIVs();
        }
      } else {
        display.item = null;
        display.nature = includeNatures ? randomNature() : null;
        display.evs = null;
        display.ivs = null;
      }

      display.gender = includeGenders ? formatGender(s.gender_rate) : null;

      results.push(display);

    } catch(e){
      // possibly rate limit or missing data; continue trying
      continue;
    }
  }

  setStatus(`Generated ${results.length}/${qty} (attempts ${attempts})`);
  renderResultsSymmetric(results);
}

/* ================ Rendering ================ */

function distributeCountsSymmetric(n){
  const maxCols = 3;
  if(n <= maxCols) return [n];
  const rows = Math.ceil(n / maxCols);
  const base = Math.floor(n / rows);
  let rest = n - base * rows;
  const out = [];
  for(let i=0;i<rows;i++){
    out.push(base + (rest>0?1:0));
    if(rest>0) rest--;
  }
  return out;
}

function renderResultsSymmetric(list){
  DOM.results.innerHTML = '';
  if(!list.length){
    DOM.results.innerHTML = '<div style="color:#bfc9d6">No Pokémon matched.</div>';
    return;
  }

  const counts = distributeCountsSymmetric(list.length);
  let idx = 0;
  counts.forEach(c=>{
    const row = document.createElement('div');
    row.className = 'pkm-row';
    for(let i=0;i<c;i++){
      const p = list[idx++];

      const card = document.createElement('div');
      card.className = 'pokemon-card';
      card.dataset.pkm = JSON.stringify(p);

      const img = document.createElement('img');
      img.src = p.sprite || '';
      img.alt = p.name;
      img.onerror = ()=> img.style.opacity = 0.5;

      const nameEl = document.createElement('div');
      nameEl.className = 'pokemon-name';
      // add gender letter on name like "Lapras (F)" if gender is known and is not a percent
      const genderDisplay = (p.gender && (p.gender.includes('♀') || p.gender.includes('♂'))) ? ` (${p.gender.includes('♀') ? 'F' : (p.gender.includes('♂')? 'M':'')})` : '';
      nameEl.textContent = capitalize(p.name) + (genderDisplay || '');

      const typesEl = document.createElement('div');
      typesEl.className = 'pokemon-meta';
      typesEl.textContent = (p.types || []).map(capitalize).join(' / ');

      const meta = [];
      if(p.ability) meta.push('Ability: ' + p.ability.replace(/-/g,' '));
      if(p.gender) meta.push('Gender: ' + p.gender);
      if(p.nature) meta.push('Nature: ' + p.nature);
      if(p.item) meta.push('Item: ' + p.item);
      if(p.evs) meta.push('EVs: ' + formatStatLine(p.evs, '').replace(/^: /,''));
      if(p.ivs) meta.push('IVs: ' + (Array.isArray(p.ivs) ? p.ivs.join(' / ') : p.ivs));

      const extra = document.createElement('div');
      extra.className = 'pokemon-meta';
      extra.style.marginTop = '8px';

      // build meta HTML lines
      const lines = [];
      if(p.ability) lines.push(`Ability: ${p.ability.replace(/-/g,' ')}`);
      if(p.gender) lines.push(`Gender: ${p.gender}`);
      if(p.nature) lines.push(`Nature: ${p.nature}`);
      if(p.item) lines.push(`Item: ${p.item}`);
      if(p.evs) {
        lines.push(formatStatLine(p.evs, 'EVs'));
      }
      if(p.ivs) {
        if(Array.isArray(p.ivs)) lines.push(formatStatLine(p.ivs, 'IVs'));
        else lines.push(`IVs: ${p.ivs}`);
      }

      if(p.moves && p.moves.length){
        lines.push('Moves: ' + p.moves.map(m => capitalize(m)).join(' • '));
      }

      extra.innerHTML = lines.join('<br>');

      card.appendChild(img);
      card.appendChild(nameEl);
      card.appendChild(typesEl);
      if(lines.length) card.appendChild(extra);

      row.appendChild(card);
    }
    DOM.results.appendChild(row);
  });
}

/* ================= Export to Showdown =================
   Format per example:
   Name (F) @ Item
   Ability: X
   Level: 63
   Happiness: 134
   EVs: 4 HP / 22 Atk / 7 Def / 21 SpA / 6 SpD / 11 Spe
   Lax Nature
   IVs: 27 HP / 25 Atk / 3 Def / 22 SpA / 16 SpD / 28 Spe
   - Move1
   - Move2
   - Move3
   - Move4
*/
function exportToShowdown(){
  const rows = [...DOM.results.querySelectorAll('.pkm-row')];
  const cards = [];
  rows.forEach(r => cards.push(...r.querySelectorAll('.pokemon-card')));

  if(!cards.length){ alert('Generate a team first'); return; }

  const incNature = DOM.showNatures.checked;
  const incEVIV = DOM.showStats.checked;
  const incItem = DOM.showStats.checked;
  const incGen = DOM.showGenders.checked;
  const includeMoves = DOM.genMoves.checked;
  const includeAbility = DOM.genAbility.checked;

  const lines = [];

  cards.forEach(c => {
    const o = JSON.parse(c.dataset.pkm);
    const name = capitalize(o.name);
    // gender letter if male/female exact:
    let genderLetter = '';
    if(incGen && o.gender){
      if(o.gender === '♂') genderLetter = ' (M)';
      else if(o.gender === '♀') genderLetter = ' (F)';
      else if(o.gender.startsWith('♀')) genderLetter = ' (F)';
      else if(o.gender.startsWith('♂')) genderLetter = ' (M)';
    }

    const itemLine = incItem && o.item ? ` @ ${o.item}` : (incItem ? ' @ No Item' : '');

    lines.push(`${name}${genderLetter}${itemLine}`);

    if(includeAbility && o.ability) lines.push(`Ability: ${capitalize(o.ability.replace(/-/g,' '))}`);

    // Level — choose a fixed level that matches your example; we'll use 63
    lines.push(`Level: 63`);

    // Happiness random 0..255 (map to example style)
    const happiness = randomInt(0,255);
    lines.push(`Happiness: ${happiness}`);

    // EVs
    if(incEVIV && o.evs){
      lines.push(formatStatLine(o.evs, 'EVs'));
    }

    // Nature line (exact example style places Nature in its own line)
    if(incNature && o.nature) lines.push(`${o.nature} Nature`);

    // IVs
    if(incEVIV && o.ivs){
      // format IVs as per example: "IVs: 27 HP / 25 Atk / ..."
      lines.push(formatStatLine(o.ivs, 'IVs'));
    }

    // Moves
    if(includeMoves && o.moves && o.moves.length){
      const moves = o.moves.slice(0,4).map(m => (typeof m === 'string' ? m : m).replace(/-/g,' ')).map(capitalize);
      moves.forEach(m => lines.push(`- ${m}`));
    } else if(includeMoves){
      // If moves requested but none present (rare), add placeholders
      ['Tackle','Protect','Growl','Struggle'].forEach(m => lines.push(`- ${m}`));
    }

    // blank separator
    lines.push('');
  });

  const blob = new Blob([lines.join('\n')], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'team-showdown.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ================= Dropdown fix & behaviour ================= */
document.querySelectorAll('.multi-dropdown').forEach(drop => {
  const btn = drop.querySelector('.dropdown-btn');
  const content = drop.querySelector('.dropdown-content');

  btn.addEventListener('click', e => {
    e.stopPropagation();
    drop.classList.toggle('open');
  });

  content.addEventListener('click', e => e.stopPropagation());

  content.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('click', e => {
      e.stopPropagation();
      if(cb.value === 'all'){
        if(cb.checked){
          content.querySelectorAll('input[type="checkbox"]').forEach(s => {
            if(s !== cb) s.checked = false;
          });
        }
      } else {
        const allCb = content.querySelector('input[value="all"]');
        if(allCb && allCb.checked) allCb.checked = false;
      }
    });
  });
});

// close dropdown on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.multi-dropdown.open').forEach(d => d.classList.remove('open'));
});

/* ================= Event listeners ================= */
document.addEventListener('DOMContentLoaded', () => {
  DOM.generateBtn.addEventListener('click', async () => {
    DOM.generateBtn.disabled = true;
    DOM.exportBtn.disabled = true;
    try {
      await generateTeam();
    } finally {
      DOM.generateBtn.disabled = false;
      DOM.exportBtn.disabled = false;
    }
  });

  DOM.exportBtn.addEventListener('click', exportToShowdown);

  document.addEventListener('keydown', e => {
    if(e.key === 'Escape'){
      document.querySelectorAll('.multi-dropdown.open').forEach(d => d.classList.remove('open'));
    }
  });
});
