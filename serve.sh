#!/bin/sh
cd "$(dirname "$0")"
echo "http://localhost:8123"
python3 -m http.server 8123
