import urllib.request
import json
import time

time.sleep(2)

# 1. Test /api/games
res = urllib.request.urlopen("http://127.0.0.1:8000/api/games")
games_data = json.loads(res.read().decode("utf-8"))
print("Supported games:", list(games_data["games"].keys()))
print("Detected game:", games_data["detected_game"])
print("Selected game:", games_data["selected_game_id"])

# 2. Test /api/recommendation
res = urllib.request.urlopen("http://127.0.0.1:8000/api/recommendation")
rec = json.loads(res.read().decode("utf-8"))
print("\n--- BEST SERVER RECOMMENDATION ---")
print("Game:", rec["game_name"])
if rec["best_server"]:
    b = rec["best_server"]
    print(f"Rank 1 (Best): {b['name']} | Region: {b['region']} | Ping: {b['metrics']['current_rtt']}ms | Jitter: {b['metrics']['jitter']}ms")
if rec["runner_up"]:
    ru = rec["runner_up"]
    print(f"Rank 2 (Runner Up): {ru['name']} | Region: {ru['region']} | Ping: {ru['metrics']['current_rtt']}ms")
if rec["third_place"]:
    th = rec["third_place"]
    print(f"Rank 3 (Tertiary): {th['name']} | Region: {th['region']} | Ping: {th['metrics']['current_rtt']}ms")
print("Recommended In-Game Max Ping:", rec["recommended_max_ping"], "ms")
print("In-Game Matchmaking Command:", rec.get("matchmaking_cmd"))
print("Total Benchmarked Regions in Leaderboard:", len(rec.get("leaderboard", [])))

# 3. Test Switching to Valorant
print("\n--- SWITCHING TO VALORANT ---")
req = urllib.request.Request("http://127.0.0.1:8000/api/select_game", data=json.dumps({"game_id": "valorant"}).encode("utf-8"), headers={"Content-Type": "application/json"})
res = urllib.request.urlopen(req)
print("Select Valorant response:", res.status)

time.sleep(2)
res = urllib.request.urlopen("http://127.0.0.1:8000/api/recommendation")
val_rec = json.loads(res.read().decode("utf-8"))
print("Valorant Game:", val_rec["game_name"])
if val_rec["best_server"]:
    b = val_rec["best_server"]
    print(f"Valorant Best Server: {b['name']} | Region: {b['region']} | Ping: {b['metrics']['current_rtt']}ms")
