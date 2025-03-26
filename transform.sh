#!/bin/bash

search="/_next"
replace="./_next"

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <file1> [file2 ... fileN]"
  exit 1
fi

for file in "$@"; do
  if [ -f "$file" ]; then
    sed -i "s/${search//\//\\/}/${replace//\//\\/}/g" "$file"
    echo "Replaced in $file"
  else
    echo "File not found: $file"
  fi
done
