from pyproj import Transformer
import json

# 假设你原始坐标是 EPSG:3857（Web Mercator），你可以根据需要换
transformer = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)

with open("mappinginequality.json") as f:
    data = json.load(f)

for feature in data["features"]:
    coords = feature["geometry"]["coordinates"]
    new_coords = []

    for ring in coords[0]:
        lng, lat = transformer.transform(ring[0], ring[1])
        new_coords.append([lng, lat])

    feature["geometry"]["coordinates"] = [new_coords]



with open("mappinginequality_wgs84.geojson", "w") as f:
    json.dump(data, f)
