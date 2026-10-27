#!/bin/zsh
# Publish the animation to bvs.agentiloop.ai as a Cloudflare static-asset Worker.
set -e
cd "${0:A:h}/.."
npx wrangler@4 deploy -c deploy/bvs.toml
