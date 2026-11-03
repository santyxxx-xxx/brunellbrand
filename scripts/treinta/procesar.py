import json, re, csv, hashlib, unicodedata, difflib, collections, sys

def sin_tildes(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
def norm(s):
    s = sin_tildes(s.lower())
    s = re.sub(r'[^a-z0-9 ]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()
def bonito(s):
    s = re.sub(r'\s+', ' ', s.strip())
    return s[:1].upper() + s[1:]
num = lambda s: float(s.replace('$', '').replace('.', '').replace(',', '.'))

VENDEDOR = {'Mateo Vargas': 'Mateo', 'Santecio Vargas': 'Santiago'}
PAGO = {'Transferencia Bancaria': 'transferencia', 'Payphone': 'payphone', 'Efectivo': 'efectivo', 'Tarjeta': 'tarjeta'}
ESTADO = {'Pagada': 'pagado'}
TALLAS = {'XS', 'S', 'M', 'L', 'XL', 'XXL'}

corte_cli = re.compile(r'\s+(c?a?\s?misas?|canisas|camisetas?|polos?|tallas?|chaquetas?|sacos?|buzos?|remate)\b.*$', re.I)
def cliente(c):
    if c.strip() in ('', '-'):
        return None, None
    nombre = corte_cli.sub('', c).strip()
    nota = c[len(nombre):].strip() or None
    palabras = [w.capitalize() if (w.isupper() and len(w) > 1) or w.islower() else w for w in nombre.split()]
    return ' '.join(palabras) or None, nota

def leer_item(texto):
    m = re.match(r'^(\d+)\s+(.*?)\s*(?:\((.*)\))?\s*$', texto.strip())
    cant, nombre, par = int(m.group(1)), m.group(2), (m.group(3) or '')
    talla = corte = None
    for tok in par.split():
        t = tok.strip().upper()
        if t in TALLAS: talla = t
        elif t.lower() in ('casual', 'oxford'): corte = t.capitalize()
    return cant, bonito(nombre), talla, corte

# Catálogo (nombres originales del inventario importado -> SKU)
catalogo = []
for f in csv.DictReader(open(sys.argv[1], encoding='utf-8')):
    m = re.match(r'^(.*?)(?:\s+\((Casual|Oxford)\))?$', f['nombre'])
    catalogo.append({'sku': f['sku'], 'nombre': f['nombre'], 'base': norm(m.group(1)), 'corte': m.group(2)})
cat_por_clave = {(c['base'], c['corte']): c for c in catalogo}

def emparejar(nombre, corte):
    base = norm(nombre)
    # 1) Igual (sin mayúsculas, tildes ni espacios extra) y mismo corte -> automático
    if (base, corte) in cat_por_clave:
        return cat_por_clave[(base, corte)], 'automatico', 1.0
    # 2) Mismo nombre pero el corte no coincide -> dudoso
    mismos = [c for c in catalogo if c['base'] == base]
    if mismos:
        return mismos[0], 'dudoso', 0.9
    # 3) Parecido -> dudoso (solo si es muy parecido); si no -> sin coincidencia
    objetivo = f"{base} {(corte or '').lower()}".strip()
    mejor, puntaje = None, 0
    for c in catalogo:
        cand = f"{c['base']} {(c['corte'] or '').lower()}".strip()
        p = difflib.SequenceMatcher(None, sorted(objetivo.split()), sorted(cand.split())).ratio()
        p2 = difflib.SequenceMatcher(None, objetivo, cand).ratio()
        p = max(p, p2)
        if p > puntaje: mejor, puntaje = c, p
    if puntaje >= 0.82:
        return mejor, 'dudoso', round(puntaje, 2)
    return None, 'sin_coincidencia', round(puntaje, 2)

datos = json.load(open('separado.json'))
ventas, prendas = [], {}
vistos = collections.Counter()
for r in datos['ventas']:
    fecha, tipo, vend, desc, cont, est, pago, valor, costo = r
    d, m_, a = fecha.split('/')
    base_clave = '|'.join(['treinta', fecha, vend, desc, cont, valor, costo])
    vistos[base_clave] += 1
    clave = hashlib.sha1(f"{base_clave}|{vistos[base_clave]}".encode()).hexdigest()[:20]
    nom_cli, nota = cliente(cont)
    items = []
    for parte in re.split(r',\s*(?=\d+\s)', desc):
        cant, nombre, talla, corte = leer_item(parte)
        clave_p = norm(nombre) + ('|' + corte.lower() if corte else '')
        if clave_p not in prendas:
            prod, estado, conf = emparejar(nombre, corte)
            prendas[clave_p] = {'clave': clave_p, 'nombre': nombre + (f' ({corte})' if corte else ''),
                                'sku': prod['sku'] if prod else None, 'sugerido': prod['nombre'] if prod else None,
                                'estado': estado, 'confianza': conf, 'unidades': 0}
        prendas[clave_p]['unidades'] += cant
        items.append({'cantidad': cant, 'nombre': nombre, 'talla': talla, 'corte': corte, 'prenda_clave': clave_p})
    ventas.append({'clave': clave, 'fecha': f'{a}-{m_}-{d}', 'vendedor': VENDEDOR.get(vend, vend), 'vendedor_original': vend,
                   'descripcion': desc, 'contacto': None if cont in ('', '-') else cont, 'cliente': nom_cli, 'nota': nota,
                   'estado': ESTADO.get(est, est.lower()), 'metodo': PAGO.get(pago, pago.lower()), 'valor': num(valor),
                   'costo': num(costo), 'items': items})

PROV_MERC = ('TuArmario_ec', 'David Ulloa Proveedor Polo', 'Cheng POLO', 'Vicmar Importadora')
gastos = []
vistos_g = collections.Counter()
for r in datos['gastos']:
    fecha, tipo, vend, desc, cont, est, pago, valor = r
    d, m_, a = fecha.split('/')
    base_clave = '|'.join(['treinta-gasto', fecha, tipo, desc, cont, valor])
    vistos_g[base_clave] += 1
    if tipo == 'Abonos gastos': cat = 'abono_gasto'
    elif cont in PROV_MERC or re.match(r'^\d+\s', desc): cat = 'compra_mercaderia'
    else: cat = 'operativo'
    gastos.append({'clave': hashlib.sha1(f"{base_clave}|{vistos_g[base_clave]}".encode()).hexdigest()[:20],
                   'fecha': f'{a}-{m_}-{d}', 'tipo_original': tipo, 'categoria': cat, 'descripcion': desc,
                   'proveedor': None if cont in ('', '-') else cont, 'metodo': PAGO.get(pago, pago.lower()),
                   'vendedor': VENDEDOR.get(vend, vend), 'valor': num(valor)})

json.dump({'ventas': ventas, 'gastos': gastos, 'prendas': list(prendas.values())}, open('procesado.json', 'w'), ensure_ascii=False, indent=1)
print('ventas', len(ventas), 'items', sum(len(v['items']) for v in ventas), 'prendas', len(prendas))
print(collections.Counter(p['estado'] for p in prendas.values()))
print(collections.Counter(g['categoria'] for g in gastos), {c: round(sum(g['valor'] for g in gastos if g['categoria']==c),2) for c in ('compra_mercaderia','operativo','abono_gasto')})
print('items sin talla', sum(1 for v in ventas for i in v['items'] if not i['talla']))
for p in sorted(prendas.values(), key=lambda p: (p['estado'], p['nombre'])):
    if p['estado'] != 'automatico': print(p['estado'], p['confianza'], '|', p['nombre'], '->', p['sugerido'])
