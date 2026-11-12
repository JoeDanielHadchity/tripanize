# Rebuilds src/server/airports/airports.json from OurAirports (public domain):
#   curl -LO https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv
#   curl -LO https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/countries.csv
#   python3 scripts/build-airports.py airports.csv countries.csv
# Keeps airports with an IATA code and scheduled flights: [IATA, name, city, country, size].
import csv, json, re, sys
airports_csv, countries_csv = sys.argv[1], sys.argv[2]
countries = {r["code"]: r["name"] for r in csv.DictReader(open(countries_csv, encoding="utf-8"))}
rank = {"large_airport": 0, "medium_airport": 1, "small_airport": 2}
out = {}
for r in csv.DictReader(open(airports_csv, encoding="utf-8")):
    iata = (r["iata_code"] or "").strip().upper()
    if not re.fullmatch(r"[A-Z]{3}", iata) or r["type"] not in rank or r["scheduled_service"] != "yes":
        continue
    city = re.sub(r"\s*\(.*?\)\s*", "", (r["municipality"] or "").strip()).strip() or (r["municipality"] or "").strip()
    item = [iata, r["name"].strip(), city, countries.get(r["iso_country"], r["iso_country"]), rank[r["type"]]]
    if iata in out and out[iata][4] <= item[4]:
        continue
    out[iata] = item
rows = sorted(out.values(), key=lambda x: (x[4], x[0]))
json.dump(rows, open("src/server/airports/airports.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(rows), "airports")
