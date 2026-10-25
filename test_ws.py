import asyncio
import websockets
import json

async def test_ws():
    uri = 'ws://127.0.0.1:8000/ws'
    async with websockets.connect(uri) as ws:
        msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
        data = json.loads(msg)
        print("WS connected successfully!")
        print("Diagnosis Verdict:", data.get("diagnosis", {}).get("verdict"))
        print("Diagnosis Message:", data.get("diagnosis", {}).get("message"))
        for t in data.get("targets", []):
            if t.get("is_gateway") or t.get("is_reference") or "CS2" in t.get("name"):
                m = t.get("metrics", {})
                print(f"Target [{t['name']}]: RTT={m.get('current_rtt')}ms, Jitter={m.get('jitter')}ms, Loss={m.get('packet_loss')}%")

if __name__ == "__main__":
    asyncio.run(test_ws())
