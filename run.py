import sys
import os
import webbrowser
from pathlib import Path

def main():
    print("=" * 60)
    print("  GAME SERVER PING RADAR (icmplib concurrency engine)")
    print("=" * 60)
    print("  Diagnosing Local Wi-Fi vs Server / ISP Faults in Real Time")
    print("  Server launching on: http://127.0.0.1:8000")
    print("=" * 60)

    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)

if __name__ == "__main__":
    main()
