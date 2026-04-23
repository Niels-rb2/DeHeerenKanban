#!/bin/bash
export PATH="/usr/local/bin:$PATH"
cd /Users/nielsslegt/Projects/cafe-de-heeren-feestje
exec node node_modules/next/dist/bin/next dev -p 3011
