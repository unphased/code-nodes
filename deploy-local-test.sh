#!/bin/bash

ssh ws -t 'cd /mnt/4tb_nvme/sd_new/storage/ComfyUI/custom_nodes/code-nodes; if git fetch origin main >/dev/null 2>&1; then   LOCAL=$(git rev-parse HEAD);   REMOTE=$(git rev-parse origin/main);   if [ "$LOCAL" != "$REMOTE" ]; then     git reset --hard origin/main;     curl http://localhost:8188/api/manager/reboot; else echo Already up to date; fi; fi'

