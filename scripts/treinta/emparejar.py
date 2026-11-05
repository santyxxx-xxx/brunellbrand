import json, re, unicodedata, difflib, collections, sys
sys.path.insert(0, '/home/claude/brunelbrand/scripts/treinta')
def sin_tildes(s): return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
VACIAS={'a','de','con','el','la','y'}
def tokens(nombre):
    t=re.sub(r'[^a-z0-9 ]+',' ',sin_tildes(nombre.lower())).split()
    out=[]
    for w in t:
        if w in VACIAS or w in ('casual','oxford'): continue
        if w=='camisas': w='camisa'
        if w=='camisetas': w='camiseta'
        if len(w)>4 and w.endswith('es') and w[:-2] in ('celest',): w=w[:-1]
        if len(w)>3 and w.endswith('s') and w not in ('gris','rayas','bolsillos','cuadros'): w=w[:-1]
        out.append(w)
    return frozenset(out)
def separar(nombre):
    m=re.match(r'^(.*?)(?:\s+\((Casual|Oxford)\))?$', nombre); return m.group(1), m.group(2)

cat=json.load(open('catalogo.json'))
indice=collections.defaultdict(list)
for p in cat:
    base,corte=separar(p['interno'])
    if not corte and re.search(r'\boxford\b', base, re.I) and p['opcion']=='Oxford': corte_k='oxford'
    else: corte_k=(corte or '').lower() or None
    indice[(tokens(base), corte_k)].append(p)
por_base=collections.defaultdict(list)
for (tk,c),ps in indice.items(): por_base[tk].extend(ps)

def emparejar(nombre, corte):
    tk=tokens(nombre); c=(corte or '').lower() or None
    # el nombre trae "casual"/"oxford" dentro (ej. "Camisa casual azul noche")
    if not c:
        m=re.search(r'\b(casual|oxford)\b', nombre, re.I)
        if m and (tk, m.group(1).lower()) in indice: c=m.group(1).lower()
    if (tk,c) in indice: return indice[(tk,c)][0],'automatico',1.0   # mismo nombre (aunque esté repetido en el inventario)
    cands=por_base.get(tk,[])
    if len(cands)==1: return cands[0],'automatico',0.95       # una sola prenda con ese nombre
    if cands and len({separar(x['interno'])[1] for x in cands})==1: return cands[0],'automatico',0.95
    if cands: return cands[0],'dudoso',0.9                     # existe en Casual y Oxford y no se sabe cuál
    mejor,p=None,0
    for (k,kc),ps in indice.items():
        r=len(tk & k)/max(len(tk | k),1)
        if c and kc and c!=kc: r-=0.2
        if r>p: mejor,p=ps[0],r
    if p>=0.75: return mejor,'dudoso',round(p,2)
    return None,'sin_coincidencia',round(p,2)
