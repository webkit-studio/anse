#!/usr/bin/env python3
"""
Segmentace návodů Jack West podle typografických kotev.

Hierarchie zjištěná z korpusu:
  H1  10 pt Montserrat-SemiBold, #231f20, x<45   ... "Způsoby montáže"
  H2  10 pt Regular, #4d4d4f / #243241, x~51     ... "vyměření na rám"
  KROK 8 pt Regular, #231f20, "^\\d+\\."          ... "1. Montáž podpěrného L profilu"
  VAR 20-27 pt oranžová #f16122, jedno písmeno   ... "A" "B" "C"
  popisky 7-8,5 pt oranžová                       ... text ve výkresu
  poznámky 5-6 pt černá                           ... vysvětlivky
"""
import pymupdf, re, os, json
from PIL import Image, ImageChops

ORANZ  = 0xf16122
TMAVE  = {0x231f20, 0x243241, 0x000c1f, 0x000000, 0x2c3643}
SEDA   = {0x4d4d4f, 0x939598}
DPI    = 220
PAD    = 9
RE_KROK = re.compile(r'^\s*(\d{1,2})[.)]\s+\S')
RE_VAR  = re.compile(r'^[A-H]$')
RE_PATA = re.compile(r'jackwest\.cz|JACK WEST s\.r\.o|objednavky@|\+420 731 650|KATALOG', re.I)

def spany(page, clip=None):
    out = []
    for b in page.get_text("dict", clip=clip)["blocks"]:
        if b["type"]: continue
        for l in b["lines"]:
            for s in l["spans"]:
                t = s["text"].replace('\x07','').replace('\xa0',' ').replace(' ',' ').strip()
                if not t: continue
                out.append({"t": t, "x": s["bbox"][0], "y": s["bbox"][1],
                            "x1": s["bbox"][2], "y1": s["bbox"][3],
                            "size": round(s["size"],1), "font": s["font"], "barva": s["color"]})
    out.sort(key=lambda s: (round(s["y"],1), s["x"]))
    return out

def kotvy(sp, sirka, textova=False):
    """Vrátí kotvy jako dicty {y,x,uroven,t}. uroven 1=H1, 2=H2, 3=krok."""
    k = []
    for s in sp:
        bold = any(w in s["font"] for w in ("SemiBold","Bold","Medium"))
        if s["size"] >= 9.5 and s["barva"] in TMAVE and bold:
            k.append({"y": s["y"], "x": s["x"], "uroven": 1, "t": s["t"]})
        elif s["size"] >= 9.5 and not bold and not RE_KROK.match(s["t"]) and (
                # na výkresu je šedá vyhrazená barva podnadpisů; v textovém dokumentu
                # ji mají i odrážky, tak tam platí přísný filtr (krátké, bez koncové tečky)
                (s["barva"] in SEDA and not textova)
                or (s["barva"] in (SEDA | TMAVE) and len(s["t"]) <= 62
                    and not s["t"].rstrip().endswith(('.', ':', ',', ';')))):
            k.append({"y": s["y"], "x": s["x"], "uroven": 2, "t": s["t"]})
        elif 7.4 <= s["size"] <= 8.4 and s["barva"] in TMAVE and RE_KROK.match(s["t"]) and s["x"] < sirka*0.35:
            k.append({"y": s["y"], "x": s["x"], "uroven": 3, "t": s["t"]})
    # víceřádkový nadpis = navazující řádky POD SEBOU (podobné x), ne vedle sebe
    slouc = []
    for a in k:
        p = slouc[-1] if slouc else None
        if p and p["uroven"] == a["uroven"] and abs(a["x"] - p["x"]) < 14 and 0 <= a["y"] - p["y"] < 15:
            p["t"] += " " + a["t"]; p["y"] = min(p["y"], a["y"])
        else:
            slouc.append(dict(a))
    return slouc

def radky_kotev(k):
    """Seskupí kotvy do řádků: kotvy na téměř stejné y = sloupce vedle sebe."""
    radky = []
    for a in sorted(k, key=lambda z: (z["y"], z["x"])):
        if radky and abs(a["y"] - radky[-1][0]["y"]) < 12 and a["uroven"] == radky[-1][0]["uroven"]:
            radky[-1].append(a)
        else:
            radky.append([a])
    return radky

def varianty(sp, y0, y1):
    """Markery variant A/B/C uvnitř pásu — vrací [(x, pismeno)] jen když jsou vedle sebe."""
    v = [s for s in sp if y0-4 <= s["y"] <= y1 and s["size"] >= 18
         and s["barva"] == ORANZ and RE_VAR.match(s["t"])]
    if len(v) < 2: return []
    v.sort(key=lambda s: s["x"])
    # musí být zhruba na stejné výšce (sloupce vedle sebe), jinak jsou pod sebou
    if max(s["y"] for s in v) - min(s["y"] for s in v) > 40: return []
    return [(s["x"], s["t"]) for s in v]

def je_textova(page):
    """Stránka bez výkresu: převažuje text a tabulky."""
    if page.get_image_info(): return False
    dr = page.get_drawings()
    velke = [d for d in dr if 30 < d["rect"].width < page.rect.width*0.92
                          and 30 < d["rect"].height < page.rect.height*0.92]
    plocha = sum(d["rect"].width*d["rect"].height for d in velke) / (page.rect.width*page.rect.height)
    return plocha < 0.3 and len(dr) < 600

def volne_pasy(page, kroky=1.5, po_blocich=False):
    """Vrátí seznam (y0,y1) vodorovných pásů, kde na stránce není žádný obsah."""
    pr = page.rect
    n = int(pr.height/kroky) + 1
    obs = [False]*n
    def znac(r):
        if r.height > 800 or r.width > 800: return
        a = max(0, int((r.y0-pr.y0)/kroky)); b = min(n-1, int((r.y1-pr.y0)/kroky))
        for i in range(a, b+1): obs[i] = True
    if not po_blocich:
        for d in page.get_drawings(): znac(d["rect"])
    for b in page.get_text("dict")["blocks"]:
        if b["type"] == 0:
            if po_blocich: znac(pymupdf.Rect(b["bbox"]))
            else:
                for l in b["lines"]:
                    for sp_ in l["spans"]:
                        if sp_["text"].strip(): znac(pymupdf.Rect(sp_["bbox"]))
        else: znac(pymupdf.Rect(b["bbox"]))
    for im in page.get_image_info(): znac(pymupdf.Rect(im["bbox"]))
    pasy, i = [], 0
    while i < n:
        if not obs[i]:
            j = i
            while j < n and not obs[j]: j += 1
            pasy.append((pr.y0 + i*kroky, pr.y0 + j*kroky))
            i = j
        else: i += 1
    return pasy

def rez_nad(volne, y_kotva, y_min):
    """Najde prázdnou mezeru těsně nad kotvou (aby řez nepadl doprostřed obsahu)."""
    kand = [(a,b) for (a,b) in volne if y_min < b <= y_kotva + 3 and (b-a) >= 2]
    if not kand: return max(y_min + 1, y_kotva - 7)
    a, b = max(kand, key=lambda p: p[1])
    # mezera musí ležet těsně nad nadpisem, jinak bychom ukradli obsah předchozí sekce
    if y_kotva - b > 45: return max(y_min + 1, y_kotva - 7)
    return (a + b) / 2

def prvky(page, y0, y1):
    """Obsahové obdélníky v pásu (kresby, textové bloky, rastry)."""
    out = []
    def p(r, vaha=1):
        if r.y1 < y0 or r.y0 > y1: return
        if r.height > 800 or r.width > 800: return
        if r.width < 0.1 and r.height < 0.1: return
        out.append((r, vaha))
    for d in page.get_drawings(): p(d["rect"])
    for b in page.get_text("dict")["blocks"]:
        if b["type"] == 0:
            for l in b["lines"]:
                for sp_ in l["spans"]:
                    if sp_["text"].strip(): p(pymupdf.Rect(sp_["bbox"]))
        else: p(pymupdf.Rect(b["bbox"]))
    for im in page.get_image_info(): p(pymupdf.Rect(im["bbox"]))
    return out

def sloupce(page, y0, y1, hinty, sirka_str):
    """Rozdělí pás na sloupce. hinty = x-pozice nadpisů/markerů sloupců.
    Mezi každou sousední dvojicí hintů hledá skutečnou svislou mezeru v obsahu."""
    if len(hinty) < 2: return []
    pr = page.rect
    kroky = 1.5
    n = int(pr.width/kroky) + 1
    obs = [False]*n
    for r, _ in prvky(page, y0, y1):
        a = max(0, int((r.x0-pr.x0)/kroky)); b = min(n-1, int((r.x1-pr.x0)/kroky))
        for i in range(a, b+1): obs[i] = True
    def mezery_mezi(xa, xb):
        ia, ib = int((xa-pr.x0)/kroky), int((xb-pr.x0)/kroky)
        ia, ib = max(0,min(ia,n-1)), max(0,min(ib,n-1))
        out, i = [], ia
        while i <= ib:
            if not obs[i]:
                j = i
                while j <= ib and not obs[j]: j += 1
                out.append(((i+j)/2*kroky + pr.x0, (j-i)*kroky))
                i = j
            else: i += 1
        return out
    hinty = sorted(hinty)
    delici = []
    for i in range(len(hinty)-1):
        m = [g for g in mezery_mezi(hinty[i]+4, hinty[i+1]-2) if g[1] >= 4]
        if not m: return []
        delici.append(max(m, key=lambda g: g[1])[0])
    hran = [pr.x0] + delici + [pr.x1]
    return [(hran[i], hran[i+1]) for i in range(len(hran)-1)]

def obsah_bbox(page, y0, y1, x0=None, x1=None):
    """Skutečný bbox obsahu v pásu (kresby + text)."""
    pr = page.rect
    lx, ly, hx, hy = 1e9, 1e9, -1e9, -1e9
    def pridej(r):
        nonlocal lx,ly,hx,hy
        if r.y1 < y0 or r.y0 > y1: return
        if x0 is not None and (r.x1 < x0 or r.x0 > x1): return
        if r.height > 800 or r.width > 800: return
        lx=min(lx,r.x0); ly=min(ly,r.y0); hx=max(hx,r.x1); hy=max(hy,r.y1)
    for d in page.get_drawings(): pridej(d["rect"])
    for b in page.get_text("dict")["blocks"]:
        if b["type"] == 0: pridej(pymupdf.Rect(b["bbox"]))
        else: pridej(pymupdf.Rect(b["bbox"]))
    for im in page.get_image_info(): pridej(pymupdf.Rect(im["bbox"]))
    if lx > hx: return None
    return pymupdf.Rect(max(pr.x0,lx-PAD), max(pr.y0,max(ly,y0)-PAD),
                        min(pr.x1,hx+PAD), min(pr.y1,min(hy,y1)+PAD))

def inkoust_a_orez(png):
    im = Image.open(png).convert("RGB")
    bbox = ImageChops.difference(im, Image.new("RGB", im.size, (255,255,255))).getbbox()
    if not bbox: return 0, (0,0)
    p = 12
    bbox = (max(0,bbox[0]-p), max(0,bbox[1]-p), min(im.width,bbox[2]+p), min(im.height,bbox[3]+p))
    im = im.crop(bbox); im.save(png, optimize=True)
    g = im.convert("L").resize((min(im.width,260), min(im.height,260)))
    podil = sum(1 for v in g.getdata() if v < 245) / (g.width*g.height)
    return podil, im.size

def klasifikuj_texty(sp, clip, nadpisove=()):
    """Rozdělí text uvnitř výřezu na popisky (ve výkresu) a poznámky (vysvětlivky)."""
    popisky, poznamky, kotky = [], [], []
    for s in sp:
        if not (clip.x0-2 <= s["x"] <= clip.x1+2 and clip.y0-2 <= s["y"] <= clip.y1+2): continue
        t = s["t"]
        if t in nadpisove: continue
        if s["barva"] == ORANZ and s["size"] >= 18 and RE_VAR.match(t): continue   # marker varianty
        if s["size"] <= 6.6 and s["barva"] in TMAVE: poznamky.append(t)
        elif re.fullmatch(r'[\d,.×x/ –-]{1,12}', t): kotky.append(t)
        else: popisky.append(t)
    return popisky, poznamky, kotky

def zpracuj(pdf_path, outdir, slug, soubor, nazev, url):
    doc = pymupdf.open(pdf_path)
    os.makedirs(outdir, exist_ok=True)
    prefix = soubor.replace('.pdf','')
    sekce, n = [], 0
    for pi, page in enumerate(doc):
        pr = page.rect
        sp = spany(page)
        textova = je_textova(page)
        má_grafiku = bool(page.get_drawings()) or bool(page.get_image_info())
        if not sp and not má_grafiku: continue
        radky = radky_kotev(kotvy(sp, pr.width, textova))

        # pásy = od řádku kotev k dalšímu; nadpisové texty si pamatuju pro filtr popisků
        nadpisove = {a["t"] for r in radky for a in r}
        pasy = []
        if radky:
            # kotvy blízko sebe splynou do jednoho řádku (H1 + jeho první podnadpis)
            slite = []
            for r in radky:
                if slite and r[0]["y"] - slite[-1][-1]["y"] < 26 and slite[-1][0]["uroven"] < r[0]["uroven"]:
                    slite[-1] = slite[-1] + r
                else:
                    slite.append(list(r))
            radky = slite
            volne = volne_pasy(page, po_blocich=textova)
            hran = []
            for i, r in enumerate(radky):
                yk = min(a["y"] for a in r)
                hran.append(rez_nad(volne, yk, hran[-1] if hran else pr.y0))
            for i, r in enumerate(radky):
                y0 = max(pr.y0, hran[i])
                y1 = hran[i+1] if i+1 < len(radky) else pr.y1
                pasy.append((y0, y1, r))
            if hran[0] > pr.y0 + 26:
                pasy.insert(0, (pr.y0, hran[0], []))
        else:
            pasy = [(pr.y0, pr.y1, [])]

        # pás bez grafiky (jen nadpis) se přilepí k následujícímu
        spojene, i = [], 0
        while i < len(pasy):
            y0, y1, r = pasy[i]
            kresby = [d for d in page.get_drawings()
                      if d["rect"].y1 > y0 and d["rect"].y0 < y1 and d["rect"].height < 700]
            rastr = any(im["bbox"][3] > y0 and im["bbox"][1] < y1 for im in page.get_image_info())
            texty_v_pasu = [x for x in sp if y0 <= x["y"] <= y1]
            grafika = rastr or len(kresby) >= 5 or len(texty_v_pasu) >= 5
            ma_krok = any(a["uroven"] == 3 for a in r)
            dalsi_krok = i+1 < len(pasy) and any(a["uroven"] == 3 for a in pasy[i+1][2])
            if not grafika and i+1 < len(pasy) and not (ma_krok and dalsi_krok):
                ny0, ny1, nr = pasy[i+1]
                pasy[i+1] = (y0, ny1, r + nr)
                i += 1; continue
            if not grafika and spojene and not r:
                py0, py1, prr = spojene[-1]
                spojene[-1] = (py0, y1, prr + r); i += 1; continue
            spojene.append((y0, y1, r)); i += 1
        pasy = spojene

        h1 = h2 = krok = None
        for (y0, y1, r) in pasy:
            for a in r:
                if a["uroven"] == 1: h1, h2, krok = a["t"], None, None
            u1 = [a for a in r if a["uroven"] == 1]
            u2 = [a for a in r if a["uroven"] == 2]
            u3 = [a for a in r if a["uroven"] == 3]
            if len(u2) == 1: h2 = u2[0]["t"]
            elif not u2 and not u3: pass
            if u3: krok = u3[0]["t"]

            var = varianty(sp, y0, y1)
            sl = []
            for hinty in ([x for x, _ in var] if len(var) >= 2 else [],
                          [a["x"] for a in u1] if len(u1) >= 2 else [],
                          [a["x"] for a in u2] if len(u2) >= 2 else []):
                if len(hinty) >= 2:
                    sl = sloupce(page, y0, y1, hinty, pr.width)
                    if sl: break
            rezy = []
            if sl:
                for (xa, xb) in sl:
                    vp = next((p for x, p in var if xa <= x <= xb), None)
                    nad1 = next((a["t"] for a in u1 if xa <= a["x"] <= xb), None) if len(u1) >= 2 else None
                    nad = next((a["t"] for a in u2 if xa <= a["x"] <= xb), None)
                    rezy.append((xa, xb, vp, nad or (h2 if len(u2) < 2 else None), nad1))
            else:
                rezy = [(None, None, var[0][1] if len(var) == 1 else None, h2, None)]

            for (xa, xb, vp, vh2, vh1) in rezy:
                clip = obsah_bbox(page, y0, y1, xa, xb)
                if clip is None or clip.width < 24 or clip.height < 24: continue
                if not textova:
                    clip.y0 = max(clip.y0, y0); clip.y1 = min(clip.y1, y1)
                if xa is not None:
                    clip.x0 = max(clip.x0, xa - 2); clip.x1 = min(clip.x1, xb + 2)
                if clip.width < 24 or clip.height < 24: continue
                n += 1
                base = f"{prefix}__s{n:02d}"
                png = f"{outdir}/{base}.png"
                page.get_pixmap(clip=clip, dpi=DPI).save(png)
                podil, (w, hh) = inkoust_a_orez(png)
                if podil < 0.003 or w < 70 or hh < 45:
                    os.remove(png); n -= 1; continue
                popisky, poznamky, kotky = klasifikuj_texty(sp, clip, nadpisove)
                nadp = (krok or vh2 or vh1 or h1)
                if not nadp and not popisky and not poznamky and (podil < 0.02 or w*hh < 260000):
                    os.remove(png); n -= 1; continue
                # patička / hlavička katalogu není obsah
                vse_t = " ".join(popisky + poznamky)
                if RE_PATA.search(vse_t) and len(popisky) + len(poznamky) <= 6 and not nadp:
                    os.remove(png); n -= 1; continue
                popisky = [t for t in popisky if not RE_PATA.search(t)]
                poznamky = [t for t in poznamky if not RE_PATA.search(t)]
                pokrac = bool(sekce) and sekce[-1].get("nadpis") == nadp and nadp is not None
                sekce.append({
                    "id": base, "strana": pi+1, "pokracovani": pokrac,
                    "h1": vh1 or h1, "h2": vh2, "krok": krok, "varianta": vp,
                    "nadpis": nadp,
                    "popisky": popisky, "poznamky": poznamky, "kotace": kotky,
                    "obrazek": f"{base}.png", "px": [w, hh],
                })
    doc.close()
    return {"slug": slug, "dokument": soubor, "nazev": nazev, "url": url,
            "sekci": len(sekce), "sekce": sekce}
