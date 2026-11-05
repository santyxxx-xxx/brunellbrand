import json, re, hashlib, collections, sys
sys.path.insert(0,'.')
from emparejar import emparejar, sin_tildes
exec(open('/home/claude/brunelbrand/scripts/treinta/procesar.py').read().split('# Catálogo (nombres originales')[0])
datos=json.load(open('separado.json'))
ventas, prendas = [], {}
vistos=collections.Counter()
for r in datos['ventas']:
    fecha, tipo, vend, desc, cont, est, pago, valor, costo = r
    d, m_, a = fecha.split('/')
    base_clave='|'.join(['treinta', fecha, vend, desc, cont, valor, costo]); vistos[base_clave]+=1
    clave=hashlib.sha1(f"{base_clave}|{vistos[base_clave]}".encode()).hexdigest()[:20]
    nom_cli, nota = cliente(cont); items=[]
    for parte in re.split(r',\s*(?=\d+\s)', desc):
        cant, nombre, talla, corte = leer_item(parte)
        clave_p = norm(nombre) + ('|' + corte.lower() if corte else '')
        if clave_p not in prendas:
            prod, estado, conf = emparejar(nombre, corte)
            prendas[clave_p]={'clave':clave_p,'nombre':nombre+(f' ({corte})' if corte else ''),'sku':prod['sku'] if prod else None,
                              'sugerido':prod['interno'] if prod else None,'estado':estado,'confianza':conf,'unidades':0}
        prendas[clave_p]['unidades']+=cant
        items.append({'cantidad':cant,'nombre':nombre,'talla':talla,'corte':corte,'prenda_clave':clave_p})
    ventas.append({'clave':clave,'fecha':f'{a}-{m_}-{d}','vendedor':VENDEDOR.get(vend,vend),'vendedor_original':vend,'descripcion':desc,
                   'contacto':None if cont in ('','-') else cont,'cliente':nom_cli,'nota':nota,'estado':ESTADO.get(est,est.lower()),
                   'metodo':PAGO.get(pago,pago.lower()),'valor':num(valor),'costo':num(costo),'items':items})
PROV_MERC=('TuArmario_ec','David Ulloa Proveedor Polo','Cheng POLO','Vicmar Importadora')
gastos=[]; vg=collections.Counter()
for r in datos['gastos']:
    fecha,tipo,vend,desc,cont,est,pago,valor=r; d,m_,a=fecha.split('/')
    bc='|'.join(['treinta-gasto',fecha,tipo,desc,cont,valor]); vg[bc]+=1
    cat='abono_gasto' if tipo=='Abonos gastos' else ('compra_mercaderia' if cont in PROV_MERC or re.match(r'^\d+\s',desc) else 'operativo')
    gastos.append({'clave':hashlib.sha1(f"{bc}|{vg[bc]}".encode()).hexdigest()[:20],'fecha':f'{a}-{m_}-{d}','tipo_original':tipo,'categoria':cat,
                   'descripcion':desc,'proveedor':None if cont in ('','-') else cont,'metodo':PAGO.get(pago,pago.lower()),'vendedor':VENDEDOR.get(vend,vend),'valor':num(valor)})
json.dump({'ventas':ventas,'gastos':gastos,'prendas':list(prendas.values())},open('procesado.json','w'),ensure_ascii=False,indent=1)
print('ventas',len(ventas),'items',sum(len(v['items']) for v in ventas),'prendas',len(prendas), 'total', round(sum(v['valor'] for v in ventas),2))
print(collections.Counter(p['estado'] for p in prendas.values()))
for p in sorted(prendas.values(), key=lambda p:(p['estado'],p['nombre'])):
    if p['estado']!='automatico' or p['confianza']<1: print(p['estado'],p['confianza'],'|',p['nombre'],'->',p['sugerido'])
