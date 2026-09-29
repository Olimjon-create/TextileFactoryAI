"""Kamera / AI-quti simulyatori: haqiqiy qurilma ulanmasdan oldin integratsiyani sinash uchun.

Ishlatish (qurilma kalitini "Kameralar va AI" sahifasida qurilma qo'shganda olasiz):
    python scripts/device_simulator.py --key tfd_... [--url http://localhost:8001] [--count 10] [--interval 2]

Har qadamda COUNT (sanoq) yuboradi, taxminan har 5-qadamda DEFECT (brak). external_id qurilma kodi va
vaqtdan hosil bo'ladi — tarmoq uzilib qayta yuborilsa ham server ikki marta yozmaydi.
Haqiqiy AI dasturi ham xuddi shu formatda POST /api/v1/vision/ingest ga yuboradi.
"""

import argparse
import random
import time
from datetime import datetime, timezone

import requests

DEFECTS = ["Mato teshik", "Chok qiyshiq", "Dog'", "Rang farqi"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Textile Factory AI — qurilma simulyatori")
    parser.add_argument("--url", default="http://localhost:8001", help="Backend manzili")
    parser.add_argument("--key", required=True, help="Qurilma kaliti (tfd_...)")
    parser.add_argument("--count", type=int, default=10, help="Nechta qadam")
    parser.add_argument("--interval", type=float, default=2.0, help="Qadamlar orasidagi soniya")
    args = parser.parse_args()

    endpoint = f"{args.url.rstrip('/')}/api/v1/vision/ingest"
    headers = {"X-Device-Key": args.key}
    run = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    for step in range(1, args.count + 1):
        events = [{
            "event_type": "COUNT", "external_id": f"sim-{run}-{step}-c", "quantity": random.randint(3, 12),
            "confidence": round(random.uniform(0.6, 0.99), 2), "occurred_at": datetime.now(timezone.utc).isoformat(),
            "data": {"model": "simulator-v1", "fps": 25},
        }]
        if step % 5 == 0:
            events.append({
                "event_type": "DEFECT", "external_id": f"sim-{run}-{step}-d", "quantity": 1, "defect_reason": random.choice(DEFECTS),
                "confidence": round(random.uniform(0.7, 0.98), 2), "occurred_at": datetime.now(timezone.utc).isoformat(),
            })
        r = requests.post(endpoint, headers=headers, json={"events": events}, timeout=10)
        if r.status_code != 200:
            print(f"[{step}] xato {r.status_code}: {r.text[:200]}")
            break
        for res in r.json()["results"]:
            print(f"[{step}] {res['external_id']}: {res['status']} — {res['message']}")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
