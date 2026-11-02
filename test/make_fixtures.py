# Genera feed e risposte di prova realistici per testare il raccoglitore senza rete.
import json, os, datetime, random, html
random.seed(4)
D = os.path.join(os.path.dirname(__file__), "fixtures"); os.makedirs(D, exist_ok=True)
NOW = datetime.datetime(2026, 11, 2, 12, 30, tzinfo=datetime.timezone.utc)
idx = {}
def put(url, name, text):
    open(os.path.join(D, name), "w").write(text); idx[url] = name
def rfc(dt): return dt.strftime("%a, %d %b %Y %H:%M:%S +0000")
img = lambda k: f"https://img.test/{k}.jpg"

stories = [
 ("Dyson Supersonic, il prezzo scende a 249 euro su Amazon", "Il phon scende di prezzo."),
 ("Rocket Lab prepara un satellite che non teme il buio", "Un nuovo satellite radar."),
 ("GTA 6, il pre-download partirà il 12 novembre su PS5 e Xbox", "Rockstar conferma il pre-download di GTA 6 su PS5 e Xbox Series X|S a partire dal 12 novembre, una settimana prima dell'uscita."),
 ("Zelda Ocarina of Time remake: il nuovo trailer per Switch 2 mostra Hyrule rinnovata", "Nintendo pubblica un nuovo filmato del remake in arrivo il 5 novembre su Switch 2."),
 ("Diablo IV in sconto del 75% su Steam: è il minimo storico", "Il gioco Blizzard scende a 12,49 euro per la promozione di metà autunno su Steam."),
 ("Recensione Football Manager 27: la rivoluzione del motore grafico", "Abbiamo provato a lungo la nuova edizione del manageriale di Sports Interactive."),
 ("Steam Deck 2: Valve smentisce l'arrivo nel 2026", "Valve ribadisce che un successore della console portatile non arriverà a breve."),
 ("RTX 5070 Ti scende sotto i 700 euro su Amazon", "La scheda video di NVIDIA tocca il prezzo più basso di sempre in Italia."),
 ("OpenAI presenta un nuovo modello per gli agenti di programmazione", "L'azienda punta su agenti capaci di lavorare per ore in autonomia sul codice."),
 ("ROG Xbox Ally X20 provato: il PC portatile da gioco più potente", "Abbiamo provato la nuova handheld di ASUS e Microsoft con la sua nuova modalità Xbox."),
 ("Metroid Ravenous ha una data di uscita: 28 gennaio 2027", "Il nuovo Metroid per Switch 2 arriverà a fine gennaio."),
 ("PlayStation Plus novembre 2026: Dead Island 2 tra i giochi del mese", "Sony annuncia i giochi gratis di novembre per gli abbonati PS Plus Essential."),
 ("Intelligenza artificiale: Google aggiorna Gemini con nuove funzioni", "Gemini ottiene nuove capacità di ragionamento e integrazione con Android."),
 ("Fable: nuovo gameplay mostrato all'Xbox Partner Preview", "Playground Games mostra nuove sequenze di gioco del suo RPG atteso a febbraio."),
 ("Black Friday 2026: le migliori offerte PS5 già attive su Amazon", "Sconti fino al 40% su giochi e accessori PS5 in vista del Black Friday."),
 ("Hollow Knight Silksong supera i 10 milioni di giocatori", "Team Cherry festeggia un traguardo importante per il suo metroidvania."),
 ("Il nuovo firmware PS5 migliora la VRR e i salvataggi in cloud", "Sony distribuisce un aggiornamento di sistema a sorpresa."),
]
def item_rss(i, src, title, desc, when, mode):
    url = f"https://{src}/notizie/{i}-{title[:30].lower().replace(' ','-').replace(',','').replace(':','')}"
    extra = ""
    body = f"<p>{html.escape(desc)}</p>"
    if mode == "media": extra = f'<media:content url="{img(src+str(i))}" medium="image" width="1200" height="675"/>'
    elif mode == "enclosure": extra = f'<enclosure url="{img(src+str(i))}" type="image/jpeg" length="1"/>'
    elif mode == "content": body = f'<p><img width="300" height="169" src="{img(src+str(i))[:-4]}-300x169.jpg" class="wp-post-image"/></p>' + body
    elif mode == "none": pass
    return url, f"""<item><title><![CDATA[{title}]]></title><link>{url}</link><guid isPermaLink="true">{url}</guid><pubDate>{rfc(when)}</pubDate>
<category><![CDATA[Videogiochi]]></category><description><![CDATA[{desc} L'articolo {title} proviene da Sito.]]></description>{extra}
<content:encoded><![CDATA[{body}]]></content:encoded></item>"""
def rss(items): return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Feed</title>' + "".join(items) + "</channel></rss>"

def make(src, feed_url, mode, picks, title_tweak=None, ogs=()):
    items = []
    for k, i in enumerate(picks):
        t, d = stories[i]
        if title_tweak: t = title_tweak(t)
        when = NOW - datetime.timedelta(minutes=17 + i * 140 + k * 13 + random.randint(0, 40))
        u, x = item_rss(i, src, t, d, when, "none" if i in ogs else mode)
        items.append(x)
        if i in ogs: put(u, f"og_{src}_{i}.html", f'<html><head><meta property="og:image" content="{img("og"+src+str(i))}"></head><body></body></html>')
    put(feed_url, f"{src}.xml", rss(items))

make("multiplayer.it", "https://multiplayer.it/feed/rss/", "media", range(2, 17))
# Everyeye: i due feed noti falliscono, il feed si trova dalla home (autodiscovery)
put("https://www.everyeye.it/", "everyeye_home.html", '<html><head><link rel="alternate" type="application/rss+xml" title="News" href="/feed/news.xml"></head></html>')
make("www.everyeye.it", "https://www.everyeye.it/feed/news.xml", "enclosure", [2, 3, 4, 7, 10, 11, 14, 15], lambda t: t.replace("GTA 6, il pre-download partirà", "GTA 6: pre-download dal").replace("trailer", "video"))
# IGN in formato Atom
entries = []
for k, i in enumerate([2, 3, 5, 9, 13, 15]):
    t, d = stories[i]; when = NOW - datetime.timedelta(minutes=30 + i * 150); u = f"https://it.ign.com/articoli/{i}"
    entries.append(f'<entry><title type="html">{html.escape(t)}</title><link rel="alternate" href="{u}"/><id>{u}</id><published>{when.isoformat()}</published><summary type="html">{html.escape(d)}</summary><media:thumbnail url="{img("ign"+str(i))}"/></entry>')
put("https://it.ign.com/feed.xml", "ign.xml", '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><title>IGN</title>' + "".join(entries) + "</feed>")
make("www.spaziogames.it", "https://www.spaziogames.it/feed", "content", [4, 6, 11, 14, 16])
make("www.tomshw.it", "https://www.tomshw.it/feed", "media", [7, 9, 16, 6, 0, 1], ogs=(7, 16))
make("www.hdblog.it", "https://www.hdblog.it/feed/", "enclosure", [8, 12, 7])

# Steam
def steam_app(i, n, fin, orig, pct): return {"id": i, "name": n, "discounted": True, "discount_percent": pct, "original_price": orig, "final_price": fin, "currency": "EUR", "header_image": img(f"steam{i}"), "discount_expiration": int((NOW + datetime.timedelta(days=3)).timestamp())}
featured = {"specials": {"items": [steam_app(2344520, "Diablo IV", 1249, 4999, 75), steam_app(1086940, "Baldur's Gate 3", 4199, 5999, 30), steam_app(2050650, "Resident Evil 4", 999, 3999, 75)]},
            "top_sellers": {"items": [steam_app(1172470, "Apex Legends Pack", 0, 0, 0)]}, "new_releases": {"items": []},
            "coming_soon": {"items": [{"id": 9001, "name": "Exodus", "header_image": img("exodus")}, {"id": 9002, "name": "Metro 2039", "header_image": img("metro")}]}}
put("https://store.steampowered.com/api/featuredcategories?cc=it&l=italian", "steam_featured.json", json.dumps(featured))
rows = ""
for i, (n, o, f, p) in enumerate([("Cyberpunk 2077", "59,99€", "23,99€", 60), ("Hades II", "29,99€", "22,49€", 25), ("Lies of P", "59,99€", "29,99€", 50), ("Diablo IV", "49,99€", "12,49€", 75), ("No Man's Sky", "58,99€", "23,59€", 60), ("Hollow Knight", "14,79€", "7,39€", 50)]):
    rows += f'<a href="https://store.steampowered.com/app/{100+i}/X/?snr=1" data-ds-appid="{100+i}" class="search_result_row"><div class="search_capsule"><img src="https://shared.akamai.steamstatic.com/capsule_sm_120.jpg"></div><span class="title">{n}</span><div class="search_released responsive_secondrow">Oct 1, 2020</div><div class="discount_block"><div class="discount_pct">-{p}%</div><div class="discount_prices"><div class="discount_original_price">{o}</div><div class="discount_final_price">{f}</div></div></div></a>'
put("https://store.steampowered.com/search/results/?specials=1&start=0&count=100&cc=it&l=english&infinite=1&json=1", "steam_specials.json", json.dumps({"results_html": rows}))
rows = ""
for i, (n, dt) in enumerate([("Exodus", "Apr 7, 2027"), ("Stranger Than Heaven", "15 Jan, 2027"), ("Pathologic 3", "Q1 2027"), ("Indie Mystery", "Coming soon")]):
    rows += f'<a href="https://store.steampowered.com/app/{500+i}/X/" class="search_result_row"><img src="x.jpg"><span class="title">{n}</span><div class="search_released responsive_secondrow">{dt}</div></a>'
put("https://store.steampowered.com/search/results/?filter=popularcomingsoon&start=0&count=100&cc=it&l=english&infinite=1&json=1", "steam_soon.json", json.dumps({"results_html": rows}))
put("https://store.steampowered.com/api/appdetails?appids=9001&cc=it&l=english&filters=release_date", "ad1.json", json.dumps({"9001": {"success": True, "data": {"release_date": {"coming_soon": True, "date": "7 Apr, 2027"}}}}))
put("https://store.steampowered.com/api/appdetails?appids=9002&cc=it&l=english&filters=release_date", "ad2.json", json.dumps({"9002": {"success": True, "data": {"release_date": {"coming_soon": True, "date": "Feb 4, 2027"}}}}))
# GOG
gog = {"products": [{"title": t, "slug": t.lower().replace(" ", "_"), "storeLink": f"https://www.gog.com/it/game/{t.lower().replace(' ', '_')}", "coverHorizontal": img("gog" + str(k)),
        "price": {"final": f"€{f}", "base": f"€{b}", "discount": f"-{d}%", "finalMoney": {"amount": f, "currency": "EUR"}, "baseMoney": {"amount": b, "currency": "EUR"}}} for k, (t, f, b, d) in enumerate([("The Witcher 3 Wild Hunt", "9.99", "29.99", 67), ("Cyberpunk 2077", "26.99", "59.99", 55), ("Disco Elysium", "9.99", "39.99", 75), ("Baldur's Gate 3", "47.99", "59.99", 20)])]}
gog["pages"]=1
put("https://catalog.gog.com/v1/catalog?limit=48&order=desc:trending&discounted=eq:true&productType=in:game,pack&page=1&countryCode=IT&locale=en-US&currencyCode=EUR", "gog.json", json.dumps(gog))
# Epic
def ep(t, slug, s, e, upcoming=False):
    po = {"promotionalOffers": [{"startDate": s, "endDate": e, "discountSetting": {"discountType": "PERCENTAGE", "discountPercentage": 0}}]}
    return {"title": t, "productSlug": slug, "keyImages": [{"type": "OfferImageWide", "url": img("epic" + slug)}], "price": {"totalPrice": {"originalPrice": 1999}},
            "promotions": {"promotionalOffers": [] if upcoming else [po], "upcomingPromotionalOffers": [po] if upcoming else []}}
epic = {"data": {"Catalog": {"searchStore": {"elements": [ep("Sorry We're Closed", "sorry-were-closed", "2026-10-29T15:00:00.000Z", "2026-11-05T16:00:00.000Z"), ep("Flotsam", "flotsam", "2026-11-05T16:00:00.000Z", "2026-11-12T16:00:00.000Z", True), {"title": "Gioco a pagamento", "keyImages": [], "promotions": None}]}}}}
put("https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=it&country=IT&allowCountries=IT", "epic.json", json.dumps(epic))
gp = [{"id": 1, "title": "Radiant Exodus (Steam) Giveaway", "worth": "$9.99", "image": img("gp1"), "open_giveaway_url": "https://www.gamerpower.com/open/radiant", "platforms": "PC, Steam", "end_date": "2026-11-17 23:59:00", "status": "Active", "instructions": "Clicca e aggiungi alla libreria."},
      {"id": 2, "title": "Sorry We're Closed (Epic Games) Giveaway", "worth": "$19.99", "image": img("gp2"), "open_giveaway_url": "https://www.gamerpower.com/open/sorry", "platforms": "PC, Epic Games Store", "end_date": "2026-11-05 16:00:00", "status": "Active"},
      {"id": 3, "title": "Vampire: The Masquerade - Swansong (Prime Gaming)", "worth": "$49.99", "image": img("gp3"), "open_giveaway_url": "https://www.gamerpower.com/open/vtm", "platforms": "PC, Prime Gaming", "end_date": "N/A", "status": "Active"}]
put("https://www.gamerpower.com/api/giveaways?type=game&sort-by=date", "gp.json", json.dumps(gp))
yt = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:yt="http://www.youtube.com/xml/schemas/2015">' + "".join(f'<entry><yt:videoId>vid{k}AAAA</yt:videoId><title>{t}</title><link rel="alternate" href="https://www.youtube.com/watch?v=vid{k}AAAA"/><published>{(NOW-datetime.timedelta(hours=k*5)).isoformat()}</published><media:group><media:thumbnail url="https://i.ytimg.com/vi/vid{k}AAAA/hqdefault.jpg" width="480" height="360"/></media:group></entry>' for k,t in enumerate(["Ghost of Yotei - Launch Trailer | PS5","Astro Bot DLC Gameplay","#shorts quick tip","Days of Play recap"])) + "</feed>"
put("https://www.youtube.com/feeds/videos.xml?channel_id=UC-2Y8dQb0S6DtpxNgAKoJKA", "yt.xml", yt)
json.dump(idx, open(os.path.join(D, "index.json"), "w"), indent=1)
print(len(idx), "risposte di prova")
