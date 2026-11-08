"""Arma data/lineas.json con las líneas del Metro de Lima a partir de OpenStreetMap.

Por cada línea en operación:
  - la vía como una sola línea continua
  - sus estaciones, proyectadas sobre la vía, con su posición (km)
  - los tramos entre estaciones consecutivas: la unidad a la que se le asigna un estado
Además, "obras": los tramos de vía en construcción (hoy, el resto de la Línea 2), solo de contexto.

Uso:  python scripts/linea.py            (baja de OpenStreetMap y guarda data/osm/*.json)
      python scripts/linea.py --local    (usa data/osm/*.json ya descargados)

Cuando abran estaciones nuevas (p. ej. las de Ate en la Línea 2), basta con volver a correrlo
si OpenStreetMap ya las tiene en la relación de la ruta.

Datos © colaboradores de OpenStreetMap, licencia ODbL.
"""
from __future__ import annotations

import json
import math
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
OSM = RAIZ / "data" / "osm"
UA = "OjoAlTren/0.1 (prototipo; datos públicos de OpenStreetMap)"

# Relación de ruta de cada línea, en el sentido en que se lee el diagrama
LINEAS = [
    {"id": "L1", "nombre": "Línea 1", "relacion": 1408101},    # Villa El Salvador → Bayóvar
    {"id": "L2", "nombre": "Línea 2", "relacion": 16861884},   # Mercado Santa Anita → Evitamiento (crecerá hacia el Callao)
]
OBRAS = ('[out:json][timeout:90];way["railway"="construction"]["construction"="subway"]'
         '["name"~"Línea 2|Linea 2"](-12.15,-77.2,-11.95,-76.85);out geom;')
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]


def http_json(url: str, datos: bytes | None = None) -> dict:
    req = urllib.request.Request(url, data=datos, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def bajar():
    OSM.mkdir(parents=True, exist_ok=True)
    for l in LINEAS:   # API principal de OSM: estable, devuelve la relación con todas sus vías y nodos
        d = http_json(f"https://api.openstreetmap.org/api/0.6/relation/{l['relacion']}/full.json")
        (OSM / f"rel-{l['relacion']}.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    # obras: solo existe en Overpass, que a veces está saturado; si falla se conserva lo anterior
    for i, s in enumerate(OVERPASS * 2):
        try:
            d = http_json(s, urllib.parse.urlencode({"data": OBRAS}).encode())
            (OSM / "obras.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
            return
        except Exception as e:
            print(f"  · Overpass no respondió ({e}); reintento")
            time.sleep(5 * (i + 1))
    print("  ! no se pudieron bajar las obras: se usa la copia anterior si existe")


# ---------------------------------------------------------------- geometría

def dist_m(a, b):
    """Distancia en metros entre [lon, lat] (equirectangular: sobra para Lima)."""
    x = math.radians(b[0] - a[0]) * math.cos(math.radians((a[1] + b[1]) / 2))
    return 6371000 * math.hypot(x, math.radians(b[1] - a[1]))


def proyectar(p, coords):
    """Punto de la línea más cercano a p: (índice del segmento, fracción 0-1, punto, distancia en m)."""
    k = math.cos(math.radians(p[1]))
    mejor = None
    for i in range(len(coords) - 1):
        a, b = coords[i], coords[i + 1]
        ax, ay, bx, by = (a[0] - p[0]) * k, a[1] - p[1], (b[0] - p[0]) * k, b[1] - p[1]
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        t = max(0.0, min(1.0, -(ax * dx + ay * dy) / l2)) if l2 else 0.0
        q = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
        d = dist_m(p, q)
        if mejor is None or d < mejor[3]:
            mejor = (i, t, q, d)
    return mejor


def slug(n: str) -> str:
    t = unicodedata.normalize("NFD", n.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return "-".join("".join(c if c.isalnum() else " " for c in t).split())


def nombre_limpio(n: str) -> str:
    for p in ("Estación ", "Estacion "):
        if n.startswith(p):
            n = n[len(p):]
    return n.strip()


def encadenar(rel, vias):
    """Une las vías (rol "") de la relación en una sola lista de nodos, volteando las que vienen al revés."""
    miembros = [m["ref"] for m in rel["members"] if m["type"] == "way" and m["role"] == ""]
    linea = list(vias[miembros[0]])
    if len(miembros) > 1:
        sig = vias[miembros[1]]
        if linea[0] in (sig[0], sig[-1]):
            linea.reverse()
    for ref in miembros[1:]:
        ns = vias[ref]
        if linea[-1] == ns[0]:
            linea += ns[1:]
        elif linea[-1] == ns[-1]:
            linea += ns[::-1][1:]
        else:
            raise RuntimeError(f"La vía {ref} no empalma con la anterior: revisar la relación en OSM")
    return linea


def armar(l):
    d = json.loads((OSM / f"rel-{l['relacion']}.json").read_text(encoding="utf-8"))["elements"]
    nodos = {e["id"]: e for e in d if e["type"] == "node"}
    vias = {e["id"]: e["nodes"] for e in d if e["type"] == "way"}
    rel = next(e for e in d if e["type"] == "relation" and e["id"] == l["relacion"])
    coords = [[nodos[n]["lon"], nodos[n]["lat"]] for n in encadenar(rel, vias)]
    # orientar la vía en el sentido de las paradas
    paradas = [m["ref"] for m in rel["members"] if m["type"] == "node" and m["role"].startswith("stop")]
    p0, p1 = ([nodos[paradas[i]]["lon"], nodos[paradas[i]]["lat"]] for i in (0, -1))
    if dist_m(p0, coords[0]) + dist_m(p1, coords[-1]) > dist_m(p0, coords[-1]) + dist_m(p1, coords[0]):
        coords.reverse()
    acum = [0.0]
    for a, b in zip(coords, coords[1:]):
        acum.append(acum[-1] + dist_m(a, b))

    pref = l["id"].lower()
    estaciones = []
    for ref in paradas:
        n = nodos[ref]
        i, t, q, dist = proyectar([n["lon"], n["lat"]], coords)
        km = (acum[i] + t * (acum[i + 1] - acum[i])) / 1000
        nom = nombre_limpio(n.get("tags", {}).get("name", ""))
        if dist > 150:
            print(f"  ! {l['nombre']}: {nom} está a {dist:.0f} m de la vía")
        estaciones.append({"id": f"{pref}-{slug(nom)}", "nombre": nom, "lon": round(n["lon"], 6), "lat": round(n["lat"], 6),
                           "km": round(km, 2), "_p": (i, t, q)})
    tramos = []
    for k, (a, b) in enumerate(zip(estaciones, estaciones[1:]), start=1):
        (ia, _, qa), (ib, _, qb) = a["_p"], b["_p"]
        seg = [qa] + coords[ia + 1:ib + 1] + [qb]
        tramos.append({"id": f"{pref}-{k:02d}", "desde": a["id"], "hasta": b["id"], "km": round(b["km"] - a["km"], 2),
                       "coords": [[round(x, 6), round(y, 6)] for x, y in seg]})
    for e in estaciones:
        del e["_p"]
    return {"id": l["id"], "nombre": l["nombre"], "de": estaciones[0]["nombre"], "a": estaciones[-1]["nombre"],
            "km": round(estaciones[-1]["km"] - estaciones[0]["km"], 2), "osm_relacion": l["relacion"],
            "estaciones": estaciones, "tramos": tramos}


def obras():
    ruta = OSM / "obras.json"
    if not ruta.exists():
        return []
    d = json.loads(ruta.read_text(encoding="utf-8"))
    return [{"linea": "L2", "coords": [[round(g["lon"], 6), round(g["lat"], 6)] for g in e["geometry"]]}
            for e in d.get("elements", []) if e.get("type") == "way" and e.get("geometry")]


def main():
    if "--local" not in sys.argv:
        bajar()
    lineas = [armar(l) for l in LINEAS]
    salida = {"lineas": lineas, "obras": obras(), "fuente": "© colaboradores de OpenStreetMap (ODbL)"}
    destino = RAIZ / "data" / "lineas.json"
    destino.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for l in lineas:
        print(f"✔ {l['nombre']}: {len(l['estaciones'])} estaciones, {len(l['tramos'])} tramos, {l['km']} km ({l['de']} → {l['a']})")
    print(f"✔ obras: {len(salida['obras'])} tramos de vía en construcción → {destino.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
